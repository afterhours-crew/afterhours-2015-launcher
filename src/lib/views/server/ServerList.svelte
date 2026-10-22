<script lang="ts">
  import IconChevronRight from "@tabler/icons-svelte/icons/chevron-right";
  import IconDeviceDesktop from "@tabler/icons-svelte/icons/device-desktop";
  import IconPlus from "@tabler/icons-svelte/icons/plus";
  import IconServer from "@tabler/icons-svelte/icons/server";
  import Glass from "$lib/components/Glass.svelte";
  import { formatDuration } from "$lib/state/format";
  import { pickNote, rowStatus, thisPcRow } from "$lib/state/serverpicker";
  import { servers } from "$lib/state/servers.svelte";
  import { session } from "$lib/state/session.svelte";
  import { isLive } from "$lib/state/launchbar";

  // The Servers panel (I1): this PC's own server first, then every saved
  // one, each a row with its name, what is known of it and a dot plus a
  // word. Pressing a row uses that server; the one in use says so. "Add a
  // server" opens the form in place of the card.
  let { now }: { now: number } = $props();

  let shared = $derived(session.settings.share_address !== null);
  let thisPcInUse = $derived(servers.inUse === null);
  // This PC's session is only known while it is the one followed.
  let thisPcStatus = $derived(thisPcInUse ? session.status : null);
  let thisPcRuns = $derived(thisPcInUse && isLive(session.status?.state));
  let own = $derived(thisPcRow(thisPcStatus, shared, thisPcInUse));
  let checked = $derived(
    servers.checking
      ? "Checking…"
      : servers.checkedAt
        ? `Checked ${formatDuration(now - servers.checkedAt.getTime())} ago`
        : "",
  );
  let note = $derived(pickNote(thisPcInUse, shared, thisPcRuns));

  const dots = {
    ready: "var(--status-ready)",
    warn: "var(--status-warn)",
    info: "var(--status-info)",
  };

  function pick(id: string | null) {
    servers.adding = false;
    void servers.use(id);
  }
</script>

<Glass radius="phone" label="Servers" class="servers">
  <div class="head">
    <h2 class="t-panel-title">Servers</h2>
    <span class="t-caption">{checked}</span>
  </div>
  <button
    type="button"
    class="srv"
    aria-pressed={thisPcInUse && !servers.adding}
    disabled={servers.busy !== null}
    onclick={() => pick(null)}
  >
    <IconDeviceDesktop size={22} stroke={1.6} aria-hidden="true" />
    <span class="text">
      <span class="name">This PC</span>
      <span class="t-caption sub">{own.subline}</span>
    </span>
    <span class="status t-caption"
      >{#if own.dot}<span class="dot" style="background: {dots[own.dot]}" aria-hidden="true"
        ></span>{/if}{own.word}</span
    >
  </button>
  {#each servers.list.servers as entry (entry.id)}
    {@const row = rowStatus(
      entry,
      servers.healthOf(entry.id),
      servers.inUse === entry.id,
      new Date(now),
    )}
    <button
      type="button"
      class="srv"
      aria-pressed={servers.inUse === entry.id && !servers.adding}
      disabled={servers.busy !== null}
      onclick={() => pick(entry.id)}
    >
      <IconServer size={22} stroke={1.6} aria-hidden="true" />
      <span class="text">
        <span class="name">{entry.name}</span>
        <span class="t-caption sub">{row.subline}</span>
      </span>
      <span class="status t-caption"
        >{#if row.dot}<span class="dot" style="background: {dots[row.dot]}" aria-hidden="true"
          ></span>{/if}{row.word}</span
      >
    </button>
  {/each}
  <button
    type="button"
    class="srv add"
    aria-pressed={servers.adding}
    disabled={servers.busy !== null}
    onclick={() => (servers.adding = true)}
  >
    <IconPlus size={20} stroke={1.8} aria-hidden="true" />
    <span class="text"><span class="name">Add a server</span></span>
    <IconChevronRight size={16} stroke={2} aria-hidden="true" />
  </button>
  <span class="t-caption note">{note}</span>
</Glass>

<style>
  :global(.servers) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 18px 12px;
    height: 100%;
    box-sizing: border-box;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 8px 10px;
  }
  h2 {
    margin: 0;
  }
  .srv {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 60px;
    padding: 8px 12px;
    border-radius: var(--radius-row);
    background: transparent;
    color: var(--ink);
    text-align: left;
  }
  .srv :global(svg) {
    flex: 0 0 auto;
    color: var(--ink-soft);
  }
  .srv:hover:not(:disabled) {
    background: var(--row-hover);
  }
  .srv[aria-pressed="true"] {
    background: var(--selected);
    box-shadow: inset 0 0 0 1px var(--selected-edge);
  }
  .srv:disabled {
    cursor: default;
  }
  .add {
    margin-top: 6px;
    min-height: 48px;
  }
  .text {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    gap: 2px;
  }
  .name {
    font-weight: 600;
    line-height: 1.3;
  }
  .sub {
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .note {
    padding: 10px 8px 0;
    margin-top: auto;
  }
</style>
