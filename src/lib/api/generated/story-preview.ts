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
  target_checkpoint: string;
  version: 1;
}
export interface Milestone {
  id: string;
  label: string;
}
