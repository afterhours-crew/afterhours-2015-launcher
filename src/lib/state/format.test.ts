import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatCount,
  formatDuration,
  formatMoney,
  formatMoneyShort,
  formatSaved,
  formatWhen,
  humanize,
} from "./format";

const UTC = { timeZone: "UTC" };

describe("numbers", () => {
  it("print counts with thousands separators and no unit", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(13_052_031)).toBe("13,052,031");
    expect(formatCount(-4200)).toBe("-4,200");
  });

  it("print the bank in dollars", () => {
    expect(formatMoney(9_788_600)).toBe("$9,788,600");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(-50)).toBe("-$50");
    expect(formatMoneyShort(250_000)).toBe("$250K");
    expect(formatMoneyShort(1_000_000)).toBe("$1M");
    expect(formatMoneyShort(1_200_000)).toBe("$1.2M");
    expect(formatMoneyShort(1_250_000)).toBe("$1,250,000");
    expect(formatMoneyShort(12_345)).toBe("$12,345");
  });

  it("print sizes like Explorer", () => {
    expect(formatBytes(219)).toBe("219 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(454_656)).toBe("444 KB");
    expect(formatBytes(2_516_582)).toBe("2.4 MB");
    expect(formatBytes(4 * 1024 * 1024)).toBe("4 MB");
  });
});

describe("column names", () => {
  it("become sentence-case labels", () => {
    expect(humanize("RepScore")).toBe("Rep score");
    expect(humanize("NumberOfEventsCompleted")).toBe("Number of events completed");
    expect(humanize("FavoriteVehicleId")).toBe("Favorite vehicle id");
    expect(humanize("P1")).toBe("P1");
    expect(humanize("user_settings")).toBe("User settings");
    expect(humanize("diagnostics")).toBe("Diagnostics");
  });
});

describe("times", () => {
  it("print durations", () => {
    expect(formatDuration(45_000)).toBe("45 s");
    expect(formatDuration(7 * 60_000 + 10_000)).toBe("7 min");
    expect(formatDuration(72 * 60_000)).toBe("1 h 12 min");
    expect(formatDuration(120 * 60_000)).toBe("2 h");
    expect(formatDuration(-1)).toBe("—");
  });

  it("print a session's span on one day", () => {
    expect(formatWhen("2026-10-18T08:18:41Z", "2026-10-18T08:25:31Z", UTC)).toBe(
      "Sun 18 Oct · 08:18–08:25",
    );
    expect(formatWhen("2026-10-18T08:18:41Z", null, UTC)).toBe("Sun 18 Oct · 08:18");
    expect(formatWhen("2026-10-18T23:50:00Z", "2026-10-19T00:10:00Z", UTC)).toBe(
      "Sun 18 Oct · 23:50 – Mon 19 Oct · 00:10",
    );
    expect(formatWhen("not a time", null, UTC)).toBe("not a time");
  });

  it("print when a save was written, relative to now", () => {
    const now = new Date("2026-10-19T22:00:00Z");
    expect(formatSaved("2026-10-19T21:40:00Z", now, UTC)).toBe("today 21:40");
    expect(formatSaved("2026-10-18T21:40:00Z", now, UTC)).toBe("yesterday 21:40");
    expect(formatSaved("2026-10-15T09:05:00Z", now, UTC)).toBe("Thu 15 Oct 09:05");
    expect(formatSaved("2025-10-19T21:40:00Z", now, UTC)).toBe("Sun 19 Oct 21:40");
  });
});
