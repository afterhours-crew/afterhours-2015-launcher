// View models for Logs (E1) and the log viewer (E2), from `sessions --json`
// (contract v1) and the session files it lists. Files are grouped by how
// useful they are when something goes wrong: start here, when something
// breaks, deep dive. Server log lines are parsed from the tracing format
// the server writes:
//
//   2026-10-18T08:19:41.015Z  WARN nfs_server::diagnostics: unsupported operation received service="lsx" route=Some("QueryFriends")

import type { OutputLine, SessionFile, SessionSummary, ServerLog } from "$lib/api/types";
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatWhen,
  humanize,
  type Clock,
} from "./format";

export type FileGroup = "start" | "breaks" | "deep";

/** What each session file is, in plain words. */
export const FILE_INFO: Record<string, { title: string; about: string; group: FileGroup }> = {
  "status.json": {
    title: "Session summary",
    about:
      "How the session ended, the message you saw, and the process IDs of the game and the server.",
    group: "start",
  },
  "server.stderr.log": {
    title: "Server log",
    about:
      "Everything your server did, one line per event: connections, what the game asked for and what was answered. It stops at 4 MB per session.",
    group: "breaks",
  },
  "server.stdout.jsonl": {
    title: "Startup report",
    about:
      "The server's first word: the ports it opened. Check here first if the game never connects.",
    group: "breaks",
  },
  "prepare.stdout.json": {
    title: "Content preparation",
    about:
      "Which files were read from your game installation before the server started. Errors here usually mean a changed or incomplete install.",
    group: "breaks",
  },
  "prepare.stderr.log": {
    title: "Content preparation",
    about:
      "Which files were read from your game installation before the server started. Errors here usually mean a changed or incomplete install.",
    group: "breaks",
  },
  "create-account.stdout.json": {
    title: "Account creation",
    about: "The first run's new driver: written once, when the save is created.",
    group: "breaks",
  },
  "create-account.stderr.log": {
    title: "Account creation",
    about: "The first run's new driver: written once, when the save is created.",
    group: "breaks",
  },
  "game.stdout.log": {
    title: "Game console",
    about: "What the game printed, usually a line or two. Rarely useful on its own.",
    group: "breaks",
  },
  "game.stderr.log": {
    title: "Game console",
    about: "What the game printed, usually a line or two. Rarely useful on its own.",
    group: "breaks",
  },
  "request.json": {
    title: "Session request",
    about: "What the launcher was asked to do (start, serve or setup) and with which folders.",
    group: "deep",
  },
  stop: {
    title: "Stop request",
    about: "Left by Stop: the request the supervisor reads to close the game, then the server.",
    group: "deep",
  },
  "stop-server": {
    title: "Stop request",
    about: "Left by Stop: the request the supervisor reads to close the game, then the server.",
    group: "deep",
  },
};

export interface FileEntry {
  title: string;
  about: string;
  group: FileGroup;
  /** Files behind this entry, such as game.stdout.log and game.stderr.log. */
  names: string[];
  bytes: number;
  lines: number | null;
  truncated: boolean;
}

/** The session's files as dashboard entries, in the order of [`FILE_INFO`]. */
export function fileEntries(files: SessionFile[]): FileEntry[] {
  const byTitle = new Map<string, FileEntry>();
  const known = Object.keys(FILE_INFO);
  const sorted = [...files].sort((a, b) => {
    const ia = known.indexOf(a.name);
    const ib = known.indexOf(b.name);
    return (
      (ia < 0 ? known.length : ia) - (ib < 0 ? known.length : ib) || a.name.localeCompare(b.name)
    );
  });
  for (const file of sorted) {
    const info = FILE_INFO[file.name] ?? {
      title: file.name,
      about: "A file the launcher does not describe yet.",
      group: "deep" as const,
    };
    const entry = byTitle.get(info.title);
    if (entry) {
      entry.names.push(file.name);
      entry.bytes += file.bytes;
      entry.lines = entry.lines == null || file.lines == null ? null : entry.lines + file.lines;
      entry.truncated ||= file.truncated;
    } else {
      byTitle.set(info.title, {
        ...info,
        names: [file.name],
        bytes: file.bytes,
        lines: file.lines,
        truncated: file.truncated,
      });
    }
  }
  return [...byTitle.values()];
}

export function groupFiles(files: SessionFile[]): Record<FileGroup, FileEntry[]> {
  const groups: Record<FileGroup, FileEntry[]> = { start: [], breaks: [], deep: [] };
  for (const entry of fileEntries(files)) groups[entry.group].push(entry);
  return groups;
}

/** "444 KB · 3,171 lines": a file row's secondary line on the dashboard. */
export function fileFacts(entry: FileEntry): string {
  const parts = [formatBytes(entry.bytes)];
  if (entry.lines != null)
    parts.push(`${formatCount(entry.lines)} ${entry.lines === 1 ? "line" : "lines"}`);
  if (entry.truncated) parts.push("cut at 4 MB");
  return parts.join(" · ");
}

