<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import { untrack } from "svelte";
  import { api } from "$lib/api/tauri";
  import Avatar from "$lib/components/Avatar.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import InfoButton from "$lib/components/InfoButton.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import ShowMore from "$lib/components/ShowMore.svelte";
  import { formatCount, formatMoney } from "$lib/state/format";
  import { isLive } from "$lib/state/launchbar";
  import { baseName, saveFacts, tableDetail, tableEntries } from "$lib/state/profile";
  import { sampleMode } from "$lib/state/preview";
  import { current, records } from "$lib/state/records.svelte";
  import { session } from "$lib/state/session.svelte";

  // Save data (H3): the save file in a few rows and what it holds; the raw
  // tables wait behind "Show more", for troubleshooting. With more than one
  // save in the data folder, the drivers on this PC come first. Nothing
  // here writes the save.
  let list = $derived(current(records.profiles));
  let load = $derived(records.shown);
  let profile = $derived(current(load));
  let activeId = $derived(current(records.profile)?.account_id ?? null);
  let shownId = $derived(records.picked ?? activeId);
  let entries = $derived(profile ? tableEntries(profile) : []);
  let progressTables = $derived(entries.filter((e) => e.group === "Progress").length);
  let tableId = $state<string | null>(null);
  let chosen = $derived(
    entries.find((e) => e.id === tableId) ??
      entries.find((e) => e.id === "GameplayStatsTable") ??
      entries[0] ??
      null,
  );
  let detail = $derived(profile && chosen ? tableDetail(profile, chosen.id) : null);
  let facts = $derived(profile ? saveFacts(profile.save, new Date()) : null);
  let folder = $derived(
    profile
      ? profile.save.path.slice(0, -baseName(profile.save.path).length).replace(/[\\/]$/, "")
      : "",
  );
  const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  let live = $derived(isLive(session.status?.state));
  let folderError = $state<string | null>(null);

  $effect(() => {
    untrack(() => void records.loadProfiles());
  });

  async function openData() {
    folderError = null;
    try {
      if (sampleMode) throw new Error("The browser preview cannot open folders.");
      await api.openFolder("data");
    } catch (e) {
      folderError = String(e instanceof Error ? e.message : e);
    }
  }
</script>

