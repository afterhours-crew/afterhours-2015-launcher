// Builds the no-install ZIP from a release build of the launcher.
//
//   node scripts/portable-zip.mjs --exe <launcher.exe> --out <folder>
//
// Run `pnpm sidecar` first: the ZIP takes the verified server from
// src-tauri/binaries and checks it against server-pin.json again. Prints
// the ZIP's path last, then nothing else. Windows only: the ZIP is made
// with the system's tar.exe.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BUNDLED_SERVER_STEM, PIN_FILE, parsePin, sha256, SIDECAR_TARGET } from "./lib/pin.mjs";
import { portableLayout, zipName } from "./lib/portable.mjs";
import { previewPortableLayout } from "./lib/preview-package.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function option(name) {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
}

try {
  const exe = option("--exe");
  const out = option("--out");
  if (!exe || !out) throw new Error("usage: portable-zip.mjs --exe <launcher.exe> --out <folder>");
  if (process.platform !== "win32") throw new Error("The no-install ZIP is built on Windows.");
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const pin = parsePin(readFileSync(join(root, PIN_FILE), "utf8"));
  const preview = option("--preview-input");
  let layout;
  let provenance;
  if (preview) {
    const input = join(resolve(preview), "input");
    const info = JSON.parse(
      readFileSync(join(input, "build-info.json"), "utf8").replace(/^\uFEFF/, ""),
    );
    const bytes = readFileSync(join(input, `${BUNDLED_SERVER_STEM}-${SIDECAR_TARGET}.exe`));
    layout = previewPortableLayout({ root, exe: resolve(exe), input, info, bytes });
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    if (git("status", "--porcelain", "--untracked-files=normal")) {
      throw new Error("Preview delivery requires a clean committed launcher checkout.");
    }
    provenance = {
      launcher_revision: git("rev-parse", "HEAD"),
      launcher_sha256: sha256(readFileSync(resolve(exe))),
      server: info,
      built_utc: new Date().toISOString(),
      production_pin_changed: false,
      game_validation: "pending",
    };
  } else {
    layout = portableLayout({ root, exe: resolve(exe), pin });
  }
  const stage = join(resolve(out), "stage");
  if (preview && existsSync(resolve(out))) throw new Error("Choose a new preview output folder.");
  if (!preview) rmSync(stage, { recursive: true, force: true });
  for (const file of layout) {
    if (!existsSync(file.from)) throw new Error(`${file.from} is missing.`);
    if (file.sha256 && sha256(readFileSync(file.from)) !== file.sha256) {
      throw new Error(`${file.from} does not match the selected server hash.`);
    }
    const to = join(stage, file.to);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(file.from, to);
  }
  if (provenance) {
    writeFileSync(join(stage, "preview-build.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  }
  const name = preview
    ? `Afterhours_Prologue_Preview_${version}_x64-portable.zip`
    : zipName(version);
  const zip = join(resolve(out), name);
  rmSync(zip, { force: true });
  // Name the top-level entries: no shell expands a wildcard here, and "."
  // would prefix every path in the ZIP with "./". Windows' own tar.exe by
  // its full path: under Git Bash, as in the release workflow, "tar.exe" is
  // GNU tar, which makes no ZIP and reads "D:\..." as a remote host.
  const entries = readdirSync(stage);
  const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  execFileSync(tar, ["-a", "-c", "-f", zip, "-C", stage, ...entries], { stdio: "inherit" });
  if (provenance) {
    writeFileSync(
      join(resolve(out), "preview-build.json"),
      `${JSON.stringify({ ...provenance, portable_sha256: sha256(readFileSync(zip)) }, null, 2)}\n`,
    );
  }
  console.log(`${name} SHA-256 ${sha256(readFileSync(zip))}`);
  console.log(zip);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
