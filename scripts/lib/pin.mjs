// The server pin, release checksums and the sidecar's place on disk.
// Pure helpers for scripts/server-pin.mjs and scripts/contract.mjs; the
// Rust side validates the same file in src-tauri/src/pin.rs.
import { createHash } from "node:crypto";
import { join } from "node:path";

export const PIN_FILE = "server-pin.json";
/** The only target the server repository publishes a bundle for. */
export const SIDECAR_TARGET = "x86_64-pc-windows-msvc";
/** Files from the server ZIP that ship with the launcher besides the executable. */
export const SERVER_NOTICES = ["LICENSE", "THIRD-PARTY-NOTICES.txt", "build-info.json"];

const KEYS = [
  "repository",
  "tag",
  "asset",
  "asset_sha256",
  "executable",
  "executable_sha256",
  "schemas",
];
const SHA256 = /^[0-9a-f]{64}$/;
const TAG = /^v(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(-[0-9A-Za-z.-]{1,64})?$/;
const FILE_NAME = /^[A-Za-z0-9._-]{1,128}$/;
const REPOSITORY = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export function isSha256(text) {
  return typeof text === "string" && SHA256.test(text);
}

export function isReleaseTag(text) {
  return typeof text === "string" && text.length <= 80 && TAG.test(text);
}

/** Parse and validate the pin file's text; throws with the reason. */
export function parsePin(text) {
  let pin;
  try {
    pin = JSON.parse(text);
  } catch (e) {
    throw new Error(`${PIN_FILE} is not JSON: ${e.message}`);
  }
  if (typeof pin !== "object" || pin === null || Array.isArray(pin)) {
    throw new Error(`${PIN_FILE} must hold one object.`);
  }
  const keys = Object.keys(pin).sort();
  if (keys.join() !== [...KEYS].sort().join()) {
    throw new Error(`${PIN_FILE} must have exactly the keys ${KEYS.join(", ")}.`);
  }
  if (!REPOSITORY.test(pin.repository))
    throw new Error(`${PIN_FILE}: repository must be owner/name.`);
  if (!isReleaseTag(pin.tag)) throw new Error(`${PIN_FILE}: tag must look like v1.2.3.`);
  for (const key of ["asset", "executable"]) {
    if (!FILE_NAME.test(pin[key]) || pin[key] === "." || pin[key] === "..") {
      throw new Error(`${PIN_FILE}: ${key} must be a plain file name.`);
    }
  }
  if (!pin.executable.endsWith(".exe"))
    throw new Error(`${PIN_FILE}: the executable must be a .exe.`);
  for (const key of ["asset_sha256", "executable_sha256"]) {
    if (!isSha256(pin[key])) throw new Error(`${PIN_FILE}: ${key} must be a lowercase SHA-256.`);
  }
  if (!["vendored", "release"].includes(pin.schemas)) {
    throw new Error(`${PIN_FILE}: schemas must be "vendored" or "release".`);
  }
  return pin;
}

/** The pin as written to disk: fixed key order, two-space indent, final newline. */
export function formatPin(pin) {
  const ordered = Object.fromEntries(KEYS.map((key) => [key, pin[key]]));
  parsePin(JSON.stringify(ordered));
  return JSON.stringify(ordered, null, 2) + "\n";
}

/** `SHA256SUMS.txt` lines (`<hash>  <name>` or `<hash> *<name>`) as a Map. */
export function parseSums(text) {
  const sums = new Map();
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^([0-9a-fA-F]{64}) [ *]?(.+)$/.exec(line);
    if (!match) throw new Error(`SHA256SUMS.txt line ${index + 1} is not "<sha256>  <file>".`);
    const name = match[2].trim();
    if (sums.has(name)) throw new Error(`SHA256SUMS.txt lists ${name} twice.`);
    sums.set(name, match[1].toLowerCase());
  }
  return sums;
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Where Tauri's externalBin expects the executable. */
export function sidecarPath(root, pin) {
  const stem = pin.executable.replace(/\.exe$/, "");
  return join(root, "src-tauri", "binaries", `${stem}-${SIDECAR_TARGET}.exe`);
}

/** Where the server's license files are kept for the installer. */
export function noticesDir(root) {
  return join(root, "src-tauri", "binaries", "afterhours-server");
}

/** The download URL of a release asset. */
export function assetUrl(pin, name = pin.asset) {
  return `https://github.com/${pin.repository}/releases/download/${pin.tag}/${name}`;
}

/**
 * Schema files a release attaches: `*.schema.json` assets, or `*schemas*.zip`
 * archives of them. Each must be listed in SHA256SUMS.txt.
 */
export function schemaAssets(assets, sums) {
  const chosen = assets
    .filter((a) => /\.schema\.json$/i.test(a.name) || /schemas.*\.zip$/i.test(a.name))
    .map((a) => {
      if (!FILE_NAME.test(a.name)) throw new Error(`Release asset ${a.name} has an unusable name.`);
      const expected = sums.get(a.name);
      if (!expected) throw new Error(`Schema asset ${a.name} is not listed in SHA256SUMS.txt.`);
      return {
        name: a.name,
        url: a.browser_download_url,
        sha256: expected,
        archive: a.name.endsWith(".zip"),
      };
    });
  return chosen.sort((a, b) => a.name.localeCompare(b.name));
}

/** Check the ZIP's build-info.json against the pin's executable hash and tag. */
export function checkBuildInfo(info, pin) {
  if (info?.executable_sha256 !== pin.executable_sha256) {
    throw new Error(
      `build-info.json records ${info?.executable_sha256}, the pin ${pin.executable_sha256}.`,
    );
  }
  if (info.release !== pin.tag) {
    throw new Error(`build-info.json is for ${info.release}, the pin for ${pin.tag}.`);
  }
  if (info.dirty_source === true) throw new Error("build-info.json reports a dirty source tree.");
}
