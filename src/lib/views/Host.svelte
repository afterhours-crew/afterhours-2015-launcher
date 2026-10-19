<script lang="ts">
  import ComingLater from "$lib/components/ComingLater.svelte";
</script>

<main>
  <ComingLater title="Local server" track="Track 2 · screens · LAN play needs server support">
    <p>
      Run the server without the game, see who is connected and how it listens. Today it listens on
      this PC only, for one driver.
    </p>
    <p>Play already starts the server with the game; the Logs screen shows its output.</p>
  </ComingLater>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: var(--space-5) var(--space-6);
    min-height: 0;
    overflow: auto;
  }
</style>
