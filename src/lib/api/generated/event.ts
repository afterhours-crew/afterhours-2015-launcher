// Generated from schemas/event.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * One line of the event stream.
 */
export type Event = {
  /**
   * When the event was written, UTC.
   */
  utc: string;
  version: 1;
} & (
  | {
      action: Action;
      data_directory: string;
      event: "session";
      /**
       * Session ID: 32 lowercase hexadecimal characters.
       */
      id: string;
      /**
       * `artifacts/launcher/<id>/` with this session's logs and records.
       */
      session_directory: string;
    }
  | {
      event: "status";
      status: Status;
    }
  | {
      event: "diagnostic";
      source: DiagnosticSource;
      text: string;
    }
  | {
      event: "final";
      /**
       * The process exit code; see the exit code table in `--help`.
       */
      exit_code: number;
      /**
       * Why the command failed; `null` on success.
       */
      message: string | null;
      /**
       * The session's final status; `null` when the command was refused
       * before the supervisor recorded one.
       */
      status: Status | null;
    }
);
/**
 * What a session was asked to do.
 */
export type Action = "setup" | "serve" | "start";
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
 * The child that wrote a diagnostic line.
 */
export type DiagnosticSource = "prepare" | "create-account" | "server" | "game";

/**
 * `artifacts/launcher/<id>/status.json`: the supervisor's latest state.
 * Also the final record of `setup`, `serve` and `start` with `--json`.
 */
export interface Status {
  /**
   * What the session was started as. `serve` hosts the server and may
   * start the game on request; `null` only in records written before
   * this field existed.
   */
  action: Action | null;
  game_pid: number | null;
  /**
   * Whether the session's game process is running: from its start until
   * it exits. With `action` `serve` this tells hosting from playing.
   * Always `false` for an interrupted session.
   */
  game_running: boolean;
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
