<script lang="ts">
  import IconFocusCentered from "@tabler/icons-svelte/icons/focus-centered";
  import IconMinus from "@tabler/icons-svelte/icons/minus";
  import IconPlus from "@tabler/icons-svelte/icons/plus";
  import { imageSrc } from "$lib/api/images";
  import type { MapImagesReport } from "$lib/api/types";
  import {
    ZOOM_STEP,
    baseLevel,
    clampView,
    fitView,
    panBy,
    pickLevel,
    placeMarkers,
    placeRings,
    scaleBar,
    scaleRange,
    tilePath,
    visibleTiles,
    zoomAt,
    type MapMarker,
    type MapRing,
    type MapView,
    type PlacedTile,
    type Point,
  } from "$lib/state/map";

  // The game's world map from `map-images`, tiled: drag to pan, the wheel
  // or a double click to zoom, keys too (+, -, arrows, 0 to show the whole
  // map). Underneath, the coarsest level covers the view while the finer
  // tiles for the current zoom load on top. Markers and rings are placed
  // through the world box the server reported; without it none are drawn.
  let {
    report,
    markers = [],
    rings = [],
  }: {
    report: MapImagesReport;
    markers?: readonly MapMarker[];
    /** Spawn rings around drivers, drawn under the markers and labelled approximate. */
    rings?: readonly MapRing[];
  } = $props();

  let width = $state(0);
  let height = $state(0);
  /** `null` until the map is moved: the whole map, fitted. */
  let view = $state<MapView | null>(null);
  let dragging = $state<{ id: number; last: Point } | null>(null);
  let element = $state<HTMLDivElement | null>(null);

  let viewport = $derived({ width, height });
  let range = $derived(scaleRange(report.levels, viewport));
  let shown = $derived(view ? clampView(view, viewport, range) : fitView(viewport));
  let ratio = $derived(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
  let base = $derived(baseLevel(report.levels));
  let level = $derived(pickLevel(report.levels, shown.scale, ratio));
  let ready = $derived(width > 0 && height > 0);
  let baseTiles = $derived(ready && base ? visibleTiles(base, shown, viewport) : []);
  let fineTiles = $derived(
    ready && level && level.level !== base?.level ? visibleTiles(level, shown, viewport) : [],
  );
  let placed = $derived(ready ? placeMarkers(markers, report.world, shown, viewport) : []);
  let circles = $derived(ready ? placeRings(rings, report.world, shown, viewport) : []);
  let bar = $derived(report.world && ready ? scaleBar(report.world, shown.scale, 140) : null);
  let fitted = $derived(shown.scale <= range[0] + 0.5);

  function src(tile: PlacedTile): string | null {
    return imageSrc(tilePath(report.directory, tile.level, tile.column, tile.row));
  }

  function anchorOf(event: { clientX: number; clientY: number }): Point {
    const box = element?.getBoundingClientRect();
    return box ? { x: event.clientX - box.left, y: event.clientY - box.top } : centre();
  }

  function centre(): Point {
    return { x: width / 2, y: height / 2 };
  }

  function zoom(factor: number, anchor: Point = centre()) {
    view = zoomAt(shown, factor, anchor, viewport, range);
  }

  function pan(dx: number, dy: number) {
    view = panBy(shown, dx, dy, viewport, range);
  }

  function down(event: PointerEvent) {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    element?.setPointerCapture(event.pointerId);
    dragging = { id: event.pointerId, last: { x: event.clientX, y: event.clientY } };
  }

  function move(event: PointerEvent) {
    if (!dragging || event.pointerId !== dragging.id) return;
    pan(event.clientX - dragging.last.x, event.clientY - dragging.last.y);
    dragging = { id: dragging.id, last: { x: event.clientX, y: event.clientY } };
  }

  function up(event: PointerEvent) {
    if (dragging?.id === event.pointerId) dragging = null;
  }

  function key(event: KeyboardEvent) {
    const step = 80;
    const actions: Record<string, () => void> = {
      "+": () => zoom(ZOOM_STEP),
      "=": () => zoom(ZOOM_STEP),
      "-": () => zoom(1 / ZOOM_STEP),
      "0": () => (view = null),
      ArrowLeft: () => pan(step, 0),
      ArrowRight: () => pan(-step, 0),
      ArrowUp: () => pan(0, step),
      ArrowDown: () => pan(0, -step),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  // The wheel listener must not be passive, so the page never scrolls instead.
  function wheel(node: HTMLElement) {
    const listener = (event: WheelEvent) => {
      event.preventDefault();
      const lines = event.deltaMode === 1 ? 33 : 1;
      zoom(Math.exp(-event.deltaY * lines * 0.0015), anchorOf(event));
    };
    node.addEventListener("wheel", listener, { passive: false });
    return { destroy: () => node.removeEventListener("wheel", listener) };
  }
</script>

<!-- A pan-and-zoom map is an interactive widget: it takes the keyboard (arrows,
     plus, minus, 0) as well as the pointer, so it is focusable. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="map"
  class:dragging
  bind:this={element}
  bind:clientWidth={width}
  bind:clientHeight={height}
  role="application"
  aria-label="Map of Ventura Bay. Drag to move, scroll to zoom; arrow keys move, plus and minus zoom, 0 shows the whole map."
  tabindex="0"
  use:wheel
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  ondblclick={(event) => {
    if (!(event.target as Element).closest("button")) zoom(2, anchorOf(event));
  }}
  onkeydown={key}
>
  {#each [baseTiles, fineTiles] as layer, i (i)}
    {#each layer as tile (tile.key)}
      {@const url = src(tile)}
      {#if url}
        <img
          class="tile"
          src={url}
          alt=""
          draggable="false"
          decoding="async"
          style="left: {tile.x}px; top: {tile.y}px; width: {tile.size}px; height: {tile.size}px"
        />
      {/if}
    {/each}
  {/each}

  {#each circles as ring (ring.id)}
    {@const size = ring.outer * 2}
    {@const inner = (ring.inner / ring.outer) * 100}
    <span
      class="ring"
      style="left: {ring.left}px; top: {ring.top}px; width: {size}px; height: {size}px; --inner: {inner}%"
      aria-hidden="true"
    ></span>
    {#if ring.outer >= 56}
      <span
        class="ring-label t-data-small ah-on-art"
        style="left: {ring.left}px; top: {ring.top - ring.outer}px"
        aria-hidden="true">Spawn ring (approximate)</span
      >
    {/if}
  {/each}

  {#each placed as marker (marker.id)}
    <span
      class="marker {marker.kind}"
      style="left: {marker.left}px; top: {marker.top}px"
      title={marker.label}
      aria-hidden="true"
    >
      {#if marker.heading !== null}
        <span class="heading" style="transform: rotate({marker.heading}deg)"></span>
      {/if}
    </span>
  {/each}

  <div class="controls">
    <div class="ah-glass flat group">
      <button
        type="button"
        class="control"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={shown.scale >= range[1]}
        onclick={() => zoom(ZOOM_STEP)}><IconPlus size={18} stroke={1.8} /></button
      >
      <button
        type="button"
        class="control"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={fitted}
        onclick={() => zoom(1 / ZOOM_STEP)}><IconMinus size={18} stroke={1.8} /></button
      >
    </div>
    <button
      type="button"
      class="ah-glass flat control single"
      aria-label="Show the whole map"
      title="Show the whole map"
      disabled={fitted}
      onclick={() => (view = null)}><IconFocusCentered size={18} stroke={1.6} /></button
    >
  </div>

  {#if bar}
    <div class="scale ah-on-art" aria-label="Scale: {bar.label}">
      <span class="t-data-small">{bar.label}</span>
      <span class="bar" style="width: {bar.pixels}px"></span>
    </div>
  {/if}
</div>

<style>
  .map {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: var(--radius-phone);
    background: #15161a;
    cursor: grab;
    touch-action: none;
    user-select: none;
    outline: none;
  }
  .map:focus-visible {
    box-shadow: inset 0 0 0 2px var(--graphite-ring);
  }
  .map.dragging {
    cursor: grabbing;
  }
  .tile {
    position: absolute;
    display: block;
    max-width: none;
    pointer-events: none;
  }
  .marker {
    position: absolute;
    width: 12px;
    height: 12px;
    margin: -6px 0 0 -6px;
    border-radius: 50%;
    background: var(--ink-soft);
    box-shadow: 0 0 0 2px rgba(18, 16, 21, 0.8);
    pointer-events: none;
  }
  .marker.you {
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    background: var(--crew);
  }
  .marker.driver {
    background: var(--crew);
  }
  .marker.rival {
    background: var(--speed);
  }
  /* Where traffic appears (beyond the inner radius) and clears (past the
     outer one): a band between the two, its outer edge dashed. */
  .ring {
    position: absolute;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1.5px dashed rgba(190, 191, 197, 0.55);
    background: radial-gradient(
      circle closest-side,
      transparent var(--inner),
      rgba(190, 191, 197, 0.1) var(--inner),
      rgba(190, 191, 197, 0.1) 100%,
      transparent 100%
    );
    pointer-events: none;
  }
  .ring-label {
    position: absolute;
    transform: translate(-50%, calc(-100% - 4px));
    white-space: nowrap;
    color: var(--ink-soft);
    pointer-events: none;
  }
  .heading {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 0;
    height: 0;
    transform-origin: 0 0;
  }
  .heading::before {
    content: "";
    position: absolute;
    left: -4px;
    top: -16px;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-bottom: 7px solid var(--ink);
  }
  .controls {
    position: absolute;
    right: 12px;
    top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .group {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-phone);
    overflow: hidden;
  }
  .control {
    width: var(--control-height);
    height: var(--control-height);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink);
    cursor: pointer;
  }
  .control.single {
    border-radius: var(--radius-phone);
  }
  .control:hover:not(:disabled) {
    background: var(--hover);
  }
  .control:disabled {
    color: var(--ink-faint);
    cursor: default;
  }
  .scale {
    position: absolute;
    left: 14px;
    bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    pointer-events: none;
  }
  .bar {
    display: block;
    height: 6px;
    border: 1.5px solid rgba(244, 240, 234, 0.75);
    border-top: 0;
  }
</style>
