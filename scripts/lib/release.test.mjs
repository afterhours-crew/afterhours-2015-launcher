import { describe, expect, it } from "vitest";
import {
  annotateManifest,
  launcherVersions,
  signedFile,
  signedVersion,
  versionProblems,
} from "./release.mjs";

const files = (version, lockVersion = version) => ({
  packageJson: JSON.stringify({ name: "x", version }),
  tauriConf: JSON.stringify({ productName: "Afterhours", version }),
  cargoToml: `[package]\nname = "afterhours-launcher"\nversion = "${version}"\n\n[dependencies]\nserde = { version = "1" }\n`,
  cargoLock: `[[package]]\nname = "afterhours-launcher"\nversion = "${lockVersion}"\ndependencies = []\n`,
});

describe("launcher versions", () => {
  it("agree, and the tag is v plus the version", () => {
    const versions = launcherVersions(files("0.2.0"));
    expect(Object.values(versions)).toEqual(["0.2.0", "0.2.0", "0.2.0", "0.2.0"]);
    expect(versionProblems(versions)).toEqual([]);
    expect(versionProblems(versions, "v0.2.0")).toEqual([]);
    expect(versionProblems(versions, "v0.2.1")).toHaveLength(1);
    expect(versionProblems(versions, "0.2.0")).toHaveLength(1);
  });

  it("report any file that disagrees", () => {
    const problems = versionProblems(launcherVersions(files("0.2.0", "0.1.0")));
    expect(problems.join()).toContain("src-tauri/Cargo.lock 0.1.0");
    expect(versionProblems(launcherVersions(files("v0.2.0"))).length).toBeGreaterThan(0);
  });
});

function signature(version) {
  const comment = version
    ? `timestamp:1700000000\tfile:Afterhours_${version}_x64-setup.exe\tversion:${version}`
    : "timestamp:1700000000\tfile:Afterhours_x64-setup.exe";
  const box = `untrusted comment: signature from tauri secret key\nRUQabc\ntrusted comment: ${comment}\nZGVm\n`;
  return Buffer.from(box).toString("base64");
}

describe("latest.json", () => {
  const pin = {
    repository: "afterhours-crew/afterhours-2015",
    tag: "v0.3.0",
    executable_sha256: "e".repeat(64),
  };
  const repository = "afterhours-crew/afterhours-2015-launcher";
  const url = `https://github.com/${repository}/releases/download/v0.2.0/Afterhours_0.2.0_x64-setup.exe`;
  const manifest = (overrides = {}) => ({
    version: "0.2.0",
    notes: "Notes",
    pub_date: "2026-11-01T00:00:00Z",
    platforms: { "windows-x86_64": { signature: signature("0.2.0"), url } },
    ...overrides,
  });

  it("reads the version a signature was made for", () => {
    expect(signedVersion(signature("0.2.0"))).toBe("0.2.0");
    expect(signedVersion(signature(null))).toBeNull();
    expect(signedVersion("not base64 at all")).toBeNull();
  });

  it("gains the bundled server when everything matches", () => {
    const out = annotateManifest(manifest(), { version: "0.2.0", repository, pin });
    expect(out.server).toEqual(pin);
    expect(out.platforms).toEqual(manifest().platforms);
  });

  it("refuses a manifest for another version, place or signature", () => {
    const check = (m) => () => annotateManifest(m, { version: "0.2.0", repository, pin });
    expect(check(manifest({ version: "0.1.0" }))).toThrow(/announces/);
    expect(check(manifest({ platforms: {} }))).toThrow(/windows-x86_64/);
    expect(
      check(
        manifest({
          platforms: { "windows-x86_64": { signature: signature("0.2.0"), url: "https://x/y" } },
        }),
      ),
    ).toThrow(/downloads from/);
    expect(
      check(manifest({ platforms: { "windows-x86_64": { signature: signature("0.1.0"), url } } })),
    ).toThrow(/signed for/);
    expect(
      check(manifest({ platforms: { "windows-x86_64": { signature: signature(null), url } } })),
    ).toThrow(/records no version/);
  });

  it("links a draft's GitHub API asset to the public download of the signed file", () => {
    // What tauri-action writes for a draft release (seen on v0.1.0).
    const api = `https://api.github.com/repos/${repository}/releases/assets/658603730`;
    const draft = manifest({
      platforms: {
        "windows-x86_64": { signature: signature("0.2.0"), url: api },
        "windows-x86_64-nsis": { signature: signature("0.2.0"), url: api },
      },
    });
    const out = annotateManifest(draft, { version: "0.2.0", repository, pin });
    expect(out.platforms["windows-x86_64"].url).toBe(url);
    expect(out.platforms["windows-x86_64-nsis"].url).toBe(url);
    expect(out.platforms["windows-x86_64"].signature).toBe(signature("0.2.0"));
    expect(out.server).toEqual(pin);
    expect(signedFile(signature("0.2.0"))).toBe("Afterhours_0.2.0_x64-setup.exe");
  });

  it("keeps refusing other hosts, other repositories and unsigned files", () => {
    const check =
      (url, sig = signature("0.2.0")) =>
      () =>
        annotateManifest(manifest({ platforms: { "windows-x86_64": { signature: sig, url } } }), {
          version: "0.2.0",
          repository,
          pin,
        });
    expect(check("https://api.github.com/repos/someone/else/releases/assets/1")).toThrow(
      /downloads from/,
    );
    expect(check(`https://api.github.com/repos/${repository}/releases/assets/x`)).toThrow(
      /downloads from/,
    );
    const noFile = Buffer.from(
      "untrusted comment: c\nRUQ\ntrusted comment: timestamp:1\tversion:0.2.0\nZGVm\n",
    ).toString("base64");
    expect(check(`https://api.github.com/repos/${repository}/releases/assets/1`, noFile)).toThrow(
      /downloads from/,
    );
  });
});
