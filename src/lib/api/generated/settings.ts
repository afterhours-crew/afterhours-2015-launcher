// Generated from schemas/settings.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * `settings --json`: the saved traffic and rival amounts, which every later
 * `setup`, `serve` and `start` uses.
 */
export interface SettingsReport {
  /**
   * `settings.json` in the data directory; it may not exist yet.
   */
  file: string;
  /**
   * Largest `rival_limit` this build accepts.
   */
  max_rivals: number;
  /**
   * Largest `traffic_percent` this build accepts.
   */
  max_traffic_percent: number;
  /**
   * Most roaming rivals active at once; 0 turns them off and `null`
   * keeps the original number.
   */
  rival_limit: number | null;
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
