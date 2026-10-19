// Update decisions as pure functions: whether a found update is offered,
// whether it may install now, whether saves are copied first, and what the
// window does next in each mode. The updater store (updater.svelte.ts) only
// carries these out; docs/ROADMAP.md states the rules.
//
// - Never install while a session runs. The supervisor outlives the window,
//   so the server is asked (`status --json`) and, when it cannot answer, the
//   data directory's records decide, failing closed.
// - Before an update that changes the bundled server, copy the saves.
// - Never offer a downgrade, of the launcher or of the server it bundles:
//   a newer server may migrate saves forward, and older servers refuse them.
// - Checks are background work: bounded, silent offline, never in Play's way.

import type { Activity, UpdateMode } from "$lib/api/types";
import { compareVersions, isNewer } from "./version";

/** First background check after start-up, then every six hours. */
export const FIRST_CHECK_DELAY_MS = 8_000;
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Bound on one check, so an offline machine fails fast and quietly. */
export const CHECK_TIMEOUT_MS = 15_000;
/** How often a waiting automatic update asks again whether a session ended. */
export const WAIT_RETRY_MS = 60_000;

export const RELEASES_URL = "https://github.com/afterhours-crew/afterhours-2015-launcher/releases";

const LIVE = new Set(["preparing", "starting", "activation", "ready", "stopping"]);

/** The server a candidate bundles, from the `server` field the release adds to latest.json. */
export interface CandidateServer {
  tag: string;
  executable_sha256: string | null;
}

export interface Candidate {
  version: string;
  notes: string;
  date: string | null;
  server: CandidateServer | null;
}

const TAG = /^v(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(-[0-9A-Za-z.-]{1,64})?$/;

/** Read `server` from the update manifest; anything malformed is `null`. */
export function candidateServer(rawJson: unknown): CandidateServer | null {
  if (typeof rawJson !== "object" || rawJson === null) return null;
  const server = (rawJson as { server?: unknown }).server;
  if (typeof server !== "object" || server === null) return null;
  const { tag, executable_sha256 } = server as Record<string, unknown>;
  if (typeof tag !== "string" || !TAG.test(tag)) return null;
  const sha =
    typeof executable_sha256 === "string" && /^[0-9a-f]{64}$/.test(executable_sha256)
      ? executable_sha256
      : null;
  return { tag, executable_sha256: sha };
}

export type Offer =
  | { kind: "none" }
  | {
      kind: "refused";
      reason: "server-downgrade" | "server-unknown";
      message: string;
    }
  | { kind: "offer"; serverChanges: boolean; skipped: boolean };

/** Whether a found update is offered at all. */
export function evaluateCandidate(input: {
  currentVersion: string;
  currentServerTag: string;
  candidate: Candidate;
  skippedVersion: string | null;
}): Offer {
  const { candidate } = input;
  if (!isNewer(candidate.version, input.currentVersion)) return { kind: "none" };
  if (!candidate.server) {
    return {
      kind: "refused",
      reason: "server-unknown",
      message: `Launcher ${candidate.version} does not say which server it bundles, so it is not offered. Your saves stay as they are.`,
    };
  }
  const order = compareVersions(candidate.server.tag, input.currentServerTag);
  if (order === null) {
    return {
      kind: "refused",
      reason: "server-unknown",
      message: `Launcher ${candidate.version} names server ${candidate.server.tag}, which is not a version. It is not offered.`,
    };
  }
  if (order < 0) {
    return {
      kind: "refused",
      reason: "server-downgrade",
      message: `Launcher ${candidate.version} bundles server ${candidate.server.tag}, older than your ${input.currentServerTag}. Older servers refuse saves a newer one has upgraded, so it is not offered.`,
    };
  }
  return {
    kind: "offer",
    serverChanges: order > 0,
    skipped: input.skippedVersion === candidate.version,
  };
}

export type Gate =
  | { allowed: true }
  | {
      allowed: false;
      reason: "window-session" | "live-session" | "unverified-session";
      message: string;
    };

/** Whether an update may install now. */
export function installGate(activity: Activity): Gate {
  if (activity.window_session) {
    return {
      allowed: false,
      reason: "window-session",
      message:
        "The update waits: a session you started here is still running. It installs once you stop playing.",
    };
  }
  if (activity.cli.kind === "ok") {
    if (LIVE.has(activity.cli.state)) {
      return {
        allowed: false,
        reason: "live-session",
        message: `The update waits: a session is running (${activity.cli.state}), and installing would replace the server under your game. It installs once the session ends.`,
      };
    }
    return { allowed: true };
  }
  const recorded = activity.recorded;
  if (recorded.kind === "session" && LIVE.has(recorded.state) && recorded.lock_held !== false) {
    return {
      allowed: false,
      reason: "unverified-session",
      message: `The update waits: the server could not be asked (${activity.cli.message}) and the last session is recorded as ${recorded.state}. Stop that session, or make sure no Afterhours window or process is left, then try again.`,
    };
  }
  return { allowed: true };
}

export interface BackupPlan {
  required: boolean;
  from: string;
  to: string;
}

/** Copy saves before any update whose bundled server differs from ours. */
export function backupPlan(currentServerTag: string, server: CandidateServer): BackupPlan {
  return {
    required: compareVersions(server.tag, currentServerTag) !== 0,
    from: currentServerTag,
    to: server.tag,
  };
}

export type Step = "nothing" | "banner" | "install" | "wait";

/**
 * What the window does with an offer. Ask shows a banner unless the user
 * said Later or skipped this version; Auto installs when the gate allows and
 * otherwise waits; Off only reacts to a check the user asked for.
 */
export function nextStep(input: {
  mode: UpdateMode;
  offer: Offer;
  gate: Gate | null;
  dismissed: boolean;
  manual: boolean;
}): Step {
  if (input.offer.kind !== "offer") return "nothing";
  if (input.manual) return "banner";
  if (input.mode === "off") return "nothing";
  if (input.mode === "auto") return input.gate?.allowed ? "install" : "wait";
  if (input.offer.skipped || input.dismissed) return "nothing";
  return "banner";
}

export function backgroundChecks(mode: UpdateMode): boolean {
  return mode !== "off";
}

/** Shown once after an update changed the bundled server, until the next start. */
export function serverChangeNotice(lastTag: string | null, currentTag: string): string | null {
  if (!lastTag || compareVersions(lastTag, currentTag) === 0) return null;
  return `The server is now ${currentTag} (was ${lastTag}). Your next start may rebuild the game content cache, which can take a few minutes.`;
}
