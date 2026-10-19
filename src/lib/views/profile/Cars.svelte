<script lang="ts">
  import type { Car, Profile } from "$lib/api/types";
  import Field from "$lib/components/Field.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import Soon from "$lib/components/Soon.svelte";
  import {
    carName,
    filterCars,
    filterOptions,
    sortCars,
    summaryLine,
    whereLabel,
    whereLong,
    type CarFilter,
    type CarSort,
  } from "$lib/state/cars";
  import { formatCount, formatMoney } from "$lib/state/format";

  // Cars (D3): every owned car, garage and warehouse, from the profile's
  // `cars`. Names are the game's localized ones, else the blueprint label.
  // Wraps and tuning are not reported, so they are not shown.
  let { profile }: { profile: Profile } = $props();

  let filter = $state<CarFilter>("all");
  let sort = $state<CarSort>("slot");
  let query = $state("");
  let selectedId = $state<string | null>(null);

  let cars = $derived(profile.cars ?? []);
  let shown = $derived(sortCars(filterCars(cars, filter, query), sort));
  let selected = $derived<Car | null>(
    cars.find((c) => c.id === selectedId) ?? shown[0] ?? cars[0] ?? null,
  );

  const columns: { label: string; sort: CarSort | null; align?: "right" }[] = [
    { label: "Car", sort: "name" },
    { label: "Where", sort: "slot" },
    { label: "Parts", sort: null, align: "right" },
    { label: "Sells for", sort: "value", align: "right" },
  ];
</script>

<div class="layout">
  <Glass dense radius="panel" label="Cars" class="list-panel">
    <div class="head">
      <span class="t-label crumb">Profile / Cars</span>
      <h1 class="t-view-title">Cars</h1>
      {#if profile.car_summary}
        <span class="t-data soft">{summaryLine(profile.car_summary, cars.length)}</span>
      {/if}
    </div>

    {#if profile.cars === null}
      <p class="caption">
        Your server read the save without the game's item content, so it cannot tell cars from other
        items. Start a session once and the content is prepared.
      </p>
    {:else}
      <div class="controls">
        <Segmented options={filterOptions(cars)} bind:value={filter} label="Show" />
        <div class="search">
          <Field
            id="car-search"
            label="Search"
            type="search"
            placeholder="Car name"
            bind:value={query}
          />
        </div>
      </div>

      <div class="table" role="group" aria-label="Car list">
        <div class="row header">
          {#each columns as column (column.label)}
            {#if column.sort}
              {@const by = column.sort}
              <button
                type="button"
                class="t-label sort"
                class:right={column.align === "right"}
                aria-pressed={sort === by}
                onclick={() => (sort = by)}
                >{column.label}{#if sort === by}<span aria-hidden="true"> ↓</span>{/if}</button
              >
            {:else}
              <span class="t-label sort-static" class:right={column.align === "right"}
                >{column.label}</span
              >
            {/if}
          {/each}
        </div>
        {#each shown as car (car.id)}
          <button
            type="button"
            class="pick row"
            aria-pressed={selected?.id === car.id}
            onclick={() => (selectedId = car.id)}
          >
            <span class="t-body-strong name">{carName(car)}</span>
            <span
              class="where"
              class:active={car.location === "active"}
              class:stored={car.location === "warehouse"}>{whereLabel(car)}</span
            >
            <span class="t-data right">{formatCount(car.installed_parts)}</span>
            <span class="t-data right">{formatMoney(car.sale_price)}</span>
          </button>
        {:else}
          <p class="caption empty">
            {cars.length === 0 ? "No cars in this save yet." : "No cars match that search."}
          </p>
        {/each}
      </div>
    {/if}
  </Glass>

  {#if selected}
    <aside>
      <Glass dense radius="phone" label="Selected car" class="detail">
        <span class="t-label soft">{whereLong(selected)}</span>
        <h2 class="t-car-name detail-name">{carName(selected)}</h2>
        <div class="tiles">
          <span class="tile"
            ><span class="t-label muted">Parts installed</span><span class="t-countdown small"
              >{formatCount(selected.installed_parts)}</span
            ></span
          >
          <span class="tile"
            ><span class="t-label muted">Spare parts</span><span class="t-countdown small"
              >{formatCount(selected.spare_parts)}</span
            ></span
          >
        </div>
        <dl class="facts">
          <dt class="t-label muted">Sells for</dt>
          <dd class="t-data">{formatMoney(selected.sale_price)}</dd>
          <dt class="t-label muted">Items</dt>
          <dd class="t-data">{formatCount(selected.item_records)} records</dd>
          <dt class="t-label muted">Item ID</dt>
          <dd class="t-data">{selected.id}</dd>
          {#if selected.vehicle}
            <dt class="t-label muted">Blueprint</dt>
            <dd class="t-data">{selected.vehicle.asset_name}</dd>
          {/if}
        </dl>
        <span class="caption rule">
          Store, collect and swap cars in the game's garage. This list follows your save, so changes
          show here after the game saves them.
        </span>
        <div class="later"><Soon /><span class="caption">Move cars from the launcher</span></div>
      </Glass>
    </aside>
  {/if}
</div>

<style>
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    align-items: flex-start;
  }
  .layout :global(.list-panel) {
    flex: 999 1 620px;
    min-width: 0;
    padding: 20px 24px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .head h1 {
    margin: 0;
  }
  .crumb {
    color: var(--ink-soft);
  }
  .soft {
    color: var(--ink-soft);
  }
  .muted {
    color: var(--ink-muted);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px 16px;
  }
  .search {
    flex: 1 1 220px;
  }
  .table {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-x: auto;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 110px 64px 104px;
    gap: 12px;
    align-items: center;
    min-width: 440px;
  }
  .row.header {
    padding: 0 10px;
  }
  .sort,
  .sort-static {
    min-height: var(--control-height);
    display: flex;
    align-items: center;
    color: var(--ink-muted);
  }
  .sort.right,
  .sort-static.right {
    justify-content: flex-end;
  }
  .sort:hover,
  .sort[aria-pressed="true"] {
    color: var(--ink);
  }
  .right {
    text-align: right;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .where {
    font-size: 14px;
  }
  .where.active {
    color: var(--crew);
    font-weight: 800;
  }
  .where.stored {
    color: var(--ink-soft);
  }
  .caption {
    margin: 0;
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-soft);
  }
  .empty {
    padding: 12px 10px;
  }
  aside {
    flex: 1 1 290px;
    max-width: 340px;
  }
  aside :global(.detail) {
    padding: 22px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  aside h2 {
    margin: 0;
    overflow-wrap: break-word;
  }
  .detail-name {
    font-size: 24px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .tile {
    padding: 10px 12px;
    border-radius: var(--radius-row);
    background: var(--field);
    display: flex;
    flex-direction: column;
  }
  .small {
    font-size: 22px;
  }
  .facts {
    margin: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 4px 12px;
    align-items: baseline;
  }
  .facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .rule {
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .later {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
