// Release checks: one version everywhere, and a latest.json the updater
// can trust. Pure helpers for scripts/versions.mjs and
// scripts/updater-manifest.mjs, tested in release.test.mjs.
import { parseVersion } from "../../src/lib/state/version.ts";

/** The launcher version in each file that carries one. */
export function launcherVersions({ packageJson, tauriConf, cargoToml, cargoLock }) {
  const cargo = /^\[package\][^[]*?^version\s*=\s*"([^"]+)"/m.exec(cargoToml);
  const lock = /\[\[package\]\]\s*\nname = "afterhours-launcher"\s*\nversion = "([^"]+)"/.exec(
    cargoLock,
  );
  return {
    "package.json": JSON.parse(packageJson).version ?? null,
    "src-tauri/tauri.conf.json": JSON.parse(tauriConf).version ?? null,
    "src-tauri/Cargo.toml": cargo ? cargo[1] : null,
    "src-tauri/Cargo.lock": lock ? lock[1] : null,
  };
}

/** Problems with the versions, and with the tag when one is given. Empty when all agree. */
export function versionProblems(versions, tag) {
  const problems = [];
  const values = Object.entries(versions);
  for (const [file, version] of values) {
    if (!version || !parseVersion(version) || version.startsWith("v")) {
      problems.push(`${file} has no plain semver version (found ${version}).`);
    }
  }
  const distinct = new Set(values.map(([, v]) => v));
  if (distinct.size > 1) {
    problems.push(`Versions differ: ${values.map(([f, v]) => `${f} ${v}`).join(", ")}.`);
  }
  if (tag !== undefined) {
    const expected = `v${values[0]?.[1]}`;
    if (tag !== expected) problems.push(`Tag ${tag} does not match the version (${expected}).`);
  }
  return problems;
}

/** The `version:` a Tauri updater signature's trusted comment records, if any. */
export function signedVersion(signature) {
  let text;
  try {
    text = Buffer.from(String(signature), "base64").toString("utf8");
  } catch {
    return null;
  }
  const line = text.split(/\r?\n/).find((l) => l.startsWith("trusted comment: "));
  if (!line) return null;
  const field = line
    .slice("trusted comment: ".length)
    .split("\t")
    .find((f) => f.startsWith("version:"));
  return field ? field.slice("version:".length).trim() : null;
}

/**
 * Check tauri-action's latest.json for this release and add the server it
 * bundles, which the launcher reads before offering the update.
 */
export function annotateManifest(manifest, { version, repository, pin }) {
  const problems = [];
  const bare = (v) => String(v ?? "").replace(/^v/, "");
  if (bare(manifest.version) !== version) {
    problems.push(`latest.json announces ${manifest.version}, the release is ${version}.`);
  }
  const platforms = manifest.platforms ?? {};
  if (!platforms["windows-x86_64"]) problems.push("latest.json has no windows-x86_64 entry.");
  const prefix = `https://github.com/${repository}/releases/download/v${version}/`;
  for (const [name, entry] of Object.entries(platforms)) {
    if (!String(entry?.url ?? "").startsWith(prefix)) {
      problems.push(`${name} downloads from ${entry?.url}, not from ${prefix}.`);
    }
    const signed = signedVersion(entry?.signature);
    if (signed === null) problems.push(`${name}'s signature records no version.`);
    else if (bare(signed) !== version) problems.push(`${name} is signed for ${signed}.`);
  }
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return {
    ...manifest,
    server: {
      repository: pin.repository,
      tag: pin.tag,
      executable_sha256: pin.executable_sha256,
    },
  };
}
