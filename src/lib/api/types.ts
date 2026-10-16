// Records exchanged with the command-line launcher. These mirror the JSON
// `nfs-afterhours --json` prints; see crates/launcher/README.md in the
// afterhours-2015 repository for the contract.

export type SessionState =
  | "preparing"
  | "starting"
  | "activation"
  | "ready"
  | "stopping"
  | "finished"
  | "failed"
  | "interrupted";

export interface Status {
  version: number;
  id: string;
  utc: string;
  state: SessionState;
  message: string;
  worker_pid: number;
  game_pid: number | null;
  server_pid: number | null;
}

export interface Preflight {
  version: number;
  game_directory: string | null;
  data_directory: string;
  server_path: string;
  server_sha256: string;
  game_sha256: string | null;
  activation_sha256: string | null;
  registered_client_path: string | null;
  compatibility_name: string | null;
  requires_administrator: boolean;
  machine_changes: string[];
  directory_write_access: string;
}

export type CliResult =
  { kind: "ok"; value: unknown } | { kind: "error"; exit: number; message: string };

export interface CliInfo {
  launcher: string | null;
  server: string | null;
  version: string | null;
}

export interface Settings {
  cli_dir: string | null;
  game_dir: string | null;
  data_dir: string | null;
  player_name: string | null;
  avatar: string | null;
  first_run_done: boolean;
}

export type OutputLine =
  { kind: "status"; time: string; state: string; message: string } | { kind: "text"; text: string };

export type SessionAction = "setup" | "serve" | "start";

export function emptySettings(): Settings {
  return {
    cli_dir: null,
    game_dir: null,
    data_dir: null,
    player_name: null,
    avatar: null,
    first_run_done: false,
  };
}
