// The release automation's command line, run by the workflows.
//
//   node scripts/release/cli.mjs prepare [--bump auto|minor|major] [--for-pin]
//        [--pin-summary <file>] --body <file> [--head <rev> --preview]
//        set the next version in the four version files and write the
//        release pull request's description (--preview writes no files)
//   node scripts/release/cli.mjs tag --commit <sha> [--require-ci]
//        print the tag a main commit gets, if it changed the version
//   node scripts/release/cli.mjs notes --commit <sha> --out <file>
//        write the draft's notes: the release pull request's, or the default
//
// Results also go to GITHUB_OUTPUT when it is set. Nothing is pushed, tagged
// or opened here; RELEASING.md describes the workflows that do.
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { apiJson } from "../lib/github.mjs";
import { findNotes, prepareRelease, selectTag } from "./flow.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const deps = {
  repository: process.env.GITHUB_REPOSITORY || "afterhours-crew/afterhours-2015-launcher",
  git: (args) => {
    const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    return { status: out.status, stdout: out.stdout ?? "" };
  },
  // apiJson reports a failed request as "GET <url>: HTTP <status>"; the
  // flows tell a missing release (404) from other failures by the status.
  api: async (path) => {
    try {
      return await apiJson(path);
    } catch (error) {
      const status = /HTTP (\d{3})$/.exec(error?.message ?? "");
      if (status) error.status = Number(status[1]);
      throw error;
    }
  },
  readFile: (path) => readFileSync(join(root, path), "utf8"),
  warn: (message) => console.warn(`::warning::${message}`),
};

function option(args, name) {
  const at = args.indexOf(name);
  if (at < 0) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} needs a value.`);
  return value;
}

function output(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "prepare") {
    const body = option(args, "--body");
    if (!body) throw new Error("prepare needs --body <file>.");
    const summary = option(args, "--pin-summary");
    const plan = await prepareRelease(deps, {
      bump: option(args, "--bump") ?? "auto",
      head: option(args, "--head") ?? "HEAD",
      forPin: args.includes("--for-pin"),
      pinSummary: summary ? readFileSync(summary, "utf8") : "",
      preview: args.includes("--preview"),
    });
    if (!args.includes("--preview")) {
      for (const [path, text] of Object.entries(plan.files)) writeFileSync(join(root, path), text);
    }
    writeFileSync(body, plan.body);
    const { version, tag, kind, base, branch, title } = plan;
    output({ version, tag, kind, base, branch, title });
    console.log(`${title} (${kind} after ${base}) on ${branch}.`);
  } else if (command === "tag") {
    const { tag, reason } = await selectTag(deps, {
      commit: option(args, "--commit"),
      requireCi: args.includes("--require-ci"),
    });
    if (tag) output({ tag });
    console.log(tag ? `Tag ${tag}: ${reason}` : `Nothing to tag: ${reason}`);
  } else if (command === "notes") {
    const out = option(args, "--out");
    if (!out) throw new Error("notes needs --out <file>.");
    const { notes, source } = await findNotes(deps, { commit: option(args, "--commit") });
    writeFileSync(out, `${notes}\n`);
    console.log(
      source === "default"
        ? "No release pull request with notes merged this commit; the draft gets the default notes."
        : `Release notes from ${source}.`,
    );
  } else {
    console.error(
      "usage: cli.mjs prepare --body <file> | tag --commit <sha> | notes --commit <sha> --out <file>",
    );
    process.exit(2);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  // 3: prepare found nothing to release, which is not a failure for a preview.
  process.exit(error?.nothingToRelease ? 3 : 1);
}
