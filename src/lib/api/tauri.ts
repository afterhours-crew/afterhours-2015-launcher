// Thin wrappers over the Tauri commands in src-tauri/src. Outside Tauri
// (plain `vite dev` in a browser) every call rejects with a clear message so
// the shell still renders for styling work.

import type {
  CliInfo,
  CliResult,
  OutputLine,
  Preflight,
  SessionAction,
  Settings,
  Status,
} from "./types";

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!inTauri) {
    throw new Error("This action needs the desktop window; run `pnpm tauri dev`.");
  }
  const core = await import("@tauri-apps/api/core");
  return (core.invoke as Invoke)<T>(command, args);
}

export const api = {
  getSettings: () => invoke<Settings>("get_settings"),
  saveSettings: (settings: Settings) => invoke<Settings>("save_settings", { settings }),
  detectGameDirs: () => invoke<string[]>("detect_game_dirs"),
  locateCli: () => invoke<CliInfo>("locate_cli"),
  runCheck: () => invoke<CliResult>("run_check"),
  sessionStatus: () => invoke<CliResult>("session_status"),
  startSession: (action: SessionAction) => invoke<void>("start_session", { action }),
  stopSession: () => invoke<CliResult>("stop_session"),
  sessionDir: () => invoke<string | null>("session_dir"),
};

export async function pickFolder(title: string): Promise<string | null> {
  if (!inTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const chosen = await open({ directory: true, multiple: false, title });
  return typeof chosen === "string" ? chosen : null;
}

export async function openPath(path: string): Promise<void> {
  if (!inTauri) return;
  const { openPath: open } = await import("@tauri-apps/plugin-opener");
  await open(path);
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
}): Promise<Unlisten> {
  if (!inTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const stops = await Promise.all([
    listen<OutputLine>("session-output", (e) => handlers.output(e.payload)),
    listen<CliResult>("session-status", (e) => handlers.status(e.payload)),
    listen<{ action: SessionAction; code: number | null }>("session-exit", (e) =>
      handlers.exit(e.payload),
    ),
  ]);
  return () => stops.forEach((stop) => stop());
}

/** `status --json` prints `{"state":"none"}` when no session exists. */
export function statusFromResult(result: CliResult): Status | null {
  if (result.kind !== "ok") return null;
  const value = result.value as { state?: string; id?: string };
  if (!value || value.state === "none" || typeof value.id !== "string") return null;
  return value as Status;
}

export function preflightFromResult(result: CliResult): Preflight | null {
  return result.kind === "ok" ? (result.value as Preflight) : null;
}
