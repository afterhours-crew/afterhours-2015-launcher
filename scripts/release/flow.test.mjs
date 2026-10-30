import { describe, expect, it } from "vitest";
import { formatPin } from "../lib/pin.mjs";
import { launcherVersions, versionProblems } from "../lib/release.mjs";
import { findNotes, mergedPulls, prepareRelease, selectTag } from "./flow.mjs";
import { extractNotes, releaseBody } from "./plan.mjs";

const REPO = "afterhours-crew/afterhours-2015-launcher";
const SERVER = "afterhours-crew/afterhours-2015";
const sha = (c) => c.repeat(40);

const pin = (tag) =>
  formatPin({
    repository: SERVER,
    tag,
    asset: "Afterhours-windows-x64.zip",
    asset_sha256: "a".repeat(64),
    executable: "Afterhours.exe",
    executable_sha256: "b".repeat(64),
    schemas: "release",
  });

const versionFiles = (version) => ({
  "package.json": `{\n  "name": "afterhours-2015-launcher",\n  "version": "${version}",\n  "type": "module"\n}\n`,
  "src-tauri/tauri.conf.json": `{\n  "productName": "Afterhours Launcher",\n  "version": "${version}"\n}\n`,
  "src-tauri/Cargo.toml": `[package]\nname = "afterhours-launcher"\nversion = "${version}"\n\n[dependencies]\nserde = { version = "1" }\n`,
  "src-tauri/Cargo.lock": `version = 4\n\n[[package]]\nname = "afterhours-launcher"\nversion = "${version}"\n`,
});

const pull = (number, head, files, extra = {}) => ({
  number,
  title: `Pull request ${number}`,
  body: "",
  html_url: `https://github.com/${REPO}/pull/${number}`,
  labels: [],
  head: { ref: head },
  files,
  ...extra,
});

const SERVER_041 = `Afterhours 0.4.1 keeps traffic steady.\n\nDownload **Afterhours-windows-x64.zip** below.\n\n## Fixed\n\n- **Rivals stay on the road.** ([#140](u))\n\n## Known limits\n\n- **No cops yet.**`;

/**
 * A constructed repository: main at version 0.1.2 (tagged v0.1.2, server
 * v0.4.0), v0.2.0 tagged from a deleted draft, and the working tree's pin
 * at v0.4.1 as the pin-bump workflow leaves it.
 */
