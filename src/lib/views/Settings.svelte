<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import { router } from "$lib/state/router.svelte";
  import General from "./settings/General.svelte";
  import Support from "./settings/Support.svelte";
  import Updates from "./settings/Updates.svelte";

  // Settings (H9), one column: game and data, then updates, with the build
  // details behind Show more. `#/settings/updates` and `#/settings/about`
  // still work: they scroll to Updates, and About opens its details.
  let section = $derived(router.route.section ?? "general");
  let updates: HTMLElement | undefined = $state();

  $effect(() => {
    if (section !== "general") updates?.scrollIntoView({ block: "start" });
  });
</script>

<main use:staggerIn>
  <div class="column">
    <h1 class="t-view-title" data-enter>Settings</h1>
    <div data-enter><General /></div>
    <div data-enter bind:this={updates}><Updates aboutOpen={section === "about"} /></div>
    <div data-enter><Support /></div>
    <p class="t-caption legal" data-enter>
      Community preservation project. Not affiliated with Electronic Arts or Ghost Games. The
      launcher is MPL-2.0; the server's license and notices are installed beside it.
    </p>
  </div>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 28px var(--space-6) var(--space-6);
    display: flex;
    justify-content: center;
  }
  .column {
    width: 100%;
    max-width: 720px;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  h1 {
    margin: 0;
  }
  .column :global(.rows-panel) {
    padding: 8px 24px;
  }
  .legal {
    margin: 0;
    text-align: center;
  }
</style>
