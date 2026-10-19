import { describe, expect, it } from "vitest";
import type { ServerLog } from "$lib/api/types";
import {
  areaCounts,
  areaOf,
  cleanValue,
  consoleRow,
  fieldSummary,
  fileEntries,
  fileFacts,
  fileLine,
  filterLines,
  groupFiles,
  groupRepeats,
  levelShares,
  parseFields,
  parseLog,
  parseLogLine,
  sessionChips,
  sessionLine,
  sessionHeading,
  stateWords,
  summaryText,
  warningGroups,
} from "./logs";
import { SAMPLE_SESSIONS, sampleFile } from "./sample";

const UTC = { timeZone: "UTC" };
const [FINISHED, FAILED] = SAMPLE_SESSIONS.sessions;

describe("session files", () => {
  it("are grouped by relevance, with both game streams as one entry", () => {
    const groups = groupFiles(FINISHED!.files);
    expect(groups.start.map((e) => e.title)).toEqual(["Session summary"]);
    expect(groups.breaks.map((e) => e.title)).toEqual([
      "Server log",
      "Startup report",
      "Content preparation",
      "Game console",
    ]);
    expect(groups.deep.map((e) => e.title)).toEqual(["Session request"]);
    const game = groups.breaks.find((e) => e.title === "Game console")!;
    expect(game.names).toEqual(["game.stdout.log", "game.stderr.log"]);
    expect(game.bytes).toBe(68);
    expect(game.lines).toBe(2);
  });

  it("describe the stop requests the supervisor and server read", () => {
    const entries = fileEntries([
      { name: "stop-server", bytes: 0, lines: 0, truncated: false },
      { name: "stop", bytes: 0, lines: 0, truncated: false },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      title: "Stop request",
      group: "deep",
      names: ["stop", "stop-server"],
    });
  });

  it("keep files the launcher does not know, under deep dive", () => {
    const entries = fileEntries([{ name: "extra.txt", bytes: 5, lines: 1, truncated: false }]);
    expect(entries[0]).toMatchObject({ title: "extra.txt", group: "deep" });
  });

  it("say their size, lines and whether they hit the 4 MB bound", () => {
    const [log] = fileEntries([
      { name: "server.stderr.log", bytes: 4 * 1024 * 1024, lines: null, truncated: true },
    ]);
    expect(fileLine(log!)).toBe("server.stderr.log · 4 MB · cut at 4 MB");
    const [status] = fileEntries([{ name: "status.json", bytes: 219, lines: 1, truncated: false }]);
    expect(fileLine(status!)).toBe("status.json · 219 B · 1 line");
  });
});

describe("server warnings", () => {
  const log = (unsupported: ServerLog["unsupported"], total: number): ServerLog => ({
    ...FINISHED!.server_log!,
    unsupported,
    unsupported_total: total,
  });

  it("show the most frequent kinds and sum up the rest", () => {
    const groups = warningGroups(
      log(
        [
          { service: "lsx", route: "QueryFriends", warnings: 12 },
          { service: "world", route: "ClientGhostRecords", warnings: 9 },
          { service: "lsx", route: "GetBlockList", warnings: 4 },
          { service: "blaze", route: null, warnings: 3 },
          { service: null, route: null, warnings: 1 },
        ],
        29,
      ),
    )!;
    expect(groups.kinds).toBe(5);
    expect(groups.rows).toEqual([
      { label: "lsx · QueryFriends", count: 12 },
      { label: "world · ClientGhostRecords", count: 9 },
      { label: "lsx · GetBlockList", count: 4 },
    ]);
    expect(groups.more).toEqual({ kinds: 2, count: 4 });
  });

  it("count warnings beyond the server's group bound", () => {
    const groups = warningGroups(log([{ service: "lsx", route: "A", warnings: 2 }], 10))!;
    expect(groups.more).toEqual({ kinds: 0, count: 8 });
    expect(warningGroups(log([], 0))!.more).toBeNull();
    expect(warningGroups(null)).toBeNull();
  });
});

