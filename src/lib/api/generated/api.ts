// Generated from schemas/api.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * How to reach a session's API: `api.json` and `nfs-afterhours api --json`.
 */
export interface ApiRecord {
  /**
   * The session this API serves.
   */
  id: string;
  /**
   * Send as `Authorization: Bearer <token>` with every request. 64
   * lowercase hexadecimal characters, new for every session.
   */
  token: string;
  /**
   * Base address, `http://127.0.0.1:<port>`; requests go to `<url>/v1/...`.
   */
  url: string;
  version: 1;
}
