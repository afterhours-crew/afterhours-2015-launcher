<script lang="ts">
  import { untrack } from "svelte";
  import { api } from "$lib/api/tauri";
  import Avatar from "$lib/components/Avatar.svelte";
  import DataChip from "$lib/components/DataChip.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Soon from "$lib/components/Soon.svelte";
  import { formatMoney } from "$lib/state/format";
  import { isLive } from "$lib/state/launchbar";
  import { saveFacts, tableDetail, tableEntries } from "$lib/state/profile";
  import { sampleMode } from "$lib/state/preview";
  import { current, records } from "$lib/state/records.svelte";
  import { session } from "$lib/state/session.svelte";

  // Save data (D2): every save in the data folder, and what one holds,
  // table by table, as the server's read-only profile command reports it.
  // Nothing here writes the save.
  let list = $derived(current(records.profiles));
  let load = $derived(records.shown);
  let profile = $derived(current(load));
  let activeId = $derived(current(records.profile)?.account_id ?? null);
  let shownId = $derived(records.picked ?? activeId);
  let entries = $derived(profile ? tableEntries(profile) : []);
  let tableId = $state<string | null>(null);
  let chosen = $derived(
    entries.find((e) => e.id === tableId) ??
      entries.find((e) => e.id === "GameplayStatsTable") ??
      entries[0] ??
      null,
  );
  let detail = $derived(profile && chosen ? tableDetail(profile, chosen.id) : null);
  let facts = $derived(profile ? saveFacts(profile.save, new Date()) : null);
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

<div class="layout">
  <aside>
    <Glass dense radius="phone" label="Drivers on this PC" class="drivers">
      <h2 class="t-panel-title">Drivers on this PC</h2>
      {#if list}
        <div role="radiogroup" aria-label="Driver" class="list">
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
              <span class="who">
                <span class="name"
                  >{account.display_name ?? "Unreadable save"}{account.active
                    ? " · active"
                    : ""}</span
                >
                <span class="t-data-small soft">
                  {#if account.error}{account.error}{:else}REP {account.level ?? "—"} · {account.bank
                      ? formatMoney(account.bank.balance)
                      : "no bank"}{/if}
                </span>
              </span>
            </button>
          {/each}
        </div>
        {#if list.truncated}<p class="caption">More saves exist than are listed.</p>{/if}
      {:else if records.profiles.kind === "error"}
        <Note kind="warn">{records.profiles.message}</Note>
      {:else}
        <p class="caption">Reading the saves…</p>
      {/if}
      <div class="foot">
        <span class="later"><Soon /><span class="caption">New driver and import save</span></span>
      </div>
    </Glass>
  </aside>

  <Glass dense radius="panel" label="Save data" class="panel">
    <div class="head">
      <span class="title">
        <span class="t-label soft">Profile / Save data</span>
        <h1 class="t-view-title">Save data</h1>
        {#if profile}<span class="t-data soft path">{profile.save.path}</span>{/if}
      </span>
      <div class="buttons">
        <PillButton variant="text" onclick={openData}>Open folder</PillButton>
      </div>
    </div>
    {#if folderError}<Note kind="warn">{folderError}</Note>{/if}

    {#if !profile}
      {#if load.kind === "error"}
        <Note kind="warn">Could not read this save: {load.message}</Note>
      {:else}
        <p class="caption">Reading the save…</p>
      {/if}
    {:else}
      {#if facts}
        <div class="chips">
          <DataChip text="Schema {facts.schema}" />
          <DataChip text={facts.size} />
          <DataChip text="Generation {facts.generation}" />
          <DataChip text="Last saved {facts.saved}" />
        </div>
      {/if}
      {#if live && profile.active}
        <Note kind="warn">
          Your server is using this file. This view is read-only and shows the last save the server
          committed.
        </Note>
      {/if}
      {#if profile.warnings.length > 0}<Note>{profile.warnings.join(" ")}</Note>{/if}

      <div class="split">
        <div class="tables" role="group" aria-label="Tables">
          {#each ["Progress", "Account"] as group (group)}
            {@const rows = entries.filter((e) => e.group === group)}
            {#if rows.length > 0}
              <span class="t-label muted group">{group}</span>
              {#each rows as entry (entry.id)}
                <button
                  type="button"
                  class="pick table-row"
                  aria-pressed={chosen?.id === entry.id}
                  onclick={() => (tableId = entry.id)}
                >
                  <span class="t-data">{entry.label}</span>
                  <span class="t-data-small soft">{entry.hint}</span>
                </button>
              {/each}
            {/if}
          {/each}
          {#if entries.length === 0}
            <p class="caption">
              Without the game's content the server reads no tables from this save.
            </p>
          {/if}
        </div>

        {#if detail}
          <div class="detail">
            <div class="detail-head">
              <span class="t-data detail-title">{detail.title}</span>
              <span class="caption">{detail.caption}</span>
            </div>
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
                  <tbody class="t-data">
                    {#each detail.rows as row (row.column)}
                      <tr>
                        <td>{row.column}</td>
                        <td class="right">{row.value}</td>
                        <td class="source" class:soft={row.source !== "Stored"}>{row.source}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              </div>
            {/if}
            {#if detail.note}<span class="caption">{detail.note}</span>{/if}
            <span class="caption"
              >Read-only. Values the game writes while you drive appear after its next save.</span
            >
          </div>
        {/if}
      </div>
    {/if}
  </Glass>
</div>

<style>
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    align-items: flex-start;
  }
  aside {
    flex: 1 1 260px;
    max-width: 300px;
  }
  aside :global(.drivers) {
    padding: 18px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h2,
  h1 {
    margin: 0;
  }
  aside h2 {
    padding: 0 8px 6px;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .who {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 0;
  }
  .name {
    font-weight: 700;
  }
  .pick:disabled .name {
    color: var(--ink-soft);
  }
  .soft {
    color: var(--ink-soft);
  }
  .muted {
    color: var(--ink-muted);
  }
  .caption {
    margin: 0;
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-soft);
  }
  .foot {
    padding: 10px 8px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .later {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .layout :global(.panel) {
    flex: 999 1 640px;
    min-width: 0;
    padding: 20px 24px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px 16px;
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
  .buttons,
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .split {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  .tables {
    flex: 1 1 240px;
    max-width: 300px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group {
    padding: 10px 10px 4px;
  }
  .table-row {
    min-height: var(--control-height);
    padding: 6px 10px;
    justify-content: space-between;
  }
  .detail {
    flex: 999 1 380px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .detail-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
  }
  .detail-title {
    font-size: 15px;
    font-weight: 500;
  }
  .scroll {
    overflow-x: auto;
    border-radius: 14px;
    background: var(--field);
  }
  table {
    width: 100%;
    min-width: 420px;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    padding: 10px 14px;
    color: var(--ink-muted);
  }
  td {
    padding: 7px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .right {
    text-align: right;
  }
  .source {
    font-family: var(--font-ui);
    font-size: 14px;
  }
</style>
