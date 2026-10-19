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

import type { CarImages, Profile } from "$lib/api/types";

export type ImageSize = "medium" | "large";

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
export function carImagePath(
  image: CarImages | null | undefined,
  size: ImageSize,
  enabled: boolean,
  dir: string | null,
): string | null {
  if (!enabled || !image || !dir) return null;
  const other: ImageSize = size === "medium" ? "large" : "medium";
  const chosen = image[size] ?? image[other];
  return chosen && insideDir(chosen.path, dir) ? chosen.path : null;
}

/**
 * Whether the launcher should run `car-images`: the server can, the save
 * has cars, and the profile reports no image set for the current content.
 */
export function needsCarImages(profile: Profile | null, enabled: boolean): boolean {
  return enabled && profile !== null && profile.cars !== null && profile.car_images === null;
}