<div class="column" use:staggerIn>
  <Glass radius="panel" label="Save file" class="panel">
    <div class="head">
      <span class="title">
        <h1 class="t-view-title">Save data</h1>
        {#if facts}<span class="t-data path">{facts.file} in {folder}</span>{/if}
      </span>
      <PillButton onclick={openData}>Open folder</PillButton>
    </div>
    {#if folderError}<Note kind="warn">{folderError}</Note>{/if}
    {#if records.profiles.kind === "error"}<Note kind="warn">{records.profiles.message}</Note>{/if}

    {#if !profile}
      {#if load.kind === "error"}
        <Note kind="warn">Could not read this save: {load.message}</Note>
      {:else}
        <p class="t-caption">Reading the save…</p>
      {/if}
    {:else if facts}
      {#if live && profile.active}
        <Note kind="warn">
          Your server is using this file. This view is read-only and shows the last save the server
          committed.
        </Note>
      {/if}
      <div class="rows">
        <div class="list-row">
          <span class="grow">Last saved</span><span class="t-num">{capitalize(facts.saved)}</span>
        </div>
        <div class="list-row">
          <span class="grow">Saves</span><span class="t-num">{facts.generation}</span>
          <InfoButton
            label="About saves"
            text="How many times the game has saved this file. Schema {facts.schema}."
          />
        </div>
        <div class="list-row">
          <span class="grow">Size</span><span class="t-num">{facts.size}</span>
        </div>
      </div>
    {/if}
  </Glass>

  {#if list && list.accounts.length > 1}
    <Glass radius="panel" label="Drivers on this PC" class="panel">
      <h2 class="t-panel-title">Drivers on this PC</h2>
      <div role="radiogroup" aria-label="Driver" class="drivers">
        {#each list.accounts as account (account.account_id)}
          <button
            type="button"
            role="radio"
            class="pick"
            aria-checked={account.account_id === shownId}
            disabled={account.error !== null}
            onclick={() => records.pick(account.account_id)}
          >
            <Avatar
              name={account.display_name ?? "?"}
              color={account.active ? session.settings.avatar : "speed"}
            />
            <span class="grow">
              {account.display_name ?? "Unreadable save"}{#if account.active}<span
                  class="t-caption"
                >
                  · active</span
                >{/if}
            </span>
            <span class="t-data">
              {#if account.error}{account.error}{:else}REP {account.level ?? "—"} · {account.bank
                  ? formatMoney(account.bank.balance)
                  : "no bank"}{/if}
            </span>
          </button>
        {/each}
      </div>
      {#if list.truncated}<span class="t-caption">More saves exist than are listed.</span>{/if}
    </Glass>
  {/if}

  {#if profile}
    <Glass radius="panel" label="What's inside" class="panel tight">
      <h2 class="t-panel-title">What's inside</h2>
      {#if profile.warnings.length > 0}<Note>{profile.warnings.join(" ")}</Note>{/if}
      <div class="rows">
        <div class="list-row">
          <span class="grow">Driver, bank and REP</span>
          <span class="t-data"
            >{profile.identity
              ? `Persona ${profile.identity.persona_id}`
              : "Not in this save"}</span
          >
        </div>
        <div class="list-row">
          <span class="grow">Cars and parts</span><span class="t-num"
            >{formatCount(profile.counts.items)} items</span
          >
        </div>
        <div class="list-row">
          <span class="grow">Wraps</span><span class="t-num"
            >{formatCount(profile.counts.livery_records)}</span
          >
        </div>
        <div class="list-row">
          <span class="grow">Progress and stats</span><span class="t-data"
            >{progressTables} {progressTables === 1 ? "table" : "tables"}</span
          >
        </div>
      </div>
      <ShowMore label="Raw tables" summary="for troubleshooting">
        {#if entries.length === 0}
          <p class="t-caption">
            Without the game's content the server reads no tables from this save.
          </p>
        {:else}
          <div class="split">
            <div class="tables" role="group" aria-label="Tables">
              {#each ["Progress", "Account"] as group (group)}
                {@const rows = entries.filter((e) => e.group === group)}
                {#if rows.length > 0}
                  <span class="t-label group">{group}</span>
                  {#each rows as entry (entry.id)}
                    <button
                      type="button"
                      class="pick table-row"
                      aria-pressed={chosen?.id === entry.id}
                      onclick={() => (tableId = entry.id)}
                    >
                      <span class="grow">{entry.label}</span>
                      <span class="t-data">{entry.hint}</span>
                    </button>
                  {/each}
                {/if}
              {/each}
            </div>

            {#if detail}
              <div class="detail">
                <span class="title">
                  <span class="t-body-strong">{detail.title}</span>
                  <span class="t-caption">{detail.caption}</span>
                </span>
                {#if detail.rows.length > 0}
                  <div class="scroll">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col" class="t-label">Column</th>
                          <th scope="col" class="t-label right">Stored value</th>
                          <th scope="col" class="t-label">In the save</th>
                        </tr>
                      </thead>
                      <tbody>
                        {#each detail.rows as row (row.column)}
                          <tr>
                            <td>{row.column}</td>
                            <td class="right num">{row.value}</td>
                            <td class:soft={row.source !== "Stored"}>{row.source}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </div>
                {/if}
                {#if detail.note}<span class="t-caption">{detail.note}</span>{/if}
              </div>
            {/if}
          </div>
        {/if}
      </ShowMore>
    </Glass>
  {/if}
</div>

<style>
  .column {
    width: 100%;
    max-width: 760px;
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .column :global(.panel) {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .column :global(.panel.tight) {
    gap: 6px;
  }
  h1,
  h2 {
    margin: 0;
  }
  .column :global(.tight h2) {
    padding-bottom: 6px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .title {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .path {
    overflow-wrap: anywhere;
  }
  .drivers {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .drivers .grow {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .split {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  .tables {
    flex: 1 1 220px;
    max-width: 280px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group {
    padding: 8px 10px 2px;
  }
  .table-row .grow {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 15px;
  }
  .detail {
    flex: 999 1 320px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .scroll {
    overflow-x: auto;
    border-radius: var(--radius-row);
    background: var(--graphite-raised);
  }
  table {
    width: 100%;
    min-width: 380px;
    border-collapse: collapse;
    font-size: 14px;
  }
  th {
    padding: 10px 14px 6px;
    text-align: left;
    font-weight: 600;
  }
  td {
    padding: 7px 14px;
    border-top: 1px solid var(--graphite-edge);
    overflow-wrap: anywhere;
  }
  .right {
    text-align: right;
  }
  .num {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
  .soft {
    color: var(--ink-soft);
  }
</style>
