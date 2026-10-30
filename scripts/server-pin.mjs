// The bundled Afterhours server: fetch the pinned release, check for a newer
// one, and move the pin to it.
//
//   node scripts/server-pin.mjs fetch          download, verify and place the pinned Afterhours.exe
//   node scripts/server-pin.mjs verify         check the placed executable against the pin
//   node scripts/server-pin.mjs latest         print the latest release tag if it is newer than the pin
//   node scripts/server-pin.mjs bump <tag> [--summary <file>]
//                                              move the pin to <tag>, refresh schemas/, place the exe
//
// Every byte is checked: the ZIP against the release's SHA256SUMS.txt (bump)
// or the pin (fetch), the executable against build-info.json inside that ZIP
// and against the pin. Nothing is executed here.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { isNewer } from "../src/lib/state/version.ts";
import { download, latestRelease, releaseByTag } from "./lib/github.mjs";
import {
  PIN_FILE,
  SERVER_NOTICES,
  assetUrl,
  checkBuildInfo,
  formatPin,
  isReleaseTag,
  noticesDir,
  parsePin,
  parseSums,
  schemaAssets,
  sha256,
  sidecarPath,
} from "./lib/pin.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pinPath = join(root, PIN_FILE);
const schemasDir = join(root, "schemas");

function readPin() {
  return parsePin(readFileSync(pinPath, "utf8"));
}

function writeAtomically(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const partial = `${path}.partial`;
  writeFileSync(partial, bytes);
  renameSync(partial, path);
}

/** Extract the executable and notices from a verified ZIP and check them. */
function unpackServer(zip, pin) {
  const wanted = new Set([pin.executable, ...SERVER_NOTICES]);
  const files = unzipSync(new Uint8Array(zip), { filter: (file) => wanted.has(file.name) });
  for (const name of wanted) {
    if (!files[name]) throw new Error(`${pin.asset} has no ${name} at its root.`);
  }
  const info = JSON.parse(Buffer.from(files["build-info.json"]).toString("utf8"));
  const actual = sha256(files[pin.executable]);
  if (actual !== pin.executable_sha256) {
    throw new Error(`${pin.executable} has SHA-256 ${actual}, the pin ${pin.executable_sha256}.`);
  }
  checkBuildInfo(info, pin);
  return { files, info };
}

function placeServer(files, pin) {
  writeAtomically(sidecarPath(root), files[pin.executable]);
  for (const name of SERVER_NOTICES) writeAtomically(join(noticesDir(root), name), files[name]);
}

function placedMatches(pin) {
  const target = sidecarPath(root);
  if (!existsSync(target)) return false;
  if (!SERVER_NOTICES.every((name) => existsSync(join(noticesDir(root), name)))) return false;
  return sha256(readFileSync(target)) === pin.executable_sha256;
}

async function fetchPinned() {
  const pin = readPin();
  if (placedMatches(pin)) {
    console.log(`${pin.executable} ${pin.tag} is already in place and matches the pin.`);
    return;
  }
  console.log(`Downloading ${pin.asset} from ${pin.repository} ${pin.tag}…`);
  const zip = await download(assetUrl(pin));
  const actual = sha256(zip);
  if (actual !== pin.asset_sha256) {
    throw new Error(`${pin.asset} has SHA-256 ${actual}, the pin ${pin.asset_sha256}.`);
  }
  const { files, info } = unpackServer(zip, pin);
  placeServer(files, pin);
  console.log(`Placed ${pin.executable} ${pin.tag} (${info.revision}) at ${sidecarPath(root)}.`);
}

function verifyPlaced() {
  const pin = readPin();
  if (!placedMatches(pin)) {
    throw new Error(`${sidecarPath(root)} is missing or differs from the pin. Run pnpm sidecar.`);
  }
  console.log(`${pin.executable} ${pin.tag} matches the pin.`);
}

