// The Map view's live markers, as pure functions. With `--events` a server
// reporting `map-feed` writes, at most four times a second while it runs a
// world session, where the cars are: one `map-feed` event listing every
// world session (one per connected game) with its drivers, traffic and
// roaming rivals (crates/launcher/README.md, "Map feed", in afterhours-2015).
// Positions are world metres: on the `map-images` map +x points right and +z
// down, and headings are degrees clockwise from up the map.

import type { MapCar, MapDriver, MapFeed, MapWorld, SessionState, Status } from "$lib/api/types";
import type { MapMarker, MapRing } from "./map";

/** The server's own bounds per frame; a frame past them is not drawn. */
export const FEED_BOUNDS = { worlds: 32, drivers: 16, traffic: 128, rivals: 128 } as const;
/** The server keeps coordinates within 100 km of the origin. */
const MAX_COORDINATE = 100_000;

type Fields = Record<string, unknown>;

function isObject(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
}

function isHeading(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && value >= 0 && value < 360);
}

function bounded(value: unknown, most: number): value is unknown[] {
  return Array.isArray(value) && value.length <= most;
}

function readCar(value: unknown): MapCar | null {
  if (!isObject(value) || !isCount(value.id)) return null;
  const { x, y, z, heading } = value;
  if (!isCoordinate(x) || !isCoordinate(y) || !isCoordinate(z) || !isHeading(heading)) return null;
  return { id: value.id, x, y, z, heading };
}

function readDriver(value: unknown): MapDriver | null {
  if (!isObject(value) || !isCount(value.participant)) return null;
  const { x, y, z, heading, speed } = value;
  if (!isCoordinate(x) || !isCoordinate(y) || !isCoordinate(z) || !isHeading(heading)) return null;
  if (typeof speed !== "number" || !Number.isFinite(speed)) return null;
  return { participant: value.participant, x, y, z, heading, speed };
}

function readAll<T>(value: unknown, most: number, read: (item: unknown) => T | null): T[] | null {
  if (!bounded(value, most)) return null;
  const items: T[] = [];
  for (const raw of value) {
    const item = read(raw);
    if (item === null) return null;
    items.push(item);
  }
  return items;
}

function readWorld(value: unknown): MapWorld | null {
  if (!isObject(value)) return null;
  const { connection, persona_id, world_ms, omitted, traffic_ring: ring } = value;
  if (!isCount(connection) || typeof persona_id !== "string") return null;
  if (!isCount(world_ms) || !isCount(omitted)) return null;
  const drivers = readAll(value.drivers, FEED_BOUNDS.drivers, readDriver);
  const traffic = readAll(value.traffic, FEED_BOUNDS.traffic, readCar);
  const rivals = readAll(value.rivals, FEED_BOUNDS.rivals, readCar);
  if (!drivers || !traffic || !rivals) return null;
  let traffic_ring: MapWorld["traffic_ring"] = null;
  if (ring !== null) {
    if (!isObject(ring)) return null;
    const { inner, outer } = ring;
    if (!isCoordinate(inner) || !isCoordinate(outer) || inner < 0 || outer < inner) return null;
    traffic_ring = { inner, outer };
  }
  return { connection, persona_id, world_ms, drivers, traffic, rivals, traffic_ring, omitted };
}

/**
 * A `map-feed` event as the window received it, checked against its schema
 * and the server's bounds; `null` for anything else, which leaves the
 * markers as they were. Fields this launcher does not know are dropped.
 */
export function readMapFeed(value: unknown): MapFeed | null {
  if (!isObject(value) || value.event !== "map-feed" || value.version !== 1) return null;
  if (typeof value.utc !== "string" || !isCount(value.frame) || !isCount(value.skipped)) {
    return null;
  }
  const worlds = readAll(value.worlds, FEED_BOUNDS.worlds, readWorld);
  if (!worlds) return null;
  return {
    version: 1,
    utc: value.utc,
    event: "map-feed",
    frame: value.frame,
    skipped: value.skipped,
    worlds,
  };
}

