<script lang="ts">
  import type { HeaderPill, PlayAction } from "$lib/state/launchbar";
  // The launch bar's Play, compact, for the header of every view but the
  // Garage home. Blue when it can start, a graphite pill naming the session
  // while one is live (pressing it when ready stops), disabled with the
  // reason as its tooltip and accessible name.
  let {
    pill,
    onPlay,
    caption = true,
  }: {
    pill: HeaderPill;
    onPlay: (action: PlayAction) => void;
    /** Off where the view already shows the session state (Host). */
    caption?: boolean;
  } = $props();
  const dots = {
    ready: "var(--status-ready)",
    warn: "var(--status-warn)",
    info: "var(--status-info)",
  };
</script>

<div class="header-play">
  {#if caption && pill.caption}
    <span class="caption" title={pill.caption}>{pill.caption}</span>
  {/if}
  <button
    type="button"
    class="pill-play {pill.kind}"
    disabled={pill.disabled}
    title={pill.title}
    aria-label={pill.title}
    onclick={() => pill.action && onPlay(pill.action)}
  >
    {#if pill.kind === "live"}
      <span
        class="dot"
        style="background: {pill.dot ? dots[pill.dot] : 'var(--status-info)'}"
        aria-hidden="true"
      ></span>
    {:else}
      <svg width="11" height="12" viewBox="0 0 18 20" aria-hidden="true">
        <path d="M2 1.5 L16.5 10 L2 18.5 Z" fill="currentColor"></path>
      </svg>
    {/if}
    <span>{pill.label}</span>
  </button>
</div>

<style>
  .header-play {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .caption {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    color: var(--ink-soft);
    text-shadow: 0 1px 12px rgba(0, 0, 0, 0.7);
  }
  .pill-play {
    flex: 0 0 auto;
    height: var(--control-height);
    padding: 0 18px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: var(--radius-pill);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .play {
    background: var(--play);
    color: var(--on-ink);
  }
  .play:hover {
    filter: brightness(1.06);
  }
  .live {
    background: var(--graphite);
    color: var(--ink);
  }
  .live:hover:not(:disabled) {
    background: var(--hover);
  }
  .live:disabled {
    cursor: default;
  }
  .blocked {
    background: var(--graphite);
    color: var(--ink-faint);
    cursor: default;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
