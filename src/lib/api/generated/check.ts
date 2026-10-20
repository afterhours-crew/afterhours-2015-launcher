// Generated from schemas/check.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * What `check --json` prints when the installation passes: the read-only preflight record. Vendored from afterhours-2015 v0.3.0 (crates/launcher/src/records.rs) until the server publishes its own schemas.
 */
export interface Preflight {
  version: 1;
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
