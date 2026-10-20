// Generated from schemas/settings.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * `settings --json`: the saved traffic and rival amounts, which every later
 * `setup`, `serve` and `start` uses and a running session applies.
 */
export interface SettingsReport {
  /**
   * `settings.json` in the data directory; it may not exist yet.
   */
  file: string;
  /**
   * Whether saving applies to a running session within about a second
   * (the server watches `settings.json`); when `false`, a running
   * session keeps the values it started with and saving is refused.
   */
  live: boolean;
  /**
   * Largest `rival_limit` this build accepts.
   */
  max_rivals: number;
  /**
   * Largest `traffic_percent` this build accepts.
   */
  max_traffic_percent: number;
  /**
   * Roaming rivals kept active; 0 turns them off and `null` keeps the
   * original number.
   */
  rival_limit: number | null;
  /**
   * Whether a `rival_limit` above the game's own number adds roaming
   * rivals (other installed racers near the player, each at most once).
   * When `false` it only caps the game's own.
   */
  rivals_above_original: boolean;
  /**
   * Whether this command saved the file.
   */
  saved: boolean;
  /**
   * Ambient traffic as a percentage of the original amount; 0 turns it
   * off and 100 is the original.
   */
  traffic_percent: number;
  version: 1;
}
