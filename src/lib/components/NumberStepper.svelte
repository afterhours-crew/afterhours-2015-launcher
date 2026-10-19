<script lang="ts">
  import { untrack } from "svelte";
  import IconMinus from "@tabler/icons-svelte/icons/minus";
  import IconPlus from "@tabler/icons-svelte/icons/plus";
  import { stepValue, typedValue } from "$lib/state/stepper";
  // A whole number from `min` to `max` with − and + either side, in the
  // segmented control's graphite pill. Type a number, click the buttons or
  // use the arrow keys. A change is committed a moment after the last click,
  // on Enter, or when the field loses focus, so a few quick clicks save
  // once. `null` shows the placeholder (such as Auto) until a number is
  // picked.
  let {
    value,
    min = 0,
    max,
    label,
    placeholder = "",
    disabled = false,
    oncommit,
  }: {
    value: number | null;
    min?: number;
    max: number;
    label: string;
    placeholder?: string;
    disabled?: boolean;
    oncommit: (value: number) => void;
  } = $props();

  const PAUSE_MS = 450;
  let draft = $state(untrack(() => (value === null ? "" : String(value))));
  let pending = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Follow the saved value, except while a change is on its way.
  $effect.pre(() => {
    const next = value === null ? "" : String(value);
    if (!untrack(() => pending)) draft = next;
  });

  let number = $derived(typedValue(draft));

  function step(delta: number) {
    if (disabled) return;
    draft = String(stepValue(number, delta, min, max));
    pending = true;
    clearTimeout(timer);
    timer = setTimeout(commit, PAUSE_MS);
  }

  function commit() {
    clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    pending = false;
    if (number === null) {
      draft = value === null ? "" : String(value);
      return;
    }
    const next = Math.min(max, Math.max(min, number));
    draft = String(next);
    if (next !== value) oncommit(next);
  }

  function key(event: KeyboardEvent) {
    if (event.key === "ArrowUp") step(1);
    else if (event.key === "ArrowDown") step(-1);
    else if (event.key === "Enter") commit();
    else return;
    event.preventDefault();
  }
</script>

<div class="stepper" class:disabled>
  <button
    type="button"
    aria-label="Fewer"
    disabled={disabled || (number !== null && number <= min)}
    onclick={() => step(-1)}><IconMinus size={16} stroke={2} aria-hidden="true" /></button
  >
  <input
    type="text"
    inputmode="numeric"
    role="spinbutton"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={number ?? undefined}
    aria-valuetext={number === null ? placeholder : String(number)}
    maxlength={String(max).length}
    {placeholder}
    {disabled}
    value={draft}
    oninput={(e) => {
      draft = e.currentTarget.value.replace(/\D/g, "");
      e.currentTarget.value = draft;
      pending = true;
    }}
    onkeydown={key}
    onblur={commit}
  />
  <button
    type="button"
    aria-label="More"
    disabled={disabled || (number !== null && number >= max)}
    onclick={() => step(1)}><IconPlus size={16} stroke={2} aria-hidden="true" /></button
  >
</div>

<style>
  .stepper {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--graphite-raised);
  }
  button {
    width: var(--control-height);
    height: var(--control-height);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--ink);
  }
  button:hover:not(:disabled) {
    background: var(--hover);
  }
  button:active:not(:disabled) {
    transform: scale(0.94);
  }
  button:disabled {
    cursor: default;
    color: var(--ink-faint);
  }
  input {
    width: 64px;
    height: var(--control-height);
    padding: 0 8px;
    border: 1px solid var(--graphite-edge);
    border-radius: var(--radius-pill);
    background: var(--graphite);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  input::placeholder {
    color: var(--ink-soft);
    font-weight: 600;
  }
  input:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .disabled input {
    color: var(--ink-faint);
  }
</style>
