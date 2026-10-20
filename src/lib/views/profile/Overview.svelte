<script lang="ts">
  import CountUp from "$lib/components/CountUp.svelte";
  import { staggerIn } from "$lib/motion";
  import { formatCount, formatMoney } from "$lib/state/format";
  import { staggerDelay } from "$lib/state/motion";
  import type { Profile } from "$lib/api/types";
  import Avatar from "$lib/components/Avatar.svelte";
  import CarImage from "$lib/components/CarImage.svelte";
  import EmptyLine from "$lib/components/EmptyLine.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import IconCar from "@tabler/icons-svelte/icons/car";
  import IconChartBar from "@tabler/icons-svelte/icons/chart-bar";
  import IconFlag3 from "@tabler/icons-svelte/icons/flag-3";
  import IconSteeringWheel from "@tabler/icons-svelte/icons/steering-wheel";
  import InfoButton from "$lib/components/InfoButton.svelte";
  import PanelHeading from "$lib/components/PanelHeading.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import ShowMore from "$lib/components/ShowMore.svelte";
  import { featureReady } from "$lib/state/capabilities";
  import { carPicture } from "$lib/state/carimages";
  import { carName, garageList } from "$lib/state/cars";
  import {
    collectionRows,
    driverCard,
    recordedStats,
    repCategories,
    repProgress,
    speedList,
    tableTiles,
  } from "$lib/state/profile";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";

  // Profile overview (G1b). Two text levels per panel; help sits behind ⓘ.
  // Stats are the raw stored integers: the game's units for distance, time
  // and speed are not confirmed, and the ⓘ says so.
  let { profile }: { profile: Profile } = $props();

  let now = $derived(new Date());
  let card = $derived(driverCard(profile, now));
  let progress = $derived(repProgress(profile.reputation));
  let categories = $derived(repCategories(profile.reputation, profile.tables));
  let stats = $derived(
    recordedStats(tableTiles(profile.tables?.["GameplayStatsTable"], profile.cars)),
  );
  let speed = $derived(speedList(profile.tables));
  let started = $derived(
    speed ? (profile.tables?.["SpeedListStatsTable"]?.["Started"]?.value ?? 0) : 0,
  );
  let cars = $derived(profile.cars ? garageList(profile.cars) : null);
  let held = $derived(collectionRows(profile.counts));
  let pictures = $derived(featureReady(session.info?.server, "car-images"));
  let active = $derived(profile.cars?.find((c) => c.location === "active") ?? null);
</script>

