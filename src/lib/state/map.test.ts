import { describe, expect, it } from "vitest";
import {
  baseLevel,
  clampView,
  fitView,
  mapToScreen,
  metresToPixels,
  panBy,
  pickLevel,
  placeMarkers,
  placeRings,
  scaleBar,
  scaleRange,
  screenToMap,
  tilePath,
  visibleTiles,
  worldToMap,
  zoomAt,
  type MapLevel,
} from "./map";

// The supported build's world map (afterhours-2015 `map-images`).
const LEVELS: MapLevel[] = [
  { level: 1, tiles_per_side: 32, size: 8192, tiles: 1024 },
  { level: 2, tiles_per_side: 16, size: 4096, tiles: 256 },
  { level: 3, tiles_per_side: 8, size: 2048, tiles: 64 },
];
const WORLD = { min_x: -8192, min_z: -8192, max_x: 8192, max_z: 8192 };
const VIEWPORT = { width: 1000, height: 600 };
const RANGE = scaleRange(LEVELS, VIEWPORT);

describe("fitting and clamping", () => {
  it("fits the whole map to the shorter side and zooms to twice the finest level", () => {
    expect(fitView(VIEWPORT)).toEqual({ u: 0.5, v: 0.5, scale: 600 });
    expect(RANGE).toEqual([600, 16384]);
  });

  it("keeps the scale in range and an axis narrower than the viewport centred", () => {
    expect(clampView({ u: 0.1, v: 0.9, scale: 50 }, VIEWPORT, RANGE)).toEqual({
      u: 0.5,
      v: 0.5,
      scale: 600,
    });
    // At 1200 px the map is wider than 1000 px: the centre may move only
    // until an edge reaches the viewport's edge.
    const view = clampView({ u: 0, v: 1, scale: 1200 }, VIEWPORT, RANGE);
    expect(view.scale).toBe(1200);
    expect(view.u).toBeCloseTo(500 / 1200);
    expect(view.v).toBeCloseTo(1 - 300 / 1200);
    expect(clampView({ u: 0.5, v: 0.5, scale: 1e6 }, VIEWPORT, RANGE).scale).toBe(16384);
  });

  it("pans by the dragged pixels, within the map", () => {
    const view = { u: 0.5, v: 0.5, scale: 4000 };
    const moved = panBy(view, 400, -200, VIEWPORT, RANGE);
    expect(moved.u).toBeCloseTo(0.5 - 400 / 4000);
    expect(moved.v).toBeCloseTo(0.5 + 200 / 4000);
    expect(panBy(view, 1e6, 0, VIEWPORT, RANGE).u).toBeCloseTo(500 / 4000);
  });
});

