<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import ViewNote from "$lib/components/ViewNote.svelte";
  import { featureReady } from "$lib/state/capabilities";
  import { session } from "$lib/state/session.svelte";
  import { worldNote } from "$lib/state/world";

  // World (H5), one column. Every setting here belongs to the server.
  // Traffic and roaming rivals wait for its `world-settings` capability and
  // a command to read and change them; cops wait for research. Until then
  // the controls are hidden and the view gives one note.
  let reported = $derived(featureReady(session.info?.server, "traffic"));
</script>

<main use:staggerIn>
  <div class="column">
    <span class="title" data-enter>
      <h1 class="t-view-title">World</h1>
      <span class="t-caption">Your server's city: traffic, rivals and cops.</span>
    </span>
    <div data-enter><ViewNote>{worldNote(reported)}</ViewNote></div>
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
