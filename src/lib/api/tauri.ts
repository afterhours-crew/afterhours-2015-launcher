// Thin wrappers over the Tauri commands in src-tauri/src and the plugins the
// window uses. Outside Tauri (plain `vite dev` in a browser) every call
// rejects with a clear message so the shell still renders for styling work.

import type {
  Activity,
  AppInfo,
  BackupReport,
  CliResult,
  Folder,
  OutputLine,
  Preflight,
  Recorded,
  SessionAction,
  SessionFileText,
  Settings,
  Status,
} from "./types";
import { readStatusReport } from "$lib/state/status";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const NEEDS_WINDOW = "This action needs the desktop window; run `pnpm tauri dev`.";

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri) throw new Error(NEEDS_WINDOW);
  const core = await import("@tauri-apps/api/core");
  return (core.invoke as Invoke)<T>(command, args);
}

export const api = {
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<Settings>("save_settings", { settings }),
  detectGameDirs: () => invoke<string[]>("detect_game_dirs"),
  runCheck: () => invoke<CliResult>("run_check"),
  sessionStatus: () => invoke<CliResult>("session_status"),
  startSession: (action: SessionAction) => invoke<void>("start_session", { action }),
  stopSession: () => invoke<CliResult>("stop_session"),
  /** `play --json`: start the game in the running `serve` session. */
  playGame: () => invoke<CliResult>("play_game"),
  /** `car-images --json`: decode each car's pictures into the data folder. */
  carImages: () => invoke<CliResult>("car_images"),
  /** `map-images --json`: decode the game's world map into the data folder. */
  mapImages: () => invoke<CliResult>("map_images"),
  /** `settings --json`: read the traffic and rival amounts, or save one of them. */
  worldSettings: (traffic: number | null = null, rivals: string | null = null) =>
    invoke<CliResult>("world_settings", { traffic, rivals }),
  recorded: () => invoke<Recorded>("recorded"),
  openFolder: (which: Folder) => invoke<void>("open_folder", { which }),
  sessionActivity: () => invoke<Activity>("session_activity"),
  backupSaves: (from: string, to: string) => invoke<BackupReport>("backup_saves", { from, to }),
  appInfo: () => invoke<AppInfo>("app_info"),
  /** `profile --json` for the active save, or the account named. */
  profile: (accountId: string | null = null) => invoke<CliResult>("profile", { accountId }),
  profileList: () => invoke<CliResult>("profile_list"),
  sessions: () => invoke<CliResult>("sessions"),
  sessionFile: (id: string, name: string) => invoke<SessionFileText>("session_file", { id, name }),
  openSessionFolder: (id: string) => invoke<void>("open_session_folder", { id }),
};

export async function pickFolder(title: string): Promise<string | null> {
  if (!inTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const chosen = await open({ directory: true, multiple: false, title });
  return typeof chosen === "string" ? chosen : null;
}

/** Open a GitHub page of this project in the browser (scoped in capabilities). */
export async function openUrl(url: string): Promise<void> {
  if (!inTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl: open } = await import("@tauri-apps/plugin-opener");
  await open(url);
}

export async function windowControl(
  action: "minimize" | "close" | "toggleMaximize",
): Promise<void> {
  if (!inTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const current = getCurrentWindow();
  if (action === "minimize") await current.minimize();
  else if (action === "close") await current.close();
  else await current.toggleMaximize();
}

export type Unlisten = () => void;

export async function onSessionEvents(handlers: {
  output: (line: OutputLine) => void;
  status: (result: CliResult) => void;
  exit: (info: { action: SessionAction; code: number | null }) => void;
  closeBlocked: () => void;
}): Promise<Unlisten> {
  if (!inTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const stops = await Promise.all([
    listen<OutputLine>("session-output", (e) => handlers.output(e.payload)),
    listen<CliResult>("session-status", (e) => handlers.status(e.payload)),
    listen<{ action: SessionAction; code: number | null }>("session-exit", (e) =>
      handlers.exit(e.payload),
    ),
    listen("close-blocked", () => handlers.closeBlocked()),
  ]);
  return () => stops.forEach((stop) => stop());
}

/**
 * The session in a `status --json` result, normalised from either contract
 * (v0.3.0 or v1) by `readStatusReport`, so a pin bump does not silently
 * lose the session.
 */
export function statusFromResult(result: CliResult): Status | null {
  return result.kind === "ok" ? readStatusReport(result.value) : null;
}

export function preflightFromResult(result: CliResult): Preflight | null {
  return result.kind === "ok" ? (result.value as Preflight) : null;
}

/** An update the plugin found, reduced to what the window uses. */
export interface FoundUpdate {
  version: string;
  currentVersion: string;
  date: string | null;
  notes: string;
  rawJson: Record<string, unknown>;
  /** Download and verify the installer; nothing changes yet. */
  download: (onProgress: (downloaded: number, total: number | null) => void) => Promise<void>;
  /** Install what was downloaded. On Windows the installer closes and restarts the app. */
  install: () => Promise<void>;
  close: () => Promise<void>;
}

/** Ask the update endpoint, bounded by `timeoutMs`. `null` when there is nothing newer. */
export async function checkForUpdate(timeoutMs: number): Promise<FoundUpdate | null> {
  if (!inTauri) throw new Error(NEEDS_WINDOW);
  const { check } = await import("@tauri-apps/plugin-updater");
  const deadline = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("The update check timed out.")), timeoutMs + 2_000),
  );
  const update = await Promise.race([check({ timeout: timeoutMs }), deadline]);
  if (!update) return null;
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date ?? null,
    notes: update.body ?? "",
    rawJson: update.rawJson,
    download: async (onProgress) => {
      let downloaded = 0;
      let total: number | null = null;
      await update.download((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? null;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        onProgress(downloaded, total);
      });
    },
    install: async () => {
      await update.install();
      // Windows exits inside install; elsewhere the new version needs a restart.
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
    close: () => update.close(),
  };
}