<div class="layout" use:staggerIn>
  <div class="main">
    <Glass radius="panel" label="Driver" class="panel">
      <div class="who">
        <Avatar name={card.name} color={session.settings.avatar} size={64} />
        <span class="names">
          <h1 class="t-view-title">{card.name}</h1>
          {#if card.subline}<span class="t-caption">{card.subline}</span>{/if}
        </span>
        <span class="figures">
          <span class="figure"
            ><span class="t-caption">REP level</span><span class="t-big"
              >{#if profile.reputation?.level != null}<CountUp
                  value={profile.reputation.level}
                  format={String}
                />{:else}{card.level}{/if}</span
            ></span
          >
          <span class="figure"
            ><span class="t-caption">Bank</span><span class="t-big"
              >{#if profile.bank}<CountUp
                  value={profile.bank.balance}
                  format={formatMoney}
                />{:else}{card.bank}{/if}</span
            ></span
          >
        </span>
      </div>
      {#if progress}
        <div class="progress">
          <div class="progress-text">
            <span class="t-body-strong">{progress.title}</span>
            <span class="t-data">{progress.detail}</span>
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
            <div class="fill grow-x" style="width: {Math.round(progress.fraction * 100)}%"></div>
          </div>
        </div>
      {/if}
      <div>
        <PillButton onclick={() => router.go("profile", "edit-driver")}>Edit driver</PillButton>
      </div>
    </Glass>

    {#if categories}
      <Glass radius="panel" label="REP by category" class="panel">
        <PanelHeading icon={IconChartBar}>
          REP by category
          {#snippet aside()}<InfoButton
              label="About REP categories"
              text="Each event type earns its own REP. Medals come from the prestige table in your save; what each value means is not decoded yet."
            />{/snippet}
        </PanelHeading>
        <div class="categories">
          {#each categories as row, i (row.key)}
            <span class="t-tag tag" style="background: {row.color}">{row.label}</span>
            <div class="track" aria-hidden="true">
              <div
                class="grow-x"
                style="width: {Math.round(
                  row.fraction * 100,
                )}%; background: {row.color}; --grow-delay: {80 + staggerDelay(i)}ms"
              ></div>
            </div>
            <span class="t-num" class:zero={row.fraction === 0}>{row.score}</span>
          {/each}
        </div>
      </Glass>
    {/if}

    <Glass radius="panel" label="Driving stats" class="panel">
      <PanelHeading icon={IconSteeringWheel}>
        Driving stats
        {#snippet aside()}{#if stats.length > 0}<InfoButton
              label="About driving stats"
              text="Raw values from your save. The game's units for distance, time and speed are not confirmed, so none are shown."
            />{/if}{/snippet}
      </PanelHeading>
      {#if stats.length === 0}
        <EmptyLine
          >No driving stats yet. They fill in as your server records your driving.</EmptyLine
        >
      {:else}
        <div class="rows">
          {#each stats as tile (tile.column)}
            <div class="list-row">
              <span class="grow">{tile.name ? "Favorite car" : tile.label}</span>
              {#if tile.name}
                <span class="t-num">{tile.name}</span>
              {:else}
                <span class="t-num"
                  >{#if tile.raw !== null}<CountUp
                      value={tile.raw}
                      format={formatCount}
                    />{:else}{tile.value}{/if}</span
                >
              {/if}
            </div>
          {/each}
        </div>
      {/if}
      {#if speed}
        <ShowMore
          label="SpeedList"
          icon={IconFlag3}
          summary={started > 0 ? speed.summary : "no races yet"}
        >
          <div
            class="histogram"
            role="img"
            aria-label="Finishing positions: {speed.positions
              .map((p) => `${p.label} ${p.count}`)
              .join(', ')}"
          >
            {#each speed.positions as p (p.label)}
              <div class="column">
                <span class="t-data">{p.count}</span>
                <div
                  class="bar-v grow-y"
                  style="height: {Math.max(2, Math.round(p.fraction * 80))}px; opacity: {p.count
                    ? 0.4 + 0.6 * p.fraction
                    : 0.25}"
                ></div>
                <span class="t-data">{p.label}</span>
              </div>
            {/each}
          </div>
        </ShowMore>
      {/if}
    </Glass>
  </div>

  <aside>
    <Glass radius="phone" label="Cars and collection" class="panel side">
      <PanelHeading icon={IconCar}>
        Cars
        {#snippet aside()}{#if profile.cars}<span class="t-num"
              >{formatCount(profile.cars.length)}</span
            >{/if}{/snippet}
      </PanelHeading>
      {#if pictures && active}
        <CarImage
          picture={carPicture(active.image, "large", pictures, profile.car_images)}
          alt={carName(active)}
          ratio="16 / 9"
          icon={32}
        />
      {/if}
      {#if cars}
        <div class="rows">
          {#each cars.garage as car (car.slot)}
            <div class="list-row">
              <span class="grow t-body-strong car">{car.name}</span>
              {#if car.active}<span class="active">Active</span>{:else}<span class="t-caption"
                  >Garage</span
                >{/if}
            </div>
          {/each}
          {#if cars.warehouse}
            <div class="list-row"><span class="grow">{cars.warehouse}</span></div>
          {/if}
        </div>
        <div>
          <PillButton onclick={() => router.go("profile", "cars")}>All cars</PillButton>
        </div>
      {:else}
        <EmptyLine>Cars show once the game's content has been prepared.</EmptyLine>
      {/if}

      <div class="collection">
        <h2 class="t-panel-title">Collection</h2>
        <div class="rows">
          {#each held.rows as row (row.label)}
            <div class="list-row">
              <span class="grow">{row.label}</span><span class="t-num">{row.value}</span>
            </div>
          {/each}
          {#if held.none}
            <div class="list-row"><span class="grow t-caption">{held.none}</span></div>
          {/if}
        </div>
      </div>
    </Glass>
  </aside>
</div>

<style>
  .layout {
    width: 100%;
    max-width: var(--page-wide);
    margin-inline: auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-5);
    align-items: flex-start;
  }
  .main {
    flex: 999 1 560px;
    min-width: 0;
    max-width: 820px;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .layout :global(.panel) {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  aside {
    flex: 1 1 320px;
    max-width: 380px;
  }
  .who {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 20px;
  }
  .names {
    flex: 1 1 200px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .names h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .figures {
    display: flex;
    flex-wrap: wrap;
    gap: 36px;
  }
  .figure {
    display: flex;
    flex-direction: column;
    gap: 4px;
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
    gap: 4px 12px;
  }
  .bar,
  .track {
    height: 8px;
    border-radius: var(--radius-pill);
    background: var(--graphite-raised);
    overflow: hidden;
  }
  .fill {
    min-width: 8px;
    height: 100%;
    border-radius: var(--radius-pill);
    background: var(--ink);
  }
  .track > div {
    height: 100%;
  }
  .categories {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr) 80px;
    gap: 14px 16px;
    align-items: center;
  }
  .tag {
    justify-self: start;
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    color: var(--on-ink);
  }
  .zero {
    color: var(--ink-soft);
  }
  .histogram {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 10px;
    align-items: end;
    padding: 4px 6px 8px;
  }
  .column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .bar-v {
    width: 100%;
    max-width: 36px;
    border-radius: 4px 4px 0 0;
    background: var(--speed);
  }
  .car {
    line-height: 1.3;
  }
  .active {
    flex: 0 0 auto;
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--crew);
    color: var(--crew);
    font-size: 13px;
    font-weight: 600;
  }
  .collection {
    padding-top: 8px;
    border-top: 1px solid var(--graphite-edge);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .collection h2 {
    margin: 0;
    padding: 10px 0 4px;
  }
</style>
