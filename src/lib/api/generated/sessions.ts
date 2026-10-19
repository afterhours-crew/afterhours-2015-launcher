// Generated from schemas/sessions.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

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
 * `sessions --json`.
 */
export interface SessionList {
  /**
   * The folder searched for game crash dumps; `null` where the game
   * does not run or the folder is unknown.
   */
  crash_dump_directory: Location | null;
  /**
   * The session `current-session.json` names, if any.
   */
  current: string | null;
  data_directory: string;
  /**
   * The EA Desktop log folder; `null` where it does not apply.
   */
  ea_desktop_logs: Location | null;
  /**
   * Newest first, by the time the session was requested.
   */
  sessions: SessionSummary[];
  /**
   * More sessions exist than are listed.
   */
  truncated: boolean;
  version: 1;
  warnings: string[];
}
/**
 * A folder outside the data directory and whether it exists.
 */
export interface Location {
  exists: boolean;
  path: string;
}
/**
 * One session folder.
 */
export interface SessionSummary {
  /**
   * From `request.json`; `null` when it is missing or unreadable.
   */
  action: Action | null;
  /**
   * Game crash dumps written between the session's request and its
   * last status (or now, while it runs) plus two minutes. `null` when
   * the crash dump folder is unknown or the session has no start time.
   */
  crash_dumps: CrashDump[] | null;
  /**
   * Whether `current-session.json` names this session.
   */
  current: boolean;
  directory: string;
  /**
   * When the session finished or failed; `null` while it runs or when
   * it was interrupted.
   */
  ended_utc: string | null;
  /**
   * Ordinary files in the session folder, by name.
   */
  files: SessionFile[];
  /**
   * More files exist than are listed.
   */
  files_truncated: boolean;
  /**
   * Session ID: 32 lowercase hexadecimal characters.
   */
  id: string;
  message: string | null;
  /**
   * The server's recording folder, `artifacts/runs/<id>/`.
   */
  runs_directory: string;
  runs_directory_exists: boolean;
  /**
   * Summary of `server.stderr.log`; `null` when there is none or it
   * was not scanned (see `warnings`).
   */
  server_log: ServerLog | null;
  /**
   * When the session was requested (the modification time of
   * `request.json`), UTC.
   */
  started_utc: string | null;
  /**
   * `null` when `status.json` is missing or unreadable, for example
   * just before a new supervisor records its first state.
   */
  state: State | null;
  /**
   * When the latest status was recorded, as `status.json` says.
   */
  updated_utc: string | null;
  warnings: string[];
}
/**
 * A game crash dump.
 */
export interface CrashDump {
  bytes: number;
  modified_utc: string;
  name: string;
  path: string;
}
/**
 * One file in a session folder.
 */
export interface SessionFile {
  bytes: number;
  /**
   * Newline-separated lines, counting an unterminated last line; `null`
   * when the file was too large or the scan budget was spent.
   */
  lines: number | null;
  name: string;
  /**
   * The file reached the 4 MiB log bound; output after it was discarded.
   */
  truncated: boolean;
}
/**
 * What `server.stderr.log` contains.
 */
export interface ServerLog {
  /**
   * Complete lines by tracing level.
   */
  levels: Levels;
  /**
   * All lines, including an unterminated last one.
   */
  lines: number;
  /**
   * The file ends without a newline (still being written, or cut at the
   * log bound). That line is counted but not parsed.
   */
  partial_last_line: boolean;
  /**
   * Those lines grouped by service and route, most frequent first.
   */
  unsupported: UnsupportedRoute[];
  /**
   * Every `unsupported operation received` line.
   */
  unsupported_total: number;
  /**
   * More distinct groups existed than are listed; their lines are
   * still in `unsupported_total`.
   */
  unsupported_truncated: boolean;
}
/**
 * Complete lines by level. `other` counts continuation lines, panics,
 * overlong lines and anything without a timestamp and level.
 */
export interface Levels {
  debug: number;
  error: number;
  info: number;
  other: number;
  trace: number;
  warn: number;
}
/**
 * One group of `unsupported operation received` warnings.
 */
export interface UnsupportedRoute {
  /**
   * The `route` field as the server printed it, without `Some(...)`,
   * quotes and a Blaze route's per-request `correlation`; `null` when
   * absent or `None`.
   */
  route: string | null;
  /**
   * The `service` field, such as `lsx` or `blaze`.
   */
  service: string | null;
  /**
   * Warning lines in this group. The server rate-limits repeats, so
   * this counts warnings, not requests.
   */
  warnings: number;
}
