import { describe, expect, it } from "vitest";
import {
  carName,
  filterCars,
  filterCounts,
  filterOptions,
  garageList,
  sortCars,
  summaryLine,
  whereLabel,
  whereLong,
} from "./cars";
import { SAMPLE_CARS, SAMPLE_PROFILE } from "./sample";

const names = (cars: typeof SAMPLE_CARS) => cars.map(carName);

describe("car names", () => {
  it("are what the profile gives, then the blueprint label, then the definition", () => {
    expect(carName(SAMPLE_CARS[0]!)).toBe("Nissan GTRSkylineKPGC10 1971");
    const labelOnly = { ...SAMPLE_CARS[1]!, display_name: null };
    expect(carName(labelOnly)).toBe("Honda CivicTypeR 2000");
    expect(carName(SAMPLE_CARS[6]!)).toMatch(/^Unknown car [0-9a-f]{8}$/);
  });
});

describe("where a car is", () => {
  it("numbers garage slots from 1, with the active car in slot 1", () => {
    expect(SAMPLE_CARS.slice(0, 4).map(whereLabel)).toEqual([
      "Active",
      "Garage 2",
      "Garage 3",
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
      "All · 7",
      "Garage · 3",
      "Warehouse · 4",
    ]);
    expect(filterCounts([])).toEqual({ all: 0, garage: 0, warehouse: 0 });
  });

  it("filters by place and by name, ignoring case and spaces around the query", () => {
    expect(filterCars(SAMPLE_CARS, "garage", "")).toHaveLength(3);
    expect(filterCars(SAMPLE_CARS, "warehouse", "")).toHaveLength(4);
    expect(names(filterCars(SAMPLE_CARS, "all", "  civic "))).toEqual(["Honda CivicTypeR 2000"]);
    expect(names(filterCars(SAMPLE_CARS, "warehouse", "sample"))).toEqual([
      "Sample Coupe 1989",
      "Sample Roadster 1994",
      "Sample Hatch 2006",
    ]);
    expect(filterCars(SAMPLE_CARS, "garage", "sample")).toEqual([]);
  });
});

describe("sorting", () => {
  const shuffled = [...SAMPLE_CARS].reverse();

  it("puts the garage in slot order before the warehouse", () => {
    expect(names(sortCars(shuffled, "slot")).slice(0, 3)).toEqual([
      "Nissan GTRSkylineKPGC10 1971",
      "Honda CivicTypeR 2000",
      "Ford MustangGT 2015",
    ]);
    // The warehouse keeps the order it was given.
    expect(
      sortCars(shuffled, "slot")
        .slice(3)
        .map((c) => c.id),
    ).toEqual(shuffled.filter((c) => c.location === "warehouse").map((c) => c.id));
  });

  it("sorts by name and by sale value", () => {
    expect(names(sortCars(SAMPLE_CARS, "name"))[0]).toBe("Ford MustangGT 2015");
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

describe("summaries", () => {
  it("say how many cars, where, and what they sell for", () => {
    expect(summaryLine(SAMPLE_PROFILE.car_summary!, SAMPLE_CARS.length)).toBe(
      "7 cars · 3 in the garage · 4 in the warehouse (holds 100) · worth $160,400 if sold",
    );
    expect(
      summaryLine({ ...SAMPLE_PROFILE.car_summary!, garage_used: 1, warehouse_used: 0 }, 1),
    ).toMatch(/^1 car · /);
  });

  it("list the garage and sum up the warehouse", () => {
    const list = garageList(SAMPLE_CARS);
    expect(list.garage).toEqual([
      { slot: "1", name: "Nissan GTRSkylineKPGC10 1971", active: true },
      { slot: "2", name: "Honda CivicTypeR 2000", active: false },
      { slot: "3", name: "Ford MustangGT 2015", active: false },
    ]);
    expect(list.warehouse).toMatch(
      /^\+ 4 in the warehouse: Sample Coupe 1989, Sample Hatch 2006, Sample Roadster 1994 and 1 more$/,
    );
    expect(garageList(SAMPLE_CARS.slice(0, 3)).warehouse).toBeNull();
  });
});
