<script lang="ts">
  // The one orange button. Its Starting state owns the only spinner in the app.
  // `title` is a tooltip for a press whose effect needs saying, such as a
  // restart of the running server.
  let {
    label,
    disabled = false,
    busy = false,
    title = null,
    onclick,
  }: {
    label: string;
    disabled?: boolean;
    busy?: boolean;
    title?: string | null;
    onclick: () => void;
  } = $props();
  let long = $derived(label.length > 6);
</script>

<button
  type="button"
  class="play"
  class:long
  {disabled}
  aria-busy={busy}
  title={title ?? undefined}
  {onclick}
>
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
    letter-spacing: 0.02em;
    text-shadow: none;
  }
  .play.long {
    font-size: 18px;
  }
  .play:hover:not(:disabled) {
    filter: brightness(1.06);
  }
  .play:disabled {
    background: var(--graphite);
    color: var(--ink-faint);
    cursor: default;
  }
  .play[aria-busy="true"] {
    background: var(--graphite);
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
