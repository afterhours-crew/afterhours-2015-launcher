<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import type { Glyph as Icon } from "$lib/components/glyph";
  import Glass from "$lib/components/Glass.svelte";
  import IconBuildingWarehouse from "@tabler/icons-svelte/icons/building-warehouse";
  import IconCar from "@tabler/icons-svelte/icons/car";
  import IconMoon from "@tabler/icons-svelte/icons/moon";
  import IconRoad from "@tabler/icons-svelte/icons/road";
  import IconShield from "@tabler/icons-svelte/icons/shield";
  import IconSwords from "@tabler/icons-svelte/icons/swords";
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
  const PRESET_ICONS: Record<(typeof PRESETS)[number]["id"], Icon> = {
    empty: IconRoad,
    cruise: IconCar,
    "night-run": IconMoon,
  };

  let reported = $derived(featureReady(session.info?.server, "traffic"));
  let waits = $derived(worldWaits(reported));
</script>

<main use:staggerIn>
  <div class="cards">
    <Glass dense radius="card" label="Traffic" class="card">
      <PanelHeading icon={IconCar}>
        Traffic
        {#snippet aside()}<Soon />{/snippet}
      </PanelHeading>
      <Segmented options={TRAFFIC_OPTIONS} value={null} label="Traffic density" disabled />
      <p class="caption">{waits}</p>
      <p class="t-data soft">Cars appear 300–450 m around you and clear out behind.</p>
    </Glass>

    <Glass dense radius="card" label="Cops" class="card">
      <PanelHeading icon={IconShield}>
        Cops
        {#snippet aside()}<Soon />{/snippet}
      </PanelHeading>
      <Segmented options={COP_OPTIONS} value={null} label="Cop density" disabled />
      <p class="caption">Your server doesn't run police yet. This turns on when pursuits do.</p>
    </Glass>

    <Glass dense radius="card" label="Rivals" class="card">
      <PanelHeading icon={IconSwords}>
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
      <PanelHeading icon={IconBuildingWarehouse}>
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
          {@const Glyph = PRESET_ICONS[preset.id]}
          <button type="button" role="radio" aria-checked="false" class="pick" disabled>
            <Glyph size={20} stroke={1.6} aria-hidden="true" class="glyph" />
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
    padding: var(--space-5) var(--space-6) var(--space-6);
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
    border-radius: var(--radius-panel);
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
  .list :global(.glyph) {
    flex: 0 0 auto;
    margin: 0 5px;
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
