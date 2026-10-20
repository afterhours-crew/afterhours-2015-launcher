import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { launcherVersions, versionProblems } from "../lib/release.mjs";
import {
  DEFAULT_CLOSING,
  DEFAULT_KNOWN_LIMITS,
  bumpVersion,
  extractNotes,
  formatEntry,
  isAppPath,
  isAutomationBranch,
  knownLimitsOf,
  launcherNotes,
  leadingList,
  markdownSection,
  nextVersion,
  pullRequestNumber,
  releaseBody,
  releaseKind,
  sectionOf,
  serverHighlights,
  serverReleasesBetween,
  setVersion,
} from "./plan.mjs";

describe("the version rule", () => {
  it("bumps the patch for a server-only release and the minor for launcher changes", () => {
    expect(releaseKind({ launcherChanges: false, serverChanged: true })).toBe("patch");
    expect(releaseKind({ launcherChanges: true, serverChanged: false })).toBe("minor");
    // Both together: the minor bump wins.
    expect(releaseKind({ launcherChanges: true, serverChanged: true })).toBe("minor");
    expect(releaseKind({ launcherChanges: false, serverChanged: false })).toBeNull();
  });

  it("counts the next version the semver way", () => {
    expect(bumpVersion("0.2.0", "patch")).toBe("0.2.1");
    expect(bumpVersion("0.2.0", "minor")).toBe("0.3.0");
    expect(bumpVersion("0.2.5", "minor")).toBe("0.3.0");
    expect(bumpVersion("0.2.5", "major")).toBe("1.0.0");
    expect(bumpVersion("0.3.0-rc.1", "patch")).toBe("0.3.0");
    expect(bumpVersion("0.3.0-rc.1", "minor")).toBe("0.3.0");
    expect(bumpVersion("0.3.1-rc.1", "minor")).toBe("0.4.0");
    expect(() => bumpVersion("0.2.0", "huge")).toThrow(/Unknown bump/);
    expect(() => bumpVersion("v", "patch")).toThrow(/not a version/);
  });

  it("never reuses a version whose tag exists", () => {
    // v0.2.0 stays tagged after its draft was deleted (2026-10-20).
    expect(nextVersion("0.1.2", "minor", ["v0.1.0", "v0.2.0"])).toBe("0.3.0");
    expect(nextVersion("0.1.2", "patch", ["v0.2.0"])).toBe("0.1.3");
    expect(nextVersion("0.1.2", "patch", ["v0.1.3", "v0.1.4"])).toBe("0.1.5");
    expect(nextVersion("0.3.0", "minor", [])).toBe("0.4.0");
  });

  it("counts only paths that can change what testers download as launcher changes", () => {
    for (const path of [
      "src/lib/views/Garage.svelte",
      "src-tauri/src/cli.rs",
      "src-tauri/Cargo.lock",
      "package.json",
      "pnpm-lock.yaml",
      "server-pin.json",
      "schemas/version.schema.json",
      "scripts/portable-zip.mjs",
      "scripts/lib/pin.mjs",
      "design/tokens.json",
      "index.html",
    ]) {
      expect(isAppPath(path), path).toBe(true);
    }
    for (const path of [
      ".github/workflows/ci.yml",
      "docs/ROADMAP.md",
      "RELEASING.md",
      "design/README.md",
      "src/lib/state/version.test.ts",
      "scripts/lib/pin.test.mjs",
      "scripts/release/flow.mjs",
      ".prettierrc",
    ]) {
      expect(isAppPath(path), path).toBe(false);
    }
  });

  it("recognizes the automation's own pull requests", () => {
    expect(isAutomationBranch("pin/afterhours-v0.4.1")).toBe(true);
    expect(isAutomationBranch("feature/release-0.3.0")).toBe(true);
    expect(isAutomationBranch("release/0.3.0")).toBe(true);
    expect(isAutomationBranch("feature/releases-page")).toBe(false);
    expect(isAutomationBranch("feature/no-install-zip")).toBe(false);
  });
});

