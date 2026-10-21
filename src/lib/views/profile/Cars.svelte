<script lang="ts">
  import { viaApi } from "$lib/state/server";
  import { staggerIn } from "$lib/motion";
  import type { Profile } from "$lib/api/types";
  import CarImage from "$lib/components/CarImage.svelte";
  import EmptyLine from "$lib/components/EmptyLine.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import InfoButton from "$lib/components/InfoButton.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import {
    carName,
    filterCars,
    filterOptions,
    groupCars,
    sortCars,
    summaryLine,
    whereLabel,
    whereLong,
    type CarFilter,
    type CarGroup,
    type CarSort,
  } from "$lib/state/cars";
  import { featureReady } from "$lib/state/capabilities";
  import { carPicture } from "$lib/state/carimages";
  import { formatCount, formatMoney } from "$lib/state/format";
  import { session } from "$lib/state/session.svelte";

  // Cars (H2): every owned car, garage and warehouse, from the profile's
  // `cars`. Identical warehouse cars share a row ("× 4"). Names are the
  // game's localized ones, else the blueprint label. Wraps and tuning are
  // not reported, so they are not shown.
  let { profile }: { profile: Profile } = $props();

  let filter = $state<CarFilter>("all");
  let sort = $state<CarSort>("slot");
  let query = $state("");
  let selectedKey = $state<string | null>(null);

  let cars = $derived(profile.cars ?? []);
  // Pictures need the server's `car-images`; without it the column is not shown.
  let pictures = $derived(featureReady(session.info?.server, "car-images"));
  let rows = $derived(groupCars(sortCars(filterCars(cars, filter, query), sort)));
  let all = $derived(groupCars(sortCars(cars, "slot")));
  let selected = $derived<CarGroup | null>(
    rows.find((g) => g.key === selectedKey) ??
      all.find((g) => g.key === selectedKey) ??
      rows[0] ??
      all[0] ??
      null,
  );

  const columns: { label: string; sort: CarSort | null; right?: boolean }[] = [
    { label: "Car", sort: "name" },
    { label: "Where", sort: "slot" },
    { label: "Parts", sort: null, right: true },
    { label: "Sells for", sort: "value", right: true },
  ];
</script>

