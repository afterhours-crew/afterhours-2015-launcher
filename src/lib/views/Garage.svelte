<script lang="ts">
  import Clock from "$lib/components/Clock.svelte";
  import ComingLater from "$lib/components/ComingLater.svelte";
  // Garage home: the floor holds the clock. Quick tune, messages and the
  // last-driven car arrive with the screens track.
</script>

<main>
  <div class="floor">
    <Clock />
  </div>
  <aside>
    <ComingLater title="Garage" track="Track 2 · screens, from the Garage home design">
      <p>Tonight's setup, quick tune and messages from your server will live here.</p>
      <p>Play works now: it starts your local server and the game.</p>
    </ComingLater>
  </aside>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-6);
    min-height: 0;
    overflow: auto;
  }
  .floor {
    flex: 999 1 480px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  aside {
    flex: 1 1 320px;
    max-width: 380px;
    align-self: flex-start;
  }
</style>
