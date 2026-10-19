import { describe, expect, it } from "vitest";
import { HOME, NAV, VIEWS, formatRoute, parseRoute, sectionFor } from "./routes";

describe("routes", () => {
  it("parses every view and their sections", () => {
    for (const view of VIEWS) {
      expect(parseRoute(`#/${view}`).view).toBe(view);
    }
    expect(parseRoute("#/settings/updates")).toEqual({
      view: "settings",
      section: "updates",
      firstRun: false,
    });
    expect(parseRoute("#/settings/about").section).toBe("about");
    expect(parseRoute("#/profile/cars").section).toBe("cars");
    expect(parseRoute("#/profile/save-data").section).toBe("save-data");
    expect(parseRoute("#/profile/edit-driver").section).toBe("edit-driver");
  });

  it("opens a view with sub-views on its first one", () => {
    expect(parseRoute("#/settings").section).toBe("general");
    expect(parseRoute("#/settings/nope").section).toBe("general");
    expect(parseRoute("#/profile").section).toBe("overview");
    // A section of another view does not carry over.
    expect(parseRoute("#/profile/updates").section).toBe("overview");
    expect(parseRoute("#/map/cars").section).toBeNull();
    expect(sectionFor("host", "about")).toBeNull();
  });

  it("sends anything unknown home", () => {
    for (const hash of ["", "#", "#/", "#/servers", "#/mods", "garbage"]) {
      expect(parseRoute(hash)).toEqual(HOME);
    }
  });

  it("round-trips", () => {
    for (const hash of [
      "#/garage",
      "#/map",
      "#/logs",
      "#/profile/overview",
      "#/profile/cars",
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
