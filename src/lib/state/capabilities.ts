// What the bundled server says it can do, from `version --json`
// (contract v1). Servers without that command report nothing, and every
// screen that needs a capability shows "Coming later" until it appears.

import type { ServerInfo } from "$lib/api/types";

/** Capabilities screens wait for. `map` is the live map feed (track 7). */
export type Capability = "profile" | "sessions" | "events" | "map";

export function hasCapability(
  server: Pick<ServerInfo, "capabilities"> | null | undefined,
  name: Capability,
): boolean {
  return server?.capabilities?.includes(name) ?? false;
}
