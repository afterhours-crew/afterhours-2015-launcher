// The no-install ZIP: what it contains and where each file comes from.
// Pure, so the layout is tested; scripts/portable-zip.mjs copies and zips.
//
// The files sit side by side, as the installer places them, so the
// launcher finds its server next to itself and, unzipped into the game
// folder, finds the game there too. `portable.txt` marks the copy as not
// installed (src-tauri/src/updates.rs): it then offers each update's
// download page instead of installing it.
import { join } from "node:path";
import { BUNDLED_SERVER_NAME, noticesDir, sidecarPath } from "./pin.mjs";

/** The launcher's name inside the ZIP. */
export const LAUNCHER_NAME = "Afterhours2015Launcher.exe";
/** Tells the launcher it was not installed; must match updates.rs. */
export const MARKER_NAME = "portable.txt";

const VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(-[0-9A-Za-z.-]{1,64})?$/;

/** The ZIP's file name, beside the installer's `Afterhours_<version>_x64-setup.exe`. */
export function zipName(version) {
  if (!VERSION.test(version)) throw new Error(`${version} is not a launcher version.`);
  return `Afterhours_${version}_x64-portable.zip`;
}

/**
 * Every file in the ZIP: `to` inside the ZIP, `from` in the checkout.
 * `exe` is the release build of the launcher.
 */
export function portableLayout({ root, exe, pin }) {
  const notices = noticesDir(root);
  return [
    { from: exe, to: LAUNCHER_NAME },
    { from: sidecarPath(root), to: BUNDLED_SERVER_NAME, sha256: pin.executable_sha256 },
    { from: join(root, "packaging", MARKER_NAME), to: MARKER_NAME },
    { from: join(root, "LICENSE"), to: "LICENSE" },
    { from: join(notices, "LICENSE"), to: "afterhours-server/LICENSE" },
    {
      from: join(notices, "THIRD-PARTY-NOTICES.txt"),
      to: "afterhours-server/THIRD-PARTY-NOTICES.txt",
    },
    { from: join(notices, "build-info.json"), to: "afterhours-server/build-info.json" },
  ];
}
