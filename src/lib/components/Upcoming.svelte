<script lang="ts">
  import IconClockHour4 from "@tabler/icons-svelte/icons/clock-hour-4";
  import { UPCOMING } from "$lib/state/upcoming";
  // The mark for something planned but not usable yet: violet, a clock and
  // the same words everywhere, never colour alone. `compact` is the clock
  // by itself, with the words as its name and tooltip, for tight places
  // such as a tab or a step.
  let { compact = false }: { compact?: boolean } = $props();
</script>

{#if compact}
  <span class="mark" role="img" aria-label={UPCOMING} title={UPCOMING}
    ><IconClockHour4 size={14} stroke={2} aria-hidden="true" /></span
  >
{:else}
  <span class="pill"
    ><IconClockHour4 size={14} stroke={2} aria-hidden="true" /><span>{UPCOMING}</span></span
  >
{/if}

<style>
  .pill {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--radius-pill);
    background: var(--upcoming-soft);
    border: 1px solid var(--upcoming-edge);
    color: var(--upcoming-ink);
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }
  .mark {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    color: var(--upcoming-ink);
  }
  .pill :global(svg),
  .mark :global(svg) {
    flex: 0 0 auto;
  }
</style>
