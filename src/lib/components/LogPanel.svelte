<script lang="ts">
  import { untrack } from "svelte";
  import IconArrowDown from "@tabler/icons-svelte/icons/arrow-down";
  import IconTerminal2 from "@tabler/icons-svelte/icons/terminal-2";
  import type { OutputLine } from "$lib/api/types";
  import { slideUp } from "$lib/motion";
  import { START, arrived, interrupt, jump, scrolled, type Follow } from "$lib/state/follow";
  import { formatCount } from "$lib/state/format";
  import { consoleRow } from "$lib/state/logs";
  import { reducedMotion } from "$lib/state/motion";

  // A live log in a graphite panel that scrolls inside itself (H6). It
  // follows the newest line until the reader scrolls up; then it holds
  // their place while lines arrive and offers "Jump to latest" with how
  // many are new. Rows read like the log viewer's: time, level, message.
  let {
    lines,
    received = lines.length,
    empty,
    title = "Log",
  }: {
    /** The newest lines; the session keeps a bounded number. */
    lines: OutputLine[];
    /** Every line received so far, trimmed ones included: counts arrivals past the bound. */
    received?: number;
    empty: string;
    title?: string;
  } = $props();

  let element: HTMLDivElement | undefined = $state();
  let follow = $state<Follow>(START);
  let seen = 0;

  // Each line keeps its key while older ones are dropped from the top, so
  // the browser's scroll anchoring holds a paused reader's place.
  let first = $derived(received - lines.length);

  // Before new lines render, read where the reader actually is: a scroll
  // can land between frames, before its scroll event, and must not be
  // undone by following.
  $effect.pre(() => {
    void received;
    untrack(() => {
      if (element) follow = scrolled(follow, element);
    });
  });

  $effect(() => {
    const total = received;
    const added = total - seen;
    seen = total;
    // A new session cleared the console: follow it from the start.
    const next =
      added < 0
        ? START
        : arrived(
            untrack(() => follow),
            added,
          );
    follow = next;
    // Runs after the new lines are in the page, so the bottom is theirs.
    if (next.following && element) element.scrollTop = element.scrollHeight;
  });

  function onscroll() {
    if (element) follow = scrolled(follow, element);
  }

  function onwheel(event: WheelEvent) {
    if (event.deltaY < 0) follow = interrupt(follow);
  }

  function toLatest() {
    follow = jump(follow);
    element?.scrollTo({
      top: element.scrollHeight,
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }
</script>

<section class="log ah-glass" aria-label={title}>
  <div class="head">
    <IconTerminal2 size={20} stroke={1.6} aria-hidden="true" class="glyph" />
    <h2 class="t-panel-title">{title}</h2>
    {#if lines.length > 0}
      <span class="t-caption" aria-live="polite"
        >{follow.following ? "Following" : "Paused · you scrolled up"}</span
      >
    {/if}
  </div>
  <div class="lines" role="log" aria-label="{title} lines" bind:this={element} {onscroll} {onwheel}>
    {#if lines.length === 0}
      <p class="empty">{empty}</p>
    {/if}
    {#each lines as line, i (first + i)}
      {@const row = consoleRow(line)}
      <div class="row">
        <span class="soft">{row.time}</span>
        <span
          class:soft={!row.tone}
          class:warn={row.tone === "warn"}
          class:error={row.tone === "error"}
          >{#if row.tone}<span class="dot" aria-hidden="true"></span>{/if}{row.level}</span
        >
        <span class="message"
          >{row.message}{#if row.detail}<span class="soft detail">{row.detail}</span>{/if}</span
        >
      </div>
    {/each}
  </div>
  {#if !follow.following}
    <button type="button" class="latest" transition:slideUp onclick={toLatest}>
      <IconArrowDown size={14} stroke={2} aria-hidden="true" />
      Jump to latest{#if follow.unseen > 0}<span>· {formatCount(follow.unseen)} new</span>{/if}
    </button>
  {/if}
</section>

<style>
  .log {
    position: relative;
    flex: 1 1 auto;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-panel);
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--graphite-edge);
  }
  .head :global(.glyph) {
    flex: 0 0 auto;
    color: var(--ink-soft);
  }
  h2 {
    flex: 1 1 auto;
    margin: 0;
  }
  .lines {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    overflow-anchor: auto;
    padding: 8px 0 64px;
    font-size: 14px;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
    user-select: text;
    -webkit-user-select: text;
  }
  .row {
    display: grid;
    grid-template-columns: 70px 92px minmax(0, 1fr);
    gap: 14px;
    align-items: baseline;
    padding: 6px 18px;
  }
  .row + .row {
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }
  .message {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .detail {
    margin-left: 8px;
  }
  .soft {
    color: var(--ink-soft);
  }
  .warn {
    color: var(--warn-ink);
  }
  .error {
    color: var(--style);
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 8px;
    border-radius: 50%;
    background: currentColor;
  }
  .empty {
    margin: 0;
    padding: 10px 18px;
    color: var(--ink-soft);
  }
  .latest {
    position: absolute;
    left: 50%;
    bottom: 18px;
    translate: -50% 0;
    height: 38px;
    padding: 0 16px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: var(--radius-pill);
    background: var(--ink);
    color: var(--on-ink);
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  }
</style>
