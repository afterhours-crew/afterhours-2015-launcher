// Generated from schemas/profile.schema.json by scripts/gen-types.mjs. Do not edit; run `pnpm types`.

/**
 * Where an owned car is kept.
 */
export type CarLocation = "active" | "garage" | "warehouse";

/**
 * `profile --json`: one saved driver.
 */
export interface Profile {
  account_id: string;
  /**
   * Whether `account.json` selects this account.
   */
  active: boolean;
  bank: Bank | null;
  car_summary: CarSummary | null;
  /**
   * Every owned car: the active car, garage slots 1-4 in order, then the
   * warehouse by item ID. `null` without item content to classify items.
   */
  cars: Car[] | null;
  content: ContentSource | null;
  counts: Counts;
  garage: Garage | null;
  identity: Driver | null;
  reputation: Reputation | null;
  save: Save;
  /**
   * Single-row tables by stored table and column name.
   */
  tables: {
    [k: string]: Columns | undefined;
  } | null;
  version: 1;
  warnings: string[];
}
export interface Bank {
  balance: number;
  formatted: string;
}
/**
 * Totals over [`Car`]s.
 */
export interface CarSummary {
  /**
   * Garage slots in all, 5.
   */
  garage_slots: number;
  /**
   * Garage slots holding an item.
   */
  garage_used: number;
  /**
   * Sum of every owned car's stored sale price.
   */
  total_sale_value: number;
  /**
   * The server's warehouse limit; moving a car there beyond it is refused.
   */
  warehouse_limit: number;
  /**
   * Owned cars outside the garage slots.
   */
  warehouse_used: number;
}
/**
 * One owned car: a root item of the race-vehicle class in the owned state,
 * the same rule the server applies to purchases, sales and the warehouse.
 * Whether a car carries a custom wrap or tuning is not reported: those
 * edits change stored records in place, and the save keeps no stock
 * reference that tells them apart without guessing.
 */
export interface Car {
  /**
   * Definition GUID as 32 lowercase hexadecimal characters.
   */
  definition: string;
  /**
   * The blueprint label from the installed vehicle content, such as
   * `Ford MustangGT 2015`; not the game's localized name. `null` when the
   * vehicle content does not list the definition.
   */
  display_name: string | null;
  id: string;
  /**
   * Records installed on the car: reachable from it through installed
   * item links, nested parts included. An installed wrap from the
   * account's library counts.
   */
  installed_parts: number;
  /**
   * Records in the car's ownership tree, the car included. Selling the
   * car removes exactly these.
   */
  item_records: number;
  location: CarLocation;
  /**
   * The stored sale price: the cash that selling this car credits.
   */
  sale_price: number;
  /**
   * Garage slot 0-4; `null` in the warehouse.
   */
  slot: number | null;
  /**
   * Records the car owns that are not installed: stock parts it replaced
   * and purchased spares.
   */
  spare_parts: number;
  vehicle: Vehicle | null;
}
/**
 * A vehicle's blueprint from the installed vehicle content. `label` is the
 * blueprint's asset name with the `Car_` prefix removed and underscores as
 * spaces; it is not the game's localized display name.
 */
export interface Vehicle {
  asset_name: string;
  blueprint: string;
  label: string;
}
/**
 * Where the content came from, reported with the profile.
 */
export interface ContentSource {
  /**
   * `argument`, `current-session` or `only-cache`.
   */
  chosen_by: string;
  directory: string;
}
export interface Counts {
  activities: number | null;
  /**
   * Saved rows; `null` when the save has no such table yet.
   */
  collectibles: number | null;
  items: number;
  /**
   * Owned items per definition class; `null` without item content.
   */
  items_by_class: {
    [k: string]: number | undefined;
  } | null;
  livery_bytes: number;
  livery_records: number;
  points_of_interest: number | null;
  /**
   * Owned items whose definition the item content does not list.
   */
  unresolved_items: number | null;
}
/**
 * The five ordered garage slots; slot 0 is the primary vehicle.
 */
export interface Garage {
  primary_vehicle: Item | null;
  slots: Slot[];
}
export interface Item {
  /**
   * Definition class from the installed item content.
   */
  class: string | null;
  /**
   * Definition GUID as 32 lowercase hexadecimal characters.
   */
  definition: string;
  id: string;
  /**
   * Blueprint from the installed vehicle content, for cars.
   */
  vehicle: Vehicle | null;
}
export interface Slot {
  index: number;
  item: Item | null;
  primary: boolean;
}
export interface Driver {
  account_id: string;
  display_name: string;
  persona_id: string;
}
/**
 * REP as `nfs_services::reputation` presents it. `level` and the
 * thresholds are evaluated from `score`; `stored_level` is the saved
 * `RepLevel` cell, which is not an input to that evaluation.
 */
export interface Reputation {
  categories: Categories;
  current_threshold: number | null;
  level: number | null;
  maximum_level: number | null;
  next_threshold: number | null;
  score: Cell | null;
  stored_level: Cell | null;
}
export interface Categories {
  build: Cell | null;
  crew: Cell | null;
  outlaw: Cell | null;
  speed: Cell | null;
  style: Cell | null;
}
/**
 * One stored integer: the value the server serves (the schema default when
 * the save has no cell) and whether the save holds the cell itself.
 */
export interface Cell {
  stored: boolean;
  value: number;
}
export interface Save {
  /**
   * Present account domains and their revisions.
   */
  domains: {
    [k: string]: Domain | undefined;
  };
  /**
   * Main database file only; recent commits may still be in its log.
   */
  file_bytes: number;
  generation: number;
  path: string;
  schema_version: number;
  /**
   * Milliseconds since the Unix epoch, from the server's clock.
   */
  updated_at_ms: number;
  updated_at_utc: string | null;
}
export interface Domain {
  bytes: number;
  revision: number;
}
/**
 * Stored cells by column name, in schema order. A column the installed schema lacks is `null`.
 */
export interface Columns {
  [k: string]: Cell | null | undefined;
}
