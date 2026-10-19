// The Garage home's side panel: how the current or last session went, in
// a line or two. Pure, so the wording is tested without a window.

import type { SessionSummary, Status } from "$lib/api/types";
import { formatSaved, type Clock } from "./format";
import { isLive } from "./launchbar";
import { stateWords } from "./logs";

export interface LastSession {
  /** "Session" while one runs, else "Last session". */
  title: string;
  state: string;
  dot: "ready" | "warn" | "info" | null;
  /** "Today 15:24": when the state was recorded or the session ended. */
  when: string | null;
  /** Server-log warnings, when the session list has this session. */
  warnings: number | null;
  /** What the session said last, for the message row. */
  message: string | null;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The status the window knows, else the newest listed session (the server
 * lists them newest first). `null` when there has been none.
 */
export function lastSession(
  status: Status | null,
  sessions: readonly SessionSummary[] | null,
  now: Date,
  clock: Clock = {},
): LastSession | null {
  const summary = (status ? sessions?.find((s) => s.id === status.id) : sessions?.[0]) ?? null;
  if (!status && !summary) return null;
  const state = status?.state ?? summary?.state ?? null;
  const words = stateWords(state);
  const utc = status?.utc || summary?.ended_utc || summary?.started_utc || null;
  return {
    title: isLive(status?.state) ? "Session" : "Last session",
    state: words.label,
    dot: words.dot,
    when: utc ? capitalize(formatSaved(utc, now, clock)) : null,
    warnings: summary?.server_log ? summary.server_log.levels.warn : null,
    message: status?.message || summary?.message || null,
  };
}
