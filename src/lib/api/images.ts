// A car picture's URL. In the desktop window a decoded PNG is read through
// Tauri's asset protocol, whose scope allows only the data folder's
// `artifacts/content/car-images` (src-tauri/src/images.rs). The browser
// preview has no files: `?sample` draws a made-up tile per path, and
// without it there is no picture.

import { convertFileSrc } from "@tauri-apps/api/core";
import { sampleImageSrc, sampleMode } from "$lib/state/preview";
import { inTauri } from "./tauri";

export function imageSrc(path: string | null): string | null {
  if (!path) return null;
  if (inTauri) return convertFileSrc(path);
  return sampleMode && sampleImageSrc ? sampleImageSrc(path) : null;
}
