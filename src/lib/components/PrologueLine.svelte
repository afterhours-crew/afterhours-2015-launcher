<script lang="ts">
  import IconFlag3 from "@tabler/icons-svelte/icons/flag-3";
  import { isLive } from "$lib/state/launchbar";
  import { staggerDelay } from "$lib/state/motion";
  import { current, records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";
  import { storySummary } from "$lib/state/story";
  import { followStory } from "$lib/state/story-follow.svelte";

  // Garage (canvas K5): while the prologue is under way, how far along it
  // is and what comes next. Nothing shows once it is complete, or for a
  // server without the story record. In a running game the done segments
  // are striped: the prologue keeps nothing until it is complete.
  followStory();
  let story = $derived(current(records.story));
  let summary = $derived(story ? storySummary(story) : null);
  let pending = $derived(isLive(session.status?.state) && session.status?.game_running === true);
</script>

{#if summary && !summary.complete}
  <div class="prologue">
    <div class="head">
      <IconFlag3 size={20} stroke={1.6} aria-hidden="true" class="glyph" />
      <h2 class="t-panel-title grow">Prologue</h2>
      <span class="t-data count">{summary.done} of {summary.total}</span>
    </div>
    <div
      class="segments"
      class:pending
      role="progressbar"
      aria-label="Prologue progress"
      aria-valuemin="0"
      aria-valuemax={summary.total}
      aria-valuenow={summary.done}
      aria-valuetext="{summary.done} of {summary.total} steps done"
    >
      {#each { length: summary.total } as _, i (i)}
        <span class="segment"
          ><span
            class="fill grow-x"
            class:on={i < summary.done}
            style="--grow-delay: {80 + staggerDelay(i, 40)}ms"
          ></span></span
        >
      {/each}
    </div>
    <div class="list-row">
      <span class="grow next">
        <span class="t-caption">{summary.started ? "Next" : "Starts with"}</span>
        <span class="t-body-strong">{summary.next}</span>
      </span>
      <button type="button" class="link" onclick={() => router.go("profile", "story")}
        >View story</button
      >
    </div>
  </div>
{/if}

<style>
  .prologue {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 14px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--graphite-edge);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .head :global(.glyph) {
    flex: 0 0 auto;
    color: var(--ink-soft);
  }
  h2 {
    margin: 0;
  }
  .grow {
    flex: 1 1 auto;
  }
  .count {
    color: var(--crew);
  }
  .segments {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .segment {
    position: relative;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--graphite-raised);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0;
    background: var(--crew);
    transform: scaleX(0);
  }
  .fill.on {
    transform: scaleX(1);
  }
  .pending .fill {
    background: repeating-linear-gradient(
      135deg,
      var(--crew) 0 4px,
      rgba(61, 214, 140, 0.45) 4px 8px
    );
  }
  .fill:not(.on) {
    animation: none;
  }
  .next {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .list-row {
    border-top: 0;
  }
  .link {
    min-height: 38px;
    padding: 0 6px;
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
