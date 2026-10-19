// View models for Profile (D1), Edit driver (A2) and Save data (D2), from
// `profile --json` (contract v1). Pure functions: the screens print what
// these return, and the tests pin the wording.
//
// Values come from the server's own decoding. Table cells are raw stored
// integers: no unit is applied to distances, times or speeds, because the
// game's units are not confirmed. A cell the save does not hold is the
// schema default the server serves, and says so.

import type { Car, Cell, Columns, Counts, Profile, Reputation, Save } from "$lib/api/types";
import { carName } from "./cars";
import { formatBytes, formatCount, formatMoney, formatSaved, humanize, type Clock } from "./format";
import { initials } from "./launchbar";

export function driverName(profile: Profile | null): string | null {
  const name = profile?.identity?.display_name?.trim();
  return name ? name : null;
}

/** The header's subline: "REP 69 · $9,788,600", or what of it the save has. */
export function headerLine(profile: Profile | null): string | null {
  if (!profile) return null;
  const parts: string[] = [];
  const level = profile.reputation?.level;
  if (level != null) parts.push(`REP ${level}`);
  if (profile.bank) parts.push(formatMoney(profile.bank.balance));
  return parts.length ? parts.join(" · ") : null;
}

export interface DriverCard {
  name: string;
  initials: string;
  /** "Persona 1666824901114517107 · last saved today 21:40". */
  subline: string;
  level: string;
  bank: string;
}

export function driverCard(profile: Profile, now: Date, clock: Clock = {}): DriverCard {
  const name = driverName(profile) ?? "Driver";
  const sub: string[] = [];
  if (profile.identity) sub.push(`Persona ${profile.identity.persona_id}`);
  if (profile.save.updated_at_utc) {
    sub.push(`last saved ${formatSaved(profile.save.updated_at_utc, now, clock)}`);
  }
  const level = profile.reputation?.level;
  return {
    name,
    initials: initials(name),
    subline: sub.join(" · "),
    level: level == null ? "—" : String(level),
    bank: profile.bank ? formatMoney(profile.bank.balance) : "—",
  };
}

export interface RepProgress {
  level: number;
  /** `null` at the top level. */
  nextLevel: number | null;
  score: number;
  /** 0–1 through the current level. */
  fraction: number;
  title: string;
  detail: string;
  /** For the progress bar's aria values, within the current level. */
  into: number;
  span: number;
}

/**
 * Progress to the next REP level. The thresholds are the total scores at
 * which the current and next levels start, as the server evaluates them.
 */
export function repProgress(rep: Reputation | null): RepProgress | null {
  if (!rep || rep.level == null || !rep.score) return null;
  const score = rep.score.value;
  const current = rep.current_threshold ?? 0;
  const next = rep.next_threshold;
  const atTop = next == null || (rep.maximum_level != null && rep.level >= rep.maximum_level);
  if (atTop || next == null) {
    return {
      level: rep.level,
      nextLevel: null,
      score,
      fraction: 1,
      title: `Level ${rep.level} · top level`,
      detail: `${formatCount(score)} REP total`,
      into: 1,
      span: 1,
    };
  }
  const span = Math.max(1, next - current);
  const into = Math.min(span, Math.max(0, score - current));
  const toGo = Math.max(0, next - score);
  return {
    level: rep.level,
    nextLevel: rep.level + 1,
    score,
    fraction: into / span,
    title: `Level ${rep.level} → ${rep.level + 1}`,
    detail: `${formatCount(toGo)} REP to go · ${formatCount(score)} total`,
    into,
    span,
  };
}

export const CATEGORIES = [
  { key: "speed", label: "Speed", color: "var(--speed)", medal: "SpeedMedal" },
  { key: "style", label: "Style", color: "var(--style)", medal: "StyleMedal" },
  { key: "build", label: "Build", color: "var(--build)", medal: "BuildMedal" },
  { key: "crew", label: "Crew", color: "var(--crew)", medal: "CrewMedal" },
  { key: "outlaw", label: "Outlaw", color: "var(--outlaw)", medal: "OutlawMedal" },
] as const;

export interface CategoryRow {
  key: (typeof CATEGORIES)[number]["key"];
  label: string;
  color: string;
  /** Printed score, or "—" when the save has no such cell. */
  score: string;
  /** Bar length relative to the strongest category. */
  fraction: number;
  /** The raw `PrestigeMedalTable` cell; its meaning is not decoded. */
  medal: string;
}

function cellText(cell: Cell | null | undefined): string {
  return cell ? formatCount(cell.value) : "—";
}

export function repCategories(
  rep: Reputation | null,
  tables: Profile["tables"],
): CategoryRow[] | null {
  if (!rep) return null;
  const medals = tables?.["PrestigeMedalTable"];
  const values = CATEGORIES.map((c) => rep.categories[c.key]?.value ?? 0);
  const top = Math.max(0, ...values);
  return CATEGORIES.map((c, i) => ({
    key: c.key,
    label: c.label,
    color: c.color,
    score: cellText(rep.categories[c.key]),
    fraction: top > 0 ? Math.max(0, values[i]!) / top : 0,
    medal: cellText(medals?.[c.medal]),
  }));
}

export interface StatTile {
  column: string;
  label: string;
  value: string;
  /** False when the save has no cell and the value is the served default. */
  stored: boolean;
  /** A resolved name, for `FavoriteVehicleId` when it is one of the cars. */
  name: string | null;
  /** The number to count up to; `null` for IDs and missing cells. */
  raw: number | null;
}