describe("the version files", () => {
  const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const files = {
    packageJson: read("package.json"),
    tauriConf: read("src-tauri/tauri.conf.json"),
    cargoToml: read("src-tauri/Cargo.toml"),
    cargoLock: read("src-tauri/Cargo.lock"),
  };

  it("change only the launcher version in the committed files", () => {
    const out = setVersion(files, "9.8.7");
    expect(versionProblems(launcherVersions(out), "v9.8.7")).toEqual([]);
    for (const key of Object.keys(files)) {
      const before = files[key].split("\n");
      const after = out[key].split("\n");
      expect(after).toHaveLength(before.length);
      expect(after.filter((line, i) => line !== before[i])).toHaveLength(1);
    }
  });

  it("refuse a file without exactly one version field", () => {
    expect(() => setVersion({ ...files, tauriConf: "{}" }, "1.0.0")).toThrow(/tauri.conf.json/);
    const twice = files.cargoLock + files.cargoLock;
    expect(() => setVersion({ ...files, cargoLock: twice }, "1.0.0")).toThrow(/Cargo.lock/);
    expect(() => setVersion(files, "v1.0.0")).toThrow(/plain version/);
  });
});

describe("pull requests in the notes", () => {
  it("are found from merge and squash subjects", () => {
    expect(
      pullRequestNumber("Merge pull request #7 from afterhours-crew/feature/release-0.2.0"),
    ).toBe(7);
    expect(pullRequestNumber("Offer a no-install ZIP (#3)")).toBe(3);
    expect(pullRequestNumber("Fix (#3) in the middle")).toBeNull();
  });

  it("are sorted by kind: label, then by branch prefix", () => {
    expect(sectionOf({ labels: ["kind:bug"], head: "feature/x" })).toBe("Fixed");
    expect(sectionOf({ labels: ["kind:feature"], head: "bugfix/x" })).toBe("Added");
    expect(sectionOf({ labels: ["kind:change"], head: "feature/x" })).toBe("Changed");
    expect(sectionOf({ head: "feature/x" })).toBe("Added");
    expect(sectionOf({ head: "bugfix/x" })).toBe("Fixed");
    expect(sectionOf({ head: "codex/x" })).toBe("Changed");
  });

  it("use a pull request's release note section, else its title", () => {
    const body =
      "## Summary\r\nInternal.\r\n\r\n## Release note\r\nPlay starts faster.\r\nReally.\r\n\r\n## Validation\r\nTests.";
    expect(formatEntry({ number: 4, title: "Speed up Play", url: "u4", body })).toBe(
      "- **Speed up Play.** Play starts faster.\n  Really. ([#4](u4))",
    );
    expect(formatEntry({ number: 5, title: "Fix it!", url: "u5", body: "" })).toBe(
      "- **Fix it!** ([#5](u5))",
    );
  });
});

const SERVER_NOTES = `Afterhours 0.4.1 keeps traffic steady.

Download **Afterhours-windows-x64.zip** below, extract it and place **Afterhours.exe** beside **NFS16.exe**.

## Added

- **Traffic.** Cars drive.
  - Nested.

## Fixed

- **Logs keep their end.** ([#135](u))

## Known limits

- **No cops yet.**

This is an early tester release, not the complete game.`;

