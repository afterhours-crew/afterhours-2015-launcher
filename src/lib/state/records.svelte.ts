// The records the screens read from the bundled server: the active save's
// profile, the list of saves, and the sessions with their files. Each is
// asked for only when the server reports its capability (`profile`,
// `sessions`); without it the record stays idle and the screen gives
// one note instead.
//
// The browser preview reads made-up records instead in its sample mode
// (./preview.ts).

import { api, inTauri } from "$lib/api/tauri";
import type {
  CliResult,
  MapImagesReport,
  Profile,
  ProfileList,
  SessionFileText,
  SessionList,
  SettingsReport,
  StoryReport,
  StoryPreview,
} from "$lib/api/types";
import { hasCapability } from "./capabilities";
import { needsCarImages } from "./carimages";
import { isLive } from "./launchbar";
import { applyChoice, saveArgs } from "./world";
import { loadSample, sampleMode } from "./preview";
import { session } from "./session.svelte";

export type Load<T> =
  | { kind: "idle" }
  | { kind: "loading"; last: T | null }
  | { kind: "ready"; value: T }
  /** `exit` is the server's exit code when it answered; 4 means there was nothing to act on. */
  | { kind: "error"; message: string; last: T | null; exit?: number };

/** The value to draw: the loaded one, or the last one while reloading. */
export function current<T>(load: Load<T>): T | null {
  if (load.kind === "ready") return load.value;
  if (load.kind === "loading" || load.kind === "error") return load.last;
  return null;
}

/** A change for `settings`: nothing reads, a field saves. */
interface WorldChange {
  traffic?: number;
  rivals?: string;
}

interface Source {
  story(): Promise<CliResult>;
  storyPreview(account: string, target: string): Promise<CliResult>;
  storyApply(preview: StoryPreview): Promise<CliResult>;
  profile(accountId: string | null): Promise<CliResult>;
  profileList(): Promise<CliResult>;
  sessions(): Promise<CliResult>;
  sessionFile(id: string, name: string): Promise<SessionFileText>;
  settings(change: WorldChange): Promise<CliResult>;
  mapImages(): Promise<CliResult>;
}

async function sampleSource(): Promise<Source> {
  if (!loadSample) throw new Error("Sample records exist in development builds only.");
  const sample = await loadSample();
  const ok = (value: unknown): CliResult => ({ kind: "ok", value });
  const query = new URLSearchParams(window.location.search);
  // `&offscale`: values saved outside the scale (traffic 150 %, at most 2
  // rivals); `&savefail`: every save is refused, to see the revert.
  let world: SettingsReport = query.has("offscale")
    ? { ...sample.SAMPLE_SETTINGS, traffic_percent: 150, rival_limit: 2 }
    : sample.SAMPLE_SETTINGS;
  return {
    story: async () => ok(sample.SAMPLE_STORY),
    storyPreview: async (account, target) => {
      const story = sample.SAMPLE_STORY;
      const at = story.checkpoints.findIndex((p) => p.id === target);
      if (account !== story.account_id || at < 0)
        return { kind: "error", exit: 1, message: "Unknown sample checkpoint." };
      return ok({
        version: 1,
        account_id: account,
        generation: story.generation,
        source_checkpoint: story.current_checkpoint,
        target_checkpoint: target,
        operation_id: "43",
        plan_id: "a".repeat(64),
        completes: story.checkpoints
          .slice(0, at)
          .filter((p) => !p.completed)
          .map(({ id, label }) => ({ id, label })),
        reopens: story.checkpoints
          .slice(at)
          .filter((p) => p.completed)
          .map(({ id, label }) => ({ id, label })),
        can_apply: false,
        reasons: ["Sample mode cannot change a save."],
      } satisfies StoryPreview);
    },
    storyApply: async () => ({
      kind: "error",
      exit: 1,
      message: "Sample mode cannot change a save.",
    }),
    settings: async (change) => {
      if (change.traffic === undefined && change.rivals === undefined) return ok(world);
      if (query.has("savefail") || isLive(session.status?.state)) {
        return {
          kind: "error",
          exit: 1,
          message: "A session is using this data folder; its values apply until it ends.",
        };
      }
      world = {
        ...world,
        ...(change.traffic !== undefined ? { traffic_percent: change.traffic } : {}),
        ...(change.rivals !== undefined
          ? { rival_limit: change.rivals === "original" ? null : Number(change.rivals) }
          : {}),
        saved: true,
      };
      return ok(world);
    },
    profile: async (accountId) => {
      const entry = sample.SAMPLE_PROFILE_LIST.accounts.find((a) => a.account_id === accountId);
      if (!accountId || entry?.active) return ok(sample.SAMPLE_PROFILE);
      if (!entry || entry.error) {
        return { kind: "error", exit: 5, message: entry?.error ?? "No such save." };
      }
      const cars = sample.SAMPLE_CARS.slice(0, 1);
      return ok({
        ...sample.SAMPLE_PROFILE,
        account_id: entry.account_id,
        active: false,
        identity: {
          ...sample.SAMPLE_PROFILE.identity!,
          display_name: entry.display_name!,
          account_id: entry.account_id,
        },
        bank: entry.bank,
        cars,
        car_summary: {
          ...sample.SAMPLE_PROFILE.car_summary!,
          garage_used: 1,
          warehouse_used: 0,
          total_sale_value: cars[0]!.sale_price,
        },
        save: {
          ...sample.SAMPLE_PROFILE.save,
          path: sample.SAMPLE_PROFILE.save.path.replace(
            sample.SAMPLE_PROFILE.account_id,
            entry.account_id,
          ),
          updated_at_utc: entry.updated_at_utc,
          generation: 40,
        },
      } satisfies Profile);
    },
    // `&nomap`: the data folder has no prepared content yet.
    mapImages: async () =>
      query.has("nomap")
        ? {
            kind: "error",
            exit: 4,
            message: "This data directory has no prepared content; run setup first.",
          }
        : ok(sample.SAMPLE_MAP),
    profileList: async () => ok(sample.SAMPLE_PROFILE_LIST),
    sessions: async () => ok(sample.SAMPLE_SESSIONS),
    sessionFile: async (id, name) => {
      const file = sample.sampleFile(id, name);
      if (!file) throw new Error(`${name} is not in this sample session.`);
      return file;
    },
  };
}

