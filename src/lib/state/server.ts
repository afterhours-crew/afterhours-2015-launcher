// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Which server the launcher uses: this PC's own, or one on another PC on
// your network, reached the same way through its API (roadmap track 8).

import type { Settings } from "$lib/api/types";

/**
 * The API address of a server on another PC as typed: `192.168.1.20:61000`
 * or `http://192.168.1.20:61000`. `null` unless it is one IPv4 address that
 * can be reached (not 0.0.0.0, broadcast or multicast) with a port.
 */
export function serverUrl(input: string): string | null {
  const text = input.trim().replace(/\/+$/, "");
  const match = /^(?:http:\/\/)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}):(\d{1,5})$/.exec(text);
  if (!match) return null;
  const parts = match.slice(1, 5).map(Number);
  const port = Number(match[5]);
  if (parts.some((part) => part > 255) || port < 1 || port > 65535) return null;
  const first = parts[0]!;
  if (parts.every((part) => part === 0) || parts.every((part) => part === 255)) return null;
  if (first >= 224 && first <= 239) return null;
  return `http://${parts.join(".")}:${port}`;
}

/** A server's API token: 64 lowercase hexadecimal characters. */
export function isToken(input: string): boolean {
  return /^[0-9a-f]{64}$/.test(input.trim());
}

/**
 * Whether the window reaches its server through the server's API: another
 * PC's, or this PC's own once the launcher has started it with the API.
 * Then pictures come from the server too, never from files here.
 */
export function viaApi(settings: Settings): boolean {
  return settings.server !== null || settings.local_api !== null;
}

/**
 * What another PC enters to use this PC's server: its address and token,
 * once sharing is on and the server has an API port; `null` otherwise.
 */
export function pairing(settings: Settings): { address: string; token: string } | null {
  if (!settings.share_address || !settings.local_api) return null;
  return {
    address: `${settings.share_address}:${settings.local_api.port}`,
    token: settings.local_api.token,
  };
}

/** "This PC", or the address of the server on another PC. */
export function serverLabel(settings: Settings): string {
  return settings.server ? settings.server.url.replace(/^http:\/\//, "") : "This PC";
}