describe("the launcher notes", () => {
  it("take the server's summary and Added/Changed/Fixed lists", () => {
    const { summary, sections } = serverHighlights(SERVER_NOTES);
    expect(summary).toBe("Afterhours 0.4.1 keeps traffic steady.");
    expect(sections).toEqual([
      ["Added", "- **Traffic.** Cars drive.\n  - Nested."],
      ["Fixed", "- **Logs keep their end.** ([#135](u))"],
    ]);
    const generated = serverHighlights(
      "<!-- Replace the next line. -->\nAfterhours 0.5.0 for Windows testers.\n\nDownload it.",
    );
    expect(generated).toEqual({ summary: "Afterhours 0.5.0 for Windows testers.", sections: [] });
  });

  it("copy a list without the paragraphs after it", () => {
    expect(leadingList(markdownSection(SERVER_NOTES, "Known limits"))).toBe("- **No cops yet.**");
    expect(leadingList("Text first.\n- then a list")).toBeNull();
    expect(markdownSection(SERVER_NOTES, "Changed")).toBeNull();
  });

  it("keep the download guide and add the server and launcher changes", () => {
    const notes = launcherNotes({
      version: "0.3.0",
      serverTag: "v0.4.1",
      previous: "v0.1.2",
      servers: [{ tag: "v0.4.1", url: "https://x/v0.4.1", body: SERVER_NOTES }],
      pulls: [
        { number: 12, title: "Show car images", url: "u12", head: "feature/car-images", body: "" },
        { number: 11, title: "Keep the window size", url: "u11", head: "bugfix/size", body: "" },
      ],
      knownLimits: "- 64-bit Windows only.",
    });
    expect(notes).toContain("Launcher 0.3.0 comes with the **Afterhours 0.4.1** server.");
    expect(notes).toContain(
      "## Updating from 0.1.2\n\nIf you installed 0.1.2, the launcher offers this update",
    );
    expect(notes).toContain("Because the server changes, it first copies your saves");
    expect(notes.indexOf("## Updating from")).toBeLessThan(notes.indexOf("## Which file"));
    expect(notes).toContain("## Which file to download");
    expect(notes).toContain("- **Afterhours_0.3.0_x64-setup.exe: the installer.**");
    expect(notes).toContain("- **Afterhours_0.3.0_x64-portable.zip: no installation.**");
    expect(notes).toContain("The other two files, `.sig` and `latest.json`");
    expect(notes).toContain(
      "## New with the 0.4.1 server\n\nAfterhours 0.4.1 keeps traffic steady.\n\n### Added\n\n- **Traffic.**",
    );
    expect(notes).toContain("[Afterhours v0.4.1 release notes](https://x/v0.4.1)");
    expect(notes).not.toContain("Download **Afterhours-windows-x64.zip**");
    expect(notes).toContain(
      "## New in the launcher\n\n### Added\n\n- **Show car images.** ([#12](u12))\n\n### Fixed\n\n- **Keep the window size.** ([#11](u11))",
    );
    expect(notes).toContain(
      "## Known limits\n\n- 64-bit Windows only.\n\nThis is an early tester release.",
    );
    expect(notes.indexOf("## Which file")).toBeLessThan(notes.indexOf("## New with"));
    expect(notes.indexOf("## New with")).toBeLessThan(notes.indexOf("## New in the launcher"));
  });

  it("leave out empty parts and fall back to the default limits", () => {
    const notes = launcherNotes({ version: "0.1.3", serverTag: "v0.4.0" });
    expect(notes).not.toContain("## New");
    expect(notes).toContain("Launcher 0.1.3, with the Afterhours 0.4.0 server.");
    expect(notes).toContain("## Updating\n\nIf you installed an earlier version,");
    expect(notes).not.toContain("Because the server changes");
    expect(notes).toContain(`## Known limits\n\n${DEFAULT_KNOWN_LIMITS}\n\n${DEFAULT_CLOSING}`);
  });

  it("carry the previous release's known limits and closing paragraphs", () => {
    const previous =
      "Intro.\n\n## Known limits\n\n- Traffic stops at 3x.\n- 64-bit Windows only.\n\nEarly tester release.\n\nFor feedback, use **Logs**.";
    const { list, rest } = knownLimitsOf(previous);
    expect(list).toBe("- Traffic stops at 3x.\n- 64-bit Windows only.");
    expect(rest).toBe("Early tester release.\n\nFor feedback, use **Logs**.");
    const notes = launcherNotes({
      version: "0.1.3",
      serverTag: "v0.4.0",
      knownLimits: list,
      closing: rest,
    });
    expect(notes.endsWith(`## Known limits\n\n${list}\n\n${rest}`)).toBe(true);
    expect(knownLimitsOf("No limits here.")).toEqual({ list: null, rest: null });
    expect(knownLimitsOf(undefined)).toEqual({ list: null, rest: null });
  });

  it("travel between markers in the pull request, edited or not", () => {
    const body = releaseBody("Notes\n\n## Which file to download", "Reviewer only.");
    expect(extractNotes(body)).toBe("Notes\n\n## Which file to download");
    expect(extractNotes(body.replace(/\n/g, "\r\n"))).toBe("Notes\n\n## Which file to download");
    expect(extractNotes(body)).not.toContain("Reviewer only.");
    expect(extractNotes("No markers.")).toBeNull();
    expect(extractNotes("<!-- release-notes:start -->\n \n<!-- release-notes:end -->")).toBeNull();
    expect(extractNotes("<!-- release-notes:start -->\nNo end.")).toBeNull();
  });
});

describe("server releases between two pins", () => {
  it("are the published ones after the old pin up to the new, oldest first", () => {
    const releases = [
      { tag_name: "v0.4.2", draft: false, prerelease: false },
      { tag_name: "v0.4.1", draft: false, prerelease: false },
      { tag_name: "v0.4.2-rc.1", draft: false, prerelease: true },
      { tag_name: "v0.4.3", draft: true, prerelease: false },
      { tag_name: "v0.4.0", draft: false, prerelease: false },
      { tag_name: "checkpoint-2026-10-18", draft: false, prerelease: true },
    ];
    expect(serverReleasesBetween(releases, "v0.4.0", "v0.4.2").map((r) => r.tag_name)).toEqual([
      "v0.4.1",
      "v0.4.2",
    ]);
  });
});
