import { describe, expect, it } from "vitest";
import { FEATURES, featureReady, hasCapability, type Feature } from "./capabilities";
import { SAMPLE_VERSION } from "./sample";

describe("capabilities", () => {
  it("are only what the server reports", () => {
    const v1 = { capabilities: ["profile", "sessions", "events"] };
    expect(hasCapability(v1, "profile")).toBe(true);
    expect(hasCapability(v1, "map-images")).toBe(false);
    expect(hasCapability({ capabilities: ["map-images"] }, "map-images")).toBe(true);
  });

  it("are none for a server without version --json, or no server", () => {
    expect(hasCapability({ capabilities: null }, "map-images")).toBe(false);
    expect(hasCapability(null, "profile")).toBe(false);
    expect(hasCapability(undefined, "profile")).toBe(false);
  });
});

describe("features", () => {
  const all = Object.keys(FEATURES) as Feature[];
  const ready = (server: { capabilities: string[] | null } | null) =>
    all.filter((f) => featureReady(server, f)).sort();

  it("all wait for v0.3.0, which reports no capabilities", () => {
    expect(ready({ capabilities: null })).toEqual([]);
    expect(ready(null)).toEqual([]);
  });

  it("open Profile, Cars, Save data, car pictures, Logs, World and the live Map on the sample server", () => {
    expect(ready({ capabilities: SAMPLE_VERSION.capabilities })).toEqual([
      "car-images",
      "cars",
      "live-map",
      "logs",
      "map",
      "profile",
      "rivals",
      "save-data",
      "traffic",
      "world-presets",
    ]);
  });

  it("open World traffic only with world-settings, and Map only with map-images", () => {
    const world = ready({ capabilities: ["world-settings"] });
    expect(world).toEqual(["rivals", "traffic", "world-presets"]);
    expect(ready({ capabilities: ["map-images"] })).toEqual(["map"]);
    expect(ready({ capabilities: ["map-feed"] })).toEqual(["live-map"]);
  });

  it("never open Cops or account edits", () => {
    const everything = {
      capabilities: ["profile", "sessions", "events", "world-settings", "map-images", "map-feed"],
    };
    for (const feature of ["cops", "account-edits"] as const) {
      expect(featureReady(everything, feature)).toBe(false);
    }
  });
});
