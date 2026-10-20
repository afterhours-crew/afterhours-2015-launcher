// Release flows over git and the GitHub API: prepare a release pull request,
// decide whether a main commit gets a version tag, and find a draft's notes.
// Each takes its git, API and file access as `deps`, so flow.test.mjs runs
// them against a constructed repository; scripts/release/cli.mjs passes the
// real ones. Nothing here pushes, tags or opens anything: the workflows do.
import { isNewer, parseVersion } from "../../src/lib/state/version.ts";
import { parsePin } from "../lib/pin.mjs";
import { launcherVersions, versionProblems } from "../lib/release.mjs";
import {
  bumpVersion,
  extractNotes,
  isAppPath,
  isAutomationBranch,
  knownLimitsOf,
  launcherNotes,
  nextVersion,
  pullRequestNumber,
  releaseBody,
  releaseKind,
  serverReleasesBetween,
  setVersion,
} from "./plan.mjs";

const SHA = /^[0-9a-f]{40}$/;
export const VERSION_FILES = {
  packageJson: "package.json",
  tauriConf: "src-tauri/tauri.conf.json",
  cargoToml: "src-tauri/Cargo.toml",
  cargoLock: "src-tauri/Cargo.lock",
};

function show(deps, revision, path) {
  const out = deps.git(["show", `${revision}:${path}`]);
  if (out.status !== 0) throw new Error(`Cannot read ${path} at ${revision}.`);
  return out.stdout;
}

