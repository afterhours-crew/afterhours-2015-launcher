// Generated from schemas/car-images.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * Which of a car's two images.
 */
export type Size = "medium" | "large";

/**
 * `car-images --json`.
 */
export interface CarImagesReport {
  /**
   * Whether this run decoded the set; `false` when a complete set was
   * reused without reading the installation.
   */
  built: boolean;
  /**
   * Car definitions the installation lists.
   */
  cars: number;
  /**
   * The image set's directory.
   */
  directory: string;
  /**
   * PNG files in the set; cars sharing a texture share a file.
   */
  files: number;
  /**
   * The content entry the set belongs to.
   */
  fingerprint: string;
  /**
   * Decoded images by their source texture format, such as `BC1_UNORM`.
   */
  formats: {
    [k: string]: number | undefined;
  };
  /**
   * The installation the images were decoded from.
   */
  game_directory: string;
  /**
   * Car items that name an image, per size.
   */
  named: SizeCounts;
  /**
   * Named images decoded, per size.
   */
  resolved: SizeCounts;
  /**
   * Named images that could not be decoded, and why.
   */
  unresolved: Unresolved[];
  version: 1;
}
/**
 * Counts per image size.
 */
export interface SizeCounts {
  large: number;
  medium: number;
}
/**
 * A named image that could not be produced, and why.
 */
export interface Unresolved {
  definition: string;
  reason: string;
  size: Size;
  /**
   * The car item's texture name.
   */
  texture_name: string;
}
