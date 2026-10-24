import type { CliResult, StoryApplied, StoryPreview, StoryReport } from "$lib/api/types";

export type StoryEdit =
  | { kind: "idle" }
  | { kind: "loading"; target: string }
  | { kind: "ready"; preview: StoryPreview }
  | { kind: "applying"; preview: StoryPreview }
  | { kind: "applied"; result: StoryApplied }
  | { kind: "error"; message: string };
export interface StoryContext {
  /** Selected server/data folder. Never contains an API token. */
  scope: string;
  story: StoryReport | null;
  fresh: boolean;
  canPreview: boolean;
}
interface Request {
  target: string;
  account: string;
  generation: string;
  scope: string;
  ticket: number;
  sourceCheckpoint: string;
}
interface Source {
  preview(account: string, target: string): Promise<CliResult>;
  apply(preview: StoryPreview): Promise<CliResult>;
}
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One command at a time, retaining only the newest slider request. */
export class StoryEditor {
  private value: StoryEdit = { kind: "idle" };
  private ticket = 0;
  private pending: Request | null = null;
  private reading = false;
  private writing = false;
  private readyScope: string | null = null;
  constructor(
    private source: Source,
    private context: () => StoryContext,
    private update: (value: StoryEdit) => void,
    private refresh: () => Promise<void>,
  ) {}
  private set(value: StoryEdit): void {
    this.value = value;
    this.update(value);
  }
  cancel(): void {
    ++this.ticket;
    this.pending = null;
    this.readyScope = null;
    this.set({ kind: "idle" });
  }
  private current(request: Request, fresh = true): boolean {
    const context = this.context();
    return (
      request.ticket === this.ticket &&
      context.scope === request.scope &&
      (!fresh || context.fresh) &&
      context.story?.account_id === request.account &&
      context.story.generation === request.generation &&
      context.story.current_checkpoint === request.sourceCheckpoint
    );
  }
  select(target: string): void {
    this.cancel();
    const context = this.context();
    const story = context.story;
    if (!context.canPreview || !context.fresh || !story || target === story.current_checkpoint)
      return;
    if (!story.checkpoints.some((point) => point.id === target)) return;
    this.pending = {
      target,
      account: story.account_id,
      generation: story.generation,
      scope: context.scope,
      ticket: this.ticket,
      sourceCheckpoint: story.current_checkpoint,
    };
    this.set({ kind: "loading", target });
    void this.drain();
  }
  private async drain(): Promise<void> {
    if (this.reading || this.writing) return;
    this.reading = true;
    try {
      while (this.pending) {
        const request = this.pending;
        this.pending = null;
        try {
          const response = await this.source.preview(request.account, request.target);
          if (!this.current(request)) {
            if (request.ticket === this.ticket && !this.pending) this.set({ kind: "idle" });
            continue;
          }
          if (response.kind === "error") {
            this.set({ kind: "error", message: response.message });
            continue;
          }
          const preview = response.value as StoryPreview;
          if (
            !preview ||
            preview.version !== 1 ||
            preview.account_id !== request.account ||
            preview.generation !== request.generation ||
            preview.source_checkpoint !== request.sourceCheckpoint ||
            preview.target_checkpoint !== request.target ||
            typeof preview.plan_id !== "string" ||
            !/^[a-f0-9]{64}$/.test(preview.plan_id) ||
            !Array.isArray(preview.completes) ||
            !Array.isArray(preview.reopens) ||
            !Array.isArray(preview.reasons) ||
            typeof preview.can_apply !== "boolean"
          )
            throw new Error("The story preview changed. Refresh your story.");
          this.readyScope = request.scope;
          this.set({ kind: "ready", preview });
        } catch (error) {
          if (this.current(request)) this.set({ kind: "error", message: message(error) });
        }
      }
    } finally {
      this.reading = false;
    }
  }
  get canApply(): boolean {
    if (this.value.kind !== "ready" || this.writing || this.pending) return false;
    const context = this.context();
    const story = context.story;
    const preview = this.value.preview;
    return !!(
      context.fresh &&
      context.canPreview &&
      context.scope === this.readyScope &&
      story?.can_edit &&
      !story.session_running &&
      preview.can_apply &&
      story.account_id === preview.account_id &&
      story.generation === preview.generation &&
      story.current_checkpoint === preview.source_checkpoint &&
      story.checkpoints.some((point) => point.id === preview.target_checkpoint && point.selectable)
    );
  }
  async apply(): Promise<void> {
    if (!this.canApply || this.value.kind !== "ready") return;
    const preview = this.value.preview;
    const request: Request = {
      account: preview.account_id,
      generation: preview.generation,
      target: preview.target_checkpoint,
      ticket: this.ticket,
      scope: this.context().scope,
      sourceCheckpoint: preview.source_checkpoint,
    };
    this.writing = true;
    this.set({ kind: "applying", preview });
    try {
      const response = await this.source.apply(preview);
      if (!this.current(request, false)) return;
      if (response.kind === "error") throw new Error(response.message);
      const result = response.value as StoryApplied;
      if (
        !result ||
        result.version !== 1 ||
        result.account_id !== request.account ||
        result.previous_generation !== request.generation ||
        result.target_checkpoint !== request.target ||
        typeof result.generation !== "string" ||
        !result.backup?.id
      )
        throw new Error("Could not confirm the story change. Refresh your story.");
      this.set({ kind: "applied", result });
    } catch (error) {
      if (this.current(request, false)) this.set({ kind: "error", message: message(error) });
    } finally {
      this.writing = false;
      // A timeout may follow a committed write. Read actual progress; never
      // guess a rollback, update the marker optimistically or retry a write.
      if (request.ticket === this.ticket && !this.current(request, false))
        this.set({ kind: "idle" });
      if (request.scope === this.context().scope) {
        try {
          await this.refresh();
        } catch (error) {
          if (request.scope === this.context().scope && request.ticket === this.ticket)
            this.set({ kind: "error", message: message(error) });
        }
      }
      void this.drain();
    }
  }
}
