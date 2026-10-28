// Generated from schemas/story-preview.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * `story --preview --json`: the server's preview of a story edit, with
 * names and pictures for its first-car choices.
 */
export interface Preview {
  account_id: string;
  can_apply: boolean;
  /**
   * The directory of the decoded car images; `null` until `car-images`
   * has run for the current content.
   */
  car_images: string | null;
  completes: Milestone[];
  generation: string;
  operation_id: string;
  /**
   * Binds the exact save file, account, generation, target, first car and
   * prepared rules.
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
/**
 * One first-car choice of a story preview, with what this computer knows of it.
 */
export interface Starter {
  /**
   * Item definition GUID, 32 lowercase hexadecimal digits; pass it as
   * `--starter`.
   */
  id: string;
  /**
   * The car's decoded pictures, as on profile cars; `null` until
   * `car-images` has run for the current content, or when the set has
   * none for this car.
   */
  image: CarImages | null;
  /**
   * The game's long car name from the installation; `null` when it
   * cannot be read.
   */
  name: string | null;
}
/**
 * A car's cached images; a size is `null` when the car names none or it
 * could not be decoded.
 */
export interface CarImages {
  large: CarImage | null;
  medium: CarImage | null;
}
/**
 * One cached image for `profile`.
 */
export interface CarImage {
  /**
   * The file below the server's content folder,
   * `car-images/<fingerprint>/<name>.png`, as the session API's
   * `GET /v1/content/<file>` serves it to a client on any computer.
   */
  file: string;
  height: number;
  /**
   * Absolute path of the PNG file.
   */
  path: string;
  /**
   * The source texture's `RenderFormat` name, such as `BC1_UNORM`.
   */
  source_format: string;
  width: number;
}