/** "server.stderr.log · 444 KB · 3,171 lines". */
export function fileLine(entry: FileEntry): string {
  const parts = [entry.names.join(", "), formatBytes(entry.bytes)];
  if (entry.lines != null)
    parts.push(`${formatCount(entry.lines)} ${entry.lines === 1 ? "line" : "lines"}`);
  if (entry.truncated) parts.push("cut at 4 MB");
  return parts.join(" · ");
}

export interface WarningGroups {
  total: number;
  kinds: number;
  rows: { label: string; count: number }[];
  more: { kinds: number; count: number } | null;
}

/** The server's unsupported-request warnings, most frequent first. */
export function warningGroups(log: ServerLog | null, top = 3): WarningGroups | null {
  if (!log) return null;
  const groups = log.unsupported.map((g) => ({
    label: `${g.service ?? "unknown"} · ${g.route ?? "no route"}`,
    count: g.warnings,
  }));
  const rows = groups.slice(0, top);
  const rest = groups.slice(top);
  const restCount = rest.reduce((sum, g) => sum + g.count, 0);
  // Groups beyond the server's bound are still in the total.
  const hidden = log.unsupported_total - groups.reduce((sum, g) => sum + g.count, 0);
  const more =
    rest.length > 0 || hidden > 0
      ? { kinds: rest.length, count: restCount + Math.max(0, hidden) }
      : null;
  return { total: log.unsupported_total, kinds: groups.length, rows, more };
}

const STATE_WORDS: Record<string, { label: string; dot: "ready" | "warn" | "info" | null }> = {
  preparing: { label: "Preparing", dot: "info" },
  starting: { label: "Starting", dot: "info" },
  activation: { label: "Waiting for EA activation", dot: "warn" },
  ready: { label: "Running", dot: "ready" },
  stopping: { label: "Stopping", dot: "info" },
  finished: { label: "Finished", dot: "ready" },
  failed: { label: "Failed", dot: "warn" },
  interrupted: { label: "Interrupted", dot: "warn" },
};

export function stateWords(state: string | null): {
  label: string;
  dot: "ready" | "warn" | "info" | null;
} {
  return (state && STATE_WORDS[state]) || { label: "No status recorded", dot: null };
}

export interface SessionHeading {
  when: string;
  /** "session 5ed19fb4 · 1 of 6". */
  position: string;
  state: string;
  dot: "ready" | "warn" | "info" | null;
  message: string | null;
}

export function sessionHeading(
  session: SessionSummary,
  index: number,
  count: number,
  clock: Clock = {},
): SessionHeading {
  const words = stateWords(session.state);
  return {
    when: session.started_utc
      ? formatWhen(session.started_utc, session.ended_utc, clock)
      : "Start unknown",
    position: `session ${session.id.slice(0, 8)} · ${index + 1} of ${count}`,
    state: words.label,
    dot: words.dot,
    message: session.message,
  };
}

/** "Finished · 3 min · 1,843 lines · 16 warnings · no errors": the dashboard's status line. */
export function sessionLine(session: SessionSummary): string {
  const parts = [stateWords(session.state).label];
  if (session.started_utc && session.ended_utc) {
    const ms = Date.parse(session.ended_utc) - Date.parse(session.started_utc);
    if (Number.isFinite(ms) && ms >= 0) parts.push(formatDuration(ms));
  }
  const log = session.server_log;
  if (log) {
    const count = (n: number, one: string, many: string) =>
      n === 0 ? `no ${many}` : `${formatCount(n)} ${n === 1 ? one : many}`;
    parts.push(`${formatCount(log.lines)} ${log.lines === 1 ? "line" : "lines"}`);
    parts.push(count(log.levels.warn, "warning", "warnings"));
    parts.push(count(log.levels.error, "error", "errors"));
  } else {
    parts.push("no server log");
  }
  return parts.join(" · ");
}

export interface Chip {
  text: string;
  tone: "plain" | "warn";
}

/** The facts row under a session's heading. */
export function sessionChips(session: SessionSummary): Chip[] {
  const chips: Chip[] = [];
  const log = session.server_log;
  if (log) {
    const warnings = log.levels.warn;
    const errors = log.levels.error;
    chips.push({ text: `${formatCount(log.lines)} server lines`, tone: "plain" });
    chips.push({
      text: `${formatCount(warnings)} ${warnings === 1 ? "warning" : "warnings"}`,
      tone: warnings > 0 ? "warn" : "plain",
    });
    chips.push({
      text: `${formatCount(errors)} ${errors === 1 ? "error" : "errors"}`,
      tone: errors > 0 ? "warn" : "plain",
    });
  } else {
    chips.push({ text: "No server log", tone: "plain" });
  }
  if (session.crash_dumps) {
    const n = session.crash_dumps.length;
    chips.push({
      text: `${n} ${n === 1 ? "crash dump" : "crash dumps"}`,
      tone: n > 0 ? "warn" : "plain",
    });
  }
  if (session.started_utc && session.ended_utc) {
    const ms = Date.parse(session.ended_utc) - Date.parse(session.started_utc);
    if (Number.isFinite(ms) && ms >= 0) chips.push({ text: formatDuration(ms), tone: "plain" });
  }
  return chips;
}

