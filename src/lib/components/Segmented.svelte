<script lang="ts" generics="T extends string">
  // Pick one of two to four options. Real radio buttons in a group, so the
  // arrow keys move between them; 38px targets.
  let {
    options,
    value = $bindable(null),
    label,
    disabled = false,
    onchange,
  }: {
    options: readonly { value: T; label: string }[];
    /** `null` checks nothing: the current value is not known. */
    value: T | null;
    label: string;
    disabled?: boolean;
    onchange?: (value: T) => void;
  } = $props();

  function pick(next: T) {
    if (disabled || next === value) return;
    value = next;
    onchange?.(next);
  }

  function key(event: KeyboardEvent, index: number) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length];
    if (!next) return;
    pick(next.value);
    const group = (event.currentTarget as HTMLElement).parentElement;
    group?.querySelectorAll<HTMLButtonElement>("button")[options.indexOf(next)]?.focus();
  }
</script>

<div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} class="seg">
  {#each options as option, i (option.value)}
    <button
      type="button"
      role="radio"
      aria-checked={option.value === value}
      tabindex={option.value === value || (value === null && i === 0) ? 0 : -1}
      {disabled}
      onclick={() => pick(option.value)}
      onkeydown={(e) => key(e, i)}>{option.label}</button
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
    background: var(--field);
  }
  button {
    min-height: var(--control-height);
    padding: 0 16px;
    border-radius: var(--radius-pill);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
  }
  button:hover:not(:disabled):not([aria-checked="true"]) {
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
  button[aria-checked="true"]:disabled {
    background: rgba(244, 240, 234, 0.4);
    color: var(--on-ink);
  }
</style>
