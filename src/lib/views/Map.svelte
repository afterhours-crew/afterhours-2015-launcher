<script lang="ts">
  import { untrack } from "svelte";
  import { staggerIn } from "$lib/motion";
  import Glass from "$lib/components/Glass.svelte";
  import MapCanvas from "$lib/components/MapCanvas.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import ViewNote from "$lib/components/ViewNote.svelte";
  import { featureReady } from "$lib/state/capabilities";
  import { current, records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";

  // Map (track 7): the game's own world map, decoded from the player's
  // installation by the server's `map-images` the first time the view opens.
  // Live positions of you, traffic and rivals need the server's position
  // feed, which is still to come; until then the layers list says so.
  let ready = $derived(featureReady(session.info?.server, "map"));
  let map = $derived(current(records.map));
  let load = $derived(records.map);
  let noContent = $derived(load.kind === "error" && load.exit === 4);
  let across = $derived(
    map?.world ? Math.round((map.world.max_x - map.world.min_x) / 100) / 10 : null,
  );

  $effect(() => {
    if (ready) untrack(() => void records.loadMap());
  });

  const LAYERS = [
    { name: "You", hint: "Where you are and which way you face" },
    { name: "Traffic", hint: "Every traffic car around you" },
    { name: "Rivals", hint: "Roaming rivals" },
    { name: "Spawn ring", hint: "Where traffic appears and clears" },
  ];
</script>

{#if !ready}
  <main class="waiting" use:staggerIn>
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
{:else}
  <main use:staggerIn>
    <span class="title" data-enter>
      <h1 class="t-view-title">Map</h1>
      <span class="t-caption">Ventura Bay, drawn from your game.</span>
    </span>

    <div class="body">
      <div class="panel" data-enter>
        <Glass label="Map of Ventura Bay" class="map-panel">
          {#if map}
            <MapCanvas report={map} />
          {:else if load.kind === "error"}
            <div class="state">
              {#if noContent}
                <p>The map is read from your game when your server first gets ready.</p>
                <p class="t-caption">Start your server once on Host, then come back.</p>
                <div class="actions">
                  <PillButton variant="solid" onclick={() => router.go("host")}
                    >Open Host</PillButton
                  >
                  <PillButton onclick={() => void records.loadMap()}>Try again</PillButton>
                </div>
              {:else}
                <p>The map could not be read from your game.</p>
                <p class="t-caption reason">{load.message}</p>
                <div class="actions">
                  <PillButton onclick={() => void records.loadMap()}>Try again</PillButton>
                </div>
              {/if}
            </div>
          {:else}
            <div class="state" role="status">
              <p>Preparing the map from your game…</p>
              <p class="t-caption">The first time takes about ten seconds.</p>
            </div>
          {/if}
        </Glass>
      </div>

      <aside data-enter>
        <Glass radius="phone" label="Map layers" class="side">
          <h2 class="t-panel-title">Layers</h2>
          <div class="rows">
            {#each LAYERS as layer (layer.name)}
              <div class="list-row">
                <span class="grow">
                  <span class="name">{layer.name}</span>
                  <span class="t-caption">{layer.hint}</span>
                </span>
              </div>
            {/each}
          </div>
          <ViewNote>Live positions of you, traffic and rivals.</ViewNote>
          {#if map}
            <p class="t-caption about">
              The game's own map{#if across}, {across} km across{/if}, read from your installation.
              {#if map.missing.length > 0}
                {map.missing.length}
                {map.missing.length === 1 ? "tile" : "tiles"} could not be read.
              {/if}
            </p>
          {/if}
        </Glass>
      </aside>
    </div>
  </main>
{/if}

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }
  /* The title and the map with its side panel share one centred width. */
  main > :global(*) {
    width: 100%;
    max-width: var(--page-wide);
    margin-inline: auto;
  }
  main.waiting {
    padding-top: 28px;
  }
  main.waiting > .column {
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
  .body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
  }
  .panel {
    flex: 999 1 560px;
    min-width: 0;
    min-height: 360px;
    display: flex;
  }
  .panel :global(.map-panel) {
    flex: 1 1 auto;
    min-height: 0;
    padding: 8px;
    display: flex;
  }
  .state {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: var(--space-6);
    text-align: center;
  }
  .state p {
    margin: 0;
  }
  .reason {
    max-width: 520px;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    gap: 10px;
    margin-top: 14px;
  }
  aside {
    flex: 1 1 280px;
    max-width: 320px;
    align-self: flex-start;
  }
  aside :global(.side) {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h2 {
    margin: 0;
  }
  .grow {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-weight: 600;
  }
  .about {
    margin: 0;
  }
</style>
