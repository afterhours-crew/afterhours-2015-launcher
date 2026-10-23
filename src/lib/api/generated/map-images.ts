// Generated from schemas/map-images.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * `map-images --json`.
 */
export interface MapImagesReport {
  /**
   * The tiled texture's name in the game.
   */
  asset: string;
  /**
   * Whether this run decoded the set; `false` when a complete set was
   * reused without reading the installation.
   */
  built: boolean;
  /**
   * The tile set's directory.
   */
  directory: string;
  /**
   * How a tile's file is named in `directory`: `{level}-{column}-{row}.png`,
   * columns from the left and rows from the top, counting from 0.
   */
  file_pattern: string;
  /**
   * PNG files in the set.
   */
  files: number;
  /**
   * The content entry the set belongs to.
   */
  fingerprint: string;
  /**
   * Decoded tiles by their source texture format, such as `BC3_UNORM`.
   */
  formats: {
    [k: string]: number | undefined;
  };
  /**
   * Width and height of level 0, which the build may not ship.
   */
  full_size: number;
  /**
   * The installation the map was decoded from.
   */
  game_directory: string;
  /**
   * Detail levels, the most detailed first.
   */
  levels: Level[];
  /**
   * Listed tiles that could not be decoded, and why.
   */
  missing: Missing[];
  /**
   * Width and height of every tile in pixels.
   */
  tile_size: number;
  version: 1;
  warnings: string[];
  /**
   * The world box the map covers; `null` when the installation has none
   * this program can read.
   */
  world: World | null;
}
/**
 * One detail level of the map.
 */
export interface Level {
  /**
   * The tiled texture's mip level: 0 is the full size, each level halves it.
   */
  level: number;
  /**
   * Width and height of the whole level in pixels.
   */
  size: number;
  /**
   * Tiles of this level in the set.
   */
  tiles: number;
  /**
   * Columns and rows of tiles.
   */
  tiles_per_side: number;
}
/**
 * A listed tile that could not be produced, and why.
 */
export interface Missing {
  column: number;
  level: number;
  reason: string;
  row: number;
}
/**
 * The world box the map covers, in metres. A position maps to
 * u = (x - min_x) / (max_x - min_x) and v = (z - min_z) / (max_z - min_z)
 * from the image's top-left corner.
 */
export interface World {
  max_x: number;
  max_z: number;
  min_x: number;
  min_z: number;
}