/** Session states in which a session is ending or over: no markers then. */
const ENDING = new Set<SessionState>(["stopping", "finished", "failed", "interrupted"]);

/**
 * The feed to keep after a new event arrived: the newest one, or none when
 * it lists no world session. While the session is ending nothing is taken.
 */
export function takeFeed(
  current: MapFeed | null,
  event: unknown,
  state: SessionState | undefined,
): MapFeed | null {
  if (state !== undefined && ENDING.has(state)) return null;
  const feed = readMapFeed(event);
  if (!feed) return current;
  return feed.worlds.length === 0 ? null : feed;
}

/**
 * Whether the markers stay when the session's status changes: they go when
 * the session leaves `ready` (stopping, or a game starting again in a serve
 * session), is ending, or its game closed while the server hosts on.
 */
export function feedSurvives(
  previous: Pick<Status, "state" | "game_running"> | null,
  next: Pick<Status, "state" | "game_running"> | null,
): boolean {
  if (next && ENDING.has(next.state)) return false;
  if (previous?.state === "ready" && next?.state !== "ready") return false;
  return !(previous?.game_running && next && !next.game_running);
}

/** Who "you" are, from the profile: the driver's name for its persona. */
export interface Identity {
  persona_id: string;
  display_name: string;
}

/**
 * The markers of the newest feed. In a local session every driver is the
 * player, so drivers are `you`; traffic and rivals follow. Ids join the
 * world's connection, the kind and the server's participant or car id,
 * which the server never reuses within a world session. "You" are drawn
 * last, on top.
 */
export function feedMarkers(feed: MapFeed | null, identity: Identity | null = null): MapMarker[] {
  if (!feed) return [];
  const cars: MapMarker[] = [];
  const you: MapMarker[] = [];
  for (const world of feed.worlds) {
    const name =
      identity && identity.persona_id === world.persona_id ? identity.display_name : "You";
    const car = (kind: "traffic" | "rival", label: string) => (c: MapCar) => ({
      id: `${world.connection}-${kind}-${c.id}`,
      kind,
      x: c.x,
      z: c.z,
      heading: c.heading,
      label,
    });
    cars.push(...world.traffic.map(car("traffic", "Traffic")));
    cars.push(...world.rivals.map(car("rival", "Rival")));
    for (const d of world.drivers) {
      you.push({
        id: `${world.connection}-you-${d.participant}`,
        kind: "you",
        x: d.x,
        z: d.z,
        heading: d.heading,
        label: name,
      });
    }
  }
  return [...cars, ...you];
}

/**
 * Where traffic appears and clears: one ring per driver of a world whose
 * traffic is on, in metres. The native policy spawns ahead of where the
 * driver will be and narrower to the sides, so a circle at its radii is an
 * approximation.
 */
export function feedRings(feed: MapFeed | null): MapRing[] {
  if (!feed) return [];
  return feed.worlds.flatMap((world) => {
    const ring = world.traffic_ring;
    if (!ring) return [];
    return world.drivers.map((d) => ({
      id: `${world.connection}-ring-${d.participant}`,
      x: d.x,
      z: d.z,
      inner: ring.inner,
      outer: ring.outer,
    }));
  });
}

/** The Layers panel's switches. */
export interface MapLayers {
  you: boolean;
  traffic: boolean;
  rivals: boolean;
  ring: boolean;
}

export const ALL_LAYERS: MapLayers = { you: true, traffic: true, rivals: true, ring: true };

const LAYER_OF: Record<MapMarker["kind"], keyof MapLayers> = {
  you: "you",
  driver: "you",
  traffic: "traffic",
  rival: "rivals",
};

/** The markers whose layer is switched on. */
export function shownMarkers(markers: readonly MapMarker[], layers: MapLayers): MapMarker[] {
  return markers.filter((m) => layers[LAYER_OF[m.kind]]);
}

/** How many markers each layer has, for the Layers panel. */
export function layerCounts(markers: readonly MapMarker[]): Record<MapMarker["kind"], number> {
  const counts = { you: 0, driver: 0, traffic: 0, rival: 0 };
  for (const m of markers) counts[m.kind] += 1;
  return counts;
}
