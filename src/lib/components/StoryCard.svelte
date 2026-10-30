<script lang="ts">
  import IconArchive from "@tabler/icons-svelte/icons/archive";
  import IconFlag3 from "@tabler/icons-svelte/icons/flag-3";
  import IconMap2 from "@tabler/icons-svelte/icons/map-2";
  import Glass from "$lib/components/Glass.svelte";
  import PanelHeading from "$lib/components/PanelHeading.svelte";
  import Upcoming from "$lib/components/Upcoming.svelte";
  import { current, records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";
  import { storySummary } from "$lib/state/story";
  import { followStory } from "$lib/state/story-follow.svelte";

  // Profile overview (canvas K6): the story in two lines, the prologue and
  // the main story, with a way into Profile › Story.
  followStory();
  let story = $derived(current(records.story));
  let summary = $derived(story ? storySummary(story) : null);
  let prologue = $derived.by(() => {
    if (!summary) return null;
    if (!summary.complete)
      return summary.started
        ? `${summary.done} of ${summary.total} done · next: ${summary.next}`
        : "Not started";
    if (summary.how === "set") return "Complete · set in launcher";
    if (summary.how === "kept") return "Complete · from an older save";
    return "Complete · played";
  });
</script>

{#if summary}
  <Glass radius="panel" label="Story" class="panel">
    <PanelHeading icon={IconFlag3}>
      Story
      {#snippet aside()}<button
          type="button"
          class="link"
          onclick={() => router.go("profile", "story")}>Open story</button
        >{/snippet}
    </PanelHeading>
    <div class="rows">
      <div class="list-row">
        {#if summary.how === "kept"}<IconArchive
            size={20}
            stroke={1.6}
            aria-hidden="true"
            class="row-icon"
          />{:else}<IconFlag3 size={20} stroke={1.6} aria-hidden="true" class="row-icon" />{/if}
        <span class="grow">Prologue</span>
        <span class="t-caption state"
          ><span
            class="dot"
            style="background: {summary.complete || summary.started
              ? 'var(--status-ready)'
              : 'var(--status-info)'}"
            aria-hidden="true"
          ></span>{prologue}</span
        >
      </div>
      <div class="list-row">
        <IconMap2 size={20} stroke={1.6} aria-hidden="true" class="row-icon" />
        <span class="grow">Main story</span>
        {#if summary.complete}
          <span class="t-caption state">Open in the game <Upcoming compact /></span>
        {:else}
          <span class="t-caption">Opens after the prologue</span>
        {/if}
      </div>
    </div>
  </Glass>
{/if}

<style>
  .rows :global(.row-icon) {
    flex: 0 0 auto;
    color: var(--ink-soft);
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .link {
    min-height: 38px;
    padding: 0 6px;
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
