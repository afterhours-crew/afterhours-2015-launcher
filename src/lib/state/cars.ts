// View models for Cars (D3) and the Profile's car list, from the profile's
// `cars` and `car_summary` (contract v1). The server lists the active car,
// garage slots 1-4 in order, then the warehouse by item ID. Garage slots
// are 0-4 in the save and 1-5 on screen, as in the game.
//
// A car is called by the game's localized name the profile reads from the
// installation ("NISSAN Skyline GT-R KPGC10 (1971)"), else by its blueprint
// label ("Nissan GTRSkylineKPGC10 1971"). Search matches either. Wraps and
// tuning are not reported, so they are not shown.

import type { Car, CarSummary } from "$lib/api/types";
import { formatCount, formatMoney } from "./format";

export type CarFilter = "all" | "garage" | "warehouse";
export type CarSort = "slot" | "name" | "value";

export function carName(car: Car): string {
  return car.name ?? car.vehicle?.label ?? `Unknown car ${car.definition.slice(0, 8)}`;
}

/** The active car is in the garage too: it is slot 1. */
export function inGarage(car: Car): boolean {
  return car.location !== "warehouse";
}

export function whereLabel(car: Car): string {
  if (car.location === "active") return "Active";
  return car.location === "garage" ? "Garage" : "Warehouse";
}

export function whereLong(car: Car): string {
  if (car.location === "active") return "Active car · garage slot 1";
  if (car.location === "garage") {
    return car.slot == null ? "In the garage" : `Garage slot ${car.slot + 1}`;
  }
  return "In the warehouse";
}

export function filterCounts(cars: Car[]): Record<CarFilter, number> {
  const garage = cars.filter(inGarage).length;
  return { all: cars.length, garage, warehouse: cars.length - garage };
}

/** Cars matching the filter and a case-insensitive search of either name. */
export function filterCars(cars: Car[], filter: CarFilter, query: string): Car[] {
  const q = query.trim().toLowerCase();
  const matches = (car: Car) =>
    [carName(car), car.vehicle?.label ?? ""].some((n) => n.toLowerCase().includes(q));
  return cars.filter(
    (car) => (filter === "all" || (filter === "garage") === inGarage(car)) && (!q || matches(car)),
  );
}

const LOCATION_ORDER = { active: 0, garage: 1, warehouse: 2 } as const;

function bySlot(a: Car, b: Car): number {
  const location = LOCATION_ORDER[a.location] - LOCATION_ORDER[b.location];
  if (location !== 0) return location;
  return (a.slot ?? Infinity) - (b.slot ?? Infinity);
}

function byName(a: Car, b: Car): number {
  return carName(a).localeCompare(carName(b), "en", { sensitivity: "base", numeric: true });
}

/**
 * `slot`: the garage in slot order, then the warehouse as the server lists
 * it. `name`: A to Z. `value`: highest sale price first. Ties keep the
 * server's order, so the list never jumps between refreshes.
 */
export function sortCars(cars: Car[], sort: CarSort): Car[] {
  const order = new Map(cars.map((car, i) => [car, i]));
  const compare =
    sort === "name"
      ? byName
      : sort === "value"
        ? (a: Car, b: Car) => b.sale_price - a.sale_price
        : bySlot;
  return [...cars].sort((a, b) => compare(a, b) || order.get(a)! - order.get(b)!);
}

/** "17 cars · worth $689,500 if sold". */
export function summaryLine(summary: CarSummary, count: number): string {
  return `${formatCount(count)} ${count === 1 ? "car" : "cars"} · worth ${formatMoney(summary.total_sale_value)} if sold`;
}

export function filterOptions(cars: Car[]): { value: CarFilter; label: string }[] {
  const n = filterCounts(cars);
  return [
    { value: "all", label: `All ${n.all}` },
    { value: "garage", label: `Garage ${n.garage}` },
    { value: "warehouse", label: `Warehouse ${n.warehouse}` },
  ];
}

/** One row of the car list: a car, or identical warehouse cars together. */
export interface CarGroup {
  /** The first car's ID; the row's key. */
  key: string;
  car: Car;
  /** "Volvo 242 (1975) × 4" when more than one. */
  count: number;
}

/**
 * Identical cars as one row: warehouse cars with the same name, parts and
 * sale price. Garage cars stay one per slot. Rows keep the order of each
 * group's first car.
 */
export function groupCars(cars: Car[]): CarGroup[] {
  const groups: CarGroup[] = [];
  const byKey = new Map<string, CarGroup>();
  for (const car of cars) {
    if (car.location !== "warehouse") {
      groups.push({ key: car.id, car, count: 1 });
      continue;
    }
    const same = `${carName(car)}|${car.installed_parts}|${car.spare_parts}|${car.sale_price}`;
    const group = byKey.get(same);
    if (group) group.count += 1;
    else {
      const next = { key: car.id, car, count: 1 };
      byKey.set(same, next);
      groups.push(next);
    }
  }
  return groups;
}

/** The Profile's car list: the garage, then one line for the warehouse. */
export function garageList(cars: Car[]): {
  garage: { slot: string; name: string; active: boolean }[];
  warehouse: string | null;
} {
  const garage = sortCars(cars.filter(inGarage), "slot").map((car) => ({
    slot: car.slot == null ? "" : String(car.slot + 1),
    name: carName(car),
    active: car.location === "active",
  }));
  const stored = cars.filter((c) => !inGarage(c)).length;
  return { garage, warehouse: stored === 0 ? null : `${formatCount(stored)} in the warehouse` };
}
