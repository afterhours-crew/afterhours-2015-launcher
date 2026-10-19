<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import IconMap from "@tabler/icons-svelte/icons/map";
  import ViewNote from "$lib/components/ViewNote.svelte";
  import { hasCapability } from "$lib/state/capabilities";
  import { session } from "$lib/state/session.svelte";

  // The live map waits for the server's `map` capability (track 7). Until
  // the screen is built, the view is its title and one note.
  let ready = $derived(hasCapability(session.info?.server, "map"));
</script>

<main use:staggerIn>
  <div class="column">
    <span class="title" data-enter>
      <h1 class="t-view-title">Map</h1>
      <span class="t-caption">Ventura Bay as your server sees it: you, traffic and rivals.</span>
    </span>
    <div data-enter>
      <ViewNote icon={IconMap}>
        {ready
          ? "Your server reports the live map. This launcher shows it in a later update."
          : "The live map arrives with a later server update."}
      </ViewNote>
    </div>
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
  .title {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  h1 {
    margin: 0;
  }
</style>
