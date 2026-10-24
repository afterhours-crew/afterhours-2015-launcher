// Thin wrappers over the Tauri commands in src-tauri/src and the plugins the
// window uses. Outside Tauri (plain `vite dev` in a browser) every call
// rejects with a clear message so the shell still renders for styling work.

import type {
  Activity,
  AppInfo,
  BackupReport,
  CliResult,
  CloseAction,
  Folder,
  OutputLine,
  Preflight,
  Recorded,
  RemoteServer,
  ServerCheck,
  ServerHealth,
  Servers,
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
  /**
   * Use the server on another PC (its API is asked first, with that token),
   * or this PC's own again with `null`.
   */
  setServer: (server: RemoteServer | null) => invoke<Settings>("set_server", { server }),
  /** Let your other PCs use this PC's server, from its next start. */
  setSharing: (enabled: boolean) => invoke<Settings>("set_sharing", { enabled }),
  /** Your servers (src-tauri/src/servers.rs): the list and which is in use. */
  serversList: () => invoke<Servers>("servers_list"),
  /** Look at a pairing code before saving it: what answers there. */
  serverCheck: (pairing: string) => invoke<ServerCheck>("server_check", { pairing }),
  /** Save a server from its pairing code (checked first); use it when `useNow`. */
  serverAdd: (name: string, pairing: string, useNow: boolean) =>
    invoke<Servers>("server_add", { name, pairing, useNow }),
  /** Use a saved server by id, or this PC's own with `null`. */
  serverUse: (id: string | null) => invoke<Servers>("server_use", { id }),
  serverRename: (id: string, name: string) => invoke<Servers>("server_rename", { id, name }),
  serverForget: (id: string) => invoke<Servers>("server_forget", { id }),
  /** A new pairing code for a saved server whose token changed. */
  serverSetToken: (id: string, pairing: string) =>
    invoke<Servers>("server_set_token", { id, pairing }),
  /** Check every saved server at once, two seconds each. */
  serversHealth: () => invoke<ServerHealth[]>("servers_health"),
  setCloseAction: (action: CloseAction) => invoke<Servers>("set_close_action", { action }),
  /** The answer to "Keep your server running?" on close. */
  closeDecision: (keep: boolean, remember: boolean) =>
    invoke<void>("close_decision", { keep, remember }),
  /** The launcher's log of one server (`null`: this PC's own), newest last. */
  connectionLog: (id: string | null) => invoke<string>("connection_log", { id }),
  detectGameDirs: () => invoke<string[]>("detect_game_dirs"),
  runCheck: () => invoke<CliResult>("run_check"),
  sessionStatus: () => invoke<CliResult>("session_status"),
  /**
   * Start a session. `api` (capability `api`) has it report through the
   * session API, else `events` (capability `events`) asks for the JSON
   * event stream.
   */
  startSession: (action: SessionAction, events: boolean, api: boolean) =>
    invoke<void>("start_session", { action, events, api }),
  /** Follow a session already running, through its API; whether one is followed. */
  connectSession: () => invoke<boolean>("connect_session"),
  stopSession: () => invoke<CliResult>("stop_session"),
  /** `play --json`: start the game in the running `serve` session. */
  playGame: () => invoke<CliResult>("play_game"),
  /** `car-images --json`: decode each car's pictures into the data folder. */
  carImages: () => invoke<CliResult>("car_images"),
  /** `map-images --json`: decode the game's world map into the data folder. */
  mapImages: () => invoke<CliResult>("map_images"),
  /**
   * `settings --json`, or the followed session API's `/v1/settings`: read the
   * traffic and rival amounts, or save one of them.
   */
  worldSettings: (traffic: number | null = null, rivals: string | null = null) =>
    invoke<CliResult>("world_settings", { traffic, rivals }),
  recorded: () => invoke<Recorded>("recorded"),
  openFolder: (which: Folder) => invoke<void>("open_folder", { which }),
  sessionActivity: () => invoke<Activity>("session_activity"),
  backupSaves: (from: string, to: string) => invoke<BackupReport>("backup_saves", { from, to }),
  appInfo: () => invoke<AppInfo>("app_info"),
  /**
   * `profile --json` for the active save (the followed session API's
   * `/v1/profile`), or the account named.
   */
  profile: (accountId: string | null = null) => invoke<CliResult>("profile", { accountId }),
  story: () => invoke<CliResult>("story"),
  storyPreview: (accountId: string, target: string) =>
    invoke<CliResult>("story_preview", { accountId, target }),
  storyApply: (accountId: string, target: string, expectedGeneration: string, planId: string) =>
    invoke<CliResult>("story_apply", { accountId, target, expectedGeneration, planId }),
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

/**
 * Calls `change` with whether the window is maximized, now and after every
 * resize (the Maximize button, a double click on the header, Windows Snap),
 * so the middle window button can show Restore.
 */
export async function onMaximizedChange(change: (maximized: boolean) => void): Promise<Unlisten> {
  if (!inTauri) return () => {};
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const current = getCurrentWindow();
  change(await current.isMaximized());
  return current.onResized(async () => change(await current.isMaximized()));
}

export async function onSessionEvents(handlers: {
  output: (line: OutputLine) => void;
  status: (result: CliResult) => void;
  /** A `map-feed` record of the session's event stream, unchecked. */
  mapFeed: (event: unknown) => void;
  exit: (info: { action: SessionAction; code: number | null }) => void;
  closeBlocked: () => void;
  /** Closing: the launcher's own server is stopping first. */
  closing: () => void;
  /** The server did not stop in time; the window stays open. */
  closeFailed: (message: string) => void;
  /** Closing while the shared server runs: keep it running, or stop it? */
  closeAsk: () => void;
  /** Picking another server: this PC's own is being stopped first. */
  serverSwitching: (message: string) => void;
}): Promise<Unlisten> {
  if (!inTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const stops = await Promise.all([
    listen<OutputLine>("session-output", (e) => handlers.output(e.payload)),
    listen<CliResult>("session-status", (e) => handlers.status(e.payload)),
    listen<unknown>("map-feed", (e) => handlers.mapFeed(e.payload)),
    listen<{ action: SessionAction; code: number | null }>("session-exit", (e) =>
      handlers.exit(e.payload),
    ),
    listen("close-blocked", () => handlers.closeBlocked()),
    listen("closing", () => handlers.closing()),
    listen<string>("close-failed", (e) => handlers.closeFailed(e.payload)),
    listen("close-ask", () => handlers.closeAsk()),
    listen<string>("server-switching", (e) => handlers.serverSwitching(e.payload)),
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
