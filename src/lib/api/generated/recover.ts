// Generated from schemas/recover.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * `recover --json`.
 */
export interface RecoverReport {
  /**
   * The account record now in `account.json`.
   */
  account: AccountRecord;
  version: 1;
  /**
   * Whether `account.json` was written now; `false` when it already
   * named this account.
   */
  written: boolean;
}
/**
 * `account.json`: which saved account this data directory uses.
 */
export interface AccountRecord {
  /**
   * The 32-character account ID; the save is `artifacts/account/<id>.sqlite`.
   */
  local_account: string;
  /**
   * Story progression the account was created with, `post-intro`.
   */
  progression: string;
  version: number;
}
