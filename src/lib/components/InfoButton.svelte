<script lang="ts">
  import IconInfoCircle from "@tabler/icons-svelte/icons/info-circle";
  // Help behind an ⓘ instead of a sentence under every control. The
  // tooltip shows while the button is hovered or focused (CSS, so it does
  // not depend on event timing), Escape hides it until the pointer or focus
  // leaves, and the button's description is the same text, so a screen
  // reader reads it too.
  let { label, text, size = 18 }: { label: string; text: string; size?: number } = $props();
  const id = `info-${Math.random().toString(36).slice(2, 10)}`;
  let closed = $state(false);
</script>

<span class="info" class:closed>
  <button
    type="button"
    aria-label={label}
    aria-describedby={id}
    onmouseleave={() => (closed = false)}
    onblur={() => (closed = false)}
    onkeydown={(e) => {
      if (e.key === "Escape") closed = true;
    }}
  >
    <IconInfoCircle {size} stroke={1.6} aria-hidden="true" />
  </button>
  <span {id} role="tooltip" class="tip">{text}</span>
</span>

<style>
  .info {
    position: relative;
    display: inline-flex;
  }
  button {
    width: 38px;
    height: 38px;
    margin: -5px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--ink-soft);
    cursor: help;
  }
  button:hover {
    background: var(--hover);
    color: var(--ink);
  }
  .tip {
    position: absolute;
    z-index: 20;
    top: calc(100% + 8px);
    left: 50%;
    width: max-content;
    max-width: 280px;
    padding: 10px 12px;
    border-radius: var(--radius-row);
    background: var(--graphite-raised);
    border: 1px solid var(--graphite-ring);
    box-shadow: var(--shadow-panel);
    color: var(--ink);
    font: 400 14px/1.45 var(--font-ui);
    text-align: left;
    white-space: normal;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transform: translate(-50%, -2px);
    transition:
      opacity var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out),
      visibility 0s linear var(--motion-fast);
  }
  .info:hover .tip,
  .info:focus-within .tip {
    opacity: 1;
    visibility: visible;
    transform: translate(-50%, 0);
    transition:
      opacity var(--motion-fast) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }
  .info.closed .tip {
    opacity: 0;
    visibility: hidden;
  }
</style>
