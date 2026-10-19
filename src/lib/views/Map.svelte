<script lang="ts">
  import ComingLater from "$lib/components/ComingLater.svelte";
</script>

<main>
  <ComingLater title="Map" track="Track 7 · live map · waits for the current server milestone">
    <p>
      Ventura Bay as your server sees it: you, traffic and rivals moving, and what spawns or clears
      around you.
    </p>
    <p>
      It needs a read-only feed from the server and a road map built from your own installation;
      events and collectibles need content research first.
    </p>
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
