<script lang="ts">
  import ComingLater from "$lib/components/ComingLater.svelte";
</script>

<main>
  <ComingLater title="World" track="Track 3 · traffic density (server) · cops need research">
    <p>How your Ventura Bay feels tonight: traffic density and roaming rivals.</p>
    <p>
      Each setting will say when it takes effect: live, next launch, or coming later. Your server
      runs no police yet; cops need research before they can be offered.
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
