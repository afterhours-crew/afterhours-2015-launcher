// The World screen (H5): traffic as a multiple of the game's own amount and
// roaming rivals as a number, read and saved with the server's `settings`
// command (capability `world-settings`). Saved values apply from the next
// session: a running session keeps the values it started with. Pure, so
// the scale, what a saved value shows as and what a change saves are all
// tested.

import type { SettingsReport, Status } from "$lib/api/types";
import { isLive } from "./launchbar";
import { listSentence } from "./upcoming";

/** The traffic scale: Off, then 1x to 5x. */
export const MULTIPLIERS: readonly number[] = [0, 1, 2, 3, 4, 5];

/** The most roaming rivals the launcher offers; the server accepts more. */
export const MAX_RIVALS = 15;

export interface Choice {
  value: string;
  label: string;
  /** On the scale but above what the server allows yet: shown, not pickable. */
  upcoming?: boolean;
}

export interface Row {
  options: Choice[];
  /** The step matching the saved value, or the extra choice for one off the scale. */
  selected: string;
}

const label = (multiplier: number) => (multiplier === 0 ? "Off" : `${multiplier}x`);

/**
 * Traffic: Off is 0 % and Nx is N × 100 %. Steps above the server's maximum
 * show as coming in a future update, and become pickable by themselves when
 * the server allows them. A saved amount off the scale ("150 %") is an
 * extra, selected choice until a step is picked.
 */
export function trafficRow(report: SettingsReport): Row {
  const options: Choice[] = MULTIPLIERS.map((m) => ({
    value: String(m * 100),
    label: label(m),
    ...(m * 100 > report.max_traffic_percent ? { upcoming: true } : {}),
  }));
  const selected = String(report.traffic_percent);
  if (!options.some((o) => o.value === selected && !o.upcoming)) {
    options.push({ value: `custom:${selected}`, label: `${report.traffic_percent} %` });
    return { options, selected: `custom:${selected}` };
  }
  return { options, selected };
}

/** Whether a traffic step is above what the server allows yet. */
export function trafficUpcoming(report: SettingsReport): boolean {
  return report.max_traffic_percent < MULTIPLIERS.at(-1)! * 100;
}

export interface RivalField {
  /** The saved cap; `null` is Auto, the game's own number. */
  value: number | null;
  /** The field's maximum: 15, or less if the server accepts fewer. */
  max: number;
}

/**
 * Roaming rivals: the most active at once, 0 (off) to 15, or Auto for the
 * game's own number. A cap saved above 15 elsewhere shows as it is; the
 * field only steps down from it.
 */
export function rivalField(report: SettingsReport): RivalField {
  return { value: report.rival_limit, max: Math.min(MAX_RIVALS, report.max_rivals) };
}

/** `settings` arguments that save a change; `null` for the extra chip or anything unexpected. */
export function saveArgs(row: "traffic" | "rivals", value: string): string[] | null {
  if (value.startsWith("custom:")) return null;
  if (row === "traffic") return /^\d+$/.test(value) ? ["--traffic", value] : null;
  if (value === "original") return ["--rivals", value];
  return /^\d+$/.test(value) && Number(value) <= MAX_RIVALS
    ? ["--rivals", String(Number(value))]
    : null;
}

/** The record as it will read once a save of `value` succeeds, to show at once. */
export function applyChoice(
  report: SettingsReport,
  row: "traffic" | "rivals",
  value: string,
): SettingsReport {
  const args = saveArgs(row, value);
  if (args === null) return report;
  return row === "traffic"
    ? { ...report, traffic_percent: Number(args[1]) }
    : { ...report, rival_limit: args[1] === "original" ? null : Number(args[1]) };
}

/** Why the controls are locked: a session keeps the values it started with. */
export function worldLock(status: Status | null): string | null {
  return isLive(status?.state)
    ? "Applies the next time you start. Stop the server to change it."
    : null;
}

/**
 * What the World view's coming note lists. Without the server's
 * `world-settings`, the traffic and rival settings themselves; with it,
 * what they cannot do yet. Cops always: they need research first.
 */
export function worldUpcoming(capabilityReported: boolean, report: SettingsReport | null): string {
  if (!capabilityReported)
    return listSentence(["traffic settings", "roaming rival settings", "cops"]);
  const items: string[] = [];
  if (!report || trafficUpcoming(report)) items.push("traffic up to 5x");
  items.push("more roaming rivals than the game's own", "cops");
  return listSentence(items);
}