const live: Source = {
  story: () => api.story(),
  storyPreview: (account, target) => api.storyPreview(account, target),
  storyApply: (p) => api.storyApply(p.account_id, p.target_checkpoint, p.generation, p.plan_id),
  profile: (accountId) => api.profile(accountId),
  profileList: () => api.profileList(),
  sessions: () => api.sessions(),
  sessionFile: (id, name) => api.sessionFile(id, name),
  settings: (change) => api.worldSettings(change.traffic ?? null, change.rivals ?? null),
  mapImages: () => api.mapImages(),
};

function message(e: unknown): string {
  return String(e instanceof Error ? e.message : e);
}

export class Records {
  story = $state<Load<StoryReport>>({ kind: "idle" });
  /** The active save, for the header, Garage and Profile. */
  profile = $state<Load<Profile>>({ kind: "idle" });
  /** Every save in the data folder, for Save data. */
  profiles = $state<Load<ProfileList>>({ kind: "idle" });
  /** A save picked on Save data; `null` is the active one. */
  picked = $state<string | null>(null);
  pickedProfile = $state<Load<Profile>>({ kind: "idle" });
  sessions = $state<Load<SessionList>>({ kind: "idle" });
  /** Traffic and rivals, from `settings --json`. */
  world = $state<Load<SettingsReport>>({ kind: "idle" });
  /** The world map's tiles and world box, from `map-images`. */
  map = $state<Load<MapImagesReport>>({ kind: "idle" });
  /** `car-images` is running in the background. */
  imagesRunning = $state(false);
  /** The game folder `car-images` last ran for; a session's end clears it. */
  private imagesTried: string | null = null;

  private source: Promise<Source> | null = null;
  private storyRead = 0;

  private async from(): Promise<Source> {
    this.source ??= sampleMode ? sampleSource() : Promise.resolve(live);
    return this.source;
  }

  get canProfile(): boolean {
    return hasCapability(session.info?.server, "profile");
  }

  async loadStory(): Promise<void> {
    const ticket = ++this.storyRead;
    await this.read<StoryReport>(
      hasCapability(session.info?.server, "story"),
      (s) => s.story(),
      (l) => {
        if (ticket === this.storyRead) this.story = l;
      },
      current(this.story),
    );
  }
  async previewStory(account: string, target: string): Promise<CliResult> {
    return (await this.from()).storyPreview(account, target);
  }
  async applyStory(preview: StoryPreview): Promise<CliResult> {
    return (await this.from()).storyApply(preview);
  }

  get canSessions(): boolean {
    return hasCapability(session.info?.server, "sessions");
  }

  get canWorld(): boolean {
    return hasCapability(session.info?.server, "world-settings");
  }

  get canMap(): boolean {
    return hasCapability(session.info?.server, "map-images");
  }

  private async read<T>(
    can: boolean,
    get: (s: Source) => Promise<CliResult>,
    set: (load: Load<T>) => void,
    last: T | null,
  ): Promise<void> {
    if (!can) {
      set({ kind: "idle" });
      return;
    }
    set({ kind: "loading", last });
    try {
      const result = await get(await this.from());
      if (result.kind === "ok") set({ kind: "ready", value: result.value as T });
      else set({ kind: "error", message: result.message, last, exit: result.exit });
    } catch (e) {
      set({ kind: "error", message: message(e), last });
    }
  }

  async loadProfile(): Promise<void> {
    await this.read<Profile>(
      this.canProfile,
      (s) => s.profile(null),
      (l) => (this.profile = l),
      current(this.profile),
    );
    void this.ensureCarImages();
  }

