// Checks a release's latest.json and adds the bundled server to it.
//
//   node scripts/updater-manifest.mjs <latest.json>
//
// The release workflow downloads tauri-action's latest.json from the draft
// release, runs this, and uploads the result in its place. The launcher
// refuses an update whose manifest does not name its server, or names an
// older one (src/lib/state/updates.ts).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PIN_FILE, parsePin } from "./lib/pin.mjs";
import { annotateManifest } from "./lib/release.mjs";

const REPOSITORY = "afterhours-crew/afterhours-2015-launcher";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
if (!file) {
  console.error("usage: updater-manifest.mjs <latest.json>");
  process.exit(2);
}
try {
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const pin = parsePin(readFileSync(join(root, PIN_FILE), "utf8"));
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  const annotated = annotateManifest(manifest, { version, repository: REPOSITORY, pin });
  writeFileSync(file, JSON.stringify(annotated, null, 2) + "\n");
  console.log(`latest.json for ${version} names server ${pin.tag}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
