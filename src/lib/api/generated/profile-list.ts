// Generated from schemas/profile-list.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * `profile --list --json`.
 */
export interface ProfileList {
  accounts: ProfileEntry[];
  content: ContentSource | null;
  truncated: boolean;
  version: 1;
  warnings: string[];
}
/**
 * One line of the account list.
 */
export interface ProfileEntry {
  account_id: string;
  active: boolean;
  bank: Bank | null;
  display_name: string | null;
  /**
   * Why this save could not be read; the other fields are then `null`.
   */
  error: string | null;
  level: number | null;
  score: number | null;
  stored_level: number | null;
  updated_at_ms: number | null;
  updated_at_utc: string | null;
}
export interface Bank {
  balance: number;
  formatted: string;
}
/**
 * Where the content came from, reported with the profile.
 */
export interface ContentSource {
  /**
   * `argument`, `current-session` or `only-cache`.
   */
  chosen_by: string;
  directory: string;
}
