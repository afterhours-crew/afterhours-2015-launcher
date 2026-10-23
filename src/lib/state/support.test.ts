import { describe, expect, it } from "vitest";
import {
  NUDGE_AFTER_OPENS,
  NUDGE_EVERY_DAYS,
  SUPPORT_LINKS,
  shouldNudge,
  supportHost,
  supportLinks,
  supportReady,
} from "./support";

const NOW = new Date("2026-10-23T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe("the support links", () => {
  it("name Ko-fi and Patreon with what each one is", () => {
    expect(SUPPORT_LINKS.kofi.about).toBe("One-off, no account needed");
    expect(SUPPORT_LINKS.patreon.about).toBe("Monthly, cancel any time");
    expect(supportHost("https://www.patreon.com/afterhours/")).toBe("patreon.com/afterhours");
    expect(supportHost("https://ko-fi.com/afterhours")).toBe("ko-fi.com/afterhours");
  });

  it("show a link only once its page name is filled in", () => {
    for (const key of ["kofi", "patreon"] as const) {
      expect(supportReady(key)).toBe(!SUPPORT_LINKS[key].url.includes("REPLACE_WITH_YOUR_PAGE"));
    }
    expect(supportLinks().every((l) => !l.url.includes("REPLACE"))).toBe(true);
  });
});

describe("the Garage's occasional line", () => {
  it("waits for a few opens, then shows once", () => {
    for (let opens = 0; opens < NUDGE_AFTER_OPENS; opens += 1) {
      expect(shouldNudge(opens, null, NOW, true), `${opens} opens`).toBe(false);
    }
    expect(shouldNudge(NUDGE_AFTER_OPENS, null, NOW, true)).toBe(true);
    expect(shouldNudge(40, null, NOW, true)).toBe(true);
  });

  it("then shows again only after a fortnight", () => {
    expect(shouldNudge(10, daysAgo(1), NOW, true)).toBe(false);
    expect(shouldNudge(10, daysAgo(NUDGE_EVERY_DAYS - 1), NOW, true)).toBe(false);
    expect(shouldNudge(10, daysAgo(NUDGE_EVERY_DAYS), NOW, true)).toBe(true);
    expect(shouldNudge(10, daysAgo(60), NOW, true)).toBe(true);
    // A damaged stamp does not hide it for ever.
    expect(shouldNudge(10, "not a date", NOW, true)).toBe(true);
  });

  it("never shows without a link to show", () => {
    expect(shouldNudge(10, null, NOW, false)).toBe(false);
  });
});
