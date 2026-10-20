// Personal information in what a player might share (H7). Pure: which
// sources hold personal information, the report's include list, and
// "Hide my user name", which replaces the Windows user name in paths with
// %USERNAME% in everything the launcher copies.

import type { SessionList, SessionSummary } from "$lib/api/types";
import { summaryText } from "./logs";
import { type Clock } from "./format";

export const REDACTED = "%USERNAME%";

/** A source that always holds personal information, and what it holds. */
export interface PersonalSource {
  id: "ea-desktop-logs" | "crash-dumps" | "protocol-recording";
  title: string;
  /** One line: what of the player's it holds. */
  holds: string;
}

export const PERSONAL_SOURCES: readonly PersonalSource[] = [
  {
    id: "ea-desktop-logs",
    title: "EA Desktop logs",
    holds: "Your EA account name, email and IDs",
  },
  {
    id: "crash-dumps",
    title: "Game crash dumps",
    holds: "Anything that was in the game's memory",
  },
  {
    id: "protocol-recording",
    title: "Protocol recording",
    holds: "Your account identity, every message",
  },
];

export function personalSource(id: string): PersonalSource | null {
  return PERSONAL_SOURCES.find((s) => s.id === id) ?? null;
}

/** What a save's account table holds when it identifies the player; `null` otherwise. */
export function personalTable(entryId: string): string | null {
  return entryId === "domain:identity" ? "Your driver name, persona and account IDs" : null;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace the user name with %USERNAME%: the folder after `Users` (or
 * `home`) in any path, whatever it is called there (including a short
 * 8.3 name such as SNOWWH~1), and the user name itself wherever it stands
 * as a whole word, in any case. A name inside a longer word is left alone.
 */
export function redactUserName(text: string, userName: string | null): string {
  let out = text.replace(
    /([A-Za-z]:[\\/]+Users[\\/]+|\/(?:Users|home)\/)([^\\/:*?"<>|\r\n]+)/gi,
    (_, head: string) => `${head}${REDACTED}`,
  );
  const name = userName?.trim();
  if (name) {
    const word = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, "giu");
    out = out.replace(word, REDACTED);
  }
  return out;
}

/** One line of the report's Include list. */
export interface ReportItem {
  id: "server" | "reports" | PersonalSource["id"];
  label: string;
  /** Personal-information sources start unchecked and carry the badge. */
  personal: PersonalSource | null;
  /** The files or folders it adds to the report. */
  paths: string[];
}

function join(dir: string, name: string): string {
  return `${dir}${dir.includes("\\") ? "\\" : "/"}${name}`;
}

const SERVER_FILES = ["server.stderr.log", "status.json"];
const REPORT_FILES = [
  "server.stdout.jsonl",
  "prepare.stdout.json",
  "prepare.stderr.log",
  "create-account.stdout.json",
  "create-account.stderr.log",
];

/** What a report of `session` can include: only what exists. */
export function reportItems(session: SessionSummary, list: SessionList): ReportItem[] {
  const has = (name: string) => session.files.some((f) => f.name === name);
  const items: ReportItem[] = [];
  const server = SERVER_FILES.filter(has).map((n) => join(session.directory, n));
  if (server.length) {
    items.push({ id: "server", label: "Server log and summary", personal: null, paths: server });
  }
  const reports = REPORT_FILES.filter(has).map((n) => join(session.directory, n));
  if (reports.length) {
    items.push({
      id: "reports",
      label: "Startup and content reports",
      personal: null,
      paths: reports,
    });
  }
  if (list.ea_desktop_logs?.exists) {
    items.push({
      id: "ea-desktop-logs",
      label: "EA Desktop logs",
      personal: personalSource("ea-desktop-logs"),
      paths: [list.ea_desktop_logs.path],
    });
  }
  if (session.crash_dumps?.length) {
    items.push({
      id: "crash-dumps",
      label: "Game crash dumps",
      personal: personalSource("crash-dumps"),
      paths: session.crash_dumps.map((d) => d.path),
    });
  }
  if (session.runs_directory_exists) {
    items.push({
      id: "protocol-recording",
      label: "Protocol recording",
      personal: personalSource("protocol-recording"),
      paths: [session.runs_directory],
    });
  }
  return items;
}

/** The checklist's starting state: everything but personal information. */
export function defaultIncluded(items: ReportItem[]): Set<ReportItem["id"]> {
  return new Set(items.filter((i) => !i.personal).map((i) => i.id));
}

/**
 * The summary Copy puts on the clipboard: the session, then the files to
 * attach for the checked items, with the user name hidden when asked.
 */
export function reportSummary(
  session: SessionSummary,
  items: ReportItem[],
  include: ReadonlySet<string>,
  hide: { on: boolean; userName: string | null },
  clock: Clock = {},
): string {
  const lines = [summaryText(session, clock)];
  const chosen = items.filter((i) => include.has(i.id));
  if (chosen.length) {
    lines.push("Files to attach:");
    for (const item of chosen) for (const path of item.paths) lines.push(`  ${path}`);
  }
  const text = lines.join("\n");
  return hide.on ? redactUserName(text, hide.userName) : text;
}

/** A path for Copy path, with the user name hidden when asked. */
export function copyablePath(path: string, hide: { on: boolean; userName: string | null }): string {
  return hide.on ? redactUserName(path, hide.userName) : path;
}
