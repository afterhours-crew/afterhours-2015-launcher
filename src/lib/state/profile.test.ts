import { describe, expect, it } from "vitest";
import type { Profile } from "$lib/api/types";
import {
  baseName,
  collection,
  driverCard,
  headerLine,
  repCategories,
  repProgress,
  saveFacts,
  speedList,
  tableDetail,
  tableEntries,
  tableTiles,
} from "./profile";
import { SAMPLE_PROFILE } from "./sample";

const UTC = { timeZone: "UTC" };
const NOW = new Date("2026-10-19T22:00:00Z");

/** A save the server read without item content: no REP, tables or cars. */
function bare(): Profile {
  return {
    ...SAMPLE_PROFILE,
    identity: null,
    bank: null,
    reputation: null,
    tables: null,
    cars: null,
    car_summary: null,
    garage: null,
    counts: { ...SAMPLE_PROFILE.counts, items_by_class: null, collectibles: null },
    save: { ...SAMPLE_PROFILE.save, updated_at_utc: null },
  };
}

describe("driver", () => {
  it("reads the header line from REP and bank", () => {
    expect(headerLine(SAMPLE_PROFILE)).toBe("REP 18 · $250,000");
    expect(headerLine({ ...SAMPLE_PROFILE, bank: null })).toBe("REP 18");
    expect(headerLine(bare())).toBeNull();
    expect(headerLine(null)).toBeNull();
  });

  it("names the driver, the persona and the last save", () => {
    expect(driverCard(SAMPLE_PROFILE, NOW, UTC)).toEqual({
      name: "Driver",
      initials: "DR",
      subline: "Persona 1000000000000000001 · last saved today 19:40",
      level: "18",
      bank: "$250,000",
    });
    const card = driverCard(bare(), NOW, UTC);
    expect(card).toMatchObject({ name: "Driver", subline: "", level: "—", bank: "—" });
  });

  it("keeps the persona ID's digits beyond 2^53", () => {
    const big = { ...SAMPLE_PROFILE.identity!, persona_id: "1666824901114517107" };
    expect(driverCard({ ...SAMPLE_PROFILE, identity: big }, NOW, UTC).subline).toContain(
      "Persona 1666824901114517107",
    );
  });
});

describe("REP", () => {
  it("measures progress within the current level", () => {
    const p = repProgress(SAMPLE_PROFILE.reputation)!;
    expect(p.title).toBe("Level 18 → 19");
    expect(p.detail).toBe("37,650 REP to go · 412,350 total");
    expect(p.into).toBe(32_350);
    expect(p.span).toBe(70_000);
    expect(p.fraction).toBeCloseTo(0.4621, 3);
  });

  it("stops at the top level", () => {
    const rep = {
      ...SAMPLE_PROFILE.reputation!,
      level: 70,
      next_threshold: null,
      maximum_level: 70,
    };
    const p = repProgress(rep)!;
    expect(p.nextLevel).toBeNull();
    expect(p.fraction).toBe(1);
    expect(p.title).toBe("Level 70 · top level");
  });

  it("clamps a score outside the thresholds and reads nothing without a score", () => {
    const below = { ...SAMPLE_PROFILE.reputation!, score: { value: 1, stored: true } };
    expect(repProgress(below)!.fraction).toBe(0);
    expect(repProgress({ ...SAMPLE_PROFILE.reputation!, score: null })).toBeNull();
    expect(repProgress({ ...SAMPLE_PROFILE.reputation!, level: null })).toBeNull();
    expect(repProgress(null)).toBeNull();
  });

  it("draws categories against the strongest and shows the raw medal cell", () => {
    const rows = repCategories(SAMPLE_PROFILE.reputation, SAMPLE_PROFILE.tables)!;
    expect(rows.map((r) => r.label)).toEqual(["Speed", "Style", "Build", "Crew", "Outlaw"]);
    expect(rows[0]).toMatchObject({ score: "132,400", fraction: 1, medal: "1" });
    expect(rows[4]!.fraction).toBeCloseTo(53_000 / 132_400);
    expect(rows[1]!.medal).toBe("0");
    const noTables = repCategories(SAMPLE_PROFILE.reputation, null)!;
    expect(noTables[0]!.medal).toBe("—");
    expect(repCategories(null, null)).toBeNull();
  });

  it("draws empty bars when every category is zero", () => {
    const zero = { value: 0, stored: false };
    const rep = {
      ...SAMPLE_PROFILE.reputation!,
      categories: { speed: zero, style: zero, build: zero, crew: zero, outlaw: null },
    };
    const rows = repCategories(rep, null)!;
    expect(rows.every((r) => r.fraction === 0)).toBe(true);
    expect(rows[4]!.score).toBe("—");
  });
});

