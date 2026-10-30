// Generated from schemas/story-preview.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * The server owns the plan; the launcher adds installed names and cached images.
 */
export interface Preview {
  account_id: string;
  can_apply: boolean;
  car_images: string | null;
  completes: Milestone[];
  generation: string;
  operation_id: string;
  plan_id: string;
  reasons: string[];
  reopens: Milestone[];
  restart?: boolean;
  source_checkpoint: string;
  starter: string | null;
  starters: Starter[];
  target_checkpoint: string;
  version: 1;
}
export interface Milestone {
  id: string;
  label: string;
}
export interface Starter {
  id: string;
  image: CarImages | null;
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
