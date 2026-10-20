import { describe, expect, it } from "vitest";
import type { MapFeed } from "$lib/api/types";
import {
  ALL_LAYERS,
  FEED_BOUNDS,
  feedMarkers,
  feedRings,
  feedSurvives,
  layerCounts,
  readMapFeed,
  shownMarkers,
  takeFeed,
} from "./mapfeed";

// The example frame of afterhours-2015 crates/launcher/README.md ("Map feed").
const README_FRAME: MapFeed = {
  version: 1,
  utc: "2026-10-20T15:52:13Z",
  event: "map-feed",
  frame: 42,
  skipped: 0,
  worlds: [
    {
      connection: 1,
      persona_id: "1000000007",
      world_ms: 81250,
      drivers: [{ participant: 1, x: -1234.57, y: 12.35, z: 6543.21, heading: 90.5, speed: 12.35 }],
      traffic: [{ id: 17, x: -1180.0, y: 11.9, z: 6610.25, heading: 182.3 }],
      rivals: [{ id: 3, x: -900.5, y: 10.0, z: 6800.0, heading: null }],
      traffic_ring: { inner: 300.0, outer: 450.0 },
      omitted: 0,
    },
  ],
};

/** A copy of the README frame with `change` applied to it. */
function frame(change: (f: MapFeed) => void = () => {}): Record<string, unknown> {
  const copy = structuredClone(README_FRAME);
  change(copy);
  return copy;
}

const feed = (f: Record<string, unknown> = frame()) => readMapFeed(f)!;

describe("reading map-feed events", () => {
  it("takes the documented frame as it is", () => {
    expect(readMapFeed(README_FRAME)).toEqual(README_FRAME);
  });

  it("drops fields this launcher does not know and keeps the rest", () => {
    const read = readMapFeed(
      frame((f) => {
        Object.assign(f, { lap: 3 });
        Object.assign(f.worlds[0]!, { weather: "rain" });
        Object.assign(f.worlds[0]!.traffic[0]!, { colour: "red" });
      }),
    );
    expect(read).toEqual(README_FRAME);
  });

  it("refuses other events and records", () => {
    for (const value of [
      null,
      "map-feed",
      [],
      frame((f) => Object.assign(f, { event: "status" })),
      frame((f) => Object.assign(f, { version: 2 })),
      frame((f) => Object.assign(f, { frame: -1 })),
      frame((f) => Object.assign(f, { skipped: 1.5 })),
      frame((f) => Object.assign(f, { worlds: null })),
    ]) {
      expect(readMapFeed(value)).toBeNull();
    }
  });

  it("refuses a frame with a car it cannot place", () => {
    const broken = [
      frame((f) => Object.assign(f.worlds[0]!.drivers[0]!, { x: "1" })),
      frame((f) => Object.assign(f.worlds[0]!.drivers[0]!, { z: Number.NaN })),
      frame((f) => Object.assign(f.worlds[0]!.drivers[0]!, { speed: null })),
      frame((f) => Object.assign(f.worlds[0]!.drivers[0]!, { heading: 360 })),
      frame((f) => Object.assign(f.worlds[0]!.traffic[0]!, { heading: -0.1 })),
      frame((f) => Object.assign(f.worlds[0]!.traffic[0]!, { x: 100_001 })),
      frame((f) => Object.assign(f.worlds[0]!.rivals[0]!, { id: "3" })),
      frame((f) => Object.assign(f.worlds[0]!, { persona_id: 1000000007 })),
      frame((f) => Object.assign(f.worlds[0]!, { traffic_ring: { inner: 450, outer: 300 } })),
      frame((f) => Object.assign(f.worlds[0]!, { traffic_ring: 300 })),
      frame((f) => Object.assign(f.worlds[0]!, { omitted: undefined })),
    ];
    for (const value of broken) expect(readMapFeed(value)).toBeNull();
  });

  it("refuses a frame past the server's own bounds", () => {
    const car = README_FRAME.worlds[0]!.traffic[0]!;
    const many = (n: number) => Array.from({ length: n }, (_, id) => ({ ...car, id }));
    expect(readMapFeed(frame((f) => (f.worlds[0]!.traffic = many(128))))).not.toBeNull();
    expect(readMapFeed(frame((f) => (f.worlds[0]!.traffic = many(129))))).toBeNull();
    expect(readMapFeed(frame((f) => (f.worlds[0]!.rivals = many(129))))).toBeNull();
    const world = README_FRAME.worlds[0]!;
    const worlds = (n: number) =>
      Array.from({ length: n }, (_, connection) => ({ ...world, connection }));
    expect(readMapFeed(frame((f) => (f.worlds = worlds(FEED_BOUNDS.worlds))))).not.toBeNull();
    expect(readMapFeed(frame((f) => (f.worlds = worlds(FEED_BOUNDS.worlds + 1))))).toBeNull();
  });
});

