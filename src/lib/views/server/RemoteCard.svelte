<script lang="ts">
  import type { ServerEntry } from "$lib/api/types";
  import Field from "$lib/components/Field.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { formatDuration } from "$lib/state/format";
  import { isLive } from "$lib/state/launchbar";
  import { featureWords, remoteChip, remoteFacts } from "$lib/state/serverpicker";
  import { servers } from "$lib/state/servers.svelte";
  import { session } from "$lib/state/session.svelte";

  // A server on another PC (I2): what the last check found, its facts,
  // what works here, and Rename, Forget, a new pairing code when the token
  // was refused. In use it has Stop server (asked twice); looked at from
  // another server it has Use this server, which switches.
  let { entry, now, inUse }: { entry: ServerEntry; now: number; inUse: boolean } = $props();

  let health = $derived(servers.healthOf(entry.id));
  let chip = $derived(remoteChip(health));
  let connectedFor = $derived(
    inUse && servers.connectedAt && (session.adopted || session.running)
      ? formatDuration(now - servers.connectedAt.getTime())
      : null,
  );
  let thisPcRuns = $derived(servers.inUse === null && isLive(session.status?.state));
  let shared = $derived(session.settings.share_address !== null);
  let facts = $derived(remoteFacts(entry, health, connectedFor, new Date(now)));
  let features = $derived(
    featureWords(health?.state === "online" ? health.capabilities : entry.last_capabilities),
  );

  let renaming = $state(false);
  let name = $state("");
  let forgetting = $state(false);
  let stopping = $state(false);
  let newCode = $state(false);
  let pairing = $state("");
  let note = $state<{ kind: "ready" | "warn"; text: string } | null>(null);

  const dots = {
    ready: "var(--status-ready)",
    warn: "var(--status-warn)",
    info: "var(--status-info)",
  };

  function startRename() {
    name = entry.name;
    renaming = true;
    note = null;
  }

  async function rename() {
    await servers.rename(entry.id, name);
    renaming = false;
  }

  async function forget() {
    // The server in use cannot be forgotten: switch to this PC first.
    if (inUse) {
      await servers.use(null);
      if (servers.error) return;
    }
    await servers.forget(entry.id);
    forgetting = false;
  }

  async function stop() {
    stopping = false;
    note = null;
    await session.stop();
    note = session.error
      ? { kind: "warn", text: session.error }
      : { kind: "ready", text: `Stop sent to ${entry.name}.` };
  }

  async function saveCode() {
    note = null;
    if (await servers.setToken(entry.id, pairing)) {
      newCode = false;
      pairing = "";
      note = { kind: "ready", text: "New pairing code saved." };
    }
  }
</script>

<Glass radius="panel" label={entry.name} class="card">
  <div class="head">
    {#if renaming}
      <div class="rename">
        <Field id="server-name" label="Name" bind:value={name} maxlength={48} />
        <PillButton variant="solid" onclick={rename}>Save</PillButton>
        <PillButton variant="text" onclick={() => (renaming = false)}>Cancel</PillButton>
      </div>
    {:else}
      <h2 class="t-panel-title">{entry.name}</h2>
      <span class="chip"
        >{#if chip.dot}<span class="dot" style="background: {dots[chip.dot]}" aria-hidden="true"
          ></span>{/if}{chip.word}</span
      >
      <PillButton variant="text" onclick={startRename}>Rename</PillButton>
      {#if forgetting}
        <span class="t-caption">Forget {entry.name}?</span>
        <PillButton variant="solid" onclick={forget}>Forget</PillButton>
        <PillButton variant="text" onclick={() => (forgetting = false)}>Keep</PillButton>
      {:else}
        <PillButton variant="text" onclick={() => (forgetting = true)}>Forget</PillButton>
      {/if}
      {#if !inUse}
        <PillButton
          variant="solid"
          onclick={() => void servers.use(entry.id)}
          disabled={servers.busy !== null || health?.state !== "online"}>Use this server</PillButton
        >
      {:else if stopping}
        <span class="t-caption">Stop {entry.name} for everyone on it?</span>
        <PillButton variant="solid" onclick={stop}>Stop</PillButton>
        <PillButton variant="text" onclick={() => (stopping = false)}>Cancel</PillButton>
      {:else}
        <PillButton
          onclick={() => (stopping = true)}
          disabled={health?.state !== "online" && !session.adopted}>Stop server</PillButton
        >
      {/if}
    {/if}
  </div>
  {#if !inUse}
    <p class="t-caption using">
      {health?.state === "online"
        ? thisPcRuns && !shared
          ? `Use this server stops this PC's server; Play, World, Profile and Map then follow ${entry.name}.`
          : `Play, World, Profile and Map follow ${entry.name} once you use it.`
        : `${entry.name} has to answer before it can be used.`}
    </p>
  {/if}
  <div class="facts">
    {#each facts as fact (fact.label)}
      <div class="fact">
        <span class="t-caption">{fact.label}</span>
        <span class="value">{fact.value}</span>
      </div>
    {/each}
  </div>
  {#if features.length > 0}
    <div class="features">
      <span class="t-caption">Works here</span>
      {#each features as feature (feature)}<span class="feat">{feature}</span>{/each}
    </div>
  {/if}
  {#if health?.state === "refused" || newCode}
    <div class="code">
      <Field
        id="server-code"
        label="New pairing code"
        placeholder="192.168.1.32:61234/…"
        mono
        bind:value={pairing}
      />
      <PillButton variant="solid" onclick={saveCode}>Save</PillButton>
      {#if newCode}<PillButton variant="text" onclick={() => (newCode = false)}>Cancel</PillButton
        >{/if}
    </div>
  {:else}
    <button type="button" class="link" onclick={() => (newCode = true)}>New pairing code</button>
  {/if}
  {#if servers.error}<Note kind="warn">{servers.error}</Note>{/if}
  {#if note}<Note kind={note.kind}>{note.text}</Note>{/if}
</Glass>

<style>
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 10px;
  }
  h2 {
    margin: 0 auto 0 0;
  }
  .using {
    margin: -6px 0 0;
  }
  .rename {
    flex: 1 1 auto;
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }
  .rename :global(.field) {
    flex: 1 1 240px;
  }
  .chip {
    height: 34px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: var(--radius-pill);
    background: var(--graphite-raised);
    border: 1px solid var(--graphite-edge);
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px 24px;
  }
  .fact {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .features {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .feat {
    display: inline-flex;
    align-items: center;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--radius-pill);
    background: var(--graphite-raised);
    border: 1px solid var(--graphite-edge);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }
  .code {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }
  .code :global(.field) {
    flex: 1 1 320px;
  }
  .link {
    align-self: flex-start;
    min-height: 38px;
    font-size: 14px;
    color: var(--ink-soft);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .link:hover {
    color: var(--ink);
  }
</style>