describe("sessions", () => {
  it("are headed by when they ran and how they ended", () => {
    expect(sessionHeading(FINISHED!, 0, 2, UTC)).toEqual({
      when: "Sun 18 Oct · 08:18–08:25",
      position: "session 5ed19fb4 · 1 of 2",
      state: "Finished",
      dot: "ready",
      message: "Game and server stopped; account data is preserved.",
    });
    expect(sessionHeading(FAILED!, 1, 2, UTC)).toMatchObject({ state: "Failed", dot: "warn" });
    expect(stateWords(null)).toEqual({ label: "No status recorded", dot: null });
    expect(stateWords("interrupted").label).toBe("Interrupted");
  });

  it("list their facts, warning only when there is something", () => {
    expect(sessionChips(FINISHED!)).toEqual([
      { text: "14 server lines", tone: "plain" },
      { text: "3 warnings", tone: "warn" },
      { text: "1 error", tone: "warn" },
      { text: "0 crash dumps", tone: "plain" },
      { text: "7 min", tone: "plain" },
    ]);
    const quiet = sessionChips({
      ...FAILED!,
      server_log: null,
      crash_dumps: null,
      ended_utc: null,
    });
    expect(quiet).toEqual([{ text: "No server log", tone: "plain" }]);
  });

  it("split the server log by level for its bar", () => {
    expect(levelShares(FINISHED!.server_log!)).toEqual([
      { level: "info", count: 10 },
      { level: "warn", count: 3 },
      { level: "error", count: 1 },
    ]);
    expect(levelShares(FAILED!.server_log!)).toEqual([]);
  });
});

describe("server log lines", () => {
  it("parse the tracing format", () => {
    const line = parseLogLine(
      '2026-10-18T08:19:41.015123Z  WARN nfs_server::diagnostics: unsupported operation received service="lsx" connection=1 correlation=None route=Some("QueryFriends") route_overflow=false seen=1 suppressed=0',
      4,
    );
    expect(line).toMatchObject({
      index: 4,
      time: "08:19:41.015",
      level: "warn",
      target: "nfs_server::diagnostics",
      area: "Diagnostics",
      message: "unsupported operation received",
    });
    expect(line.fields).toEqual([
      ["service", "lsx"],
      ["connection", "1"],
      ["correlation", "none"],
      ["route", "QueryFriends"],
      ["route_overflow", "false"],
      ["seen", "1"],
      ["suppressed", "0"],
    ]);
  });

  it("keep debug values with spaces and quoted spaces in one field", () => {
    const fields = parseFields(
      'route=Some(Route { component: 4, command: 22, category: 0 }) disposition="closing now" phase=Some(Login)',
    );
    expect(fields).toEqual([
      ["route", "Route { component: 4, command: 22, category: 0 }"],
      ["disposition", "closing now"],
      ["phase", "Login"],
    ]);
    expect(cleanValue('Some("a \\"b\\"")')).toBe('a "b"');
  });

  it("read lines without a timestamp as Other, and ERROR with its padding", () => {
    expect(parseLogLine("thread 'main' panicked at src/main.rs:1:1", 0)).toMatchObject({
      level: null,
      area: "Other",
      time: null,
      message: "thread 'main' panicked at src/main.rs:1:1",
    });
    const error = parseLogLine("2026-10-18T08:22:05Z ERROR nfs_server: stopped early", 1);
    expect(error).toMatchObject({
      level: "error",
      area: "Server",
      time: "08:22:05.000",
      fields: [],
    });
    expect(areaOf("nfs_server::world::replication")).toBe("Replication");
    expect(areaOf(null)).toBe("Other");
  });

  it("are bounded, and a trailing newline is no extra line", () => {
    const text = sampleFile(FINISHED!.id, "server.stderr.log")!.text;
    const { lines, cut } = parseLog(text);
    expect(lines).toHaveLength(14);
    expect(cut).toBe(false);
    const huge = parseLog("x\n".repeat(20_001));
    expect(huge.lines).toHaveLength(20_000);
    expect(huge.cut).toBe(true);
    expect(parseLog("a\r\nb").lines.map((l) => l.raw)).toEqual(["a", "b"]);
  });
});

describe("the dashboard's lines", () => {
  it("sum a session up in one status line", () => {
    expect(sessionLine(FINISHED!)).toBe("Finished · 7 min · 14 lines · 3 warnings · 1 error");
    const quiet = {
      ...FINISHED!,
      server_log: {
        ...FINISHED!.server_log!,
        lines: 1,
        levels: { ...FINISHED!.server_log!.levels, warn: 0, error: 0 },
      },
    };
    expect(sessionLine(quiet)).toBe("Finished · 7 min · 1 line · no warnings · no errors");
    expect(sessionLine({ ...FINISHED!, server_log: null, ended_utc: null })).toBe(
      "Finished · no server log",
    );
  });

  it("give a file row its size and lines, without the file names", () => {
    const [entry] = groupFiles(FINISHED!.files).breaks;
    expect(fileFacts(entry!)).toBe(fileLine(entry!).split(" · ").slice(1).join(" · "));
  });
});

