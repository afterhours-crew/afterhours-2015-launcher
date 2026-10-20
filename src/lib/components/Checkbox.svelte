<script lang="ts">
  // A checkbox in the switch's green. A real checkbox input stays underneath,
  // visually hidden, so a wrapping <label>, the keyboard (Space) and screen
  // readers work as usual. Checking fills the box and draws the tick in;
  // unchecking erases the tick and empties the box. The box gives a small
  // press on click. With reduced motion (app.css) it changes at once.
  let {
    checked = $bindable(false),
    disabled = false,
    label,
    onchange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    /** Accessible name when no wrapping <label> gives one. */
    label?: string;
    onchange?: (checked: boolean) => void;
  } = $props();
</script>

<span class="checkbox" class:on={checked} class:disabled>
  <input
    type="checkbox"
    bind:checked
    {disabled}
    aria-label={label}
    onchange={(e) => onchange?.(e.currentTarget.checked)}
  />
  <span class="box" aria-hidden="true">
    <svg viewBox="0 0 20 20" width="20" height="20">
      <path d="M5.5 10.5 8.6 13.6 14.6 6.8" pathLength="1" />
    </svg>
  </span>
</span>

<style>
  .checkbox {
    position: relative;
    flex: 0 0 auto;
    display: inline-flex;
    width: 22px;
    height: 22px;
  }
  /* Hidden but still focusable and clickable through its label. */
  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .disabled input {
    cursor: default;
  }
  .box {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-thumb);
    border: 1.5px solid var(--graphite-outline);
    background: var(--graphite-raised);
    pointer-events: none;
    transition:
      background-color var(--motion-base) var(--ease-out),
      border-color var(--motion-base) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }
  .checkbox:hover:not(.disabled) .box {
    border-color: var(--ink-faint);
  }
  .on .box,
  .checkbox.on:hover .box {
    border-color: transparent;
    background: var(--crew);
  }
  .checkbox:active:not(.disabled) .box {
    transform: scale(0.88);
  }
  input:focus-visible + .box {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .disabled .box {
    opacity: 0.5;
  }
  /* The tick draws in after the fill starts and erases at once. */
  path {
    fill: none;
    stroke: var(--on-ink);
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    transition: stroke-dashoffset var(--motion-fast) var(--ease-out);
  }
  .on path {
    stroke-dashoffset: 0;
    transition: stroke-dashoffset var(--motion-slow) var(--ease-out) 60ms;
  }
</style>
