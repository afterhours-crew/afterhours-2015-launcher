<script lang="ts">
  import IconClockHour4 from "@tabler/icons-svelte/icons/clock-hour-4";
  import type { Snippet } from "svelte";
  import { UPCOMING } from "$lib/state/upcoming";
  // The one "coming" note a view gives: on a view whose main content is not
  // here yet, or at the end of one with several upcoming items. It always
  // reads "Coming in a future update" in the upcoming violet with a clock,
  // like the Upcoming pill, then says what is coming as a short noun phrase.
  let { children }: { children: Snippet } = $props();
</script>

<div class="note" role="note">
  <span class="head">
    <IconClockHour4 size={18} stroke={1.8} aria-hidden="true" />
    <span>{UPCOMING}</span>
  </span>
  <span class="text">{@render children()}</span>
</div>

<style>
  .note {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 18px;
    border-radius: var(--radius-panel);
    background: var(--graphite);
    border: 1px solid var(--upcoming-edge);
    box-shadow: var(--shadow-panel);
  }
  .head {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--upcoming-ink);
    font-size: 14px;
    font-weight: 700;
  }
  .text {
    font-size: 16px;
    line-height: 1.5;
    max-width: 65ch;
  }
</style>
