// Prepare an explicitly identified local NSIS preview input. Never changes the
// production pin or publishes a release. Build/bundle with the printed config.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { BUNDLED_SERVER_STEM, sha256, SIDECAR_TARGET } from "./lib/pin.mjs";
import { previewBundleConfig, validatePreviewServer } from "./lib/preview-package.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const option = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
try {
  const source = option("--server-package");
  const destination = option("--out");
  if (!source || !destination) {
    throw new Error("Use --server-package <canonical package folder> --out <new folder>.");
  }
  const server = resolve(source);
  const out = resolve(destination);
  const info = JSON.parse(
    readFileSync(join(server, "build-info.json"), "utf8").replace(/^\uFEFF/, ""),
  );
  const bytes = readFileSync(join(server, "Afterhours.exe"));
  validatePreviewServer(info, bytes);
  const contract = spawnSync(process.execPath, ["scripts/contract.mjs"], {
    cwd: root,
    env: { ...process.env, AFTERHOURS_EXE: join(server, "Afterhours.exe") },
    stdio: "inherit",
  });
  if (contract.status !== 0) throw new Error("Preview server failed the GUI contract.");
  mkdirSync(out); // Existing evidence is never overwritten.
  const input = join(out, "input");
  mkdirSync(input);
  writeFileSync(join(input, `${BUNDLED_SERVER_STEM}-${SIDECAR_TARGET}.exe`), bytes);
  for (const name of ["LICENSE", "THIRD-PARTY-NOTICES.txt", "build-info.json"]) {
    copyFileSync(join(server, name), join(input, name));
  }
  const distribution = JSON.parse(
    readFileSync(join(root, "packaging/prologue-preview.json"), "utf8"),
  );
  const files = previewBundleConfig(input.replaceAll("\\", "/"));
  const config = { ...distribution, bundle: { ...distribution.bundle, ...files.bundle } };
  writeFileSync(join(out, "tauri-preview.json"), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(
    join(out, "preview-input.json"),
    `${JSON.stringify({ server: info, executable_sha256: sha256(bytes), production_pin_changed: false }, null, 2)}\n`,
  );
  console.log(join(out, "tauri-preview.json"));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
