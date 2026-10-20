// Generated from schemas/status-legacy.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * What `status --json` prints: {"state":"none"} before any session, otherwise the current session's status record. Vendored from afterhours-2015 v0.3.0 (crates/launcher/src/records.rs and commands/status.rs) until the server publishes its own schemas.
 */
export type StatusReport = NoSession | Status;
/**
 * Session states in the order a successful session passes through them. `interrupted` is derived on read: a live state whose supervisor no longer holds the data directory lock.
 */
export type State =
  | "preparing"
  | "starting"
  | "activation"
  | "ready"
  | "stopping"
  | "finished"
  | "failed"
  | "interrupted";

export interface NoSession {
  state: "none";
}
/**
 * artifacts/launcher/<id>/status.json: the supervisor's latest state.
 */
export interface Status {
  version: 1;
  id: string;
  utc: string;
  state: State;
  message: string;
  worker_pid: number;
  game_pid: number | null;
  server_pid: number | null;
}
