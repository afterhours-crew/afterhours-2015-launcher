// Builds the no-install ZIP from a release build of the launcher.
//
//   node scripts/portable-zip.mjs --exe <launcher.exe> --out <folder>
//
// Run `pnpm sidecar` first: the ZIP takes the verified server from
// src-tauri/binaries and checks it against server-pin.json again. Prints
// the ZIP's path last, then nothing else. Windows only: the ZIP is made
// with the system's tar.exe.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PIN_FILE, parsePin, sha256 } from "./lib/pin.mjs";
import { portableLayout, zipName } from "./lib/portable.mjs";

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
  const stage = join(resolve(out), "stage");
  rmSync(stage, { recursive: true, force: true });
  for (const file of portableLayout({ root, exe: resolve(exe), pin })) {
    if (!existsSync(file.from)) throw new Error(`${file.from} is missing.`);
    if (file.sha256 && sha256(readFileSync(file.from)) !== file.sha256) {
      throw new Error(`${file.from} is not the pinned server. Run pnpm sidecar again.`);
    }
    const to = join(stage, file.to);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(file.from, to);
  }
  const zip = join(resolve(out), zipName(version));
  rmSync(zip, { force: true });
  // Name the top-level entries: no shell expands a wildcard here, and "."
  // would prefix every path in the ZIP with "./".
  const entries = readdirSync(stage);
  execFileSync("tar.exe", ["-a", "-c", "-f", zip, "-C", stage, ...entries], { stdio: "inherit" });
  console.log(`${zipName(version)} SHA-256 ${sha256(readFileSync(zip))}`);
  console.log(zip);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