async function apiOrNull(deps, path) {
  try {
    return await deps.api(path);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

const refs = (pulls) => pulls.map((p) => `#${p.number}`).join(", ");

/** The tag the current version came from, or the nearest version tag before `head`. */
export function baseTag(deps, current, head = "HEAD") {
  const own = `v${current}`;
  const tagged = deps.git(["rev-parse", "--quiet", "--verify", `refs/tags/${own}^{commit}`]);
  if (tagged.status === 0 && deps.git(["merge-base", "--is-ancestor", own, head]).status === 0) {
    return own;
  }
  const nearest = deps.git(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", head]);
  const tag = nearest.stdout?.trim();
  if (nearest.status !== 0 || !tag) throw new Error("No earlier version tag to start from.");
  return tag;
}

/** Every tag on the remote: taken versions are never reused. */
export function remoteTags(deps) {
  const out = deps.git(["ls-remote", "--tags", "--refs", "origin"]);
  if (out.status !== 0) throw new Error("Cannot list the remote tags.");
  return out.stdout
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[1])
    .filter(Boolean)
    .map((ref) => ref.replace(/^refs\/tags\//, ""));
}

function branchExists(deps, branch) {
  const out = deps.git(["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${branch}`]);
  if (out.status === 0) return true;
  if (out.status === 2) return false;
  throw new Error("Cannot check the remote branches.");
}

/**
 * Pull requests merged into the first-parent history after `since` up to
 * `head`, oldest first, with their changed files. Merge and squash subjects
 * name their pull request; other commits are looked up, direct ones skipped.
 */
export async function mergedPulls(deps, since, head = "HEAD") {
  const log = deps.git([
    "log",
    "--first-parent",
    "--reverse",
    "--format=%H%x09%s",
    `${since}..${head}`,
  ]);
  if (log.status !== 0) throw new Error(`Cannot list the commits after ${since}.`);
  const numbers = [];
  for (const line of log.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [sha, subject = ""] = line.split("\t");
    let number = pullRequestNumber(subject);
    if (number === null) {
      const found = await deps.api(`/repos/${deps.repository}/commits/${sha}/pulls`);
      const merged = (found ?? []).find((p) => p.merged_at);
      if (!merged) continue;
      number = merged.number;
    }
    if (!numbers.includes(number)) numbers.push(number);
  }
  const pulls = [];
  for (const number of numbers) {
    const pull = await deps.api(`/repos/${deps.repository}/pulls/${number}`);
    const files = [];
    for (let page = 1; page <= 30; page++) {
      const batch = await deps.api(
        `/repos/${deps.repository}/pulls/${number}/files?per_page=100&page=${page}`,
      );
      for (const file of batch) {
        files.push(file.filename);
        if (file.previous_filename) files.push(file.previous_filename);
      }
      if (batch.length < 100) break;
    }
    pulls.push({
      number,
      title: String(pull.title ?? ""),
      body: String(pull.body ?? ""),
      url: String(pull.html_url ?? ""),
      labels: (pull.labels ?? []).map((label) => label.name),
      head: String(pull.head?.ref ?? ""),
      files,
    });
  }
  return pulls;
}

/**
 * Plan a launcher release from main: the version by the rule, the notes and
 * the pull request's description, and the version files to commit.
 *
 * `bump` is "auto" (the rule), or "minor"/"major" chosen by hand. `forPin`
 * names the pin-bump branch; `head` other than HEAD reads every file at that
 * revision (CI's preview). `preview` allows an existing branch.
 */
export async function prepareRelease(deps, options = {}) {
  const {
    bump = "auto",
    head = "HEAD",
    forPin = false,
    pinSummary = "",
    preview = false,
  } = options;
  if (!["auto", "minor", "major"].includes(bump)) {
    throw new Error(`Unknown bump ${bump}; use auto, minor or major.`);
  }
  const read = head === "HEAD" ? deps.readFile : (path) => show(deps, head, path);
  const files = Object.fromEntries(
    Object.entries(VERSION_FILES).map(([key, path]) => [key, read(path)]),
  );
  const versions = launcherVersions(files);
  const problems = versionProblems(versions);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const current = versions["package.json"];
  const pin = parsePin(read("server-pin.json"));
  const base = baseTag(deps, current, head);
  const basePin = parsePin(show(deps, base, "server-pin.json"));
  const serverChanged = basePin.tag !== pin.tag;

  const pulls = await mergedPulls(deps, base, head);
  const automation = pulls.filter((p) => isAutomationBranch(p.head));
  const others = pulls.filter((p) => !isAutomationBranch(p.head));
  const changes = others.filter((p) => p.files.some(isAppPath));
  const quiet = others.filter((p) => !p.files.some(isAppPath));
  const rule = releaseKind({ launcherChanges: changes.length > 0, serverChanged });
  const kind = bump === "auto" ? rule : bump;
  if (!kind) {
    throw Object.assign(
      new Error(
        `Nothing to release since ${base}: no launcher changes and the same server ${pin.tag}.`,
      ),
      { nothingToRelease: true },
    );
  }

  const taken = remoteTags(deps);
  const version = nextVersion(current, kind, taken);
  const tag = `v${version}`;
  const latest = await apiOrNull(deps, `/repos/${deps.repository}/releases/latest`);
  if (latest?.tag_name && parseVersion(latest.tag_name) && !isNewer(tag, latest.tag_name)) {
    throw new Error(`${tag} is not newer than the published ${latest.tag_name}.`);
  }
  const branch = forPin ? `pin/afterhours-${pin.tag}` : `feature/release-${version}`;
  if (!preview && branchExists(deps, branch)) {
    throw new Error(
      `${branch} already exists; close its pull request and delete the branch first.`,
    );
  }

  const servers = serverChanged
    ? serverReleasesBetween(
        await deps.api(`/repos/${pin.repository}/releases?per_page=100`),
        basePin.tag,
        pin.tag,
      ).map((r) => ({ tag: r.tag_name, url: r.html_url, body: r.body ?? "" }))
    : [];
  const previous = await apiOrNull(
    deps,
    `/repos/${deps.repository}/releases/tags/${encodeURIComponent(base)}`,
  );
  const { list: knownLimits, rest: closing } = knownLimitsOf(previous?.body);
  const notes = launcherNotes({
    version,
    serverTag: pin.tag,
    previous: base,
    servers,
    pulls: changes,
    knownLimits,
    closing,
  });

  const open = (await deps.api(`/repos/${deps.repository}/pulls?state=open&per_page=100`))
    .filter((p) => isAutomationBranch(p.head?.ref ?? "") && p.head.ref !== branch)
    .map((p) => `#${p.number} (\`${p.head.ref}\`)`);
  const skipped = [];
  for (let v = bumpVersion(current, kind); v !== version; v = bumpVersion(v, kind))
    skipped.push(`v${v}`);
  const why =
    bump !== "auto"
      ? `${kind}, chosen when preparing`
      : changes.length > 0
        ? `minor: launcher changes in ${refs(changes)}${serverChanged ? ", which wins over the newer server" : ""}`
        : "patch: only the bundled server changed";
  const review = [
    "### Before merging",
    "",
    `- **Version:** ${current} → ${version} (${why}) in \`package.json\`, \`src-tauri/tauri.conf.json\`, \`src-tauri/Cargo.toml\` and \`src-tauri/Cargo.lock\`.${skipped.length > 0 ? ` Skips ${skipped.join(", ")}: the tag already exists.` : ""}`,
    serverChanged
      ? `- **Server:** ${basePin.tag} → ${pin.tag}. The notes repeat the published notes of ${servers.map((s) => s.tag).join(", ") || "no release (none found)"}.`
      : `- **Server:** unchanged at ${pin.tag}.`,
    `- **Notes:** drafted from the pull requests merged after \`${base}\`. Edit the text between the \`release-notes\` markers in this description: the draft release takes it from here when it is built. Everything below the line stays out of the notes.`,
    ...(quiet.length > 0
      ? [
          `- **Not launcher changes** (only workflows, docs, tests or release scripts), so not in the notes and no minor bump: ${refs(quiet)}.`,
        ]
      : []),
    ...(automation.length > 0
      ? [`- **Release pull requests**, left out: ${refs(automation)}.`]
      : []),
    knownLimits
      ? `- **Known limits** and the closing paragraphs are copied from ${base}'s release notes; remove what no longer holds.`
      : `- **Known limits:** ${base} has no published notes to copy them from, so these and the closing paragraphs are the defaults.`,
    ...(open.length > 0
      ? [
          `- **Also open:** ${open.join(", ")}. Merge one release pull request and close the others.`,
        ]
      : []),
    `- Merging tags the merge commit \`${tag}\` once CI passes on it, and **Release** then builds the unpublished draft with these notes.`,
    "- If more pull requests merge before this one, close it, delete its branch and prepare again so the notes and the version include them.",
    ...(pinSummary.trim() ? ["", "### Server pin", "", pinSummary.trim()] : []),
  ].join("\n");

  const bumped = setVersion(files, version);
  return {
    version,
    tag,
    kind,
    base,
    branch,
    title: `Release ${version}${serverChanged ? `: bundle server ${pin.tag}` : ""}`,
    body: releaseBody(notes, review),
    files: Object.fromEntries(
      Object.entries(VERSION_FILES).map(([key, path]) => [path, bumped[key]]),
    ),
  };
}

/**
 * The tag for a main commit whose CI passed, when it is the commit that
 * changed the launcher version (a merged release pull request); `tag: null`
 * with the reason otherwise. Refuses rather than move or reuse a tag.
 */
export async function selectTag(deps, { commit, requireCi = false, branch = "main" }) {
  if (!SHA.test(String(commit))) throw new Error("Expected the full commit SHA.");
  // Main's own history: a merge commit, not a commit inside a merged branch.
  const history = deps.git(["rev-list", "--first-parent", `origin/${branch}`]);
  if (history.status !== 0) throw new Error(`Cannot list the history of ${branch}.`);
  if (!history.stdout.split("\n").includes(commit)) {
    throw new Error(`${commit} is not on ${branch}'s first-parent history.`);
  }
  const versions = launcherVersions(
    Object.fromEntries(
      Object.entries(VERSION_FILES).map(([key, path]) => [key, show(deps, commit, path)]),
    ),
  );
  const problems = versionProblems(versions);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const version = versions["package.json"];
  const before = JSON.parse(show(deps, `${commit}^1`, "package.json")).version;
  if (version === before) return { tag: null, reason: `${commit} keeps version ${version}.` };
  const tag = `v${version}`;

  const listed = deps.git([
    "ls-remote",
    "--tags",
    "origin",
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ]);
  if (listed.status !== 0) throw new Error("Cannot check the remote tags.");
  const remote = new Map(
    listed.stdout
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts.length === 2)
      .map(([sha, ref]) => [ref, sha]),
  );
  if (remote.size > 0) {
    const tagged = remote.get(`refs/tags/${tag}^{}`) ?? remote.get(`refs/tags/${tag}`);
    if (tagged === commit) return { tag: null, reason: `${tag} already names ${commit}.` };
    throw new Error(`${tag} already names ${tagged}, not ${commit}. Prepare a newer version.`);
  }

  const latest = await apiOrNull(deps, `/repos/${deps.repository}/releases/latest`);
  if (latest?.tag_name && parseVersion(latest.tag_name) && !isNewer(tag, latest.tag_name)) {
    throw new Error(`${tag} is not newer than the published ${latest.tag_name}.`);
  }
  if (requireCi) {
    const runs = await deps.api(
      `/repos/${deps.repository}/actions/workflows/ci.yml/runs?head_sha=${commit}&event=push&status=success&per_page=1`,
    );
    if (!(runs?.total_count > 0)) throw new Error(`CI has not passed on ${commit}.`);
  }
  return { tag, reason: `${commit} changes the version ${before} → ${version}.` };
}

/**
 * The draft's notes: those reviewed in the pull request that merged `commit`
 * when it has them, else the default notes for the version at `commit`.
 */
export async function findNotes(deps, { commit }) {
  if (!SHA.test(String(commit))) throw new Error("Expected the full commit SHA.");
  let pulls = [];
  try {
    pulls = (await deps.api(`/repos/${deps.repository}/commits/${commit}/pulls`)) ?? [];
  } catch (error) {
    deps.warn?.(`Cannot look up the pull request that merged ${commit}: ${error.message}`);
  }
  for (const pull of pulls) {
    if (!pull.merged_at || pull.merge_commit_sha !== commit) continue;
    const notes = extractNotes(pull.body);
    if (notes) return { notes, source: `#${pull.number}` };
  }
  const version = JSON.parse(deps.readFile("package.json")).version;
  const pin = parsePin(deps.readFile("server-pin.json"));
  return { notes: launcherNotes({ version, serverTag: pin.tag }), source: "default" };
}
