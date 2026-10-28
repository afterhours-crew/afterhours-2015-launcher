// Generated from schemas/story-apply.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

export interface Applied {
  account_id: string;
  backup: Backup;
  generation: string;
  previous_generation: string;
  replayed: boolean;
  /**
   * The first car granted into garage slot 0 by this edit, once.
   */
  starter: string | null;
  target_checkpoint: string;
  version: 1;
}
export interface Backup {
  database_sha256: string;
  generation: string;
  /**
   * One immutable directory under artifacts/story-backups, never a path.
   */
  id: string;
}
