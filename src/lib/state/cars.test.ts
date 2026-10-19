import { describe, expect, it } from "vitest";
import {
  carName,
  filterCars,
  filterCounts,
  filterOptions,
  garageList,
  groupCars,
  sortCars,
  summaryLine,
  whereLabel,
  whereLong,
} from "./cars";
import { SAMPLE_CARS, SAMPLE_PROFILE } from "./sample";

const names = (cars: typeof SAMPLE_CARS) => cars.map(carName);

describe("car names", () => {
  it("are the game's localized name, then the blueprint label, then the definition", () => {
    expect(carName(SAMPLE_CARS[0]!)).toBe("NISSAN Skyline GT-R KPGC10 (1971)");
    // The name did not resolve: the blueprint label, never an empty string.
    expect(SAMPLE_CARS[1]!.name).toBeNull();
    expect(carName(SAMPLE_CARS[1]!)).toBe("Honda CivicTypeR 2000");
    expect(carName(SAMPLE_CARS[6]!)).toMatch(/^Unknown car [0-9a-f]{8}$/);
  });
});

describe("where a car is", () => {
  it("numbers garage slots from 1, with the active car in slot 1", () => {
    expect(SAMPLE_CARS.slice(0, 4).map(whereLabel)).toEqual([
      "Active",
      "Garage",
      "Garage",
      "Warehouse",
    ]);
    expect(whereLong(SAMPLE_CARS[0]!)).toBe("Active car · garage slot 1");
    expect(whereLong(SAMPLE_CARS[2]!)).toBe("Garage slot 3");
    expect(whereLong(SAMPLE_CARS[3]!)).toBe("In the warehouse");
  });
});

describe("filtering", () => {
  it("counts the garage with its active car", () => {
    expect(filterCounts(SAMPLE_CARS)).toEqual({ all: 7, garage: 3, warehouse: 4 });
    expect(filterOptions(SAMPLE_CARS).map((o) => o.label)).toEqual([
      "All 7",
      "Garage 3",
      "Warehouse 4",
    ]);
    expect(filterCounts([])).toEqual({ all: 0, garage: 0, warehouse: 0 });
  });

  it("filters by place and by name, ignoring case and spaces around the query", () => {
    expect(filterCars(SAMPLE_CARS, "garage", "")).toHaveLength(3);
    expect(filterCars(SAMPLE_CARS, "warehouse", "")).toHaveLength(4);
    expect(names(filterCars(SAMPLE_CARS, "all", "  civic "))).toEqual(["Honda CivicTypeR 2000"]);
    // Both the localized name and the blueprint label are searched.
    expect(names(filterCars(SAMPLE_CARS, "all", "skyline gt-r"))).toEqual([
      "NISSAN Skyline GT-R KPGC10 (1971)",
    ]);
    expect(names(filterCars(SAMPLE_CARS, "all", "GTRSkyline"))).toEqual([
      "NISSAN Skyline GT-R KPGC10 (1971)",
    ]);
    expect(names(filterCars(SAMPLE_CARS, "warehouse", "sample"))).toEqual([
      "SAMPLE Coupe (1989)",
      "SAMPLE Roadster (1994)",
      "SAMPLE Hatch (2006)",
    ]);
    expect(filterCars(SAMPLE_CARS, "garage", "coupe")).toEqual([]);
  });
});

describe("sorting", () => {
  const shuffled = [...SAMPLE_CARS].reverse();

  it("puts the garage in slot order before the warehouse", () => {
    expect(names(sortCars(shuffled, "slot")).slice(0, 3)).toEqual([
      "NISSAN Skyline GT-R KPGC10 (1971)",
      "Honda CivicTypeR 2000",
      "SAMPLE Muscle GT (2015)",
    ]);
    // The warehouse keeps the order it was given.
    expect(
      sortCars(shuffled, "slot")
        .slice(3)
        .map((c) => c.id),
    ).toEqual(shuffled.filter((c) => c.location === "warehouse").map((c) => c.id));
  });

  it("sorts by name and by sale value", () => {
    expect(names(sortCars(SAMPLE_CARS, "name")).slice(0, 3)).toEqual([
      "Honda CivicTypeR 2000",
      "NISSAN Skyline GT-R KPGC10 (1971)",
      "SAMPLE Coupe (1989)",
    ]);
    expect(sortCars(SAMPLE_CARS, "value").map((c) => c.sale_price)).toEqual([
      62_000, 38_500, 31_200, 14_000, 11_500, 3_200, 0,
    ]);
  });

  it("does not change the list it was given", () => {
    const before = SAMPLE_CARS.map((c) => c.id);
    sortCars(SAMPLE_CARS, "value");
    expect(SAMPLE_CARS.map((c) => c.id)).toEqual(before);
  });
});

describe("grouping", () => {
  const stored = SAMPLE_CARS.find((c) => c.location === "warehouse")!;
  const copy = (id: string, patch: Partial<typeof stored> = {}) => ({ ...stored, id, ...patch });

  it("shows identical warehouse cars as one row with a count", () => {
    const cars = [...SAMPLE_CARS.slice(0, 3), stored, copy("c2"), copy("c3"), copy("c4")];
    const groups = groupCars(cars);
    expect(groups.map((g) => g.count)).toEqual([1, 1, 1, 4]);
    expect(groups[3]).toMatchObject({ key: stored.id, car: stored });
  });

  it("keeps cars apart that differ in parts or price, and never groups the garage", () => {
    const cars = [stored, copy("c2", { installed_parts: 1 }), copy("c3", { sale_price: 1 })];
    expect(groupCars(cars).map((g) => g.count)).toEqual([1, 1, 1]);
    const garage = SAMPLE_CARS.filter((c) => c.location === "garage")[0]!;
    expect(groupCars([garage, { ...garage, id: "g2" }]).map((g) => g.count)).toEqual([1, 1]);
  });

  it("keeps the order of each group's first car", () => {
    const other = SAMPLE_CARS.filter((c) => c.location === "warehouse")[1]!;
    const groups = groupCars([stored, other, copy("c2")]);
    expect(groups.map((g) => [g.car.id, g.count])).toEqual([
      [stored.id, 2],
      [other.id, 1],
    ]);
  });
});

describe("summaries", () => {
  it("say how many cars, where, and what they sell for", () => {
    expect(summaryLine(SAMPLE_PROFILE.car_summary!, SAMPLE_CARS.length)).toBe(
      "7 cars · worth $160,400 if sold",
    );
    expect(
      summaryLine({ ...SAMPLE_PROFILE.car_summary!, garage_used: 1, warehouse_used: 0 }, 1),
    ).toMatch(/^1 car · /);
  });

  it("list the garage and sum up the warehouse", () => {
    const list = garageList(SAMPLE_CARS);
    expect(list.garage).toEqual([
      { slot: "1", name: "NISSAN Skyline GT-R KPGC10 (1971)", active: true },
      { slot: "2", name: "Honda CivicTypeR 2000", active: false },
      { slot: "3", name: "SAMPLE Muscle GT (2015)", active: false },
    ]);
    expect(list.warehouse).toBe("4 in the warehouse");
    expect(garageList(SAMPLE_CARS.slice(0, 3)).warehouse).toBeNull();
  });
});
