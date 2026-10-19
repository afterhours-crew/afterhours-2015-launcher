<script lang="ts">
  import IconCar from "@tabler/icons-svelte/icons/car";
  import { imageSrc } from "$lib/api/images";
  // A car's in-game picture, cropped to its box (`object-fit: cover`). It
  // fades in once loaded (no fade with reduced motion: app.css turns
  // transitions off). Without a picture, while one loads, or when it fails
  // to load, a graphite tile with a car icon stands in: never a broken image.
  let {
    path,
    alt,
    ratio = "1 / 1",
    width = "100%",
    icon = 20,
    radius = "var(--radius-row)",
  }: {
    /** From `carImagePath`; `null` shows the tile. */
    path: string | null;
    /** The car's name. */
    alt: string;
    /** Box shape, as CSS `aspect-ratio`. */
    ratio?: string;
    width?: string;
    icon?: number;
    radius?: string;
  } = $props();

  let src = $derived(imageSrc(path));
  let loaded = $state(false);
  let failed = $state(false);

  // A new picture starts over: hidden until it loads.
  $effect.pre(() => {
    void src;
    loaded = false;
    failed = false;
  });
</script>

<span class="box" style="width: {width}; aspect-ratio: {ratio}; border-radius: {radius}">
  {#if !src || failed || !loaded}
    <span class="tile" aria-hidden="true"><IconCar size={icon} stroke={1.6} /></span>
  {/if}
  {#if src && !failed}
    <img
      {src}
      {alt}
      class:loaded
      decoding="async"
      draggable="false"
      onload={() => (loaded = true)}
      onerror={() => (failed = true)}
    />
  {/if}
</span>

<style>
  .box {
    position: relative;
    flex: 0 0 auto;
    display: block;
    overflow: hidden;
    background: var(--graphite-raised);
  }
  .tile {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-soft);
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* The game frames each car a little below the middle of its square
       picture; this keeps the wheels in a wide crop. */
    object-position: 50% 58%;
    opacity: 0;
    transition: opacity var(--motion-slow) var(--ease-out);
  }
  img.loaded {
    opacity: 1;
  }
</style>