describe("the newest frame", () => {
  it("replaces the one before", () => {
    const first = feed();
    const next = takeFeed(
      first,
      frame((f) => (f.frame = 43)),
      "ready",
    );
    expect(next?.frame).toBe(43);
  });

  it("is ignored when malformed, keeping the markers as they were", () => {
    const first = feed();
    expect(takeFeed(first, { event: "map-feed" }, "ready")).toBe(first);
    expect(takeFeed(null, "nonsense", undefined)).toBeNull();
  });

  it("clears the markers when it lists no world session", () => {
    expect(
      takeFeed(
        feed(),
        frame((f) => (f.worlds = [])),
        "ready",
      ),
    ).toBeNull();
  });

  it("is not taken while the session ends", () => {
    for (const state of ["stopping", "finished", "failed", "interrupted"] as const) {
      expect(takeFeed(feed(), frame(), state)).toBeNull();
    }
    // A status poll may still say `starting` when the first frame arrives.
    expect(takeFeed(null, frame(), "starting")?.frame).toBe(42);
    expect(takeFeed(null, frame(), undefined)?.frame).toBe(42);
  });
});

describe("markers go when the session leaves ready", () => {
  const status = (state: "ready" | "starting" | "stopping" | "finished", game = true) => ({
    state,
    game_running: game,
  });

  it("stay while it is ready", () => {
    expect(feedSurvives(status("ready"), status("ready"))).toBe(true);
    expect(feedSurvives(null, status("ready"))).toBe(true);
    expect(feedSurvives(status("starting"), status("ready"))).toBe(true);
    expect(feedSurvives(null, null)).toBe(true);
  });

  it("go when it stops, a game starts again or the game closes", () => {
    expect(feedSurvives(status("ready"), status("stopping"))).toBe(false);
    expect(feedSurvives(status("ready"), status("starting"))).toBe(false);
    expect(feedSurvives(status("ready"), null)).toBe(false);
    expect(feedSurvives(status("ready", true), status("ready", false))).toBe(false);
    expect(feedSurvives(null, status("finished"))).toBe(false);
  });
});

describe("markers", () => {
  it("are you, traffic and rivals, keyed by connection, kind and id", () => {
    expect(feedMarkers(feed())).toEqual([
      {
        id: "1-traffic-17",
        kind: "traffic",
        x: -1180,
        z: 6610.25,
        heading: 182.3,
        label: "Traffic",
      },
      { id: "1-rival-3", kind: "rival", x: -900.5, z: 6800, heading: null, label: "Rival" },
      { id: "1-you-1", kind: "you", x: -1234.57, z: 6543.21, heading: 90.5, label: "You" },
    ]);
  });

  it("name you after the profile whose persona drives", () => {
    const named = feedMarkers(feed(), { persona_id: "1000000007", display_name: "Nova" });
    expect(named.at(-1)?.label).toBe("Nova");
    const other = feedMarkers(feed(), { persona_id: "1", display_name: "Nova" });
    expect(other.at(-1)?.label).toBe("You");
  });

  it("draw every driver as you, on top, with ids unique across worlds", () => {
    const two = feed(
      frame((f) => {
        const world = f.worlds[0]!;
        world.drivers.push({ ...world.drivers[0]!, participant: 2 });
        f.worlds.push({ ...structuredClone(world), connection: 2 });
      }),
    );
    const markers = feedMarkers(two);
    expect(markers.filter((m) => m.kind === "you").map((m) => m.id)).toEqual([
      "1-you-1",
      "1-you-2",
      "2-you-1",
      "2-you-2",
    ]);
    expect(markers.slice(-4).every((m) => m.kind === "you")).toBe(true);
    expect(new Set(markers.map((m) => m.id)).size).toBe(markers.length);
  });

  it("are none without a feed", () => {
    expect(feedMarkers(null)).toEqual([]);
    expect(feedRings(null)).toEqual([]);
  });

  it("show only the layers switched on, counted per kind", () => {
    const markers = feedMarkers(feed());
    expect(layerCounts(markers)).toEqual({ you: 1, driver: 0, traffic: 1, rival: 1 });
    expect(shownMarkers(markers, ALL_LAYERS)).toEqual(markers);
    const kinds = (layers: Partial<typeof ALL_LAYERS>) =>
      shownMarkers(markers, { ...ALL_LAYERS, ...layers }).map((m) => m.kind);
    expect(kinds({ traffic: false })).toEqual(["rival", "you"]);
    expect(kinds({ rivals: false, you: false })).toEqual(["traffic"]);
    expect(kinds({ you: false, traffic: false, rivals: false })).toEqual([]);
  });
});

describe("spawn rings", () => {
  it("circle each driver at the traffic policy's radii", () => {
    expect(feedRings(feed())).toEqual([
      { id: "1-ring-1", x: -1234.57, z: 6543.21, inner: 300, outer: 450 },
    ]);
  });

  it("are none while traffic is off", () => {
    const off: MapFeed = feed(frame((f) => Object.assign(f.worlds[0]!, { traffic_ring: null })));
    expect(feedRings(off)).toEqual([]);
  });
});