  /**
   * Decode the cars' pictures in the background when the server can and
   * the profile has none (after the first run, or when the content
   * changed), then read the profile again. Nothing waits on it: the
   * screens show a placeholder tile until the pictures arrive. Once per game
   * folder until a session ends, so a refusal is not retried in a loop.
   */
  async ensureCarImages(): Promise<void> {
    if (!inTauri || sampleMode || this.imagesRunning) return;
    const enabled = hasCapability(session.info?.server, "car-images");
    if (!needsCarImages(current(this.profile), enabled)) return;
    const folder = session.settings.game_dir ?? "";
    if (this.imagesTried === folder) return;
    this.imagesTried = folder;
    this.imagesRunning = true;
    try {
      const result = await api.carImages();
      if (result.kind === "ok") {
        this.imagesRunning = false;
        await this.loadProfile();
      }
    } catch {
      // A missing or refusing server keeps the placeholders; Logs and the
      // server's own records say why.
    } finally {
      this.imagesRunning = false;
    }
  }

  /**
   * Decode the world map, or get the set already decoded: the first time
   * takes seconds, later calls return at once. Asked for when the Map view
   * opens without a map, and again when it is retried.
   */
  async loadMap(): Promise<void> {
    if (this.map.kind === "loading" || this.map.kind === "ready") return;
    await this.read<MapImagesReport>(
      this.canMap,
      (s) => s.mapImages(),
      (l) => (this.map = l),
      current(this.map),
    );
  }

  async loadProfiles(): Promise<void> {
    await this.read<ProfileList>(
      this.canProfile,
      (s) => s.profileList(),
      (l) => (this.profiles = l),
      current(this.profiles),
    );
  }

  /** Read the saved traffic and rival amounts; reading never creates the file. */
  async loadWorld(): Promise<void> {
    await this.read<SettingsReport>(
      this.canWorld,
      (s) => s.settings({}),
      (l) => (this.world = l),
      current(this.world),
    );
  }

  /**
   * Save a picked step: shown at once, put back with the server's message
   * when it refuses (a running session holds the data folder). Returns
   * that message, or `null` when saved or nothing was to save.
   */
  async saveWorld(row: "traffic" | "rivals", value: string): Promise<string | null> {
    const before = current(this.world);
    const args = saveArgs(row, value);
    if (!before || !args || !this.canWorld) return null;
    this.world = { kind: "ready", value: applyChoice(before, row, value) };
    const change: WorldChange =
      row === "traffic" ? { traffic: Number(args[1]) } : { rivals: args[1]! };
    try {
      const result = await (await this.from()).settings(change);
      if (result.kind === "ok") {
        this.world = { kind: "ready", value: result.value as SettingsReport };
        return null;
      }
      this.world = { kind: "ready", value: before };
      return result.message;
    } catch (e) {
      this.world = { kind: "ready", value: before };
      return message(e);
    }
  }

  /** Show one save on Save data; `null` or the active one is the profile. */
  async pick(accountId: string | null): Promise<void> {
    const active = current(this.profile);
    this.picked = accountId === active?.account_id ? null : accountId;
    if (this.picked === null) return;
    await this.read<Profile>(
      this.canProfile,
      (s) => s.profile(accountId),
      (l) => (this.pickedProfile = l),
      null,
    );
  }

  async loadSessions(): Promise<void> {
    await this.read<SessionList>(
      this.canSessions,
      (s) => s.sessions(),
      (l) => (this.sessions = l),
      current(this.sessions),
    );
  }

  /** The save Save data shows: the picked one, else the active profile. */
  get shown(): Load<Profile> {
    return this.picked === null ? this.profile : this.pickedProfile;
  }

  async sessionFile(id: string, name: string): Promise<SessionFileText> {
    return (await this.from()).sessionFile(id, name);
  }

  async openSessionFolder(id: string): Promise<void> {
    if (sampleMode) throw new Error("The browser preview cannot open folders.");
    await api.openSessionFolder(id);
  }

  /**
   * The server in use changed (the Server screen picked another): every
   * record came from the old one. Forget them and read the new server's
   * profile now, for the header; the other screens read theirs when opened,
   * and the map is decoded again for the new server.
   */
  async switchServer(): Promise<void> {
    ++this.storyRead;
    this.story = { kind: "idle" };
    this.imagesTried = null;
    this.profile = { kind: "idle" };
    this.profiles = { kind: "idle" };
    this.picked = null;
    this.pickedProfile = { kind: "idle" };
    this.sessions = { kind: "idle" };
    this.world = { kind: "idle" };
    this.map = { kind: "idle" };
    await this.loadProfile();
  }

  /** After a session ends the save and the session list have changed. */
  async refreshAfterSession(): Promise<void> {
    // A session may have prepared new content: pictures can be tried again.
    this.imagesTried = null;
    void this.loadWorld();
    await Promise.all([this.loadProfile(), this.loadSessions(), this.loadStory()]);
  }
}

export const records = new Records();
