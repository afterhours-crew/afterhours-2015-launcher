<script lang="ts">
  import IconChevronDown from "@tabler/icons-svelte/icons/chevron-down";
  import type { Snippet } from "svelte";
  import { slide } from "svelte/transition";
  import type { Glyph as Icon } from "./glyph";
  import { MOTION, reducedMotion } from "$lib/state/motion";
  // A rarely used section behind one row: SpeedList, more log sources, raw
  // save tables. Closed, it is a single line with a short summary.
  let {
    label,
    summary = null,
    icon: Glyph,
    open = $bindable(false),
    children,
  }: {
    label: string;
    /** After the label in the secondary grey, e.g. "no races yet". */
    summary?: string | null;
    icon?: Icon;
    open?: boolean;
    children: Snippet;
  } = $props();
  const id = `more-${Math.random().toString(36).slice(2, 10)}`;
</script>

<div class="more">
  <button type="button" aria-expanded={open} aria-controls={id} onclick={() => (open = !open)}>
    <span class="label">
      {#if Glyph}<Glyph size={20} stroke={1.6} aria-hidden="true" />{/if}
      <span
        >{label}{#if summary}<span class="summary"> · {summary}</span>{/if}</span
      >
    </span>
    <span class="chevron" class:open
      ><IconChevronDown size={18} stroke={1.6} aria-hidden="true" /></span
    >
  </button>
  {#if open}
    <div {id} class="body" transition:slide={{ duration: reducedMotion() ? 0 : MOTION.base }}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .more {
    border-top: 1px solid var(--graphite-edge);
    padding-top: 6px;
  }
  button {
    width: 100%;
    min-height: 48px;
    padding: 0 6px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-radius: var(--radius-row);
    text-align: left;
    font: 600 16px/1.4 var(--font-ui);
  }
  button:hover {
    background: var(--row-hover);
  }
  .label {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .label :global(svg) {
    flex: 0 0 auto;
    color: var(--ink-soft);
  }
  .summary {
    font-weight: 400;
    font-size: 14px;
    color: var(--ink-soft);
  }
  .chevron {
    display: inline-flex;
    color: var(--ink-soft);
    transition: transform var(--motion-base) var(--ease-out);
  }
  .chevron.open {
    transform: rotate(180deg);
  }
  .body {
    padding-top: 8px;
  }
</style>
