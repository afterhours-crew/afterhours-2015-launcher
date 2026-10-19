<script lang="ts">
  import type { Profile } from "$lib/api/types";
  import Avatar from "$lib/components/Avatar.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import PanelHeading from "$lib/components/PanelHeading.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { garageList } from "$lib/state/cars";
  import {
    collection,
    driverCard,
    repCategories,
    repProgress,
    saveFacts,
    speedList,
    tableTiles,
  } from "$lib/state/profile";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";

  // Profile from the save (D1). Stats are the raw stored integers: the
  // game's units for distance, time and speed are not confirmed.
  let { profile }: { profile: Profile } = $props();

  let now = $derived(new Date());
  let card = $derived(driverCard(profile, now));
  let progress = $derived(repProgress(profile.reputation));
  let categories = $derived(repCategories(profile.reputation, profile.tables));
  let stats = $derived(tableTiles(profile.tables?.["GameplayStatsTable"], profile.cars));
  let speed = $derived(speedList(profile.tables));
  let cars = $derived(profile.cars ? garageList(profile.cars) : null);
  let tiles = $derived(collection(profile.counts, profile.cars));
  let save = $derived(saveFacts(profile.save, now));
</script>

<div class="layout">
  <div class="main">
    <Glass dense radius="panel" label="Driver" class="driver">
      <div class="who">
        <Avatar name={card.name} color={session.settings.avatar} size={84} />
        <div class="names">
          <span class="t-label soft">Driver profile</span>
          <h1 class="t-car-name">{card.name}</h1>
          <span class="t-data soft">{card.subline}</span>
        </div>
        <div class="figures">
          <span class="figure"
            ><span class="t-label muted">REP level</span><span class="t-countdown"
              >{card.level}</span
            ></span
          >
          <span class="figure"
            ><span class="t-label muted">Bank</span><span class="t-countdown">{card.bank}</span
            ></span
          >
        </div>
      </div>
      {#if progress}
        <div class="progress">
          <div class="progress-text">
            <span class="t-body-strong">{progress.title}</span>
            <span class="t-data soft">{progress.detail}</span>
          </div>
          <div
            class="bar"
            role="progressbar"
            aria-label={progress.nextLevel
              ? `Progress to REP level ${progress.nextLevel}`
              : "REP level"}
            aria-valuemin="0"
            aria-valuemax={progress.span}
            aria-valuenow={progress.into}
          >
            <div class="fill" style="width: {Math.round(progress.fraction * 100)}%"></div>
          </div>
        </div>
      {/if}
      <div class="buttons">
        <PillButton onclick={() => router.go("profile", "edit-driver")}>Edit driver</PillButton>
        <PillButton variant="text" onclick={() => router.go("profile", "save-data")}
          >Save data</PillButton
        >
      </div>
    </Glass>

    {#if categories}
      <Glass dense radius="card" label="REP by category" class="card">
        <PanelHeading color="var(--style)">REP by category</PanelHeading>
        <div class="categories">
          <span class="t-label muted" aria-hidden="true"></span>
          <span class="t-label muted" aria-hidden="true"></span>
          <span class="t-label muted right">Score</span>
          <span class="t-label muted right">Medal cell</span>
          {#each categories as row (row.key)}
            <span class="tag" style="background: {row.color}">{row.label}</span>
            <div class="track" aria-hidden="true">
              <div style="width: {Math.round(row.fraction * 100)}%; background: {row.color}"></div>
            </div>
            <span class="t-data right">{row.score}</span>
            <span class="t-data right soft">{row.medal}</span>
          {/each}
        </div>
        <span class="caption rule"
          >Medals are the stored PrestigeMedalTable values; what each number means is not decoded
          yet.</span
        >
      </Glass>
    {/if}

    {#if stats.length > 0}
      <Glass dense radius="card" label="Driving stats" class="card">
        <PanelHeading color="var(--crew)">
          Driving stats
          {#snippet aside()}<span class="caption">Raw stored values · units unconfirmed</span
            >{/snippet}
        </PanelHeading>
        <div class="tiles">
          {#each stats as tile (tile.column)}
            <div class="tile">
              <span class="t-label muted">{tile.label}</span>
              {#if tile.name}
                <span class="t-body-strong">{tile.name}</span>
                <span class="t-data-small soft">item {tile.value}</span>
              {:else}
                <span class="t-countdown small" class:soft={!tile.stored}>{tile.value}</span>
              {/if}
              {#if !tile.stored}<span class="caption">Not saved yet · default</span>{/if}
            </div>
          {/each}
        </div>
      </Glass>
    {/if}

    {#if speed}
      <Glass dense radius="card" label="SpeedList" class="card">
        <PanelHeading color="var(--speed)">
          SpeedList
          {#snippet aside()}<span class="t-data soft">{speed.summary}</span>{/snippet}
        </PanelHeading>
        <div
          class="histogram"
          role="img"
          aria-label="Finishing positions: {speed.positions
            .map((p) => `${p.label} ${p.count}`)
            .join(', ')}"
        >
          {#each speed.positions as p (p.label)}
            <div class="column">
              <span class="t-data-small">{p.count}</span>
              <div
                class="bar-v"
                style="height: {Math.max(2, Math.round(p.fraction * 80))}px; opacity: {p.count
                  ? 0.4 + 0.6 * p.fraction
                  : 0.25}"
              ></div>
              <span class="t-label muted">{p.label}</span>
            </div>
          {/each}
        </div>
      </Glass>
    {/if}
  </div>

  <aside>
    <Glass dense radius="phone" label="Garage and save" class="side">
      {#if cars && profile.car_summary}
        <div class="side-head">
          <h2 class="t-panel-title">Cars</h2>
          <span class="t-data-small soft"
            >{profile.cars?.length} · {profile.car_summary.garage_used} garage · {profile
              .car_summary.warehouse_used} warehouse</span
          >
        </div>
        <ol class="garage">
          {#each cars.garage as car (car.slot)}
            <li>
              <span class="t-data slot">{car.slot}</span>
              <span class="t-body-strong car">{car.name}</span>
              {#if car.active}<span class="active">Active</span>{/if}
            </li>
          {/each}
          {#if cars.warehouse}
            <li class="more">
              <span class="slot" aria-hidden="true"></span><span>{cars.warehouse}</span>
            </li>
          {/if}
        </ol>
        <div class="pad">
          <PillButton onclick={() => router.go("profile", "cars")}>All cars</PillButton>
        </div>
      {:else}
        <div class="side-head"><h2 class="t-panel-title">Cars</h2></div>
        <p class="caption pad">The server could not list cars without the game's item content.</p>
      {/if}

      <div class="section">
        <h2 class="t-panel-title">Collection</h2>
        <div class="collection">
          {#each tiles as tile (tile.label)}
            <span class="count"
              ><span class="t-countdown small">{tile.value}</span><span class="t-label muted"
                >{tile.label}</span
              ></span
            >
          {/each}
        </div>
      </div>

      <div class="section">
        <h2 class="t-panel-title">Save file</h2>
        <dl class="facts">
          <dt class="t-label muted">File</dt>
          <dd class="t-data">{save.file}</dd>
          <dt class="t-label muted">Schema</dt>
          <dd class="t-data">{save.schema}</dd>
          <dt class="t-label muted">Saves</dt>
          <dd class="t-data">{save.generation}</dd>
          <dt class="t-label muted">Last saved</dt>
          <dd class="t-data">{save.saved}</dd>
        </dl>
        <div>
          <PillButton onclick={() => router.go("profile", "save-data")}>Open save data</PillButton>
        </div>
      </div>
    </Glass>
  </aside>
</div>

<style>
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    align-items: flex-start;
  }
  .main {
    flex: 999 1 600px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .main :global(.driver) {
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .main :global(.card) {
    border-radius: 24px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .who {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 18px 24px;
  }
  .names {
    flex: 1 1 220px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .names h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .figures {
    display: flex;
    flex-wrap: wrap;
    gap: 28px;
  }
  .figure {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .soft {
    color: var(--ink-soft);
  }
  .muted {
    color: var(--ink-muted);
  }
  .progress {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .progress-text {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 4px 16px;
  }
  .bar {
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 999px;
    background: var(--ink);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .categories {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr) 96px 96px;
    gap: 12px 16px;
    align-items: center;
  }
  .right {
    text-align: right;
  }
  .tag {
    justify-self: start;
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    color: var(--on-ink);
    font: 800 11px/16px var(--font-ui);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .track {
    height: 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .track > div {
    height: 100%;
  }
  .caption {
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-soft);
  }
  .rule {
    padding-top: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
  }
  .tile {
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--field);
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .small {
    font-size: 22px;
  }
  .histogram {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 10px;
    align-items: end;
    height: 120px;
  }
  .column {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    height: 100%;
  }
  .bar-v {
    width: 100%;
    border-radius: 8px 8px 2px 2px;
    background: var(--ink);
  }
  aside {
    flex: 1 1 300px;
    max-width: 360px;
  }
  aside :global(.side) {
    padding: 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .side-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 0 6px;
  }
  h2 {
    margin: 0;
  }
  .garage {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .garage li {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 4px 8px;
  }
  .slot {
    width: 14px;
    flex: 0 0 auto;
    color: var(--ink-soft);
  }
  .car {
    flex: 1 1 auto;
    min-width: 0;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .active {
    padding: 0 8px;
    border-radius: var(--radius-pill);
    border: 1px solid rgba(255, 255, 255, 0.3);
    font: 700 10px/16px var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .more {
    color: var(--ink-soft);
    font-size: 14px;
  }
  .pad {
    padding: 0 6px;
  }
  .section {
    padding: 12px 6px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .collection {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px 8px;
  }
  .count {
    display: flex;
    flex-direction: column;
  }
  .facts {
    margin: 0;
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr);
    gap: 4px 12px;
    align-items: baseline;
  }
  .facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
