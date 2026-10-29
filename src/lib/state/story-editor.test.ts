import { describe, expect, it, vi } from "vitest";
import { StoryEditor, type StoryContext, type StoryEdit } from "./story-editor";
import type { CliResult, StoryPreview, StoryApplied, StoryReport } from "$lib/api/types";

const account = "01".repeat(16);
const generation = "9007199254740993";
function story(): StoryReport {
  return {
    version: 1,
    account_id: account,
    generation,
    current_checkpoint: "1",
    intro_completed: false,
    session_running: false,
    can_edit: true,
    warnings: [],
    checkpoints: ["1", "2", "3", "after-intro"].map((id) => ({
      id,
      label: id,
      active: id === "1",
      completed: false,
      played: false,
      edited: false,
      existing: false,
      reward_claimed: false,
      selectable: true,
    })),
  };
}
function preview(target = "after-intro"): StoryPreview {
  return {
    version: 1,
    account_id: account,
    generation,
    source_checkpoint: "1",
    target_checkpoint: target,
    operation_id: "9007199254740994",
    plan_id: "a".repeat(64),
    completes: [],
    reopens: [],
    can_apply: true,
    reasons: [],
    starters: [],
    car_images: null,
    starter: null,
  };
}
const BRZ = "592ac0f528a4f4a56d80ff6c290f2f54";
const CIVIC = "0b18c9413a0f38f4815a80342a62dc4e";
/** A skip past the car choice: the server lists the cars and binds the picked one. */
function skip(starter: string | null): StoryPreview {
  return {
    ...preview(),
    starters: [
      { id: BRZ, name: "Subaru BRZ Premium", image: null },
      { id: CIVIC, name: "Honda Civic Type-R (2000)", image: null },
    ],
    starter,
    can_apply: starter !== null,
  };
}
function applied(p: StoryPreview): StoryApplied {
  return {
    version: 1,
    account_id: p.account_id,
    previous_generation: p.generation,
    generation: "9007199254740994",
    target_checkpoint: p.target_checkpoint,
    replayed: false,
    backup: { id: "b".repeat(64), generation: p.generation, database_sha256: "c".repeat(64) },
    starter: p.starter,
  };
}
const ok = (value: unknown): CliResult => ({ kind: "ok", value });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
function deferred() {
  let resolve!: (r: CliResult) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<CliResult>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const context: StoryContext = {
    scope: "local-folder-a",
    story: story(),
    fresh: true,
    canPreview: true,
  };
  let value: StoryEdit = { kind: "idle" };
  const source = {
    preview: vi.fn(async (_account: string, target: string) => ok(preview(target))),
    apply: vi.fn(async (p: StoryPreview) => ok(applied(p))),
  };
  const refresh = vi.fn(async () => {});
  const editor = new StoryEditor(
    source,
    () => context,
    (v) => (value = v),
    refresh,
  );
  return { context, source, refresh, editor, value: () => value };
}