describe("zooming", () => {
  it("keeps the map point under the cursor in place", () => {
    const view = { u: 0.5, v: 0.5, scale: 2000 };
    const anchor = { x: 800, y: 150 };
    const before = screenToMap(view, VIEWPORT, anchor);
    const zoomed = zoomAt(view, 2, anchor, VIEWPORT, RANGE);
    expect(zoomed.scale).toBe(4000);
    const after = screenToMap(zoomed, VIEWPORT, anchor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("stops at the range and recentres when zoomed all the way out", () => {
    const view = { u: 0.3, v: 0.7, scale: 1000 };
    expect(zoomAt(view, 0.01, { x: 0, y: 0 }, VIEWPORT, RANGE)).toEqual(fitView(VIEWPORT));
    expect(zoomAt(view, 1000, { x: 500, y: 300 }, VIEWPORT, RANGE).scale).toBe(16384);
  });
});

describe("detail levels", () => {
  it("draws the coarsest level that is at least as sharp as the screen", () => {
    expect(pickLevel(LEVELS, 600)?.level).toBe(3);
    expect(pickLevel(LEVELS, 2048)?.level).toBe(3);
    expect(pickLevel(LEVELS, 2049)?.level).toBe(2);
    expect(pickLevel(LEVELS, 2048, 2)?.level).toBe(2);
    expect(pickLevel(LEVELS, 16384)?.level).toBe(1);
  });

  it("skips levels without tiles and has no level without any", () => {
    const sparse = LEVELS.map((l) => (l.level === 2 ? { ...l, tiles: 0 } : l));
    expect(pickLevel(sparse, 3000)?.level).toBe(1);
    expect(baseLevel(LEVELS)?.level).toBe(3);
    expect(pickLevel([], 600)).toBeNull();
    expect(baseLevel(LEVELS.map((l) => ({ ...l, tiles: 0 })))).toBeNull();
  });
});

describe("tiles", () => {
  it("covers the viewport with the tiles it touches, edge to edge", () => {
    const view = { u: 0.5, v: 0.5, scale: 600 };
    const tiles = visibleTiles(LEVELS[2]!, view, VIEWPORT);
    // The whole 600 px map shows: all 8 x 8 tiles of 75 px.
    expect(tiles).toHaveLength(64);
    expect(tiles[0]).toMatchObject({ key: "3-0-0", column: 0, row: 0, x: 200, y: 0, size: 75 });
    const right = tiles.find((t) => t.column === 7 && t.row === 0)!;
    expect(right.x + right.size).toBe(800);
  });

  it("draws only the tiles in view when zoomed in", () => {
    const view = { u: 0.25, v: 0.25, scale: 8192 };
    const tiles = visibleTiles(LEVELS[0]!, view, VIEWPORT);
    const columns = new Set(tiles.map((t) => t.column));
    const rows = new Set(tiles.map((t) => t.row));
    // 1000 x 600 px of 256 px tiles around (2048, 2048).
    expect(Math.min(...columns)).toBe(6);
    expect(Math.max(...columns)).toBe(9);
    expect(Math.min(...rows)).toBe(6);
    expect(Math.max(...rows)).toBe(9);
    for (const tile of tiles) {
      const next = tiles.find((t) => t.row === tile.row && t.column === tile.column + 1);
      if (next) expect(next.x).toBe(tile.x + tile.size);
    }
  });

  it("names a tile's file in the set's directory", () => {
    expect(tilePath("C:\\Data\\map-images\\abc", 1, 31, 7)).toBe(
      "C:\\Data\\map-images\\abc\\1-31-7.png",
    );
    expect(tilePath("/data/map-images/abc/", 3, 0, 0)).toBe("/data/map-images/abc/3-0-0.png");
  });
});

describe("world positions", () => {
  it("places the world box's corners and centre, +z down the map", () => {
    expect(worldToMap(WORLD, -8192, -8192)).toEqual({ x: 0, y: 0 });
    expect(worldToMap(WORLD, 0, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(worldToMap(WORLD, 8192, 4096)).toEqual({ x: 1, y: 0.75 });
  });

  it("puts a world position on screen through the view", () => {
    const view = { u: 0.5, v: 0.5, scale: 16384 };
    const { x, y } = worldToMap(WORLD, 100, -50);
    // At 1 px per metre the point is 100 px right and 50 px up of centre.
    expect(mapToScreen(view, VIEWPORT, x, y)).toEqual({ x: 600, y: 250 });
  });

  it("labels the scale bar with a round distance", () => {
    // 16384 m over 600 px is about 27 m per pixel.
    expect(scaleBar(WORLD, 600)).toMatchObject({ metres: 2000, label: "2 km" });
    const bar = scaleBar(WORLD, 16384);
    expect(bar).toEqual({ metres: 100, pixels: 100, label: "100 m" });
    expect(scaleBar(WORLD, 4096, 160).label).toBe("500 m");
  });
});

describe("markers", () => {
  const view = { u: 0.5, v: 0.5, scale: 16384 };
  const car = (id: string, x: number, z: number) =>
    ({ id, kind: "traffic", x, z, heading: null }) as const;

  it("places markers in view and leaves out the rest", () => {
    const placed = placeMarkers(
      [car("near", 100, -50), car("far", 4000, 0), car("edge", 510, 0)],
      WORLD,
      view,
      VIEWPORT,
    );
    expect(placed.map((m) => [m.id, m.left, m.top])).toEqual([
      ["near", 600, 250],
      ["edge", 1010, 300],
    ]);
  });

  it("places nothing without the world box", () => {
    expect(placeMarkers([car("near", 0, 0)], null, view, VIEWPORT)).toEqual([]);
  });
});

describe("rings", () => {
  // At 16384 px across a 16384 m world, one pixel is one metre.
  const view = { u: 0.5, v: 0.5, scale: 16384 };
  const ring = (id: string, x: number, z: number) => ({ id, x, z, inner: 300, outer: 450 });

  it("turn metres into pixels at the current zoom", () => {
    expect(metresToPixels(WORLD, 16384, 450)).toBe(450);
    expect(metresToPixels(WORLD, 600, 450)).toBeCloseTo(16.48, 2);
  });

  it("are placed while any of the circle reaches into view", () => {
    const placed = placeRings(
      [ring("near", 100, -50), ring("reaching", 900, 0), ring("gone", 1000, 0)],
      WORLD,
      view,
      VIEWPORT,
    );
    expect(placed).toEqual([
      { id: "near", left: 600, top: 250, inner: 300, outer: 450 },
      { id: "reaching", left: 1400, top: 300, inner: 300, outer: 450 },
    ]);
  });

  it("place nothing without the world box", () => {
    expect(placeRings([ring("near", 0, 0)], null, view, VIEWPORT)).toEqual([]);
  });
});
