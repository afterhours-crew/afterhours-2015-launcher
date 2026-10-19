// The World screen (H5): traffic and roaming rivals as multipliers of the
// game's own amounts, read and saved with the server's `settings` command
// (capability `world-settings`). Saved values apply from the next session:
// a running session keeps the values it started with. Pure, so the scale,
// what a saved value shows as and what a click saves are all tested.

import type { SettingsReport, Status } from "$lib/api/types";
import { isLive } from "./launchbar";

/** The scale both rows draw from: Off, then 1x to 5x. */
export const MULTIPLIERS: readonly number[] = [0, 1, 2, 3, 4, 5];

/**
 * Rival steps shown today. The server can only cap rivals at the game's
 * own number (`--rivals original`), not add more, and no record reports a
 * rival multiplier yet. When one does, show more steps here.
 */
export const RIVAL_MULTIPLIERS: readonly number[] = MULTIPLIERS.filter((m) => m <= 1);

export interface Choice {
  value: string;
  label: string;
}

export interface Row {
  options: Choice[];
  /** The step matching the saved value, or the extra choice for one off the scale. */
  selected: string;
}

const label = (multiplier: number) => (multiplier === 0 ? "Off" : `${multiplier}x`);

/**
 * Traffic: Off is 0 % and Nx is N × 100 %, up to the server's maximum, so
 * 4x and 5x appear by themselves when it allows them. A saved amount off
 * the scale ("150 %") is an extra, selected choice until a step is picked.
 */
export function trafficRow(report: SettingsReport): Row {
  const options: Choice[] = MULTIPLIERS.filter((m) => m * 100 <= report.max_traffic_percent).map(
    (m) => ({ value: String(m * 100), label: label(m) }),
  );
  const selected = String(report.traffic_percent);
  if (!options.some((o) => o.value === selected)) {
    options.push({ value: `custom:${selected}`, label: `${report.traffic_percent} %` });
    return { options, selected: `custom:${selected}` };
  }
  return { options, selected };
}

/**
 * Rivals: Off caps them at 0 and 1x keeps the game's own number (a
 * `rival_limit` of `null`). Any other saved cap ("At most 2") is an extra,
 * selected choice until a step is picked.
 */
export function rivalRow(report: SettingsReport): Row {
  const options: Choice[] = RIVAL_MULTIPLIERS.map((m) => ({
    value: m === 0 ? "0" : m === 1 ? "original" : `x${m}`,
    label: label(m),
  }));
  const limit = report.rival_limit;
  const selected = limit === null ? "original" : String(limit);
  if (!options.some((o) => o.value === selected)) {
    options.push({ value: `custom:${selected}`, label: `At most ${limit}` });
    return { options, selected: `custom:${selected}` };
  }
  return { options, selected };
}

/** `settings` arguments that save a picked choice; `null` for the extra one. */
export function saveArgs(row: "traffic" | "rivals", value: string): string[] | null {
  if (value.startsWith("custom:")) return null;
  if (row === "traffic") return /^\d+$/.test(value) ? ["--traffic", value] : null;
  return value === "original" || /^\d+$/.test(value) ? ["--rivals", value] : null;
}

/** The record as it will read once a save of `value` succeeds, to show at once. */
export function applyChoice(
  report: SettingsReport,
  row: "traffic" | "rivals",
  value: string,
): SettingsReport {
  if (saveArgs(row, value) === null) return report;
  return row === "traffic"
    ? { ...report, traffic_percent: Number(value) }
    : { ...report, rival_limit: value === "original" ? null : Number(value) };
}

/** Why the controls are locked: a session keeps the values it started with. */
export function worldLock(status: Status | null): string | null {
  return isLive(status?.state)
    ? "Applies the next time you start. Stop the server to change it."
    : null;
}

/** The World view's one note: what the server cannot do yet. */
export function worldNote(capabilityReported: boolean): string {
  return capabilityReported
    ? "Cops arrive with a later server update."
    : "Traffic, roaming rivals and cops arrive with a later server update.";
}
