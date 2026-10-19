// View models for the launch bar and the first-run checks. Pure functions,
// so the mapping from CLI records to words on screen is tested without a
// window.

import type { Preflight, SessionState, Status } from "$lib/api/types";

export type Platform = "windows" | "other";

export type Dot = "ready" | "warn" | "info" | null;

export interface LaunchBarInput {
  platform: Platform;
  /** The bundled server was found. */
  serverReady: boolean;
  /** An update is about to install and close the app. */
  updating: boolean;
  gameChosen: boolean;
  status: Status | null;
  /** The window itself started a session that has not exited yet. */
  running: boolean;
}

export interface LaunchBarModel {
  eyebrow: string;
  title: string;
  /** Under the title: whether the server runs, and who can reach it. */
  summary: string;
  stateLine: string;
  dot: Dot;
  play: {
    label: string;
    action: "start" | "serve" | "stop" | null;
    disabled: boolean;
    reason: string | null;
    busy: boolean;
  };
  /** The header's compact Play, on every view but the Garage home. */
  pill: HeaderPill;
}

/**
 * The same control as the launch bar's Play, compact: blue Play or Serve
 * when it can start, a glass pill naming the session state while one is
 * live (pressing it when ready stops), and a disabled Play saying why.
 */
export interface HeaderPill {
  kind: "play" | "live" | "blocked";
  label: string;
  action: "start" | "serve" | "stop" | null;
  disabled: boolean;
  /** Tooltip and accessible name: what pressing it does, or why it cannot. */
  title: string;
  dot: Dot;
  /** The state line shown beside the pill; `null` when it says nothing new. */
  caption: string | null;
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
  // The bar names the server, never a car (owner decision, 2026-10-19).
  // The server listens on loopback only, so it is always this PC only.
  const eyebrow = "Playing on";
  const title = "Your server";
  const state = input.status?.state;
  const summary = `${isLive(state) ? "Running" : "Offline"} · this PC only`;

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
    const line = lines[s.state] ?? s.message;
    const dot: Dot = s.state === "ready" ? "ready" : s.state === "activation" ? "warn" : "info";
    const ready = s.state === "ready";
    return {
      eyebrow,
      title,
      summary,
      stateLine: line,
      dot,
      play: {
        label: labels[s.state] ?? "Working",
        action: ready ? "stop" : null,
        disabled: !ready,
        reason: null,
        busy,
      },
      pill: {
        kind: "live",
        // While live the pill says where you are; pressing it when ready stops.
        label: ready ? (serveOnly ? "Running" : "In game") : (labels[s.state] ?? "Working"),
        action: ready ? "stop" : null,
        disabled: !ready,
        title: ready ? `${line} · Stop` : line,
        dot,
        caption: line,
      },
    };
  }

  let reason: string | null = null;
  if (!input.serverReady) reason = "Server missing · see Settings › About";
  else if (input.updating) reason = "Installing an update";
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

  const play: LaunchBarModel["play"] = {
    label: serveOnly ? "Serve" : "Play",
    action: reason ? null : idleAction,
    disabled: reason !== null || input.running,
    reason,
    busy: false,
  };
  const line = reason ?? stateLine;
  const lineDot: Dot = reason ? "warn" : dot;
  return {
    eyebrow,
    title,
    summary,
    stateLine: line,
    dot: lineDot,
    play,
    pill: {
      kind: play.disabled ? "blocked" : "play",
      label: play.label,
      action: play.action,
      disabled: play.disabled,
      title:
        reason ??
        (play.disabled
          ? line
          : serveOnly
            ? "Serve: start your server"
            : "Play: start your server and the game"),
      dot: lineDot,
      // Idle and ready says nothing worth the space; a failure or a reason does.
      caption: lineDot ? line : null,
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
