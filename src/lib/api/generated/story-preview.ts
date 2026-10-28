// Generated from schemas/story-preview.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

export interface Preview {
  account_id: string;
  can_apply: boolean;
  completes: Milestone[];
  generation: string;
  operation_id: string;
  /**
   * Binds the exact save file, account, generation, target and prepared rules.
   */
  plan_id: string;
  reasons: string[];
  reopens: Milestone[];
  source_checkpoint: string;
  /**
   * The choice this preview's `plan_id` binds, from `--starter`.
   */
  starter: string | null;
  /**
   * First-car choices, listed only when this change completes the car
   * choice on a save without a starter. Apply then requires one of them.
   */
  starters: Starter[];
  target_checkpoint: string;
  version: 1;
}
export interface Milestone {
  id: string;
  label: string;
}
export interface Starter {
  /**
   * Item definition GUID, 32 lowercase hexadecimal digits.
   */
  id: string;
  /**
   * The game's car name when the installation provides one.
   */
  name: string | null;
}
