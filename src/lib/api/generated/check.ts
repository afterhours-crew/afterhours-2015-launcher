// Generated from schemas/check.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * `check` output.
 */
export interface Preflight {
  /**
   * SHA-256 of the installed activation helper; `null` when not checked.
   */
  activation_sha256: string | null;
  /**
   * File name the server runs under so the game accepts it (`start` only).
   */
  compatibility_name: string | null;
  data_directory: string;
  /**
   * `checked during setup`: `check` itself writes nothing.
   */
  directory_write_access: string;
  game_directory: string | null;
  /**
   * SHA-256 of the installed `NFS16.exe`; `null` when no game was checked.
   */
  game_sha256: string | null;
  /**
   * Always empty: the launcher changes no machine-wide setting.
   */
  machine_changes: string[];
  /**
   * The existing EA client registration the game uses, read-only.
   */
  registered_client_path: string | null;
  /**
   * Always `false`: the launcher never needs administrator rights.
   */
  requires_administrator: boolean;
  server_path: string;
  /**
   * SHA-256 of the server executable, lowercase hexadecimal.
   */
  server_sha256: string;
  version: 1;
}
