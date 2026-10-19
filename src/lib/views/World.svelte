<script lang="ts">
  import { untrack } from "svelte";
  import { staggerIn } from "$lib/motion";
  import IconCar from "@tabler/icons-svelte/icons/car";
  import IconSwords from "@tabler/icons-svelte/icons/swords";
  import IconUserShield from "@tabler/icons-svelte/icons/user-shield";
  import Glass from "$lib/components/Glass.svelte";
  import InfoButton from "$lib/components/InfoButton.svelte";
  import Note from "$lib/components/Note.svelte";
  import NumberStepper from "$lib/components/NumberStepper.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import Upcoming from "$lib/components/Upcoming.svelte";
  import ViewNote from "$lib/components/ViewNote.svelte";
  import { featureReady } from "$lib/state/capabilities";
  import { current, records } from "$lib/state/records.svelte";
  import { session } from "$lib/state/session.svelte";
  import { MAX_RIVALS, rivalField, trafficRow, worldLock, worldUpcoming } from "$lib/state/world";

  // World (H5), one column. Traffic is a multiple of the game's own amount
  // and roaming rivals a number, saved with the server's `settings` command
  // for the next session; a running session keeps the values it started
  // with, so the controls rest while one runs. Whatever is planned but not
  // usable yet stays in view, marked as coming in a future update: traffic
  // steps above the server's limit, cops, and without the server's
  // `world-settings` the traffic and rival rows themselves.
  let reported = $derived(featureReady(session.info?.server, "traffic"));
  let load = $derived(records.world);
  let world = $derived(current(load));
  let traffic = $derived(world ? trafficRow(world) : null);
  let rivals = $derived(world ? rivalField(world) : null);
  let locked = $derived(worldLock(session.status));
  let failure = $state<string | null>(null);

  $effect(() => {
    if (reported) untrack(() => void records.loadWorld());
  });

  async function save(row: "traffic" | "rivals", value: string) {
    failure = await records.saveWorld(row, value);
  }
</script>

<main use:staggerIn>
  <div class="column">
    <span class="title" data-enter>
      <h1 class="t-view-title">World</h1>
      <span class="t-caption"
        >{reported
          ? "Your server's city. Changes apply the next time you start."
          : "Your server's city: traffic, rivals and cops."}</span
      >
    </span>

    {#if reported && !traffic && load.kind === "error"}
      <div data-enter><Note kind="warn">Could not read your settings: {load.message}</Note></div>
      <div data-enter>
        <PillButton onclick={() => records.loadWorld()}>Try again</PillButton>
      </div>
    {:else if reported && !traffic}
      <p class="t-caption" data-enter>Reading your settings…</p>
    {:else}
      <Glass radius="panel" label="World settings" class="settings">
        <div class="list-row tall">
          <IconCar size={20} stroke={1.6} aria-hidden="true" class="icon" />
          <span class="grow name"
            ><span class="t-body-strong">Traffic</span>
            <InfoButton
              label="About traffic"
              text="How many cars your server spawns around you, as a multiple of the game's own amount. More than 1x costs game performance."
            /></span
          >
          {#if traffic}
            <Segmented
              options={traffic.options}
              value={traffic.selected}
              label="Traffic"
              disabled={locked !== null}
              onchange={(value) => save("traffic", value)}
            />
          {:else}
            <Upcoming />
          {/if}
        </div>
        <div class="list-row tall">
          <IconSwords size={20} stroke={1.6} aria-hidden="true" class="icon" />
          <span class="grow name"
            ><span class="t-body-strong">Roaming rivals</span>
            <InfoButton
              label="About roaming rivals"
              text="The most roaming rivals at once, from 0 (off) to {MAX_RIVALS}. Auto keeps the game's own number. For now your server can only lower that number; more rivals than the game's own is coming in a future update."
            /></span
          >
          {#if rivals}
            <span class="rivals">
              {#if rivals.value !== null}
                <PillButton
                  variant="text"
                  disabled={locked !== null}
                  onclick={() => save("rivals", "original")}>Auto</PillButton
                >
              {/if}
              <NumberStepper
                value={rivals.value}
                max={rivals.max}
                label="Roaming rivals"
                placeholder="Auto"
                disabled={locked !== null}
                oncommit={(value) => save("rivals", String(value))}
              />
            </span>
          {:else}
            <Upcoming />
          {/if}
        </div>
        <div class="list-row tall">
          <IconUserShield size={20} stroke={1.6} aria-hidden="true" class="icon" />
          <span class="grow name"><span class="t-body-strong">Cops</span></span>
          <Upcoming />
        </div>
        {#if locked && traffic}<p class="t-caption line" role="status">{locked}</p>{/if}
      </Glass>
      {#if failure}
        <div data-enter role="alert"><Note kind="warn">Not saved: {failure}</Note></div>
      {/if}
    {/if}

    <div data-enter><ViewNote>{worldUpcoming(reported, world)}</ViewNote></div>
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
  .column :global(.settings) {
    padding: 8px 24px;
    border-radius: var(--radius-panel);
  }
  .tall {
    min-height: 72px;
    flex-wrap: wrap;
  }
  .column :global(.icon) {
    flex: 0 0 auto;
    color: var(--ink-soft);
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .rivals {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .line {
    margin: 0;
    padding: 4px 0 16px;
  }
</style>
