<script lang="ts" generics="T extends string">
  import { slidingIndicator } from "$lib/motion";
  import Upcoming from "./Upcoming.svelte";
  import { UPCOMING } from "$lib/state/upcoming";
  // Pick one of a few options. Real radio buttons in a group, so the arrow
  // keys move between them; 38px targets. An `upcoming` option stays in
  // view with the clock mark but cannot be picked, and the arrow keys skip
  // it.
  let {
    options,
    value = $bindable(null),
    label,
    disabled = false,
    onchange,
  }: {
    options: readonly { value: T; label: string; upcoming?: boolean }[];
    /** `null` checks nothing: the current value is not known. */
    value: T | null;
    label: string;
    disabled?: boolean;
    onchange?: (value: T) => void;
  } = $props();

  let pickable = $derived(options.filter((o) => !o.upcoming));

  function pick(next: T) {
    if (disabled || next === value) return;
    if (options.find((o) => o.value === next)?.upcoming) return;
    value = next;
    onchange?.(next);
  }

  function key(event: KeyboardEvent, current: T) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0 || pickable.length === 0) return;
    event.preventDefault();
    const at = pickable.findIndex((o) => o.value === current);
    const next = pickable[(at + step + pickable.length) % pickable.length];
    if (!next) return;
    pick(next.value);
    const group = (event.currentTarget as HTMLElement).parentElement;
    group?.querySelectorAll<HTMLButtonElement>("button")[options.indexOf(next)]?.focus();
  }
</script>

<div
  role="radiogroup"
  aria-label={label}
  aria-disabled={disabled || undefined}
  class="seg slider"
  use:slidingIndicator={{ selector: '[aria-checked="true"]' }}
>
  {#each options as option (option.value)}
    <button
      type="button"
      role="radio"
      aria-checked={option.value === value}
      aria-label={option.upcoming ? `${option.label}, ${UPCOMING.toLowerCase()}` : undefined}
      title={option.upcoming ? UPCOMING : undefined}
      class:upcoming={option.upcoming}
      tabindex={option.value === value || (value === null && option === pickable[0]) ? 0 : -1}
      {disabled}
      aria-disabled={option.upcoming || undefined}
      onclick={() => pick(option.value)}
      onkeydown={(e) => key(e, option.value)}
      >{option.label}{#if option.upcoming}<Upcoming compact />{/if}</button
    >
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--graphite-raised);
  }
  button {
    min-height: var(--control-height);
    padding: 0 14px;
    border-radius: var(--radius-pill);
    font-weight: 600;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  button:hover:not(:disabled):not(.upcoming):not([aria-checked="true"]) {
    background: var(--hover);
  }
  button[aria-checked="true"] {
    background: var(--ink);
    color: var(--on-ink);
  }
  button:disabled {
    cursor: default;
    color: var(--ink-faint);
  }
  /* Shown, hoverable for its tooltip, never picked. */
  button.upcoming {
    cursor: help;
    color: var(--ink-faint);
  }
  button[aria-checked="true"]:disabled {
    background: var(--ink-faint);
    color: var(--on-ink);
  }
</style>
