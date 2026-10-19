<script lang="ts">
  import type { Snippet } from "svelte";
  import Glass from "./Glass.svelte";
  // A screen whose server capability or design is not built yet. Says what
  // will be here and what it waits on, never shows sample data as real.
  let {
    title,
    track,
    chip = "Coming later",
    children,
  }: { title: string; track: string; chip?: string; children: Snippet } = $props();
</script>

<Glass dense radius="phone" label={title} class="coming-later">
  <div class="head">
    <h1 class="t-view-title">{title}</h1>
    <span class="chip">{chip}</span>
  </div>
  <div class="body">{@render children()}</div>
  <span class="t-data-small track">{track}</span>
</Glass>

<style>
  :global(.coming-later) {
    width: 100%;
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 22px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
  }
  h1 {
    margin: 0;
  }
  .chip {
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    background: var(--field);
    color: var(--ink-muted);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .body {
    color: var(--ink-soft);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .body :global(p) {
    margin: 0;
  }
  .track {
    color: var(--ink-muted);
  }
</style>