describe("first car on a skip", () => {
  it("previews again with the picked car and applies only with it", async () => {
    const f = fixture();
    f.source.preview.mockResolvedValueOnce(ok(skip(null)));
    f.editor.select("after-intro");
    await flush();
    expect(f.editor.canApply).toBe(false);
    f.source.preview.mockResolvedValueOnce(ok(skip(BRZ)));
    f.editor.pickStarter(BRZ);
    expect(f.value()).toMatchObject({ kind: "loading", starter: BRZ, last: skip(null) });
    await flush();
    expect(f.source.preview.mock.calls.at(-1)).toEqual([account, "after-intro", BRZ]);
    expect(f.editor.canApply).toBe(true);
    await f.editor.apply();
    expect(f.source.apply).toHaveBeenCalledWith(skip(BRZ));
    expect(f.value().kind).toBe("applied");
  });
  it("ignores a car the preview did not offer", async () => {
    const f = fixture();
    f.source.preview.mockResolvedValueOnce(ok(skip(null)));
    f.editor.select("after-intro");
    await flush();
    f.editor.pickStarter("ff".repeat(16));
    expect(f.source.preview).toHaveBeenCalledTimes(1);
  });
  it("refuses a preview bound to another car than the one picked", async () => {
    const f = fixture();
    f.source.preview.mockResolvedValueOnce(ok(skip(null)));
    f.editor.select("after-intro");
    await flush();
    f.source.preview.mockResolvedValueOnce(ok(skip(CIVIC)));
    f.editor.pickStarter(BRZ);
    await flush();
    expect(f.value().kind).toBe("error");
    expect(f.editor.canApply).toBe(false);
  });
  it("does not confirm an apply that granted a different car", async () => {
    const f = fixture();
    f.source.preview.mockResolvedValueOnce(ok(skip(BRZ)));
    f.editor.select("after-intro", BRZ);
    await flush();
    f.source.apply.mockResolvedValueOnce(ok({ ...applied(skip(BRZ)), starter: CIVIC }));
    await f.editor.apply();
    expect(f.value().kind).toBe("error");
    expect(f.refresh).toHaveBeenCalled();
  });
});

