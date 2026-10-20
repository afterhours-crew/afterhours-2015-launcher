// Generated from schemas/api-error.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * The body of every refused API request.
 */
export interface ApiError {
  /**
   * What was refused and why, for a person to read.
   */
  message: string;
  version: 1;
}
