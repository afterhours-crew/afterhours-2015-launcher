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
  if (car.location === "garage") return car.slot == null ? "Garage" : `Garage ${car.slot + 1}`;
  return "Warehouse";
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

/** "17 cars · 5 in the garage · 12 in the warehouse (holds 100) · worth $689,500 if sold". */
export function summaryLine(summary: CarSummary, count: number): string {
  return [
    `${formatCount(count)} ${count === 1 ? "car" : "cars"}`,
    `${summary.garage_used} in the garage`,
    `${formatCount(summary.warehouse_used)} in the warehouse (holds ${formatCount(summary.warehouse_limit)})`,
    `worth ${formatMoney(summary.total_sale_value)} if sold`,
  ].join(" · ");
}

export function filterOptions(cars: Car[]): { value: CarFilter; label: string }[] {
  const n = filterCounts(cars);
  return [
    { value: "all", label: `All · ${n.all}` },
    { value: "garage", label: `Garage · ${n.garage}` },
    { value: "warehouse", label: `Warehouse · ${n.warehouse}` },
  ];
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
  const stored = cars.filter((c) => !inGarage(c));
  if (stored.length === 0) return { garage, warehouse: null };
  const names = sortCars(stored, "name").map(carName);
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  const list = rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ");
  return { garage, warehouse: `+ ${formatCount(stored.length)} in the warehouse: ${list}` };
}
