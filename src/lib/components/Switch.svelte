<script lang="ts">
  let {
    checked = $bindable(false),
    label,
    hint,
    disabled = false,
  }: { checked?: boolean; label: string; hint?: string; disabled?: boolean } = $props();
</script>

<div class="switch-row">
  <span class="text">
    <span>{label}</span>
    {#if hint}<span class="hint">{hint}</span>{/if}
  </span>
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    {disabled}
    class="track"
    class:on={checked}
    onclick={() => (checked = !checked)}
  >
    <span class="knob"></span>
  </button>
</div>

<style>
  .switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 46px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .text {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .hint {
    font-size: 13px;
    color: var(--ink-muted);
  }
  .track {
    flex: 0 0 auto;
    width: 48px;
    height: 28px;
    padding: 3px;
    display: flex;
    justify-content: flex-start;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: var(--field);
  }
  .track.on {
    border-color: rgba(255, 255, 255, 0);
    background: var(--crew);
  }
  .track:disabled {
    opacity: 0.5;
    cursor: default;
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
