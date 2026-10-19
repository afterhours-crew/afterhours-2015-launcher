// View models for the launch bar and the first-run checks. Pure functions,
// so the mapping from CLI records to words on screen is tested without a
// window.

import type { Preflight, SessionState, Status } from "$lib/api/types";

export type Platform = "windows" | "other";

export type Dot = "ready" | "warn" | "info" | null;

/**
 * What Play does: `start` (server and game), `serve` (server alone),
 * `stop`, `play` (start the game inside a running serve session, with the
 * server's `play` capability) or `restart` (for servers without it: stop
 * the serve session, then `start`).
 */
export type PlayAction = "start" | "serve" | "stop" | "play" | "restart";

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
  /** The server reports `play`: it can start the game in a serve session. */
  canPlay: boolean;
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
    action: PlayAction | null;
    disabled: boolean;
    reason: string | null;
    /** A tooltip for an enabled Play whose effect needs saying. */
    hint: string | null;
    busy: boolean;
  };
  /** The header's compact Play, on every view but the Garage home. */
  pill: HeaderPill;
}

/**
 * The same control as the launch bar's Play, compact: blue Play or Serve
 * when it can start, a glass pill naming the session state while one is
 * live (pressing it in game stops), and a disabled Play saying why.
 */
export interface HeaderPill {
  kind: "play" | "live" | "blocked";
  label: string;
  action: PlayAction | null;
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

/**
 * Where a session is. `hosting` is a ready `serve` session without a game:
 * the server runs and nobody is playing. A game makes it `in-game`, as a
 * ready `start` session is. Records from before `action` existed carry a
 * `game_running` derived from their game process ID (see status.ts).
 */
export type Phase =
  "idle" | "preparing" | "hosting" | "starting" | "activation" | "in-game" | "stopping";

export function sessionPhase(status: Status | null): Phase {
  if (!status || !isLive(status.state)) return "idle";
  switch (status.state) {
    case "preparing":
      return "preparing";
    case "starting":
      return "starting";
    case "activation":
      return "activation";
    case "stopping":
      return "stopping";
    default:
      return status.game_running || status.action === "start" ? "in-game" : "hosting";
  }
}

export const RESTART_HINT = "Your server restarts: it stops, then starts again with the game.";

export function launchBarModel(input: LaunchBarInput): LaunchBarModel {
  const serveOnly = input.platform !== "windows";
  const idleAction = serveOnly ? "serve" : "start";
  // The bar names the server, never a car (owner decision, 2026-10-19).
  // The server listens on loopback only, so it is always this PC only.
  const eyebrow = "Playing on";
  const title = "Your server";
  const phase = sessionPhase(input.status);
  const summary = `${phase === "idle" ? "Offline" : "Running"} · this PC only`;

  if (phase !== "idle" && input.status) {
    const live = (
      label: string,
      pillLabel: string,
      line: string,
      dot: Dot,
      action: PlayAction | null,
    ): LaunchBarModel => ({
      eyebrow,
      title,
      summary,
      stateLine: line,
      dot,
      play: {
        label,
        action,
        disabled: action === null,
        reason: null,
        hint: null,
        busy: action === null,
      },
      pill: {
        kind: "live",
        label: pillLabel,
        action,
        disabled: action === null,
        title: action === "stop" ? `${line} · Stop` : line,
        dot,
        caption: line,
      },
    });
    switch (phase) {
      case "preparing":
        return live("Preparing", "Preparing", "Checking game files and your account", "info", null);
      case "starting":
        return live(
          "Starting",
          "Starting",
          "Starting the game; wait for ready before pressing Space",
          "info",
          null,
        );
      case "activation":
        return live(
          "Sign in",
          "Sign in",
          "EA activation dialog open; finish it in the game",
          "warn",
          null,
        );
      case "stopping":
        return live(
          "Stopping",
          "Stopping",
          input.status.game_running ? "Closing the game, then the server" : "Stopping the server",
          "info",
          null,
        );
      case "in-game":
        return live("Stop", "In game", "In game · Press Space in the game", "ready", "stop");
      default:
        break;
    }
    // Hosting: the server runs without a game. Elsewhere than Windows no
    // game can join, so Play stops the server as it always did.
    if (serveOnly) return live("Stop", "Running", "Server running · Ready", "ready", "stop");
    const line = "Hosting · server running";
    const play: LaunchBarModel["play"] = input.canPlay
      ? { label: "Play", action: "play", disabled: false, reason: null, hint: null, busy: false }
      : {
          label: "Restart with game",
          action: "restart",
          disabled: false,
          reason: null,
          hint: RESTART_HINT,
          busy: false,
        };
    return {
      eyebrow,
      title,
      summary,
      stateLine: line,
      dot: "ready",
      play,
      pill: {
        kind: "play",
        label: play.label,
        action: play.action,
        disabled: false,
        title: input.canPlay
          ? "Play: start the game on your running server"
          : `Restart with the game. ${RESTART_HINT}`,
        dot: "ready",
        caption: line,
      },
    };
  }

  const state = input.status?.state;
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
    hint: null,
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
