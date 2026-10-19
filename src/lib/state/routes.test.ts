import { describe, expect, it } from "vitest";
import { HOME, NAV, VIEWS, formatRoute, parseRoute } from "./routes";

describe("routes", () => {
  it("parses every view and settings section", () => {
    for (const view of VIEWS) {
      expect(parseRoute(`#/${view}`).view).toBe(view);
    }
    expect(parseRoute("#/settings/updates")).toEqual({
      view: "settings",
      section: "updates",
      firstRun: false,
    });
    expect(parseRoute("#/settings/about").section).toBe("about");
    expect(parseRoute("#/settings").section).toBe("general");
    expect(parseRoute("#/settings/nope").section).toBe("general");
    expect(parseRoute("#/host/extra").section).toBeNull();
  });

  it("sends anything unknown home", () => {
    for (const hash of ["", "#", "#/", "#/servers", "#/mods", "garbage"]) {
      expect(parseRoute(hash)).toEqual(HOME);
    }
  });

  it("round-trips", () => {
    for (const hash of [
      "#/garage",
      "#/logs",
      "#/settings/general",
      "#/settings/about",
      "#/first-run",
    ]) {
      expect(formatRoute(parseRoute(hash))).toBe(hash);
    }
  });

  it("lists the views in the designed order", () => {
    expect(NAV.map((n) => n.label)).toEqual([
      "Garage",
      "Profile",
      "World",
      "Map",
      "Host",
      "Logs",
      "Settings",
    ]);
  });
});
