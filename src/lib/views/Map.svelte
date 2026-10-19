<script lang="ts">
  import ComingLater from "$lib/components/ComingLater.svelte";
  import { hasCapability } from "$lib/state/capabilities";
  import { session } from "$lib/state/session.svelte";

  // The live map waits for the server's `map` capability (track 7).
  let ready = $derived(hasCapability(session.info?.server, "map"));
</script>

<main>
  <ComingLater
    title="Map"
    track="Track 7 · live map · waits for the current server milestone"
    chip={ready ? "Server ready" : "Coming later"}
  >
    <p>
      Ventura Bay as your server sees it: you, traffic and rivals moving, and what spawns or clears
      around you.
    </p>
    {#if ready}
      <p>Your server reports the live map feed; this screen is built next.</p>
    {:else}
      <p>
        It needs a read-only feed from the server and a road map built from your own installation.
        Your server does not report it yet.
      </p>
    {/if}
  </ComingLater>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: var(--space-5) var(--space-6) var(--space-6);
    min-height: 0;
    overflow: auto;
  }
</style>
