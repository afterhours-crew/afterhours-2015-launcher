// Release planning: the version rule, what counts as a launcher change, and
// the tester-facing notes. Pure helpers for scripts/release/flow.mjs, tested
// in plan.test.mjs. RELEASING.md describes the rule.
import { compareVersions, parseVersion } from "../../src/lib/state/version.ts";

export const NOTES_START = "<!-- release-notes:start -->";
export const NOTES_END = "<!-- release-notes:end -->";

const normalize = (text) => String(text ?? "").replace(/\r\n/g, "\n");

/** The next version for a bump kind; a pre-release is followed by its own release first. */
export function bumpVersion(version, kind) {
  const v = parseVersion(version);
  if (!v) throw new Error(`${version} is not a version.`);
  const { major, minor, patch } = v;
  if (v.pre.length > 0) {
    const own =
      kind === "patch" ||
      (kind === "minor" && patch === 0) ||
      (kind === "major" && minor === 0 && patch === 0);
    if (own) return `${major}.${minor}.${patch}`;
  }
  if (kind === "major") return `${major + 1}.0.0`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Unknown bump ${kind}; use patch, minor or major.`);
}

/**
 * The version after `current`, skipping any whose tag already exists: tags
 * are immutable, so a tag left by a deleted draft (v0.2.0) is never reused.
 */
export function nextVersion(current, kind, takenTags = []) {
  const taken = new Set(takenTags.map((tag) => String(tag).replace(/^v/, "")));
  let next = bumpVersion(current, kind);
  for (let i = 0; taken.has(next); i++) {
    if (i >= 100) throw new Error(`No free ${kind} version after ${current}.`);
    next = bumpVersion(next, kind);
  }
  return next;
}

/**
 * The owner's rule (2026-10-20): launcher changes bump the minor version, a
 * release that only bundles a newer server bumps the patch, and with both
 * the minor bump wins. `null` when there is nothing to release.
 */
export function releaseKind({ launcherChanges, serverChanged }) {
  if (launcherChanges) return "minor";
  if (serverChanged) return "patch";
  return null;
}

/** Paths that cannot change what testers download: automation, docs and tests. */
const NOT_APP = [
  /^\.github\//,
  /^docs\//,
  /^scripts\/release\//,
  /\.md$/i,
  /\.test\.(ts|mjs)$/,
  /^\.(prettierrc|prettierignore|gitignore|gitattributes)$/,
];

/** Whether a changed path is a launcher change for the version rule. */
export function isAppPath(path) {
  return !NOT_APP.some((pattern) => pattern.test(path));
}

/** Pull requests the release automation opens, which are never launcher changes. */
export function isAutomationBranch(head) {
  return /^pin\/afterhours-/.test(head) || /^(feature\/)?release[-/]/.test(head);
}

/** GitHub's merge commit subject, or a squash merge's "Title (#N)". */
export function pullRequestNumber(subject) {
  const merge = /^Merge pull request #(\d+) from /.exec(subject);
  if (merge) return Number(merge[1]);
  const squash = /\(#(\d+)\)\s*$/.exec(subject);
  return squash ? Number(squash[1]) : null;
}

/** Added, Changed or Fixed: a kind: label first, then the branch prefix. */
export function sectionOf({ labels = [], head = "" }) {
  if (labels.includes("kind:bug")) return "Fixed";
  if (labels.includes("kind:feature")) return "Added";
  if (labels.includes("kind:change")) return "Changed";
  if (/^(bugfix|fix)\//.test(head)) return "Fixed";
  if (/^feature\//.test(head)) return "Added";
  return "Changed";
}

const VERSION_FIELDS = [
  ["packageJson", "package.json", /^(\s*"version":\s*")([^"]+)(")/gm],
  ["tauriConf", "src-tauri/tauri.conf.json", /^(\s*"version":\s*")([^"]+)(")/gm],
  ["cargoToml", "src-tauri/Cargo.toml", /^(\[package\][^[]*?^version\s*=\s*")([^"]+)(")/gm],
  [
    "cargoLock",
    "src-tauri/Cargo.lock",
    /(\[\[package\]\]\r?\nname = "afterhours-launcher"\r?\nversion = ")([^"]+)(")/g,
  ],
];

/** The four version files with `version` set, everything else untouched. */
export function setVersion(files, version) {
  if (!parseVersion(version) || version.startsWith("v")) {
    throw new Error(`${version} is not a plain version.`);
  }
  const out = { ...files };
  for (const [key, file, pattern] of VERSION_FIELDS) {
    const found = String(files[key] ?? "").match(pattern) ?? [];
    if (found.length !== 1) throw new Error(`${file} has no single launcher version field.`);
    out[key] = files[key].replace(pattern, (_, before, _old, after) => before + version + after);
  }
  return out;
}

/** The text under a level 2 heading up to the next level 1 or 2 heading, or `null`. */
export function markdownSection(markdown, heading) {
  const out = [];
  let inside = false;
  for (const line of normalize(markdown).split("\n")) {
    if (/^#{1,2}\s/.test(line)) {
      if (inside) break;
      inside =
        /^##\s/.test(line) &&
        line
          .replace(/^##\s+/, "")
          .trim()
          .toLowerCase() === heading.toLowerCase();
      continue;
    }
    if (inside) out.push(line);
  }
  const text = out.join("\n").trim();
  return text || null;
}

/** A section's opening list and the paragraphs after it, each `null` when absent. */
export function splitLeadingList(text) {
  const lines = normalize(text).split("\n");
  const out = [];
  let blanks = 0;
  let index = 0;
  for (; index < lines.length; index++) {
    const line = lines[index];
    if (out.length === 0) {
      if (/^\s*$/.test(line)) continue;
      if (!/^[-*+] /.test(line)) break;
      out.push(line);
      continue;
    }
    if (/^\s*$/.test(line)) {
      blanks++;
      continue;
    }
    if (!(/^[-*+] /.test(line) || /^\s+\S/.test(line) || blanks === 0)) break;
    for (; blanks > 0; blanks--) out.push("");
    out.push(line);
  }
  const rest = lines.slice(index).join("\n").trim();
  return { list: out.length > 0 ? out.join("\n") : null, rest: rest || null };
}

/** The list a section opens with, without the paragraphs that may follow it. */
export function leadingList(text) {
  return splitLeadingList(text).list;
}

/** A pull request's own tester-facing text: its "## Release note" section, if any. */
export function releaseNoteText(body) {
  for (const heading of ["Release note", "Release notes", "For testers"]) {
    const text = markdownSection(body, heading);
    if (text) return text;
  }
  return null;
}

export function formatEntry({ number, title, url, body }) {
  let text = String(title).trim();
  if (!/[.!?]$/.test(text)) text += ".";
  const note = releaseNoteText(body);
  const line = `- **${text}**${note ? ` ${note.replace(/\n/g, "\n  ")}` : ""}`;
  return `${line} ([#${number}](${url}))`;
}

/** The parts of a server release's notes worth repeating in the launcher's. */
export function serverHighlights(body) {
  const text = normalize(body).replace(/<!--[\s\S]*?-->/g, "");
  const intro = text.split(/\n#{1,6}\s/)[0] ?? "";
  const summary =
    intro
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !/^download\b/i.test(p)) ?? null;
  const sections = [];
  for (const heading of ["Added", "Changed", "Fixed"]) {
    const list = leadingList(markdownSection(text, heading));
    if (list) sections.push([heading, list]);
  }
  return { summary, sections };
}

export const DEFAULT_KNOWN_LIMITS = [
  "- The installer isn't code-signed, so SmartScreen may warn.",
  "- 64-bit Windows only.",
  "- Like the terminal, the launcher needs the supported, previously activated game installation (EA or Steam) and does not activate the game.",
].join("\n");

/** The paragraphs that close the v0.1.2 notes, used when no earlier notes have any. */
export const DEFAULT_CLOSING = [
  "This is an early tester release. No game content is distributed: car pictures are read from your own installation on your PC.",
  "",
  "For feedback, include the launcher version (Settings → About), what you did, what happened and what you expected. Use the summary on **Logs** and check it before sharing; never upload game files, saves or activation credentials.",
].join("\n");

const bare = (tag) => String(tag).replace(/^v/, "");

/** The Known limits list and the closing paragraphs after it in a release's notes. */
export function knownLimitsOf(body) {
  return splitLeadingList(markdownSection(body ?? "", "Known limits"));
}

/**
 * The launcher release's notes, in the shape of the v0.1.2 notes: a summary
 * line to replace, updating from the previous release, which file to
 * download, what the bundled server brings (for a pin bump), what changed in
 * the launcher, then known limits and the closing paragraphs, both carried
 * over from the previous release's notes when it has them.
 */
export function launcherNotes({
  version,
  serverTag,
  previous,
  servers = [],
  pulls = [],
  knownLimits,
  closing,
}) {
  const server = bare(serverTag);
  const earlier = previous ? bare(previous) : null;
  const lines = [
    "<!-- Replace the next line with one sentence on what this release brings. -->",
    servers.length > 0
      ? `Launcher ${version} comes with the **Afterhours ${server}** server.`
      : `Launcher ${version}, with the Afterhours ${server} server.`,
    "",
    earlier ? `## Updating from ${earlier}` : "## Updating",
    "",
    `If you installed ${earlier ?? "an earlier version"}, the launcher offers this update by itself (Settings → Updates, or the banner).${servers.length > 0 ? " Because the server changes, it first copies your saves to `%LOCALAPPDATA%\\Afterhours2015\\backups`." : ""} It never updates while you're playing.`,
    "",
    "If you use the no-install ZIP, the launcher tells you this version is out and opens this page. Download the new ZIP, close the launcher and replace the files.",
    "",
    "## Which file to download",
    "",
    "There are two downloads with the same launcher inside. They differ only in how it gets onto your PC and how it updates:",
    "",
    `- **Afterhours_${version}_x64-setup.exe: the installer.** Choose this if you want the launcher to keep itself up to date. It installs for your Windows user only, needs no administrator rights, and installs new versions for you. It isn't code-signed yet, so Windows SmartScreen may warn; choose **More info → Run anyway**.`,
    `- **Afterhours_${version}_x64-portable.zip: no installation.** Choose this if you'd rather not install anything. Extract it anywhere and run **Afterhours2015Launcher.exe**. Extracted into the game folder, beside NFS16.exe, it uses that game. It tells you when a new version is out and opens its download page, but you replace the files yourself.`,
    "",
    "The other two files, `.sig` and `latest.json`, are for the launcher's updater. You don't need to download them.",
  ];
  for (const server of servers) {
    const { summary, sections } = serverHighlights(server.body);
    lines.push("", `## New with the ${bare(server.tag)} server`);
    if (summary) lines.push("", summary);
    for (const [heading, list] of sections) lines.push("", `### ${heading}`, "", list);
    lines.push("", `[Afterhours ${server.tag} release notes](${server.url})`);
  }
  const groups = ["Added", "Changed", "Fixed"]
    .map((heading) => [
      heading,
      pulls.filter((p) => sectionOf(p) === heading).sort((a, b) => a.number - b.number),
    ])
    .filter(([, entries]) => entries.length > 0);
  if (groups.length > 0) {
    lines.push("", "## New in the launcher");
    for (const [heading, entries] of groups) {
      lines.push("", `### ${heading}`, "", ...entries.map(formatEntry));
    }
  }
  lines.push(
    "",
    "## Known limits",
    "",
    knownLimits || DEFAULT_KNOWN_LIMITS,
    "",
    closing || DEFAULT_CLOSING,
  );
  return lines.join("\n");
}

/** A release pull request's description: the notes between markers, then the review. */
export function releaseBody(notes, review = "") {
  let body = `${NOTES_START}\n${notes.trim()}\n${NOTES_END}`;
  if (review.trim()) body += `\n\n---\n\n${review.trim()}`;
  return `${body}\n`;
}

/** The notes between the markers, line endings normalized; `null` when there are none. */
export function extractNotes(body) {
  const text = normalize(body);
  const start = text.indexOf(NOTES_START);
  if (start < 0) return null;
  const end = text.indexOf(NOTES_END, start + NOTES_START.length);
  if (end < 0) return null;
  const notes = text.slice(start + NOTES_START.length, end).trim();
  return notes || null;
}

/** Server releases after `from` up to and including `to`, published only, oldest first. */
export function serverReleasesBetween(releases, from, to) {
  return releases
    .filter((r) => !r.draft && !r.prerelease && parseVersion(String(r.tag_name ?? "")))
    .filter((r) => compareVersions(r.tag_name, from) > 0 && compareVersions(r.tag_name, to) <= 0)
    .sort((a, b) => compareVersions(a.tag_name, b.tag_name));
}
