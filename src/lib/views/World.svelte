<script lang="ts">
  import Glass from "$lib/components/Glass.svelte";
  import PanelHeading from "$lib/components/PanelHeading.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import Soon from "$lib/components/Soon.svelte";
  import { featureReady } from "$lib/state/capabilities";
  import { session } from "$lib/state/session.svelte";
  import { COP_OPTIONS, PRESETS, TRAFFIC_OPTIONS, worldWaits } from "$lib/state/world";

  // World (A3). Every setting here belongs to the server. Traffic, rivals
  // and presets wait for its `world-settings` capability and a command to
  // read and change them; no current value is shown until then. Cops wait
  // for research, garage slots for a server setting.
  let reported = $derived(featureReady(session.info?.server, "traffic"));
  let waits = $derived(worldWaits(reported));
</script>

<main>
  <div class="cards">
    <Glass dense radius="card" label="Traffic" class="card">
      <PanelHeading color="var(--crew)">
        Traffic
        {#snippet aside()}<Soon />{/snippet}
      </PanelHeading>
      <Segmented options={TRAFFIC_OPTIONS} value={null} label="Traffic density" disabled />
      <p class="caption">{waits}</p>
      <p class="t-data soft">Cars appear 300–450 m around you and clear out behind.</p>
    </Glass>

    <Glass dense radius="card" label="Cops" class="card">
      <PanelHeading color="var(--outlaw)">
        Cops
        {#snippet aside()}<Soon />{/snippet}
      </PanelHeading>
      <Segmented options={COP_OPTIONS} value={null} label="Cop density" disabled />
      <p class="caption">Your server doesn't run police yet. This turns on when pursuits do.</p>
    </Glass>

    <Glass dense radius="card" label="Rivals" class="card">
      <PanelHeading color="var(--speed)">
        Rivals
        {#snippet aside()}<Soon />{/snippet}
      </PanelHeading>
      <div class="row">
        <span class="text">
          <span>Roaming rivals</span>
          <span class="hint">Rivals cruise Ventura Bay and race you.</span>
        </span>
      </div>
      <p class="caption">{waits}</p>
    </Glass>

    <Glass dense radius="card" label="Garage" class="card">
      <PanelHeading color="var(--build)">
        Garage
        {#snippet aside()}<Soon />{/snippet}
      </PanelHeading>
      <div class="row">
        <span class="text">
          <span>Garage slots</span>
          <span class="hint">How many cars you can keep at hand. Your garage has five today.</span>
        </span>
      </div>
      <p class="caption">Changing it needs a server setting that does not exist yet.</p>
    </Glass>
  </div>

  <aside>
    <Glass dense radius="phone" label="Presets" class="presets">
      <div class="presets-head">
        <h2 class="t-panel-title">Presets</h2>
        <Soon />
      </div>
      <div role="radiogroup" aria-label="World preset" aria-disabled="true" class="list">
        {#each PRESETS as preset (preset.id)}
          <button type="button" role="radio" aria-checked="false" class="pick" disabled>
            <span class="swatch" style="background: {preset.color}" aria-hidden="true"></span>
            <span class="text">
              <span class="name">{preset.name}</span>
              <span class="hint">{preset.about}</span>
            </span>
          </button>
        {/each}
      </div>
      <div class="foot">
        <span class="caption">
          These settings belong to your server. Drivers who join you get the same world.
        </span>
        <span class="t-data soft">127.0.0.1 · this computer only</span>
      </div>
    </Glass>
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
    align-items: flex-start;
  }
  .cards {
    flex: 999 1 560px;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-4);
  }
  .cards :global(.card) {
    border-radius: 24px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .caption {
    margin: 0;
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-soft);
  }
  .soft {
    margin: 0;
    color: var(--ink-soft);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 46px;
  }
  .text {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
    min-width: 0;
  }
  .hint {
    font-size: 13px;
    color: var(--ink-soft);
  }
  aside {
    flex: 1 1 300px;
    max-width: 360px;
  }
  aside :global(.presets) {
    padding: 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .presets-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px 8px;
  }
  .presets-head h2 {
    margin: 0;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pick:disabled {
    color: var(--ink-soft);
  }
  .swatch {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    border-radius: 10px;
    opacity: 0.6;
  }
  .name {
    font-weight: 700;
  }
  .foot {
    margin-top: 10px;
    padding: 12px 6px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
