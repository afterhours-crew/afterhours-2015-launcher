// Generated from schemas/game-endpoints.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * `GET /v1/game`: where a game, on this computer or another, reaches this
 * session's server. A game is routed to a relay on its own computer that
 * forwards to these ([`crate::relay`]); the server's answers give it the
 * rest of its addresses.
 */
export interface GameEndpoints {
  /**
   * The server's launcher services, `<IPv4 address>:<port>`, when it
   * serves them (a session with game support); `null` otherwise.
   */
  launcher_services: string | null;
  /**
   * The server's redirector, `<IPv4 address>:<port>`.
   */
  redirector: string;
  version: 1;
}
