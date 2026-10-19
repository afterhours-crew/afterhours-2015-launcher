<script lang="ts">
  import type { Glyph as Icon } from "$lib/components/glyph";
  import type { Snippet } from "svelte";
  // A glass panel's title with its icon, drawn in ink. Colour is kept for
  // what it encodes (event types, status); a heading's icon is decoration.
  let {
    icon: Glyph,
    level = 2,
    children,
    aside,
  }: { icon?: Icon; level?: 2 | 3; children: Snippet; aside?: Snippet } = $props();
</script>

<div class="heading">
  {#if Glyph}<Glyph size={20} stroke={1.6} aria-hidden="true" class="glyph" />{/if}
  <svelte:element this={`h${level}`} class="t-panel-title">{@render children()}</svelte:element>
  {#if aside}<span class="aside">{@render aside()}</span>{/if}
</div>

<style>
  .heading {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .heading :global(.glyph) {
    flex: 0 0 auto;
    color: var(--ink);
  }
  .heading :global(h2),
  .heading :global(h3) {
    margin: 0;
  }
  .aside {
    margin-left: auto;
  }
</style>
