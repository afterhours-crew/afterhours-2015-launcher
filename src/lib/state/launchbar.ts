// View models for the launch bar and the first-run checks. Pure functions,
// so the mapping from CLI records to words on screen is tested without a
// window.

import type { Preflight, SessionState, Status } from "$lib/api/types";

export type Platform = "windows" | "other";

export type Dot = "ready" | "warn" | "info" | null;

export interface LaunchBarInput {
  platform: Platform;
  cliReady: boolean;
  gameChosen: boolean;
  status: Status | null;
  /** The window itself started a session that has not exited yet. */
  running: boolean;
}

export interface LaunchBarModel {
  eyebrow: string;
  title: string;
  stateLine: string;
  dot: Dot;
  play: {
    label: string;
    action: "start" | "serve" | "stop" | null;
    disabled: boolean;
    reason: string | null;
    busy: boolean;
  };
}

const LIVE: ReadonlySet<SessionState> = new Set([
  "preparing",
  "starting",
  "activation",
  "ready",
  "stopping",
]);

export function isLive(state: SessionState | undefined): boolean {
  return state !== undefined && LIVE.has(state);
}

export function detectPlatform(userAgent: string): Platform {
  return /Windows/i.test(userAgent) ? "windows" : "other";
}

export function launchBarModel(input: LaunchBarInput): LaunchBarModel {
  const serveOnly = input.platform !== "windows";
  const idleAction = serveOnly ? "serve" : "start";
  const title = serveOnly ? "This PC" : "Need for Speed (2015)";
  const eyebrow = serveOnly ? "Hosting" : "Last driven";
  const state = input.status?.state;

  if (isLive(state) && input.status) {
    const s = input.status;
    const busy = s.state !== "ready";
    const labels: Record<string, string> = {
      preparing: "Preparing",
      starting: "Starting",
      activation: "Sign in",
      ready: "Stop",
      stopping: "Stopping",
    };
    const lines: Record<string, string> = {
      preparing: "Checking game files and your account",
      starting: serveOnly
        ? "Starting the server"
        : "Starting the game; wait for ready before pressing Space",
      activation: "EA activation dialog open; finish it in the game",
      ready: serveOnly ? "Server running · Ready" : "Ready · Press Space in the game",
      stopping: "Closing the game, then the server",
    };
    return {
      eyebrow,
      title,
      stateLine: lines[s.state] ?? s.message,
      dot: s.state === "ready" ? "ready" : s.state === "activation" ? "warn" : "info",
      play: {
        label: labels[s.state] ?? "Working",
        action: s.state === "ready" ? "stop" : null,
        disabled: s.state !== "ready",
        reason: null,
        busy,
      },
    };
  }

  let reason: string | null = null;
  if (!input.cliReady) reason = "Set up the launcher in Settings";
  else if (!input.gameChosen) reason = "Choose the game folder";

  let stateLine = serveOnly ? "Server stopped · Play will start it" : "Ready to play";
  let dot: Dot = null;
  if (state === "failed") {
    stateLine = `Last session failed · ${input.status?.message ?? ""}`.trim();
    dot = "warn";
  } else if (state === "interrupted") {
    stateLine = "Last session was interrupted · Play starts a new one";
    dot = "warn";
  } else if (input.running) {
    stateLine = "Finishing up";
    dot = "info";
  }

  return {
    eyebrow,
    title,
    stateLine: reason ?? stateLine,
    dot: reason ? "warn" : dot,
    play: {
      label: serveOnly ? "Serve" : "Play",
      action: reason ? null : idleAction,
      disabled: reason !== null || input.running,
      reason,
      busy: false,
    },
  };
}

export interface CheckRow {
  label: string;
  value: string;
  ok: boolean;
}

/** The rows of the first run's "Check the files" step. */
export function firstRunChecks(preflight: Preflight, platform: Platform): CheckRow[] {
  const rows: CheckRow[] = [
    {
      label: "Game executable",
      value: preflight.game_sha256 ? "supported build" : "not checked",
      ok: preflight.game_sha256 !== null,
    },
    {
      label: "Server",
      value: `build ${preflight.server_sha256.slice(0, 12)}`,
      ok: true,
    },
    {
      label: "Data folder",
      value: preflight.data_directory,
      ok: true,
    },
  ];
  if (platform === "windows") {
    rows.push({
      label: "Launcher registration",
      value: preflight.compatibility_name ? `found · ${preflight.compatibility_name}` : "missing",
      ok: preflight.compatibility_name !== null,
    });
  }
  rows.push({
    label: "Machine changes",
    value:
      preflight.machine_changes.length === 0
        ? "none · no administrator rights"
        : preflight.machine_changes.join(", "),
    ok: preflight.machine_changes.length === 0 && !preflight.requires_administrator,
  });
  return rows;
}

/** A driver's initials for the avatar: first letters of up to two words. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s_\-.]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
  if (letters.length === 1 && words[0]!.length > 1) letters.push(words[0]![1]!.toUpperCase());
  return letters.join("");
}