describe("story preview and apply", () => {
  it("keeps one preview running and replaces queued dragging with the latest target", async () => {
    const f = fixture();
    const first = deferred();
    const last = deferred();
    f.source.preview.mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
    f.editor.select("2");
    f.editor.select("3");
    f.editor.select("after-intro");
    expect(f.source.preview).toHaveBeenCalledTimes(1);
    expect(f.value()).toEqual({
      kind: "loading",
      target: "after-intro",
      starter: null,
      last: null,
    });
    first.resolve(ok(preview("2")));
    await flush();
    expect(f.source.preview).toHaveBeenCalledTimes(2);
    expect(f.source.preview.mock.calls[1]).toEqual([account, "after-intro", null]);
    last.resolve(ok(preview()));
    await flush();
    expect(f.value()).toEqual({ kind: "ready", preview: preview() });
    expect(f.editor.canApply).toBe(true);
    expect(f.source.apply).not.toHaveBeenCalled();
  });
  it("cancel and a saved-position selection discard late results and never write", async () => {
    const f = fixture();
    const wait = deferred();
    f.source.preview.mockReturnValueOnce(wait.promise);
    f.editor.select("after-intro");
    f.editor.cancel();
    wait.resolve(ok(preview()));
    await flush();
    expect(f.value()).toEqual({ kind: "idle" });
    expect(f.editor.canApply).toBe(false);
    f.editor.select("1");
    expect(f.source.preview).toHaveBeenCalledTimes(1);
    await f.editor.apply();
    expect(f.source.apply).not.toHaveBeenCalled();
  });
  it("refuses an old account, generation, source position, target or malformed proof", async () => {
    for (const patch of [
      { account_id: "02".repeat(16) },
      { generation: "9007199254740994" },
      { source_checkpoint: "2" },
      { target_checkpoint: "3" },
      { version: 2 },
      { plan_id: "--help" },
      { starters: undefined },
      { starters: [null] },
      { starters: [{ id: BRZ, name: null }] },
      {
        starters: [
          { id: BRZ, name: null, image: null },
          { id: BRZ, name: null, image: null },
        ],
      },
      { starter: undefined },
      { car_images: undefined },
      { operation_id: "9007199254740994oops" },
      { completes: [null] },
      { reopens: [{ id: 2, label: "Second" }] },
    ]) {
      const f = fixture();
      f.source.preview.mockResolvedValueOnce(ok({ ...preview(), ...patch }));
      f.editor.select("after-intro");
      await flush();
      expect(f.value().kind).toBe("error");
      expect(f.editor.canApply).toBe(false);
      await f.editor.apply();
      expect(f.source.apply).not.toHaveBeenCalled();
    }
  });
  it("needs a fresh idle supported save and the same selected server/data folder", async () => {
    const mutations: ((c: StoryContext) => void)[] = [
      (c) => {
        c.scope = "folder-b";
      },
      (c) => {
        c.fresh = false;
      },
      (c) => {
        c.story!.session_running = true;
      },
      (c) => {
        c.story!.can_edit = false;
      },
      (c) => {
        c.story!.checkpoints.at(-1)!.selectable = false;
      },
      (c) => {
        c.story!.generation = "9007199254740994";
      },
      (c) => {
        c.canPreview = false;
      },
    ];
    for (const mutate of mutations) {
      const f = fixture();
      f.editor.select("after-intro");
      await flush();
      expect(f.editor.canApply).toBe(true);
      mutate(f.context);
      expect(f.editor.canApply).toBe(false);
      await f.editor.apply();
      expect(f.source.apply).not.toHaveBeenCalled();
    }
    const f = fixture();
    f.source.preview.mockResolvedValueOnce(
      ok({ ...preview(), can_apply: false, reasons: ["Unavailable"] }),
    );
    f.editor.select("after-intro");
    await flush();
    expect(f.value().kind).toBe("ready");
    expect(f.editor.canApply).toBe(false);
  });
  it("applies the exact server proof once and refreshes actual saved progress", async () => {
    const f = fixture();
    const wait = deferred();
    f.source.apply.mockReturnValueOnce(wait.promise);
    f.editor.select("after-intro");
    await flush();
    const saving = f.editor.apply();
    await f.editor.apply();
    expect(f.value().kind).toBe("applying");
    expect(f.source.apply).toHaveBeenCalledTimes(1);
    expect(f.source.apply).toHaveBeenCalledWith(preview());
    wait.resolve(ok(applied(preview())));
    await saving;
    expect(f.value()).toEqual({ kind: "applied", result: applied(preview()) });
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(f.editor.canApply).toBe(false);
  });
  it("reads the save after a lost apply reply and never assumes rollback or retries", async () => {
    const f = fixture();
    f.source.apply.mockRejectedValueOnce(new Error("Reply timed out"));
    f.refresh.mockImplementationOnce(async () => {
      f.context.story = {
        ...f.context.story!,
        generation: "9007199254740994",
        current_checkpoint: "after-intro",
      };
    });
    f.editor.select("after-intro");
    await flush();
    await f.editor.apply();
    expect(f.value()).toEqual({ kind: "error", message: "Reply timed out" });
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(f.context.story!.current_checkpoint).toBe("after-intro");
    expect(f.source.apply).toHaveBeenCalledTimes(1);
  });
  it("an old server's result cannot overwrite or refresh a newly selected one", async () => {
    const f = fixture();
    const read = deferred();
    f.source.preview.mockReturnValueOnce(read.promise);
    f.editor.select("after-intro");
    f.context.scope = "remote-server";
    f.editor.cancel();
    read.resolve(ok(preview()));
    await flush();
    expect(f.value()).toEqual({ kind: "idle" });
    f.context.scope = "local-folder-a";
    f.editor.select("after-intro");
    await flush();
    const write = deferred();
    f.source.apply.mockReturnValueOnce(write.promise);
    const saving = f.editor.apply();
    f.context.scope = "remote-server";
    f.editor.cancel();
    write.resolve(ok(applied(preview())));
    await saving;
    expect(f.value()).toEqual({ kind: "idle" });
    expect(f.refresh).not.toHaveBeenCalled();
  });
  it("retires a preview when a save changes while the command is running", async () => {
    const f = fixture();
    const read = deferred();
    f.source.preview.mockReturnValueOnce(read.promise);
    f.editor.select("after-intro");
    f.context.story = { ...f.context.story!, generation: "9007199254740994" };
    read.resolve(ok(preview()));
    await flush();
    expect(f.value()).toEqual({ kind: "idle" });
    expect(f.editor.canApply).toBe(false);
    expect(f.source.apply).not.toHaveBeenCalled();
  });
});
