<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import ViewNote from "$lib/components/ViewNote.svelte";

  // The live map (track 7) needs the server's `map` feed and this screen,
  // neither built yet. Until then the view is its title and the coming
  // note, and its tab carries the clock mark.
</script>

<main use:staggerIn>
  <div class="column">
    <span class="title" data-enter>
      <h1 class="t-view-title">Map</h1>
      <span class="t-caption">Ventura Bay as your server sees it: you, traffic and rivals.</span>
    </span>
    <div data-enter>
      <ViewNote>A live map of your server: where you, traffic and rivals are right now.</ViewNote>
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