/** Info, warning and error shares of the server log, for its level bar. */
export function levelShares(log: ServerLog): { level: "info" | "warn" | "error"; count: number }[] {
  const info = log.levels.info + log.levels.debug + log.levels.trace + log.levels.other;
  return [
    { level: "info" as const, count: info },
    { level: "warn" as const, count: log.levels.warn },
    { level: "error" as const, count: log.levels.error },
  ].filter((s) => s.count > 0);
}

export type Level = "error" | "warn" | "info" | "debug" | "trace";

export interface LogLine {
  /** 0-based line number in the file. */
  index: number;
  /** "08:19:41.015" in UTC, as the server stamps lines. */
  time: string | null;
  level: Level | null;
  target: string | null;
  /** The target's last part, humanized: `nfs_server::diagnostics` → "Diagnostics". */
  area: string;
  message: string;
  fields: [string, string][];
  raw: string;
}

const LINE =
  /^(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})(\.\d+)?Z)\s+(ERROR|WARN|INFO|DEBUG|TRACE)\s+([A-Za-z_][\w:]*):\s?(.*)$/;
const FIELD_START = /\s([A-Za-z_][\w.]*)=/;

export function areaOf(target: string | null): string {
  if (!target) return "Other";
  const last = target.split("::").pop() ?? target;
  return last === "nfs_server" ? "Server" : humanize(last);
}

/** Read one field value at `at`: a quoted string, or text up to a space outside brackets. */
function readValue(text: string, at: number): [string, number] {
  if (text[at] === '"') {
    let out = "";
    let i = at + 1;
    for (; i < text.length; i++) {
      const c = text[i]!;
      if (c === "\\" && i + 1 < text.length) {
        out += text[++i];
      } else if (c === '"') {
        i++;
        break;
      } else {
        out += c;
      }
    }
    return [out, i];
  }
  let depth = 0;
  let quoted = false;
  let i = at;
  for (; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === "\\") i++;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth = Math.max(0, depth - 1);
    else if (/\s/.test(c) && depth === 0) break;
  }
  return [text.slice(at, i), i];
}

