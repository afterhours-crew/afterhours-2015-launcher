import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import {
  SAMPLE_MAP,
  SAMPLE_PREFLIGHT,
  SAMPLE_PROFILE,
  SAMPLE_PROFILE_LIST,
  SAMPLE_SESSIONS,
  SAMPLE_SETTINGS,
  SAMPLE_VERSION,
  sampleFile,
  sampleHosting,
  sampleMapFrame,
} from "./sample";
import { feedMarkers, readMapFeed } from "./mapfeed";

// The sample records must be what the server could print: each is
// validated against the schema `pnpm types` generated its type from.
function validator(name: string) {
  const url = new URL(`../../../schemas/${name}.schema.json`, import.meta.url);
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
  for (const format of ["int32", "uint16", "uint32", "int64", "uint64", "uint"]) {
    ajv.addFormat(format, { type: "number", validate: (n: number) => Number.isInteger(n) });
  }
  return ajv.compile(JSON.parse(readFileSync(url, "utf8")));
}

describe("sample records", () => {
  it.each([
    ["check", SAMPLE_PREFLIGHT],
    ["version", SAMPLE_VERSION],
    ["settings", SAMPLE_SETTINGS],
    ["map-images", SAMPLE_MAP],
    ["profile", SAMPLE_PROFILE],
    ["profile-list", SAMPLE_PROFILE_LIST],
    ["sessions", SAMPLE_SESSIONS],
    ["status", { version: 1, session: sampleHosting(false) }],
    ["status", { version: 1, session: sampleHosting(true) }],
    ["event", sampleMapFrame(0)],
    ["event", sampleMapFrame(1234)],
  ])("match %s.schema.json", (name, value) => {
    const check = validator(name);
    expect(check(value), JSON.stringify(check.errors)).toBe(true);
  });

  it("stream map frames the window reads, ordered and keyed as the server's are", () => {
    const check = validator("event");
    const gone = new Set<number>();
    let before = sampleMapFrame(0);
    for (let frame = 0; frame < 1600; frame += 1) {
      const value = sampleMapFrame(frame);
      if (frame % 40 === 0) expect(check(value), JSON.stringify(check.errors)).toBe(true);
      expect(readMapFeed(value)).toEqual(value);
      const world = value.worlds[0]!;
      const ids = world.traffic.map((car) => car.id);
      expect(ids).toEqual([...ids].sort((x, y) => x - y));
      // A traffic car that cleared never comes back under the same id.
      for (const id of ids) expect(gone.has(id)).toBe(false);
      for (const car of before.worlds[0]!.traffic) if (!ids.includes(car.id)) gone.add(car.id);
      // Traffic stays within the spawn ring's outer radius.
      const driver = world.drivers[0]!;
      for (const car of world.traffic) {
        expect(Math.hypot(car.x - driver.x, car.z - driver.z)).toBeLessThanOrEqual(451);
      }
      expect(new Set(feedMarkers(value).map((m) => m.id)).size).toBe(14);
      before = value;
    }
    expect(gone.size).toBeGreaterThan(10);
    // The driver moves between frames.
    expect(sampleMapFrame(4).worlds[0]!.drivers[0]).not.toEqual(
      sampleMapFrame(0).worlds[0]!.drivers[0],
    );
  });

  it("keep the car summary consistent with the cars", () => {
    const cars = SAMPLE_PROFILE.cars!;
    const summary = SAMPLE_PROFILE.car_summary!;
    expect(summary.garage_used).toBe(cars.filter((c) => c.location !== "warehouse").length);
    expect(summary.warehouse_used).toBe(cars.filter((c) => c.location === "warehouse").length);
  });

  it("serve log text only for the files the sample session lists", () => {
    const session = SAMPLE_SESSIONS.sessions[0]!;
    expect(sampleFile(session.id, "server.stderr.log")?.text).toMatch(/\n$/);
    expect(sampleFile(session.id, "nope.log")).toBeNull();
    expect(sampleFile("0".repeat(32), "server.stderr.log")).toBeNull();
  });
});
