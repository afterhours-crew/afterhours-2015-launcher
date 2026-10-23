// The Map view's geometry, as pure functions: where the map sits in the
// viewport, which detail level and tiles to draw, and where a world
// position lands. The server's `map-images` decodes the game's world map
// into square tiles at several detail levels and reports the world box the
// map covers (crates/launcher/README.md, "World map", in afterhours-2015).
//
// Map coordinates u and v run from 0 to 1 across the whole map, from its
// top-left corner. A view is the map point at the viewport's centre and the
// map's on-screen width in CSS pixels (`scale`).

import type { MapImagesReport, World } from "$lib/api/generated/map-images";

export interface MapView {
  u: number;
  v: number;
  /** On-screen width (and height) of the whole map, in CSS pixels. */
  scale: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** One tile to draw, in viewport pixels. */
export interface PlacedTile {
  key: string;
  level: number;
  column: number;
  row: number;
  x: number;
  y: number;
  size: number;
}

/** The detail levels `map-images` reported, most detailed first. */
export type MapLevel = MapImagesReport["levels"][number];

/** How far the view may zoom in past the most detailed level's pixels. */
export const MAX_OVERZOOM = 2;
/** One step of the zoom buttons and keys. */
export const ZOOM_STEP = 1.6;

/** The scale that shows the whole map. */
export function fitScale(viewport: Viewport): number {
  return Math.max(1, Math.min(viewport.width, viewport.height));
}

/** Smallest and largest scale: the whole map, to twice the finest level. */
export function scaleRange(levels: readonly MapLevel[], viewport: Viewport): [number, number] {
  const min = fitScale(viewport);
  const finest = Math.max(0, ...levels.map((l) => l.size));
  return [min, Math.max(min, finest * MAX_OVERZOOM)];
}

/** The whole map, centred. */
export function fitView(viewport: Viewport): MapView {
  return { u: 0.5, v: 0.5, scale: fitScale(viewport) };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * Keep the scale in range and the map covering the viewport: an axis the
 * map is narrower than stays centred.
 */
export function clampView(
  view: MapView,
  viewport: Viewport,
  range: readonly [number, number],
): MapView {
  const scale = clamp(view.scale, range[0], range[1]);
  const axis = (centre: number, span: number) => {
    const half = span / 2 / scale;
    return half >= 0.5 ? 0.5 : clamp(centre, half, 1 - half);
  };
  return { u: axis(view.u, viewport.width), v: axis(view.v, viewport.height), scale };
}

/** Move the map by a drag of `dx`, `dy` pixels. */
export function panBy(
  view: MapView,
  dx: number,
  dy: number,
  viewport: Viewport,
  range: readonly [number, number],
): MapView {
  return clampView(
    { u: view.u - dx / view.scale, v: view.v - dy / view.scale, scale: view.scale },
    viewport,
    range,
  );
}

/** Zoom by `factor`, keeping the map point under `anchor` where it is. */
export function zoomAt(
  view: MapView,
  factor: number,
  anchor: Point,
  viewport: Viewport,
  range: readonly [number, number],
): MapView {
  const scale = clamp(view.scale * factor, range[0], range[1]);
  const dx = anchor.x - viewport.width / 2;
  const dy = anchor.y - viewport.height / 2;
  const u = view.u + dx / view.scale - dx / scale;
  const v = view.v + dy / view.scale - dy / scale;
  return clampView({ u, v, scale }, viewport, range);
}

/**
 * The level to draw: the coarsest whose pixels are at least as fine as the
 * screen's (`scale` times the device pixel ratio), else the finest there is.
 */
export function pickLevel(
  levels: readonly MapLevel[],
  scale: number,
  pixelRatio = 1,
): MapLevel | null {
  const usable = levels.filter((l) => l.tiles > 0);
  if (usable.length === 0) return null;
  const bySize = [...usable].sort((a, b) => a.size - b.size);
  const needed = scale * pixelRatio;
  return bySize.find((l) => l.size >= needed) ?? bySize.at(-1)!;
}

/** The coarsest level with tiles, drawn underneath while finer tiles load. */
export function baseLevel(levels: readonly MapLevel[]): MapLevel | null {
  const usable = levels.filter((l) => l.tiles > 0);
  return usable.length === 0 ? null : usable.reduce((a, b) => (b.size < a.size ? b : a));
}

/** The viewport position of map point (u, v). */
export function mapToScreen(view: MapView, viewport: Viewport, u: number, v: number): Point {
  return {
    x: viewport.width / 2 + (u - view.u) * view.scale,
    y: viewport.height / 2 + (v - view.v) * view.scale,
  };
}

/** The map point at a viewport position. */
export function screenToMap(view: MapView, viewport: Viewport, point: Point): Point {
  return {
    x: view.u + (point.x - viewport.width / 2) / view.scale,
    y: view.v + (point.y - viewport.height / 2) / view.scale,
  };
}

/**
 * The tiles of `level` that cover the viewport. Edges are rounded so
 * neighbouring tiles meet without seams.
 */
export function visibleTiles(level: MapLevel, view: MapView, viewport: Viewport): PlacedTile[] {
  const side = level.tiles_per_side;
  const span = view.scale / side;
  const left = viewport.width / 2 - view.u * view.scale;
  const top = viewport.height / 2 - view.v * view.scale;
  const first = (origin: number) => clamp(Math.floor(-origin / span), 0, side - 1);
  const last = (origin: number, extent: number) =>
    clamp(Math.floor((extent - origin) / span), 0, side - 1);
  const tiles: PlacedTile[] = [];
  for (let row = first(top); row <= last(top, viewport.height); row += 1) {
    for (let column = first(left); column <= last(left, viewport.width); column += 1) {
      const x = Math.round(left + column * span);
      const y = Math.round(top + row * span);
      const size = Math.round(left + (column + 1) * span) - x;
      tiles.push({
        key: `${level.level}-${column}-${row}`,
        level: level.level,
        column,
        row,
        x,
        y,
        size,
      });
    }
  }
  return tiles;
}

/** A tile's file: `<directory>/<level>-<column>-<row>.png`, with the directory's separator. */
export function tilePath(directory: string, level: number, column: number, row: number): string {
  const separator = directory.includes("\\") ? "\\" : "/";
  const base = directory.endsWith(separator) ? directory.slice(0, -1) : directory;
  return `${base}${separator}${level}-${column}-${row}.png`;
}

/** Where world position (x, z) lies on the map, in map coordinates. */
export function worldToMap(world: World, x: number, z: number): Point {
  return {
    x: (x - world.min_x) / (world.max_x - world.min_x),
    y: (z - world.min_z) / (world.max_z - world.min_z),
  };
}

/** The scale bar: a round distance no longer than `maxPixels` on screen. */
export function scaleBar(
  world: World,
  scale: number,
  maxPixels = 160,
): { metres: number; pixels: number; label: string } {
  const metresPerPixel = (world.max_x - world.min_x) / scale;
  const most = metresPerPixel * maxPixels;
  const power = 10 ** Math.floor(Math.log10(most));
  const step = [5, 2, 1].map((m) => m * power).find((d) => d <= most) ?? power;
  const label = step >= 1000 ? `${step / 1000} km` : `${step} m`;
  return { metres: step, pixels: step / metresPerPixel, label };
}

/** Something to show on the map at a world position, such as a car. */
export interface MapMarker {
  id: string;
  kind: "you" | "driver" | "traffic" | "rival";
  /** World position in metres. */
  x: number;
  z: number;
  /** Heading in degrees, clockwise from up the map; `null` when unknown. */
  heading: number | null;
  label?: string;
}

/** A marker in viewport pixels. */
export interface PlacedMarker extends MapMarker {
  left: number;
  top: number;
}

/**
 * The markers inside the viewport (with `margin` pixels to spare), in
 * viewport pixels. Nothing can be placed without the world box.
 */
export function placeMarkers(
  markers: readonly MapMarker[],
  world: World | null,
  view: MapView,
  viewport: Viewport,
  margin = 24,
): PlacedMarker[] {
  if (!world) return [];
  const placed: PlacedMarker[] = [];
  for (const marker of markers) {
    const at = worldToMap(world, marker.x, marker.z);
    const { x, y } = mapToScreen(view, viewport, at.x, at.y);
    const inside =
      x >= -margin && y >= -margin && x <= viewport.width + margin && y <= viewport.height + margin;
    if (inside) placed.push({ ...marker, left: x, top: y });
  }
  return placed;
}

/** Metres in the world as CSS pixels at `scale`. */
export function metresToPixels(world: World, scale: number, metres: number): number {
  return (metres / (world.max_x - world.min_x)) * scale;
}

/** A circle around a world position, such as a driver's spawn ring, in metres. */
export interface MapRing {
  id: string;
  x: number;
  z: number;
  inner: number;
  outer: number;
}

/** A ring in viewport pixels: its centre and both radii. */
export interface PlacedRing {
  id: string;
  left: number;
  top: number;
  inner: number;
  outer: number;
}

/** The rings that reach into the viewport, in viewport pixels. */
export function placeRings(
  rings: readonly MapRing[],
  world: World | null,
  view: MapView,
  viewport: Viewport,
): PlacedRing[] {
  if (!world) return [];
  const placed: PlacedRing[] = [];
  for (const ring of rings) {
    const at = worldToMap(world, ring.x, ring.z);
    const { x, y } = mapToScreen(view, viewport, at.x, at.y);
    const outer = metresToPixels(world, view.scale, ring.outer);
    const inner = metresToPixels(world, view.scale, ring.inner);
    const inside =
      x >= -outer && y >= -outer && x <= viewport.width + outer && y <= viewport.height + outer;
    if (inside) placed.push({ id: ring.id, left: x, top: y, inner, outer });
  }
  return placed;
}
