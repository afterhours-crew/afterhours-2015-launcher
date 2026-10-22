<script lang="ts">
  // A bare on/off switch: a real switch button whose name comes from a
  // visible label elsewhere (`labelledby`) or from `label`.
  let {
    checked = $bindable(false),
    label,
    labelledby,
    disabled = false,
    onchange,
  }: {
    checked?: boolean;
    label?: string;
    labelledby?: string;
    disabled?: boolean;
    /** Told after a press, for a switch whose value is saved elsewhere. */
    onchange?: (checked: boolean) => void;
  } = $props();
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={labelledby ? undefined : label}
  aria-labelledby={labelledby}
  {disabled}
  class="track"
  class:on={checked}
  onclick={() => {
    checked = !checked;
    onchange?.(checked);
  }}
>
  <span class="knob"></span>
</button>

<style>
  .track {
    flex: 0 0 auto;
    width: 48px;
    height: 28px;
    padding: 3px;
    display: flex;
    border-radius: 14px;
    border: 1px solid var(--graphite-outline);
    background: var(--graphite-raised);
  }
  .track.on {
    border-color: transparent;
    background: var(--crew);
  }
  .track:disabled {
    cursor: default;
    opacity: 0.5;
  }
  /* The knob slides across rather than jumping. */
  .knob {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--ink-faint);
    transition:
      transform var(--motion-base) var(--ease-out),
      background-color var(--motion-base) var(--ease-out);
  }
  .on .knob {
    transform: translateX(20px);
    background: var(--on-ink);
  }
</style>
