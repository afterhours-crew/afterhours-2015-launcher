// Generated from schemas/story.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

export interface StoryReport {
  account_id: string;
  can_edit: boolean;
  checkpoints: StoryCheckpoint[];
  current_checkpoint: string;
  generation: string;
  intro_completed: boolean;
  session_running: boolean;
  version: 1;
  warnings: string[];
}
export interface StoryCheckpoint {
  active: boolean;
  completed: boolean;
  edited: boolean;
  /**
   * Completion inherited from a save without a gameplay provenance receipt.
   */
  existing: boolean;
  /**
   * Exact native objective ID; `after-intro` is the terminal checkpoint.
   */
  id: string;
  /**
   * Authored label when the installed catalog supplies it.
   */
  label: string;
  played: boolean;
  reward_claimed: boolean;
  /**
   * True only after this runtime supports starting from this boundary.
   */
  selectable: boolean;
}
