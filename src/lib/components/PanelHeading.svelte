<script lang="ts">
  import type { Snippet } from "svelte";
  // A glass panel's title with its colored tile. Color says the kind of
  // thing (the category colors), never status.
  let {
    color = "var(--build)",
    level = 2,
    children,
    aside,
  }: { color?: string; level?: 2 | 3; children: Snippet; aside?: Snippet } = $props();
</script>

<div class="heading">
  <span class="tile" style="background: {color}" aria-hidden="true"></span>
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
  .tile {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    border-radius: 10px;
  }
  .heading :global(h2),
  .heading :global(h3) {
    margin: 0;
  }
  .aside {
    margin-left: auto;
  }
</style>
