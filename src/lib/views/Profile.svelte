<script lang="ts">
  import ComingLater from "$lib/components/ComingLater.svelte";
</script>

<main>
  <ComingLater title="Profile" track="Track 1a · profile --json, then track 2 · screens">
    <p>
      Your driver as your save records it: REP, bank, garage slots and stats, read from the account
      database without changing it.
    </p>
    <p>The server's read-only profile command exists; this screen is built on it next.</p>
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
