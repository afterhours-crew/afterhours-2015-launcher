import { describe, expect, it } from "vitest";
import {
  PERSONAL_SOURCES,
  REDACTED,
  copyablePath,
  defaultIncluded,
  personalSource,
  personalTable,
  redactUserName,
  reportItems,
  reportSummary,
} from "./privacy";
import { SAMPLE_SESSIONS } from "./sample";

const [FINISHED] = SAMPLE_SESSIONS.sessions;

describe("hiding the user name", () => {
  it("replaces the user folder in Windows paths, whatever its case", () => {
    expect(
      redactUserName("C:\\Users\\Snow White\\AppData\\Local\\Afterhours2015", "Snow White"),
    ).toBe(`C:\\Users\\${REDACTED}\\AppData\\Local\\Afterhours2015`);
    expect(redactUserName("c:/users/snow white/Documents", "Snow White")).toBe(
      `c:/users/${REDACTED}/Documents`,
    );
    expect(redactUserName("D:\\USERS\\Driver", null)).toBe(`D:\\USERS\\${REDACTED}`);
  });

  it("also hides a short 8.3 profile folder", () => {
    expect(redactUserName("C:\\Users\\SNOWWH~1\\AppData\\Local\\Temp\\x.log", "Snow White")).toBe(
      `C:\\Users\\${REDACTED}\\AppData\\Local\\Temp\\x.log`,
    );
  });

  it("hides the name wherever it stands as a whole word, in any case", () => {
    expect(redactUserName("Signed in as SNOW WHITE; Snow White again", "Snow White")).toBe(
      `Signed in as ${REDACTED}; ${REDACTED} again`,
    );
    expect(redactUserName("E:\\Backups\\driver\\save.sqlite", "Driver")).toBe(
      `E:\\Backups\\${REDACTED}\\save.sqlite`,
    );
  });

  it("leaves a name inside a longer word alone", () => {
    expect(redactUserName("Alpha Al_x Albert Al", "Al")).toBe(`Alpha Al_x Albert ${REDACTED}`);
    expect(redactUserName("Drivers and Driver2", "Driver")).toBe("Drivers and Driver2");
  });

  it("treats the name as text, not a pattern", () => {
    expect(redactUserName("a.b and axb", "a.b")).toBe(`${REDACTED} and axb`);
  });

  it("changes nothing without a user name or a user folder", () => {
    expect(redactUserName("F:\\EA Games\\Need for Speed", null)).toBe(
      "F:\\EA Games\\Need for Speed",
    );
    expect(redactUserName("F:\\EA Games\\Need for Speed", "  ")).toBe(
      "F:\\EA Games\\Need for Speed",
    );
  });

  it("applies to copy actions only when switched on", () => {
    const path = "C:\\Users\\Driver\\AppData\\Local\\Afterhours2015";
    expect(copyablePath(path, { on: true, userName: "Driver" })).toContain(REDACTED);
    expect(copyablePath(path, { on: false, userName: "Driver" })).toBe(path);
  });
});

describe("sources with personal information", () => {
  it("are EA Desktop logs, crash dumps and protocol recordings, each saying what it holds", () => {
    expect(PERSONAL_SOURCES.map((s) => s.id)).toEqual([
      "ea-desktop-logs",
      "crash-dumps",
      "protocol-recording",
    ]);
    for (const source of PERSONAL_SOURCES) expect(source.holds.length).toBeGreaterThan(10);
    expect(personalSource("crash-dumps")?.holds).toMatch(/memory/);
    expect(personalSource("server.stderr.log")).toBeNull();
  });

  it("include the save's identity table and nothing else of it", () => {
    expect(personalTable("domain:identity")).toMatch(/persona/);
    expect(personalTable("domain:settings")).toBeNull();
    expect(personalTable("GameplayStatsTable")).toBeNull();
  });
});

/** WCAG contrast of two sRGB colours. */
function contrast(a: number[], b: number[]): number {
  const lum = (c: number[]) => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
const over = (rgb: number[], alpha: number, ground: number[]) =>
  rgb.map((v, i) => Math.round(v * alpha + ground[i]! * (1 - alpha)));

describe("the personal-info colours", () => {
  const amber = [255, 194, 51];
  const warnInk = [255, 215, 114];
  const ink = [243, 243, 244];
  const grounds = { graphite: [29, 30, 33], raised: [38, 39, 43] };

  it("keep the badge text at least 4.5:1 on its fill, on graphite and raised graphite", () => {
    for (const ground of Object.values(grounds)) {
      expect(contrast(warnInk, over(amber, 0.18, ground))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keep the callout's title and list readable", () => {
    const fill = over(amber, 0.12, grounds.graphite);
    expect(contrast(warnInk, fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, fill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the report", () => {
  const items = reportItems(FINISHED!, SAMPLE_SESSIONS);

  it("offers what exists, personal sources last and unchecked", () => {
    expect(items.map((i) => i.id)).toEqual(["server", "reports", "ea-desktop-logs"]);
    expect(items.find((i) => i.id === "ea-desktop-logs")!.personal?.title).toBe("EA Desktop logs");
    expect([...defaultIncluded(items)]).toEqual(["server", "reports"]);
  });

  it("adds crash dumps and recordings only when the session has them", () => {
    const withDumps = {
      ...FINISHED!,
      crash_dumps: [
        {
          name: "CrashDump.dmp",
          path: "C:\\Users\\Driver\\Temp\\CrashDump.dmp",
          bytes: 1024,
          modified_utc: "2026-10-18T08:20:00Z",
        },
      ],
      runs_directory_exists: true,
    };
    const more = reportItems(withDumps!, SAMPLE_SESSIONS).map((i) => i.id);
    expect(more).toContain("crash-dumps");
    expect(more).toContain("protocol-recording");
    expect(defaultIncluded(reportItems(withDumps!, SAMPLE_SESSIONS)).has("crash-dumps")).toBe(
      false,
    );
  });

  it("lists the checked files and hides the user name in the copied summary", () => {
    const text = reportSummary(FINISHED!, items, defaultIncluded(items), {
      on: true,
      userName: "Driver",
    });
    expect(text).toContain("Files to attach:");
    expect(text).toContain("server.stderr.log");
    expect(text).not.toContain("EA Desktop");
    expect(text).not.toMatch(/\\Users\\Driver\\/);
    expect(text).toContain(`\\Users\\${REDACTED}\\`);
  });

  it("keeps the user name when the switch is off", () => {
    const text = reportSummary(FINISHED!, items, new Set(["server", "ea-desktop-logs"]), {
      on: false,
      userName: "Driver",
    });
    expect(text).toMatch(/\\Users\\Driver\\/);
    expect(text).toContain("EA Desktop");
  });
});
