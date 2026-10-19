// What the bundled server says it can do, from `version --json`
// (contract v1). Servers without that command report nothing, and every
// screen that needs a capability hides it and gives one note until it
// appears.

import type { ServerInfo } from "$lib/api/types";

/**
 * Capabilities screens wait for. `profile`, `sessions`, `events`, `play`
 * (start the game in a running `serve` session) and `car-images` (decode
 * each car's in-game pictures) are contract v1's;
 * `world-settings` (track 3, traffic density) and `map` (track 7, the live
 * map feed) are expected names no server reports yet.
 */
export type Capability =
  "profile" | "sessions" | "events" | "play" | "car-images" | "world-settings" | "map";

export function hasCapability(
  server: Pick<ServerInfo, "capabilities"> | null | undefined,
  name: Capability,
): boolean {
  return server?.capabilities?.includes(name) ?? false;
}

/**
 * Screens and controls, and the capability each one needs. `null` means no
 * server offers it yet and nothing is planned to: police have no server
 * support and need research first, so Cops always waits.
 */
export const FEATURES = {
  profile: "profile",
  cars: "profile",
  "save-data": "profile",
  /** Each car's in-game picture on Cars and Profile. */
  "car-images": "car-images",
  logs: "sessions",
  traffic: "world-settings",
  rivals: "world-settings",
  "world-presets": "world-settings",
  map: "map",
  cops: null,
  /** Name, bank and REP edits: track 4's `account set`. */
  "account-edits": null,
} as const satisfies Record<string, Capability | null>;
export type Feature = keyof typeof FEATURES;

/** Whether `feature` can show real data: its capability is reported. */
export function featureReady(
  server: Pick<ServerInfo, "capabilities"> | null | undefined,
  feature: Feature,
): boolean {
  const needs: Capability | null = FEATURES[feature];
  return needs !== null && hasCapability(server, needs);
}