/** `Some("QueryFriends")` → `QueryFriends`; `None` → `none`. */
export function cleanValue(value: string): string {
  const some = /^Some\((.*)\)$/s.exec(value);
  const inner = some ? some[1]! : value;
  if (inner === "None") return "none";
  const quoted = /^"(.*)"$/s.exec(inner);
  return quoted ? quoted[1]!.replace(/\\"/g, '"') : inner;
}

export function parseFields(text: string): [string, string][] {
  const fields: [string, string][] = [];
  let rest = ` ${text}`;
  while (rest.length > 0) {
    const match = FIELD_START.exec(rest);
    if (!match || match.index !== 0) break;
    const at = match[0].length;
    const [value, end] = readValue(rest, at);
    fields.push([match[1]!, cleanValue(value)]);
    rest = rest.slice(end);
    if (!/^\s/.test(rest)) break;
  }
  return fields;
}

export function parseLogLine(raw: string, index: number): LogLine {
  const match = LINE.exec(raw);
  if (!match) {
    return {
      index,
      time: null,
      level: null,
      target: null,
      area: "Other",
      message: raw,
      fields: [],
      raw,
    };
  }
  const body = match[6]!;
  const start = FIELD_START.exec(body);
  const message = start ? body.slice(0, start.index) : body;
  const fields = start ? parseFields(body.slice(start.index + 1)) : [];
  const millis = (match[3] ?? ".000").slice(0, 4).padEnd(4, "0");
  return {
    index,
    time: `${match[2]}${millis}`,
    level: match[4]!.toLowerCase() as Level,
    target: match[5]!,
    area: areaOf(match[5]!),
    message: message.trim(),
    fields,
    raw,
  };
}

/** Level words for log rows: "Warning", not "WARN". */
export const LEVEL_WORDS: Record<Level, string> = {
  error: "Error",
  warn: "Warning",
  info: "Info",
  debug: "Debug",
  trace: "Trace",
};

/** One row of a live log: time, a level word, the message and its key fields. */
export interface ConsoleRow {
  /** "17:41:02"; empty for a line without a time. */
  time: string;
  level: string;
  tone: "warn" | "error" | "info" | null;
  message: string;
  /** "service=lsx route=GetBlockList", in the secondary grey. */
  detail: string;
}

/**
 * A line of the session console as a log row. Supervisor status lines keep
 * their state as the level ("Ready"); server lines are parsed like the
 * viewer's, and anything else is shown as it came.
 */
export function consoleRow(line: OutputLine): ConsoleRow {
  if (line.kind === "status") {
    const state = line.state.trim();
    return {
      time: line.time,
      level: state ? `${state.charAt(0).toUpperCase()}${state.slice(1)}` : "",
      tone: state === "failed" ? "warn" : null,
      message: line.message,
      detail: "",
    };
  }
  // The launcher's own line about the server in use, told apart from the
  // server's by its level.
  if (line.kind === "launcher") {
    return {
      time: line.time,
      level: "Launcher",
      tone: "info",
      message: line.message,
      detail: line.detail,
    };
  }
  const parsed = parseLogLine(line.text, 0);
  return {
    time: parsed.time?.slice(0, 8) ?? "",
    level: parsed.level ? LEVEL_WORDS[parsed.level] : "",
    tone: parsed.level === "warn" || parsed.level === "error" ? parsed.level : null,
    message: parsed.message,
    detail: fieldSummary(parsed),
  };
}

/** Lines the viewer parses from one file; the file itself is at most 4 MB. */
export const MAX_VIEWER_LINES = 20_000;

export function parseLog(text: string): { lines: LogLine[]; cut: boolean } {
  const raw = text.split(/\r?\n/);
  if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
  const cut = raw.length > MAX_VIEWER_LINES;
  return { lines: raw.slice(0, MAX_VIEWER_LINES).map(parseLogLine), cut };
}

export type LevelFilter = "all" | "warn" | "error";

export interface LineFilter {
  level: LevelFilter;
  query: string;
  /** Areas to show; `null` shows every area. */
  areas: ReadonlySet<string> | null;
}

export function filterLines(lines: LogLine[], filter: LineFilter): LogLine[] {
  const q = filter.query.trim().toLowerCase();
  return lines.filter(
    (line) =>
      (filter.level === "all" || line.level === filter.level) &&
      (!filter.areas || filter.areas.has(line.area)) &&
      (!q || line.raw.toLowerCase().includes(q)),
  );
}

export interface Grouped {
  line: LogLine;
  /** Consecutive lines with the same level, target and message. */
  count: number;
}

/** Fields that say which thing an event is about, so repeats of different ones stay apart. */
const IDENTITY_FIELDS = ["service", "route"];
/** Fields that change on every repeat and say little on their own. */
const NOISY_FIELDS = new Set(["connection", "correlation", "seen", "suppressed", "route_overflow"]);

function identity(line: LogLine): string {
  return JSON.stringify(
    IDENTITY_FIELDS.map((key) => line.fields.find(([k]) => k === key)?.[1] ?? null),
  );
}

/** The first fields worth reading inline: "service=lsx route=QueryFriends". */
export function fieldSummary(line: LogLine, max = 3): string {
  return line.fields
    .filter(([key]) => !NOISY_FIELDS.has(key))
    .slice(0, max)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
}

/** Collapse runs of the same event into one row with a count. */
export function groupRepeats(lines: LogLine[]): Grouped[] {
  const out: Grouped[] = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    if (
      last &&
      line.level !== null &&
      last.line.level === line.level &&
      last.line.target === line.target &&
      last.line.message === line.message &&
      identity(last.line) === identity(line)
    ) {
      last.count += 1;
    } else {
      out.push({ line, count: 1 });
    }
  }
  return out;
}

/** Areas present, most lines first. */
export function areaCounts(lines: LogLine[]): { area: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line.area, (counts.get(line.area) ?? 0) + 1);
  return [...counts.entries()]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area));
}

/** Plain text for "Copy summary": what a bug report needs, no file contents. */
export function summaryText(session: SessionSummary, clock: Clock = {}): string {
  const heading = sessionHeading(session, 0, 1, clock);
  const lines = [
    `Afterhours session ${session.id}`,
    `${heading.when} · ${session.action ?? "unknown action"} · ${heading.state}`,
  ];
  if (session.message) lines.push(`Message: ${session.message}`);
  lines.push(
    sessionChips(session)
      .map((c) => c.text)
      .join(" · "),
  );
  const warnings = warningGroups(session.server_log, 10);
  if (warnings && warnings.total > 0) {
    lines.push("Unsupported requests:");
    for (const row of warnings.rows) lines.push(`  ${row.label}: ${row.count}`);
    if (warnings.more) lines.push(`  ${warnings.more.kinds} more kinds: ${warnings.more.count}`);
  }
  for (const warning of session.warnings) lines.push(`Note: ${warning}`);
  return lines.join("\n");
}
