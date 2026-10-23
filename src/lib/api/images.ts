// A car picture's URL. In the desktop window a decoded PNG is read through
// Tauri's asset protocol, whose scope allows only the data folder's
// `artifacts/content/car-images` (src-tauri/src/images.rs). The browser
// preview has no files: `?sample` draws a made-up tile per path, and
// without it there is no picture.

import { convertFileSrc } from "@tauri-apps/api/core";
import { sampleImageSrc, sampleMode } from "$lib/state/preview";
import { inTauri } from "./tauri";

/**
 * A picture's URL: through the server's API (`GET /v1/content/<file>`, by
 * the app's `afterhours://` protocol) when `file` is given, else the file
 * at `path` on this PC.
 */
export function imageSrc(path: string | null, file: string | null = null): string | null {
  if (file && inTauri) return convertFileSrc(`content/${file}`, "afterhours");
  if (!path) return null;
  if (inTauri) return convertFileSrc(path);
  return sampleMode && sampleImageSrc ? sampleImageSrc(path) : null;
}
