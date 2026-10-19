<script lang="ts">
  import { untrack } from "svelte";
  import type { OutputLine } from "$lib/api/types";
  import { slideUp } from "$lib/motion";
  import { START, arrived, interrupt, jump, scrolled, type Follow } from "$lib/state/follow";
  import { formatCount } from "$lib/state/format";
  import { reducedMotion } from "$lib/state/motion";

  // A live log that scrolls inside itself. It follows the newest line until
  // the reader scrolls up; then it holds their place while lines arrive and
  // offers "Jump to latest" with how many are new. The log is read, not
  // navigated, so it is not glass.
  let {
    lines,
    received = lines.length,
    empty,
    title = "Log",
    onOpenFolder,
  }: {
    /** The newest lines; the session keeps a bounded number. */
    lines: OutputLine[];
    /** Every line received so far, trimmed ones included: counts arrivals past the bound. */
    received?: number;
    empty: string;
    title?: string;
    onOpenFolder?: () => void;
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

  const colors: Record<string, string> = {
    preparing: "var(--speed)",
    starting: "var(--speed)",
    activation: "var(--build)",
    ready: "var(--crew)",
    stopping: "var(--build)",
    finished: "var(--crew)",
    failed: "var(--build)",
  };
</script>

<section class="log" aria-label={title}>
  <div class="head">
    <h2 class="t-label">{title}</h2>
    {#if onOpenFolder}<button type="button" class="t-data-small link" onclick={onOpenFolder}
        >Open folder</button
      >{/if}
  </div>
  <div class="lines" bind:this={element} {onscroll} {onwheel}>
    {#if lines.length === 0}
      <span class="empty">{empty}</span>
    {/if}
    {#each lines as line, i (first + i)}
      {#if line.kind === "status"}
        <div>
          <span style="color: {colors[line.state] ?? 'var(--ink-muted)'}">{line.time}</span>
          {line.state} · {line.message}
        </div>
      {:else}
        <div class="text">{line.text}</div>
      {/if}
    {/each}
  </div>
  {#if !follow.following}
    <button type="button" class="latest" transition:slideUp onclick={toLatest}>
      Jump to latest
      {#if follow.unseen > 0}<span class="new">{formatCount(follow.unseen)} new</span>{/if}
    </button>
  {/if}
</section>

<style>
  .log {
    position: relative;
    flex: 1 1 auto;
    min-height: 160px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    border-radius: var(--radius-panel);
    background: var(--log);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  h2 {
    margin: 0;
    color: var(--ink-muted);
  }
  .link {
    color: var(--ink-muted);
    text-decoration: underline;
  }
  .lines {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    overflow-anchor: auto;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 11.5px;
    line-height: 1.8;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--ink-muted);
    user-select: text;
    -webkit-user-select: text;
  }
  .text {
    color: var(--ink-faint);
  }
  .empty {
    color: var(--ink-faint);
  }
  .latest {
    position: absolute;
    left: 50%;
    bottom: 16px;
    translate: -50% 0;
    min-height: var(--control-height);
    padding: 0 16px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: var(--radius-pill);
    background: var(--ink);
    color: var(--on-ink);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    box-shadow: var(--shadow-glass);
  }
  .new {
    padding: 0 8px;
    border-radius: var(--radius-pill);
    background: rgba(18, 16, 21, 0.12);
    font-variant-numeric: tabular-nums;
    text-transform: none;
    letter-spacing: 0;
  }
</style>
