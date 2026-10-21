<script lang="ts">
  import IconCar from "@tabler/icons-svelte/icons/car";
  import { imageSrc } from "$lib/api/images";
  import { coverRect, parseRatio, type CarPicture } from "$lib/state/carimages";
  // A car's in-game picture, stretched back to its display aspect (the large
  // pictures are stored squeezed) and cropped to cover its box. It fades in
  // once loaded (no fade with reduced motion: app.css turns transitions off).
  // Without a picture, while one loads, or when it fails to load, a graphite
  // tile with a car icon stands in: never a broken image.
  let {
    picture,
    alt,
    ratio = "1 / 1",
    width = "100%",
    icon = 20,
    radius = "var(--radius-row)",
  }: {
    /** From `carPicture`; `null` shows the tile. */
    picture: CarPicture | null;
    /** The car's name. */
    alt: string;
    /** Box shape, as CSS `aspect-ratio`. */
    ratio?: string;
    width?: string;
    icon?: number;
    radius?: string;
  } = $props();

  let src = $derived(imageSrc(picture?.path ?? null, picture?.file ?? null));
  let rect = $derived(coverRect(picture?.aspect ?? 1, parseRatio(ratio)));
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
      style="left: {rect.left}%; top: {rect.top}%; width: {rect.width}%; height: {rect.height}%"
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
    max-width: none;
    /* The size and place come from coverRect; the picture fills them. */
    object-fit: fill;
    opacity: 0;
    transition: opacity var(--motion-slow) var(--ease-out);
  }
  img.loaded {
    opacity: 1;
  }
</style>