/** Every column of one single-row table, in the server's order. */
export function tableTiles(columns: Columns | undefined, cars: Car[] | null = null): StatTile[] {
  if (!columns) return [];
  return Object.entries(columns).map(([column, cell]) => {
    let name: string | null = null;
    if (column === "FavoriteVehicleId" && cell && cars) {
      const car = cars.find((c) => c.id === String(cell.value));
      if (car) name = carName(car);
    }
    return {
      column,
      label: humanize(column),
      // IDs are identifiers, not amounts: no thousands separators.
      value: cell
        ? column.endsWith("Id")
          ? String(cell.value)
          : formatCount(cell.value)
        : "not in this save's schema",
      stored: cell?.stored ?? false,
      name,
      raw: cell && !column.endsWith("Id") ? cell.value : null,
    };
  });
}

export interface SpeedListModel {
  summary: string;
  positions: { label: string; count: number; fraction: number }[];
}

/** SpeedList: starts, finishes and finishing positions, all counts. */
export function speedList(tables: Profile["tables"]): SpeedListModel | null {
  const table = tables?.["SpeedListStatsTable"];
  if (!table) return null;
  const value = (column: string) => table[column]?.value ?? 0;
  const positions = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"].map((label) => ({
    label,
    count: value(label),
  }));
  const top = Math.max(0, ...positions.map((p) => p.count));
  return {
    summary: `${formatCount(value("Started"))} started · ${formatCount(value("Finished"))} finished`,
    positions: positions.map((p) => ({ ...p, fraction: top > 0 ? p.count / top : 0 })),
  };
}

export interface CollectionTile {
  label: string;
  value: string;
}

export function collection(counts: Counts, cars: Car[] | null): CollectionTile[] {
  const rows = (n: number | null) => (n == null ? "—" : formatCount(n));
  return [
    { label: "Cars", value: cars ? formatCount(cars.length) : "—" },
    { label: "Items", value: formatCount(counts.items) },
    { label: "Wraps", value: formatCount(counts.livery_records) },
    { label: "Collectibles", value: rows(counts.collectibles) },
    { label: "Activities", value: rows(counts.activities) },
    { label: "Places", value: rows(counts.points_of_interest) },
  ];
}

/** The last path component, for either separator. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export interface SaveFacts {
  file: string;
  path: string;
  schema: string;
  generation: string;
  size: string;
  saved: string;
}

export function saveFacts(save: Save, now: Date, clock: Clock = {}): SaveFacts {
  return {
    file: baseName(save.path),
    path: save.path,
    schema: `v${save.schema_version}`,
    generation: formatCount(save.generation),
    size: formatBytes(save.file_bytes),
    saved: save.updated_at_utc ? formatSaved(save.updated_at_utc, now, clock) : "never",
  };
}

/** One entry of the Save data screen's table list. */
export interface TableEntry {
  id: string;
  label: string;
  /** "7 cols", "37 rows", "rev 5". */
  hint: string;
  group: "Progress" | "Account";
}

const ROW_TABLES = [
  { id: "CollectiblesTable", count: "collectibles" },
  { id: "ActivitiesTable", count: "activities" },
  { id: "PoiIdTable", count: "points_of_interest" },
] as const;

export function tableEntries(profile: Profile): TableEntry[] {
  const entries: TableEntry[] = [];
  for (const [id, columns] of Object.entries(profile.tables ?? {})) {
    const n = Object.keys(columns ?? {}).length;
    entries.push({ id, label: id, hint: `${n} ${n === 1 ? "col" : "cols"}`, group: "Progress" });
  }
  for (const row of ROW_TABLES) {
    const n = profile.counts[row.count];
    if (n == null) continue;
    entries.push({ id: row.id, label: row.id, hint: `${formatCount(n)} rows`, group: "Progress" });
  }
  for (const [id, domain] of Object.entries(profile.save.domains)) {
    if (!domain) continue;
    entries.push({
      id: `domain:${id}`,
      label: humanize(id),
      hint: `rev ${domain.revision}`,
      group: "Account",
    });
  }
  return entries;
}

export interface TableDetail {
  title: string;
  caption: string;
  /** Column, stored integer, where it comes from. */
  rows: { column: string; value: string; source: string }[];
  note: string | null;
}

/** What the Save data screen shows for one entry of [`tableEntries`]. */
export function tableDetail(profile: Profile, id: string): TableDetail | null {
  const columns = profile.tables?.[id];
  if (columns) {
    const rows = Object.entries(columns).map(([column, cell]) => ({
      column,
      value: cell ? String(cell.value) : "—",
      source: cell == null ? "Not in schema" : cell.stored ? "Stored" : "Default",
    }));
    const n = rows.length;
    return {
      title: id,
      caption: `1 row · ${n} ${n === 1 ? "column" : "columns"} · raw stored integers`,
      rows,
      note: rows.some((r) => r.source === "Default")
        ? "Default: the save has no cell yet, so the server serves the schema default."
        : null,
    };
  }
  const rowTable = ROW_TABLES.find((r) => r.id === id);
  if (rowTable) {
    const n = profile.counts[rowTable.count];
    return {
      title: id,
      caption: n == null ? "Not in this save yet" : `${formatCount(n)} rows`,
      rows: [],
      note: "The profile counts this table's rows; their contents are not read.",
    };
  }
  if (id.startsWith("domain:")) {
    const name = id.slice("domain:".length);
    const domain = profile.save.domains[name];
    if (!domain) return null;
    return {
      title: humanize(name),
      caption: `Account domain · revision ${formatCount(domain.revision)} · ${formatBytes(domain.bytes)}`,
      rows: [
        { column: "revision", value: String(domain.revision), source: "Stored" },
        { column: "bytes", value: String(domain.bytes), source: "Stored" },
      ],
      note: null,
    };
  }
  return null;
}