<div class="layout" use:staggerIn>
  <Glass radius="panel" label="Cars" class="panel list-panel">
    <div class="head">
      <h1 class="t-view-title">Cars</h1>
      {#if profile.car_summary}
        <span class="t-data">{summaryLine(profile.car_summary, cars.length)}</span>
      {/if}
    </div>

    {#if profile.cars === null}
      <EmptyLine
        >Cars show once the game's content has been prepared: start a session once.</EmptyLine
      >
    {:else}
      <div class="controls">
        <Segmented options={filterOptions(cars)} bind:value={filter} label="Show" />
        <label for="car-search" class="visually-hidden">Search cars</label>
        <input
          id="car-search"
          class="search"
          type="search"
          placeholder="Search cars"
          spellcheck="false"
          bind:value={query}
        />
      </div>

      <div class="table" class:pictures role="group" aria-label="Car list">
        <div class="grid header">
          {#if pictures}<span aria-hidden="true"></span>{/if}
          {#each columns as column (column.label)}
            {#if column.sort}
              {@const by = column.sort}
              <button
                type="button"
                class="sort"
                class:right={column.right}
                aria-pressed={sort === by}
                onclick={() => (sort = by)}
                >{column.label}{#if sort === by}<span aria-hidden="true"> ↓</span>{/if}</button
              >
            {:else}
              <span class="sort-static" class:right={column.right}>{column.label}</span>
            {/if}
          {/each}
        </div>
        {#each rows as row (row.key)}
          <button
            type="button"
            class="pick grid"
            aria-pressed={selected?.key === row.key}
            onclick={() => (selectedKey = row.key)}
          >
            {#if pictures}
              <!-- Identical cars share a row, so they share its picture. -->
              <CarImage
                picture={carPicture(
                  row.car.image,
                  "medium",
                  pictures,
                  profile.car_images,
                  viaApi(session.settings),
                )}
                alt={carName(row.car)}
                ratio="72 / 40"
                width="72px"
                icon={18}
                radius="var(--radius-thumb)"
              />
            {/if}
            <span class="name"
              ><span class="t-body-strong">{carName(row.car)}</span>{#if row.count > 1}<span
                  class="t-caption then"
                >
                  × {row.count}</span
                >{/if}</span
            >
            <span
              class="where"
              class:active={row.car.location === "active"}
              class:stored={row.car.location === "warehouse"}>{whereLabel(row.car)}</span
            >
            <span class="t-num">{formatCount(row.car.installed_parts)}</span>
            <span class="t-num">{formatMoney(row.car.sale_price)}</span>
          </button>
        {:else}
          <EmptyLine
            >{cars.length === 0
              ? "No cars in this save yet."
              : "No cars match that search."}</EmptyLine
          >
        {/each}
      </div>
    {/if}
  </Glass>

  {#if selected}
    {@const car = selected.car}
    <aside>
      <Glass radius="phone" label="Selected car" class="panel">
        {#if pictures}
          <CarImage
            picture={carPicture(
              car.image,
              "large",
              pictures,
              profile.car_images,
              viaApi(session.settings),
            )}
            alt={carName(car)}
            ratio="16 / 9"
            icon={32}
          />
        {/if}
        <span class="title">
          <span class="t-caption"
            >{whereLong(car)}{#if selected.count > 1}<span class="then"
                >· {selected.count} alike</span
              >{/if}</span
          >
          <h2 class="t-view-title car-title">{carName(car)}</h2>
        </span>
        <div class="rows">
          <div class="list-row">
            <span class="grow">Parts installed</span><span class="t-num"
              >{formatCount(car.installed_parts)}</span
            >
          </div>
          <div class="list-row">
            <span class="grow">Spare parts</span><span class="t-num"
              >{formatCount(car.spare_parts)}</span
            >
          </div>
          <div class="list-row">
            <span class="grow">Sells for</span><span class="t-num"
              >{formatMoney(car.sale_price)}</span
            >
          </div>
          <div class="list-row">
            <span class="grow">Item ID</span><span class="t-data">{car.id}</span>
            <InfoButton
              label="About the item ID"
              text={car.vehicle
                ? `The car's item in your save. Blueprint ${car.vehicle.asset_name}.`
                : "The car's item in your save."}
            />
          </div>
        </div>
        <span class="t-caption">Store, collect and swap cars in the game's garage.</span>
      </Glass>
    </aside>
  {/if}
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
  .layout :global(.panel) {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .layout :global(.list-panel) {
    flex: 999 1 600px;
    min-width: 0;
    max-width: 840px;
  }
  aside {
    flex: 1 1 300px;
    max-width: 360px;
  }
  .head,
  .title {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  h1,
  h2 {
    margin: 0;
  }
  .car-title {
    font-size: 22px;
    line-height: 1.25;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  .search {
    flex: 1 1 220px;
    min-width: 0;
    height: 42px;
    padding: 0 14px;
    border-radius: var(--radius-field);
    border: 1px solid var(--graphite-edge);
    background: var(--graphite-raised);
    color: var(--ink);
    font: 400 16px var(--font-ui);
  }
  .table {
    display: flex;
    flex-direction: column;
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 110px 70px 110px;
    gap: 14px;
    align-items: center;
    padding: 0 12px;
  }
  .pictures .grid {
    grid-template-columns: 72px minmax(0, 1fr) 100px 60px 100px;
  }
  .pictures .pick.grid {
    min-height: 56px;
  }
  .header {
    padding-bottom: 4px;
  }
  .sort,
  .sort-static {
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 4px;
    text-align: left;
    font-size: 14px;
    color: var(--ink-soft);
  }
  .sort:hover {
    color: var(--ink);
  }
  .sort[aria-pressed="true"] {
    color: var(--ink);
    font-weight: 600;
  }
  .right {
    justify-content: flex-end;
    text-align: right;
  }
  .pick.grid {
    min-height: 48px;
    padding: 0 12px;
    border-top: 1px solid var(--graphite-edge);
    border-radius: 0;
  }
  .pick.grid[aria-pressed="true"] {
    border-radius: var(--radius-row);
    border-top-color: transparent;
  }
  .pick.grid[aria-pressed="true"] + .pick.grid {
    border-top-color: transparent;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .where {
    font-size: 16px;
  }
  .where.active {
    color: var(--crew);
    font-weight: 600;
  }
  .where.stored {
    color: var(--ink-soft);
  }
</style>
