// Generated from schemas/status.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * Session states, in the order a successful session passes through them.
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

/**
 * `status --json`.
 */
export interface StatusReport {
  /**
   * The current session's latest status, or `null` when no session was
   * ever started in this data directory. A live state whose supervisor
   * is gone is reported as `interrupted`.
   */
  session: Status | null;
  version: 1;
}
/**
 * `artifacts/launcher/<id>/status.json`: the supervisor's latest state.
 * Also the final record of `setup`, `serve` and `start` with `--json`.
 */
export interface Status {
  game_pid: number | null;
  /**
   * Session ID: 32 lowercase hexadecimal characters.
   */
  id: string;
  /**
   * What the session is doing or why it ended, for a person to read.
   */
  message: string;
  server_pid: number | null;
  state: State;
  /**
   * When this state was recorded, UTC. Records written by the old
   * PowerShell launcher use a longer ISO 8601 form with an offset.
   */
  utc: string;
  version: 1;
  /**
   * Supervisor process ID when recorded. Process IDs may be reused after
   * the process exits; verify identity before acting on one.
   */
  worker_pid: number;
}
