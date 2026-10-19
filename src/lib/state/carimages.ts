// Which in-game picture a car shows, from the profile's `image` and
// `car_images` (the server's `car-images` capability). Pure: the screens
// turn the chosen path into a URL (src/lib/api/tauri.ts `imageSrc`) and
// show a graphite tile with a car icon whenever this returns `null`.
//
// The server decodes each car's medium (256×256) and large (512×512)
// picture from the player's installation into
// `<data>/artifacts/content/car-images/<fingerprint>/`. Only files inside
// the folder the profile names are used; the window's asset scope allows
// that folder and nothing else.
//
// The two sizes are not the same shape on screen. The medium pictures (the
// game's driver-details textures) are true squares. The large ones (its
// collectibles textures) are 16:9 renders squeezed into a square: comparing
// both pictures of the same car, the large one needs 1.74-1.78 times its
// width to match (inferred from two cars; the game's own layout code was not
// read). Each picture therefore carries its display aspect, and `coverRect`
// stretches it back before filling a box.

import type { CarImages, Profile } from "$lib/api/types";

export type ImageSize = "medium" | "large";

/** Width over height each size is meant to be shown at. */
export const DISPLAY_ASPECT: Record<ImageSize, number> = { medium: 1, large: 16 / 9 };

/** A picture to show: its file and the aspect to show it at. */
export interface CarPicture {
  path: string;
  aspect: number;
}

/** `path` is inside `dir`: same drive and folders, no `..`, either separator, any case. */
export function insideDir(path: string, dir: string): boolean {
  const parts = (p: string) => p.split(/[\\/]+/).filter((s) => s.length > 0 && s !== ".");
  const file = parts(path);
  const base = parts(dir);
  if (file.includes("..") || base.includes("..") || base.length === 0) return false;
  if (file.length <= base.length) return false;
  return base.every((segment, i) => segment.toLowerCase() === file[i]!.toLowerCase());
}

/**
 * The picture to show at `size`: that size when the car has it, else the
 * other one (a large panel may show the medium picture enlarged, a
 * thumbnail the large one reduced). `null` without the capability, before
 * the images exist, when the car has none, or for a path outside `dir`.
 */
export function carPicture(
  image: CarImages | null | undefined,
  size: ImageSize,
  enabled: boolean,
  dir: string | null,
): CarPicture | null {
  if (!enabled || !image || !dir) return null;
  const other: ImageSize = size === "medium" ? "large" : "medium";
  const used: ImageSize = image[size] ? size : other;
  const chosen = image[used];
  return chosen && insideDir(chosen.path, dir)
    ? { path: chosen.path, aspect: DISPLAY_ASPECT[used] }
    : null;
}

/** A CSS `aspect-ratio` such as "16 / 9" or "1.5" as a number; 1 when unreadable. */
export function parseRatio(ratio: string): number {
  const [w, h = "1"] = ratio.split("/");
  const value = Number(w) / Number(h);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Where a picture shown at `aspect` sits to cover a box of aspect `box`, in
 * percent of the box: like `object-fit: cover` with `object-position: 50% 58%`
 * (the game frames each car a little below the middle), applied after the
 * picture is stretched back to its display aspect.
 */
export function coverRect(
  aspect: number,
  box: number,
): { left: number; top: number; width: number; height: number } {
  if (box >= aspect) {
    const height = (box / aspect) * 100;
    return { left: 0, top: (100 - height) * 0.58, width: 100, height };
  }
  const width = (aspect / box) * 100;
  return { left: (100 - width) / 2, top: 0, width, height: 100 };
}

/**
 * Whether the launcher should run `car-images`: the server can, the save
 * has cars, and the profile reports no image set for the current content.
 */
export function needsCarImages(profile: Profile | null, enabled: boolean): boolean {
  return enabled && profile !== null && profile.cars !== null && profile.car_images === null;
}
