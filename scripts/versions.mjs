// One launcher version everywhere: package.json, tauri.conf.json, Cargo.toml
// and Cargo.lock. With --tag, the tag must be "v" plus that version.
//
//   node scripts/versions.mjs              CI: the files agree
//   node scripts/versions.mjs --tag v0.2.0 release: the tag matches them
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launcherVersions, versionProblems } from "./lib/release.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const versions = launcherVersions({
  packageJson: read("package.json"),
  tauriConf: read("src-tauri/tauri.conf.json"),
  cargoToml: read("src-tauri/Cargo.toml"),
  cargoLock: read("src-tauri/Cargo.lock"),
});
const at = process.argv.indexOf("--tag");
const problems = versionProblems(versions, at >= 0 ? (process.argv[at + 1] ?? "") : undefined);
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(`Launcher version ${versions["package.json"]} everywhere.`);
