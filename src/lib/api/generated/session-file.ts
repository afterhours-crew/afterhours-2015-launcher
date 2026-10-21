// Generated from schemas/session-file.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * `GET /v1/sessions/<id>/files/<name>`: the start of one session file.
 */
export interface SessionFileText {
  /**
   * The file's size.
   */
  bytes: number;
  /**
   * The session.
   */
  id: string;
  /**
   * The file's name in the session folder.
   */
  name: string;
  /**
   * The first bytes as text, at most the session's log bound; invalid
   * UTF-8 is replaced.
   */
  text: string;
  /**
   * Whether the file is longer than what `text` holds.
   */
  truncated: boolean;
  version: 1;
}