async function latest() {
  const pin = readPin();
  const release = await latestRelease(pin.repository);
  const tag = String(release.tag_name ?? "");
  const newer = isReleaseTag(tag) && isNewer(tag, pin.tag) ? tag : "";
  console.log(newer ? newer : `No release newer than ${pin.tag} (latest is ${tag || "none"}).`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${newer}\n`);
}

/** Schema files from the release: plain assets or ZIPs of them, each verified. */
async function releaseSchemas(release, sums) {
  const out = new Map();
  for (const asset of schemaAssets(release.assets, sums)) {
    const bytes = await download(asset.url);
    if (sha256(bytes) !== asset.sha256)
      throw new Error(`${asset.name} does not match SHA256SUMS.txt.`);
    const entries = asset.archive
      ? Object.entries(
          unzipSync(new Uint8Array(bytes), { filter: (f) => /\.schema\.json$/i.test(f.name) }),
        ).map(([name, data]) => [basename(name), Buffer.from(data)])
      : [[asset.name, bytes]];
    for (const [name, data] of entries) {
      if (!/^[A-Za-z0-9._-]+\.schema\.json$/.test(name))
        throw new Error(`Unusable schema name ${name}.`);
      if (out.has(name)) throw new Error(`The release provides ${name} twice.`);
      const schema = JSON.parse(data.toString("utf8"));
      if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
        throw new Error(`${name} is not a JSON Schema object.`);
      }
      out.set(name, JSON.stringify(schema, null, 2) + "\n");
    }
  }
  return out;
}

async function bump(tag, summaryPath) {
  const pin = readPin();
  if (!isReleaseTag(tag)) throw new Error(`${tag} is not a release tag like v1.2.3.`);
  if (!isNewer(tag, pin.tag))
    throw new Error(`${tag} is not newer than ${pin.tag}; pins only move forward.`);
  const release = await releaseByTag(pin.repository, tag);
  if (release.draft || release.prerelease) throw new Error(`${tag} is a draft or a pre-release.`);
  const asset = (name) => release.assets.find((a) => a.name === name);
  const sumsAsset = asset("SHA256SUMS.txt");
  if (!sumsAsset) throw new Error(`${tag} has no SHA256SUMS.txt.`);
  const sums = parseSums((await download(sumsAsset.browser_download_url)).toString("utf8"));
  const zipAsset = asset(pin.asset);
  const zipSha = sums.get(pin.asset);
  if (!zipAsset || !zipSha) throw new Error(`${tag} has no ${pin.asset} listed in SHA256SUMS.txt.`);
  const zip = await download(zipAsset.browser_download_url);
  if (sha256(zip) !== zipSha) throw new Error(`${pin.asset} does not match SHA256SUMS.txt.`);
  const exe = unzipSync(new Uint8Array(zip), { filter: (f) => f.name === pin.executable })[
    pin.executable
  ];
  if (!exe) throw new Error(`${pin.asset} has no ${pin.executable}.`);
  const next = { ...pin, tag, asset_sha256: zipSha, executable_sha256: sha256(exe) };
  const { files, info } = unpackServer(zip, next);

  const warnings = [];
  const schemas = await releaseSchemas(release, sums);
  if (schemas.size > 0) {
    mkdirSync(schemasDir, { recursive: true });
    for (const name of readdirSync(schemasDir)) {
      if (name.endsWith(".schema.json")) rmSync(join(schemasDir, name));
    }
    for (const [name, text] of schemas) writeFileSync(join(schemasDir, name), text);
    next.schemas = "release";
  } else {
    warnings.push(
      `${tag} attaches no schemas; schemas/ is unchanged (${pin.schemas}). The contract check still runs against them.`,
    );
  }

  writeFileSync(pinPath, formatPin(next));
  placeServer(files, next);

  const summary = [
    `Bundles [Afterhours ${tag}](${release.html_url}) in place of ${pin.tag}.`,
    "",
    "| | |",
    "| --- | --- |",
    `| ZIP | \`${pin.asset}\` \`${zipSha}\` (SHA256SUMS.txt) |`,
    `| Executable | \`${next.executable}\` \`${next.executable_sha256}\` (build-info.json) |`,
    `| Source | ${info.source ?? info.revision} |`,
    `| Schemas | ${schemas.size > 0 ? [...schemas.keys()].map((n) => `\`${n}\``).join(", ") : "none attached"} |`,
    "",
    ...warnings.map((w) => `> **Note:** ${w}`),
    "",
    "Before merging: CI's contract job must pass (it runs the pinned executable's JSON commands",
    "against a temporary data folder and validates them against `schemas/`), and the release notes",
    "must not require a save migration the backup rule does not cover. A launcher release",
    "(RELEASING.md) then delivers this server to testers. Never auto-merge.",
  ].join("\n");
  console.log(summary);
  if (summaryPath) writeFileSync(summaryPath, summary + "\n");
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "fetch") await fetchPinned();
  else if (command === "verify") verifyPlaced();
  else if (command === "latest") await latest();
  else if (command === "bump" && rest[0]) {
    const at = rest.indexOf("--summary");
    await bump(rest[0], at >= 0 ? rest[at + 1] : undefined);
  } else {
    console.error("usage: server-pin.mjs fetch | verify | latest | bump <tag> [--summary <file>]");
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