function repository(change = {}) {
  const state = {
    working: { ...versionFiles("0.1.2"), "server-pin.json": pin("v0.4.1") },
    revisions: { "v0.1.2:server-pin.json": pin("v0.4.0"), "v0.2.0:server-pin.json": pin("v0.4.0") },
    localTags: ["v0.1.0", "v0.1.1", "v0.2.0", "v0.1.2"],
    remoteTags: { "v0.1.0": sha("1"), "v0.1.1": sha("2"), "v0.2.0": sha("3"), "v0.1.2": sha("4") },
    branches: [],
    describe: "v0.1.2",
    log: [`${sha("5")}\tMerge pull request #8 from afterhours-crew/feature/release-0.1.2`],
    pulls: [pull(8, "feature/release-0.1.2", ["package.json"])],
    commitPulls: { [sha("5")]: [{ number: 8, merged_at: "2026-10-21T00:00:00Z" }] },
    open: [],
    latest: { tag_name: "v0.1.2" },
    serverReleases: [
      { tag_name: "v0.4.0", draft: false, prerelease: false, body: "old", html_url: "s040" },
      { tag_name: "v0.4.1", draft: false, prerelease: false, body: SERVER_041, html_url: "s041" },
      { tag_name: "v0.4.2-rc.1", draft: false, prerelease: true, body: "rc", html_url: "s042rc" },
    ],
    launcherReleases: {
      "v0.1.2": {
        body: "Intro.\n\n## Known limits\n\n- 64-bit Windows only.\n\nThis is an early tester release.",
      },
    },
    ciRuns: 1,
    failApi: null,
    warnings: [],
    ...change,
  };
  const notFound = () => Object.assign(new Error("HTTP 404"), { status: 404 });
  const deps = {
    repository: REPO,
    readFile: (path) => {
      if (!(path in state.working)) throw new Error(`no ${path}`);
      return state.working[path];
    },
    warn: (message) => state.warnings.push(message),
    git: (args) => {
      const ok = (stdout = "") => ({ status: 0, stdout });
      const [command] = args;
      if (command === "rev-parse") {
        const tag = args
          .at(-1)
          .replace(/^refs\/tags\//, "")
          .replace(/\^\{commit\}$/, "");
        return state.localTags.includes(tag) ? ok() : { status: 1, stdout: "" };
      }
      if (command === "merge-base") return ok();
      if (command === "rev-list")
        return ok(
          state.offMain
            ? `${sha("9")}
`
            : `${sha("9")}
${sha("c")}
`,
        );
      if (command === "describe") return ok(`${state.describe}\n`);
      if (command === "log") return ok(state.log.join("\n") + "\n");
      if (command === "show") {
        const key = args[1];
        return key in state.revisions ? ok(state.revisions[key]) : { status: 128, stdout: "" };
      }
      if (command === "ls-remote" && args.includes("--refs")) {
        return ok(
          Object.entries(state.remoteTags)
            .map(([tag, commit]) => `${commit}\trefs/tags/${tag}`)
            .join("\n"),
        );
      }
      if (command === "ls-remote" && args.includes("--heads")) {
        const branch = args.at(-1).replace(/^refs\/heads\//, "");
        return state.branches.includes(branch)
          ? ok(`x\t${args.at(-1)}`)
          : { status: 2, stdout: "" };
      }
      if (command === "ls-remote") {
        const wanted = args.filter((a) => a.startsWith("refs/tags/"));
        const lines = Object.entries(state.remoteRefs ?? {})
          .filter(([ref]) => wanted.includes(ref))
          .map(([ref, commit]) => `${commit}\t${ref}`);
        return ok(lines.join("\n"));
      }
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
    api: async (path) => {
      if (state.failApi && state.failApi.test(path)) throw new Error(`GET ${path}: HTTP 502`);
      let match;
      if ((match = /^\/repos\/[^/]+\/[^/]+\/commits\/([0-9a-f]{40})\/pulls$/.exec(path))) {
        return state.commitPulls[match[1]] ?? [];
      }
      if ((match = /\/pulls\/(\d+)\/files\?per_page=100&page=(\d+)$/.exec(path))) {
        const found = state.pulls.find((p) => p.number === Number(match[1]));
        return match[2] === "1" ? found.files.map((filename) => ({ filename })) : [];
      }
      if ((match = /\/pulls\/(\d+)$/.exec(path))) {
        const found = state.pulls.find((p) => p.number === Number(match[1]));
        if (!found) throw notFound();
        return found;
      }
      if (path.endsWith("/pulls?state=open&per_page=100")) return state.open;
      if (path === `/repos/${REPO}/releases/latest`) {
        if (!state.latest) throw notFound();
        return state.latest;
      }
      if (path === `/repos/${SERVER}/releases?per_page=100`) return state.serverReleases;
      if ((match = new RegExp(`^/repos/${REPO}/releases/tags/(.+)$`).exec(path))) {
        const release = state.launcherReleases[decodeURIComponent(match[1])];
        if (!release) throw notFound();
        return release;
      }
      if (path.includes("/actions/workflows/ci.yml/runs?")) return { total_count: state.ciRuns };
      throw new Error(`unexpected GET ${path}`);
    },
  };
  return { state, deps };
}

const withPulls = (...pulls) => ({
  log: pulls.map(
    (p, i) =>
      `${String(i + 6)
        .repeat(40)
        .slice(0, 40)}\tMerge pull request #${p.number} from x/${p.head.ref}`,
  ),
  pulls,
  commitPulls: Object.fromEntries(
    pulls.map((p, i) => [
      String(i + 6)
        .repeat(40)
        .slice(0, 40),
      [{ number: p.number, merged_at: "2026-10-21T00:00:00Z" }],
    ]),
  ),
});

describe("commit association for release notes", () => {
  it("skips direct issue references even when that number names an unrelated PR", async () => {
    const { deps } = repository({
      log: [
        `${sha("7")}\tPreserve child exit status in preview startup checks (#25)`,
        `${sha("8")}\tRefresh story editing (#26)`,
      ],
      pulls: [pull(26, "feature/unrelated", ["src/main.ts"])],
      commitPulls: {},
    });
    await expect(mergedPulls(deps, "v0.1.2")).resolves.toEqual([]);
  });

  it("uses the associated merged PR instead of an issue-shaped subject hint", async () => {
    const { deps } = repository({
      log: [`${sha("7")}\tHandle startup failures (#25)`],
      pulls: [pull(12, "feature/startup", ["src/main.ts"])],
      commitPulls: {
        [sha("7")]: [
          { number: 25, merged_at: null },
          { number: 12, merged_at: "2026-10-21T00:00:00Z" },
        ],
      },
    });
    const result = await mergedPulls(deps, "v0.1.2");
    expect(result.map((p) => p.number)).toEqual([12]);
  });

  it.each(["Handle startup (#12)", "Merge pull request #12 from x/startup"])(
    "accepts an associated merge or squash: %s",
    async (subject) => {
      const { deps } = repository({
        log: [`${sha("7")}\t${subject}`],
        pulls: [pull(12, "feature/startup", ["src/main.ts"])],
        commitPulls: {
          [sha("7")]: [{ number: 12, merged_at: "2026-10-21T00:00:00Z" }],
        },
      });
      const result = await mergedPulls(deps, "v0.1.2");
      expect(result.map((p) => p.number)).toEqual([12]);
    },
  );

  it("does not treat an open associated PR as merged", async () => {
    const { deps } = repository({
      log: [`${sha("7")}\tHandle startup (#12)`],
      commitPulls: { [sha("7")]: [{ number: 12, merged_at: null }] },
    });
    await expect(mergedPulls(deps, "v0.1.2")).resolves.toEqual([]);
  });

  it("reports an association API failure rather than dropping the commit", async () => {
    const { deps } = repository({ failApi: /\/commits\/.*\/pulls$/ });
    await expect(mergedPulls(deps, "v0.1.2")).rejects.toThrow(/HTTP 502/);
  });
});

describe("preparing a pin bump", () => {
  it("bumps the patch when only the server changed", async () => {
    const docs = pull(9, "docs/releasing", [".github/workflows/ci.yml", "RELEASING.md"]);
    const { deps } = repository(
      withPulls(pull(8, "feature/release-0.1.2", ["package.json"]), docs),
    );
    const plan = await prepareRelease(deps, { forPin: true, pinSummary: "| ZIP | hash |" });
    expect(plan).toMatchObject({
      version: "0.1.3",
      tag: "v0.1.3",
      kind: "patch",
      base: "v0.1.2",
      branch: "pin/afterhours-v0.4.1",
      title: "Release 0.1.3: bundle server v0.4.1",
    });
    const notes = extractNotes(plan.body);
    expect(notes).toContain("Launcher 0.1.3 comes with the **Afterhours 0.4.1** server.");
    expect(notes).toContain("## Updating from 0.1.2\n\nIf you installed 0.1.2,");
    expect(notes).toContain("## Which file to download");
    expect(notes).toContain(
      "## New with the 0.4.1 server\n\nAfterhours 0.4.1 keeps traffic steady.",
    );
    expect(notes).toContain("### Fixed\n\n- **Rivals stay on the road.**");
    expect(notes).not.toContain("0.4.2-rc.1");
    expect(notes).not.toContain("## New in the launcher");
    expect(notes).toContain("## Known limits\n\n- 64-bit Windows only.\n\nThis is an early");
    expect(plan.body).toContain("(patch: only the bundled server changed)");
    expect(plan.body).toContain(
      "**Not launcher changes** (only workflows, docs, tests or release scripts), so not in the notes and no minor bump: #9.",
    );
    expect(plan.body).toContain("**Release pull requests**, left out: #8.");
    expect(plan.body).toContain("### Server pin\n\n| ZIP | hash |");
    const versions = launcherVersions({
      packageJson: plan.files["package.json"],
      tauriConf: plan.files["src-tauri/tauri.conf.json"],
      cargoToml: plan.files["src-tauri/Cargo.toml"],
      cargoLock: plan.files["src-tauri/Cargo.lock"],
    });
    expect(versionProblems(versions, "v0.1.3")).toEqual([]);
  });

  it("bumps the minor when the launcher changed too, skipping a taken tag", async () => {
    const feature = pull(10, "feature/car-images", ["src/lib/views/Garage.svelte"], {
      title: "Show car images",
      body: "## Release note\nYour cars appear with pictures.",
    });
    const { deps } = repository(withPulls(feature));
    const plan = await prepareRelease(deps, { forPin: true });
    expect(plan).toMatchObject({
      version: "0.3.0",
      kind: "minor",
      title: "Release 0.3.0: bundle server v0.4.1",
    });
    expect(plan.body).toContain("Skips v0.2.0: the tag already exists.");
    expect(plan.body).toContain("minor: launcher changes in #10, which wins over the newer server");
    const notes = extractNotes(plan.body);
    expect(notes).toContain(
      "## New in the launcher\n\n### Added\n\n- **Show car images.** Your cars appear with pictures. ([#10](",
    );
    expect(notes.indexOf("## New with the 0.4.1 server")).toBeLessThan(
      notes.indexOf("## New in the launcher"),
    );
  });

  it("names other open release pull requests", async () => {
    const { deps } = repository({
      open: [
        { number: 20, head: { ref: "pin/afterhours-v0.4.0x" } },
        { number: 21, head: { ref: "feature/screens" } },
      ],
    });
    const plan = await prepareRelease(deps, { forPin: true });
    expect(plan.body).toContain("**Also open:** #20 (`pin/afterhours-v0.4.0x`).");
    expect(plan.body).not.toContain("#21");
  });
});

describe("preparing a launcher release", () => {
  const sameServer = { working: { ...versionFiles("0.1.2"), "server-pin.json": pin("v0.4.0") } };

  it("bumps the minor for launcher changes on its own", async () => {
    const fix = pull(11, "bugfix/size", ["src-tauri/src/settings.rs"], {
      title: "Keep the window size",
    });
    const { deps } = repository({ ...sameServer, ...withPulls(fix) });
    const plan = await prepareRelease(deps);
    expect(plan).toMatchObject({
      version: "0.3.0",
      branch: "feature/release-0.3.0",
      title: "Release 0.3.0",
    });
    expect(plan.body).toContain("- **Server:** unchanged at v0.4.0.");
    const notes = extractNotes(plan.body);
    expect(notes).toContain("### Fixed\n\n- **Keep the window size.**");
    expect(notes).not.toContain("## New with the");
  });

  it("finds a rebase-merged pull request through the API and skips direct commits", async () => {
    const rebased = pull(12, "feature/x", ["src/main.ts"]);
    const { deps } = repository({
      ...sameServer,
      log: [`${sha("7")}\tA rebased commit`, `${sha("8")}\tA direct commit`],
      pulls: [rebased],
      commitPulls: { [sha("7")]: [{ number: 12, merged_at: "2026-10-21T00:00:00Z" }] },
    });
    const plan = await prepareRelease(deps);
    expect(extractNotes(plan.body)).toContain("([#12](");
  });

  it("refuses when there is nothing to release, unless a bump is chosen", async () => {
    const docs = pull(9, "docs/x", ["docs/ROADMAP.md"]);
    const { deps } = repository({ ...sameServer, ...withPulls(docs) });
    await expect(prepareRelease(deps)).rejects.toThrow(/Nothing to release since v0.1.2/);
    await expect(prepareRelease(deps)).rejects.toMatchObject({ nothingToRelease: true });
    const plan = await prepareRelease(deps, { bump: "minor" });
    expect(plan).toMatchObject({ version: "0.3.0", kind: "minor" });
    expect(plan.body).toContain("(minor, chosen when preparing)");
    await expect(prepareRelease(deps, { bump: "patch" })).rejects.toThrow(
      /use auto, minor or major/,
    );
  });

  it("refuses an existing release branch, except for a preview", async () => {
    const { deps } = repository({ branches: ["pin/afterhours-v0.4.1"] });
    await expect(prepareRelease(deps, { forPin: true })).rejects.toThrow(/already exists/);
    await expect(prepareRelease(deps, { forPin: true, preview: true })).resolves.toMatchObject({
      version: "0.1.3",
    });
  });

  it("refuses a version that is not newer than the published one", async () => {
    const { deps } = repository({ latest: { tag_name: "v0.5.0" } });
    await expect(prepareRelease(deps, { forPin: true })).rejects.toThrow(
      /not newer than the published v0.5.0/,
    );
  });

  it("starts from the nearest tag when the current version has none", async () => {
    const { deps } = repository({
      localTags: ["v0.1.1", "v0.2.0"],
      describe: "v0.2.0",
      latest: null,
    });
    const plan = await prepareRelease(deps, { forPin: true });
    expect(plan.base).toBe("v0.2.0");
    expect(plan.body).toContain("v0.2.0 has no published notes to copy them from");
    expect(extractNotes(plan.body)).toContain("- The installer isn't code-signed");
  });

  it("reads every file at another revision for CI's preview", async () => {
    const { deps } = repository({
      working: {},
      revisions: {
        ...Object.fromEntries(
          Object.entries(versionFiles("0.1.2")).map(([p, t]) => [`HEAD^1:${p}`, t]),
        ),
        "HEAD^1:server-pin.json": pin("v0.4.1"),
        "v0.1.2:server-pin.json": pin("v0.4.0"),
      },
    });
    const plan = await prepareRelease(deps, { head: "HEAD^1", preview: true });
    expect(plan.version).toBe("0.1.3");
  });

  it("refuses version files that disagree", async () => {
    const working = { ...versionFiles("0.1.2"), "server-pin.json": pin("v0.4.1") };
    working["src-tauri/Cargo.lock"] = versionFiles("0.1.1")["src-tauri/Cargo.lock"];
    const { deps } = repository({ working });
    await expect(prepareRelease(deps, { forPin: true })).rejects.toThrow(/Versions differ/);
  });
});

describe("tagging a merged release", () => {
  const release = sha("c");
  const at = (revision, version) =>
    Object.fromEntries(
      Object.entries(versionFiles(version)).map(([p, t]) => [`${revision}:${p}`, t]),
    );
  const merged = (version, before = "0.1.2") => ({
    revisions: {
      ...at(release, version),
      [`${release}^1:package.json`]: versionFiles(before)["package.json"],
    },
  });

  it("tags the commit that changed the version", async () => {
    const { deps } = repository(merged("0.1.3"));
    await expect(selectTag(deps, { commit: release })).resolves.toMatchObject({ tag: "v0.1.3" });
    await expect(selectTag(deps, { commit: release, requireCi: true })).resolves.toMatchObject({
      tag: "v0.1.3",
    });
  });

  it("tags nothing for an unchanged version or a tag already on the commit", async () => {
    let { deps } = repository(merged("0.1.2"));
    expect((await selectTag(deps, { commit: release })).tag).toBeNull();
    ({ deps } = repository({
      ...merged("0.1.3"),
      remoteRefs: { "refs/tags/v0.1.3": sha("d"), "refs/tags/v0.1.3^{}": release },
    }));
    expect(await selectTag(deps, { commit: release })).toMatchObject({
      tag: null,
      reason: expect.stringMatching(/already names/),
    });
  });

  it("refuses to move a tag, go backwards, leave main or skip CI", async () => {
    const cases = [
      [{ remoteRefs: { "refs/tags/v0.1.3": sha("d") } }, {}, /already names d+, not c+/],
      [{ latest: { tag_name: "v0.2.1" } }, {}, /not newer than the published v0.2.1/],
      [{ offMain: true }, {}, /is not on main's first-parent history/],
      [{ ciRuns: 0 }, { requireCi: true }, /CI has not passed/],
    ];
    for (const [change, options, error] of cases) {
      const { deps } = repository({ ...merged("0.1.3"), ...change });
      await expect(selectTag(deps, { commit: release, ...options })).rejects.toThrow(error);
    }
    const { deps } = repository(merged("0.1.3"));
    await expect(selectTag(deps, { commit: "abc" })).rejects.toThrow(/full commit SHA/);
    const mixed = repository({
      revisions: {
        ...at(release, "0.1.3"),
        [`${release}:src-tauri/Cargo.lock`]: versionFiles("0.1.2")["src-tauri/Cargo.lock"],
        [`${release}^1:package.json`]: versionFiles("0.1.2")["package.json"],
      },
    });
    await expect(selectTag(mixed.deps, { commit: release })).rejects.toThrow(/Versions differ/);
  });
});

describe("the draft's notes", () => {
  const commit = sha("e");
  const body = releaseBody("Reviewed notes.\r\n\r\n## Which file to download", "Reviewer only.");

  it("come from the pull request that merged the commit", async () => {
    const { deps } = repository({
      commitPulls: { [commit]: [{ number: 30, merged_at: "x", merge_commit_sha: commit, body }] },
    });
    expect(await findNotes(deps, { commit })).toEqual({
      notes: "Reviewed notes.\n\n## Which file to download",
      source: "#30",
    });
  });

  it("are the default notes otherwise", async () => {
    const elsewhere = [{ number: 31, merged_at: "x", merge_commit_sha: sha("f"), body }];
    const bare = [{ number: 32, merged_at: "x", merge_commit_sha: commit, body: "Release 0.1.3" }];
    for (const commitPulls of [{}, { [commit]: elsewhere }, { [commit]: bare }]) {
      const { deps } = repository({ commitPulls });
      const { notes, source } = await findNotes(deps, { commit });
      expect(source).toBe("default");
      expect(notes).toContain("Launcher 0.1.2, with the Afterhours 0.4.1 server.");
      expect(notes).toContain("## Which file to download");
    }
    const { state, deps } = repository({ failApi: /commits/ });
    expect((await findNotes(deps, { commit })).source).toBe("default");
    expect(state.warnings).toHaveLength(1);
  });
});
