<script lang="ts">
  // The one orange button. Its Starting state owns the only spinner in the app.
  let {
    label,
    disabled = false,
    busy = false,
    onclick,
  }: { label: string; disabled?: boolean; busy?: boolean; onclick: () => void } = $props();
  let long = $derived(label.length > 6);
</script>

<button type="button" class="play" class:long {disabled} aria-busy={busy} {onclick}>
  {#if busy}
    <span class="spinner" aria-hidden="true"></span>
  {:else}
    <svg width="16" height="18" viewBox="0 0 18 20" aria-hidden="true">
      <path d="M2 1.5 L16.5 10 L2 18.5 Z" fill="currentColor"></path>
    </svg>
  {/if}
  <span>{label}</span>
</button>

<style>
  .play {
    min-width: var(--play-min-width);
    height: var(--play-height);
    padding: 0 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border-radius: var(--radius-play);
    background: var(--play);
    color: var(--on-ink);
    font-family: var(--font-ui);
    font-weight: 700;
    font-size: 22px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-shadow: none;
    transition: filter 160ms ease-out;
  }
  .play.long {
    font-size: 18px;
  }
  .play:hover:not(:disabled) {
    filter: brightness(1.06);
  }
  .play:disabled {
    background: var(--field);
    color: var(--ink-faint);
    cursor: default;
  }
  .play[aria-busy="true"] {
    background: var(--glass-solid);
    color: var(--ink);
  }
  .spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2.5px solid rgba(244, 240, 234, 0.25);
    border-top-color: var(--ink);
    animation: spin 900ms linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