describe("live log rows", () => {
  it("parse server lines into time, level, message and key fields", () => {
    const text =
      '2026-10-18T08:19:41.015Z  WARN nfs_server::diagnostics: unsupported request service="lsx" route=Some("GetBlockList") connection=1';
    expect(consoleRow({ kind: "text", text })).toEqual({
      time: "08:19:41",
      level: "Warning",
      tone: "warn",
      message: "unsupported request",
      detail: "service=lsx route=GetBlockList",
    });
  });

  it("keep supervisor status lines, with the state as their level", () => {
    expect(
      consoleRow({ kind: "status", time: "17:41:03", state: "ready", message: "Server ready" }),
    ).toEqual({
      time: "17:41:03",
      level: "Ready",
      tone: null,
      message: "Server ready",
      detail: "",
    });
    expect(
      consoleRow({ kind: "status", time: "17:41:09", state: "failed", message: "Game exited" })
        .tone,
    ).toBe("warn");
  });

  it("show other text as it came", () => {
    expect(consoleRow({ kind: "text", text: "Launch context: F:\\Games" })).toEqual({
      time: "",
      level: "",
      tone: null,
      message: "Launch context: F:\\Games",
      detail: "",
    });
  });
});

describe("the log viewer", () => {
  const { lines } = parseLog(sampleFile(FINISHED!.id, "server.stderr.log")!.text);

  it("filters by level, area and search", () => {
    expect(filterLines(lines, { level: "warn", query: "", areas: null })).toHaveLength(3);
    expect(filterLines(lines, { level: "error", query: "", areas: null })).toHaveLength(1);
    expect(
      filterLines(lines, { level: "all", query: "QUERYFRIENDS", areas: null }).map((l) => l.index),
    ).toEqual([4]);
    expect(filterLines(lines, { level: "all", query: "", areas: new Set(["World"]) })).toHaveLength(
      3,
    );
    expect(filterLines(lines, { level: "warn", query: "", areas: new Set(["World"]) })).toEqual([]);
  });

  it("groups consecutive repeats of one event", () => {
    const grouped = groupRepeats(lines);
    const world = grouped.find((g) => g.line.area === "World")!;
    expect(world.count).toBe(3);
    const scoring = grouped.find((g) => g.line.area === "Scoring")!;
    expect(scoring.count).toBe(2);
    // Warnings for different routes stay apart: the route says what was asked.
    const warnings = grouped.filter((g) => g.line.level === "warn");
    expect(warnings.map((g) => g.count)).toEqual([1, 1, 1]);
    const same = parseLogLine(
      lines[4]!.raw.replace("correlation=Some(17)", "correlation=Some(99)"),
      99,
    );
    expect(groupRepeats([lines[4]!, same])).toHaveLength(1);
    expect(grouped.reduce((sum, g) => sum + g.count, 0)).toBe(lines.length);
    expect(groupRepeats([parseLogLine("a", 0), parseLogLine("a", 1)])).toHaveLength(2);
  });

  it("shows the fields worth reading, without per-request noise", () => {
    expect(fieldSummary(lines[4]!)).toBe("service=lsx route=QueryFriends");
    expect(fieldSummary(lines[0]!)).toBe("segments=8652");
    expect(fieldSummary(parseLogLine("plain text", 0))).toBe("");
  });

  it("counts areas, most lines first", () => {
    expect(areaCounts(lines).slice(0, 3)).toEqual([
      { area: "Diagnostics", count: 3 },
      { area: "World", count: 3 },
      { area: "Scoring", count: 2 },
    ]);
  });
});

describe("copy summary", () => {
  it("says what a bug report needs and nothing from the files themselves", () => {
    expect(summaryText(FINISHED!, UTC)).toBe(
      [
        "Afterhours session 5ed19fb4c0a14d2e9b7f3a6c8d1e2f30",
        "Sun 18 Oct · 08:18–08:25 · start · Finished",
        "Message: Game and server stopped; account data is preserved.",
        "14 server lines · 3 warnings · 1 error · 0 crash dumps · 7 min",
        "Unsupported requests:",
        "  lsx · GetBlockList: 1",
        "  lsx · QueryFriends: 1",
        "  lsx · QueryImage: 1",
      ].join("\n"),
    );
    expect(summaryText(FAILED!, UTC)).not.toContain("Unsupported");
  });
});