describe("stats", () => {
  it("print raw stored integers with no unit", () => {
    const tiles = tableTiles(SAMPLE_PROFILE.tables!["GameplayStatsTable"], SAMPLE_PROFILE.cars);
    const distance = tiles.find((t) => t.column === "DistanceDriven")!;
    expect(distance).toMatchObject({ label: "Distance driven", value: "1,284,021", stored: true });
    expect(tiles.find((t) => t.column === "TopSpeed")!.value).toBe("312");
    expect(tiles.find((t) => t.column === "LargestFineEscaped")!.stored).toBe(false);
  });

  it("name the favourite vehicle only when it is one of the cars", () => {
    const tiles = tableTiles(SAMPLE_PROFILE.tables!["GameplayStatsTable"], SAMPLE_PROFILE.cars);
    expect(tiles.find((t) => t.column === "FavoriteVehicleId")!.name).toBe(
      "Nissan GTRSkylineKPGC10 1971",
    );
    expect(tiles.find((t) => t.column === "FavoriteVehicleId")!.value).toBe("1000001");
    const other = { FavoriteVehicleId: { value: 5, stored: true } };
    expect(tableTiles(other, SAMPLE_PROFILE.cars)[0]!.name).toBeNull();
    expect(tableTiles({ Missing: null })[0]!.value).toBe("not in this save's schema");
    expect(tableTiles(undefined)).toEqual([]);
  });

  it("count SpeedList finishes by position", () => {
    const list = speedList(SAMPLE_PROFILE.tables)!;
    expect(list.summary).toBe("23 started · 21 finished");
    expect(list.positions.map((p) => p.count)).toEqual([9, 5, 3, 2, 1, 1, 0, 0]);
    expect(list.positions[0]!.fraction).toBe(1);
    expect(speedList(null)).toBeNull();
  });

  it("count the collection, with dashes for tables the save lacks", () => {
    expect(collection(SAMPLE_PROFILE.counts, SAMPLE_PROFILE.cars)).toEqual([
      { label: "Cars", value: "7" },
      { label: "Items", value: "533" },
      { label: "Wraps", value: "3" },
      { label: "Collectibles", value: "37" },
      { label: "Activities", value: "12" },
      { label: "Places", value: "61" },
    ]);
    const b = bare();
    expect(collection(b.counts, b.cars).map((t) => t.value)).toEqual([
      "—",
      "533",
      "3",
      "—",
      "12",
      "61",
    ]);
  });
});

describe("save data", () => {
  it("describes the save file", () => {
    expect(saveFacts(SAMPLE_PROFILE.save, NOW, UTC)).toEqual({
      file: "0f1e2d3c4b5a69788796a5b4c3d2e1f0.sqlite",
      path: SAMPLE_PROFILE.save.path,
      schema: "v5",
      generation: "1,284",
      size: "2.4 MB",
      saved: "today 19:40",
    });
    expect(saveFacts(bare().save, NOW, UTC).saved).toBe("never");
    expect(baseName("/home/d/.local/share/afterhours2015/artifacts/account/a.sqlite")).toBe(
      "a.sqlite",
    );
  });

  it("lists tables, row tables and account domains", () => {
    const entries = tableEntries(SAMPLE_PROFILE);
    expect(entries.filter((e) => e.group === "Progress").map((e) => [e.id, e.hint])).toEqual([
      ["RepValuesTable", "7 cols"],
      ["PrestigeMedalTable", "6 cols"],
      ["GameplayStatsTable", "9 cols"],
      ["SpeedListStatsTable", "10 cols"],
      ["ProgressionStats", "1 col"],
      ["CollectiblesTable", "37 rows"],
      ["ActivitiesTable", "12 rows"],
      ["PoiIdTable", "61 rows"],
    ]);
    expect(entries.filter((e) => e.group === "Account").map((e) => e.label)).toEqual([
      "Identity",
      "Entitlements",
      "Kickback",
      "Settings",
    ]);
    expect(tableEntries(bare()).some((e) => e.id === "CollectiblesTable")).toBe(false);
  });

  it("shows each cell's raw value and whether the save holds it", () => {
    const detail = tableDetail(SAMPLE_PROFILE, "GameplayStatsTable")!;
    expect(detail.caption).toBe("1 row · 9 columns · raw stored integers");
    expect(detail.rows[0]).toEqual({
      column: "DistanceDriven",
      value: "1284021",
      source: "Stored",
    });
    expect(detail.rows.find((r) => r.column === "LargestFineBusted")!.source).toBe("Default");
    expect(detail.note).toContain("schema default");
    expect(tableDetail(SAMPLE_PROFILE, "RepValuesTable")!.note).toBeNull();
  });

  it("counts rows of row tables and describes domains", () => {
    expect(tableDetail(SAMPLE_PROFILE, "CollectiblesTable")).toMatchObject({
      caption: "37 rows",
      rows: [],
    });
    expect(tableDetail(SAMPLE_PROFILE, "domain:settings")).toMatchObject({
      title: "Settings",
      caption: "Account domain · revision 5 · 2 KB",
    });
    expect(tableDetail(SAMPLE_PROFILE, "domain:nope")).toBeNull();
    expect(tableDetail(SAMPLE_PROFILE, "Nope")).toBeNull();
  });
});
