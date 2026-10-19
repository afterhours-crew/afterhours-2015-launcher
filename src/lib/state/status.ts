// The current session as `status --json` reports it, read the same way
// whichever contract the bundled server speaks:
//
//   contract v1   {"version":1,"session":null}  or  {"version":1,"session":<status>}
//   v0.3.0        {"state":"none"}              or  <status>
//
// Both carry the same status record. It is normalised into one `Status`,
// so the launch bar and the header Play pill behave the same with either
// server. This reads plain JSON structurally and imports no generated type
// of the legacy shape, so it keeps compiling after the pin moves past
// v0.3.0 and the legacy schema is dropped.

import type { SessionState, Status } from "$lib/api/types";

export const SESSION_STATES: readonly SessionState[] = [
  "preparing",
  "starting",
  "activation",
  "ready",
  "stopping",
  "finished",
  "failed",
  "interrupted",
];

type Json = Record<string, unknown>;
type Action = NonNullable<Status["action"]>;

const ACTIONS: readonly Action[] = ["setup", "serve", "start"];
/** States in which a game process can be running. */
const GAME_STATES: readonly SessionState[] = ["starting", "activation", "ready", "stopping"];

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isState(value: unknown): value is SessionState {
  return (SESSION_STATES as readonly unknown[]).includes(value);
}

function isAction(value: unknown): value is Action {
  return (ACTIONS as readonly unknown[]).includes(value);
}

const pid = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) ? value : null;

/**
 * One status record, normalised: only the contract's fields, in their
 * types, with `action` and `game_running` filled in for older records.
 * `null` when it has no session ID or a state this launcher does not know,
 * since nothing can be decided from it.
 */
export function readStatus(value: unknown): Status | null {
  if (!isObject(value) || typeof value.id !== "string" || !isState(value.state)) return null;
  const state = value.state;
  const gamePid = pid(value.game_pid);
  return {
    version: 1,
    id: value.id,
    // `null` in records from before `action` existed (v0.3.0).
    action: isAction(value.action) ? value.action : null,
    // Older records have no `game_running`: a game process ID in a state
    // where a game can run stands for it.
    game_running:
      typeof value.game_running === "boolean"
        ? value.game_running
        : gamePid !== null && GAME_STATES.includes(state),
    utc: typeof value.utc === "string" ? value.utc : "",
    state,
    message: typeof value.message === "string" ? value.message : "",
    worker_pid: pid(value.worker_pid) ?? 0,
    game_pid: gamePid,
    server_pid: pid(value.server_pid),
  };
}

/** Which `status --json` shape a reply has; `null` when it is neither. */
export function statusContract(value: unknown): "v1" | "legacy" | null {
  if (!isObject(value)) return null;
  if ("session" in value) return value.version === 1 ? "v1" : null;
  return value.state === "none" || readStatus(value) ? "legacy" : null;
}

/** The session in a `status --json` reply of either contract; `null` for none. */
export function readStatusReport(value: unknown): Status | null {
  switch (statusContract(value)) {
    case "v1":
      return (value as Json).session === null ? null : readStatus((value as Json).session);
    case "legacy":
      return (value as Json).state === "none" ? null : readStatus(value);
    default:
      return null;
  }
}
