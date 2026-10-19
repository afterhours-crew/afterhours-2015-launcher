// The records the screens read from the bundled server: the active save's
// profile, the list of saves, and the sessions with their files. Each is
// asked for only when the server reports its capability (`profile`,
// `sessions`); without it the record stays idle and the screen gives
// one note instead.
//
// The browser preview reads made-up records instead in its sample mode
// (./preview.ts).

import { api, inTauri } from "$lib/api/tauri";
import type { CliResult, Profile, ProfileList, SessionFileText, SessionList } from "$lib/api/types";
import { hasCapability } from "./capabilities";
import { needsCarImages } from "./carimages";
import { loadSample, sampleMode } from "./preview";
import { session } from "./session.svelte";

export type Load<T> =
  | { kind: "idle" }
  | { kind: "loading"; last: T | null }
  | { kind: "ready"; value: T }
  | { kind: "error"; message: string; last: T | null };

/** The value to draw: the loaded one, or the last one while reloading. */
export function current<T>(load: Load<T>): T | null {
  if (load.kind === "ready") return load.value;
  if (load.kind === "loading" || load.kind === "error") return load.last;
  return null;
}

interface Source {
  profile(accountId: string | null): Promise<CliResult>;
  profileList(): Promise<CliResult>;
  sessions(): Promise<CliResult>;
  sessionFile(id: string, name: string): Promise<SessionFileText>;
}

async function sampleSource(): Promise<Source> {
  if (!loadSample) throw new Error("Sample records exist in development builds only.");
  const sample = await loadSample();
  const ok = (value: unknown): CliResult => ({ kind: "ok", value });
  return {
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
  profile: (accountId) => api.profile(accountId),
  profileList: () => api.profileList(),
  sessions: () => api.sessions(),
  sessionFile: (id, name) => api.sessionFile(id, name),
};

function message(e: unknown): string {
  return String(e instanceof Error ? e.message : e);
}

export class Records {
  /** The active save, for the header, Garage and Profile. */
  profile = $state<Load<Profile>>({ kind: "idle" });
  /** Every save in the data folder, for Save data. */
  profiles = $state<Load<ProfileList>>({ kind: "idle" });
  /** A save picked on Save data; `null` is the active one. */
  picked = $state<string | null>(null);
  pickedProfile = $state<Load<Profile>>({ kind: "idle" });
  sessions = $state<Load<SessionList>>({ kind: "idle" });
  /** `car-images` is running in the background. */
  imagesRunning = $state(false);
  /** The game folder `car-images` last ran for; a session's end clears it. */
  private imagesTried: string | null = null;

  private source: Promise<Source> | null = null;

  private async from(): Promise<Source> {
    this.source ??= sampleMode ? sampleSource() : Promise.resolve(live);
    return this.source;
  }

  get canProfile(): boolean {
    return hasCapability(session.info?.server, "profile");
  }

  get canSessions(): boolean {
    return hasCapability(session.info?.server, "sessions");
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
      else set({ kind: "error", message: result.message, last });
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

  async loadProfiles(): Promise<void> {
    await this.read<ProfileList>(
      this.canProfile,
      (s) => s.profileList(),
      (l) => (this.profiles = l),
      current(this.profiles),
    );
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

  /** After a session ends the save and the session list have changed. */
  async refreshAfterSession(): Promise<void> {
    // A session may have prepared new content: pictures can be tried again.
    this.imagesTried = null;
    await Promise.all([this.loadProfile(), this.loadSessions()]);
  }
}

export const records = new Records();
