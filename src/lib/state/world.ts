// The World screen (H5): traffic as a multiple of the game's own amount and
// roaming rivals as a number, read and saved with the server's `settings`
// command (capability `world-settings`). Saved values apply from the next
// session: a running session keeps the values it started with. Pure, so
// the scale, what a saved value shows as and what a change saves are all
// tested.

import type { SettingsReport, Status } from "$lib/api/types";
import { isLive } from "./launchbar";
import { listSentence } from "./upcoming";

/**
 * The traffic scale: Off, then 1x to 5x, shown up to the server's maximum.
 * Servers stop at 3x: at 5x the game itself crashed (a fixed client pool
 * ran out, afterhours-crew/afterhours-2015#136), so 4x and 5x are not
 * planned and not shown. A server that ever allows them shows them.
 */
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

/** Off, Default (the game's own amount, 1x), then 2x to 5x. */
const label = (multiplier: number) =>
  multiplier === 0 ? "Off" : multiplier === 1 ? "Default" : `${multiplier}x`;

/**
 * Traffic: Off is 0 %, Default is the game's own 100 % and Nx is N × 100 %,
 * up to the server's maximum. A saved amount off the scale ("150 %") is an
 * extra, selected choice until a step is picked.
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

/**
 * Whether a save reaches a running session within about a second (`live`).
 * Servers that predate it print no such field: their sessions keep the
 * values they started with.
 */
export function appliesLive(report: SettingsReport | null): boolean {
  return report?.live === true;
}

/** Whether a rival count above the game's own adds rivals; `false` when the server does not say. */
export function rivalsAboveOriginal(report: SettingsReport | null): boolean {
  return report?.rivals_above_original === true;
}

/**
 * Why the controls are locked: on a server without live changes, a running
 * session keeps the values it started with. A live server never locks.
 */
export function worldLock(status: Status | null, report: SettingsReport | null): string | null {
  return isLive(status?.state) && !appliesLive(report)
    ? "Applies the next time you start. Stop the server to change it."
    : null;
}

/** When changes take effect, for the view's caption. */
export function worldTiming(report: SettingsReport | null): string {
  return appliesLive(report)
    ? "Your server's city. Changes apply within a few seconds, even while you play."
    : "Your server's city. Changes apply the next time you start.";
}

/** The rivals info text: what the number does on this server. */
export function rivalHelp(report: SettingsReport | null): string {
  const base = `The most roaming rivals at once, from 0 (off) to ${MAX_RIVALS}. Auto keeps the game's own number.`;
  return rivalsAboveOriginal(report)
    ? `${base} Above it, other rivals from the game join near you.`
    : `${base} For now your server can only lower that number; more rivals than the game's own is coming in a future update.`;
}

/**
 * What the World view's coming note lists, or `null` when at most one thing
 * is coming: that one already carries its own pill (Cops). Without the
 * server's `world-settings`, the traffic and rival settings themselves;
 * with it, what they cannot do yet. Cops always: they need research first.
 */
export function worldUpcoming(
  capabilityReported: boolean,
  report: SettingsReport | null,
): string | null {
  if (!capabilityReported)
    return listSentence(["traffic settings", "roaming rival settings", "cops"]);
  const items: string[] = [];
  if (!rivalsAboveOriginal(report)) items.push("more roaming rivals than the game's own");
  items.push("cops");
  return items.length > 1 ? listSentence(items) : null;
}
