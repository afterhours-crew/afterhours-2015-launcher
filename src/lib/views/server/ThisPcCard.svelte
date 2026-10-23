<script lang="ts">
  import IconCopy from "@tabler/icons-svelte/icons/copy";
  import { api, inTauri } from "$lib/api/tauri";
  import Glass from "$lib/components/Glass.svelte";
  import InfoButton from "$lib/components/InfoButton.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { formatDuration } from "$lib/state/format";
  import { hostModel } from "$lib/state/host";
  import { isLive } from "$lib/state/launchbar";
  import { sampleMode } from "$lib/state/preview";
  import { current, records } from "$lib/state/records.svelte";
  import { sharedPairingCode, shortPairingCode, thisPcFacts } from "$lib/state/serverpicker";
  import { servers } from "$lib/state/servers.svelte";
  import { session } from "$lib/state/session.svelte";

  // This PC's own server (I1): what it is doing, Serve or Stop, its facts,
  // and sharing it with your other PCs, with the pairing code they paste.
  let { now }: { now: number } = $props();

  let model = $derived(
    hostModel({
      serverReady: session.serverReady || !inTauri,
      gameChosen: session.settings.game_dir !== null || !inTauri,
      status: session.status,
      running: session.running,
    }),
  );
  // Sharing changes when the server next starts, so the switch rests while
  // a session is live or this window's own is still finishing.
  let running = $derived(isLive(session.status?.state) || session.running);
  let runningFor = $derived(
    running && session.startedAt ? formatDuration(now - session.startedAt.getTime()) : null,
  );
  let shared = $derived(session.settings.share_address !== null);
  let local = $derived(session.settings.local_api);
  let address = $derived(
    local ? `${session.settings.share_address ?? "127.0.0.1"}:${local.port}` : null,
  );
  let code = $derived(sharedPairingCode(session.settings.share_address, local));
  let version = $derived(
    session.info?.server.pinned_tag?.replace(/^v/, "") ?? session.info?.server.version_line ?? null,
  );
  let saves = $derived(current(records.profiles)?.accounts.length ?? null);
  let facts = $derived(
    thisPcFacts({
      address,
      version,
      runningFor,
      saves,
      lastPlayed: servers.list.this_pc.last_played_utc,
      now: new Date(now),
    }),
  );
  let note = $state<{ kind: "ready" | "warn"; text: string } | null>(null);

  const dots = {
    ready: "var(--status-ready)",
    warn: "var(--status-warn)",
    info: "var(--status-info)",
  };

  function act() {
    if (model.button.action === "stop") void session.stop();
    else if (model.button.action === "serve") void session.start("serve");
  }

  async function share(enabled: boolean) {
    note = null;
    try {
      if (sampleMode) {
        session.settings = { ...session.settings, share_address: enabled ? "192.168.1.32" : null };
        return;
      }
      session.settings = await api.setSharing(enabled);
      note = {
        kind: "ready",
        text: enabled
          ? "Shared from its next start. Serve it, then copy the pairing code for your other PCs."
          : "Kept on this PC from its next start.",
      };
    } catch (e) {
      note = { kind: "warn", text: String(e instanceof Error ? e.message : e) };
    }
  }

  async function copy() {
    if (!code) return;
    note = null;
    try {
      await navigator.clipboard.writeText(code);
      note = {
        kind: "ready",
        text: "Pairing code copied. Paste it on your other PC under Server › Add a server.",
      };
    } catch {
      note = { kind: "warn", text: "Could not reach the clipboard." };
    }
  }
</script>

<Glass radius="panel" label="This PC" class="card">
  <div class="head">
    <h2 class="t-panel-title">This PC</h2>
    <span class="chip"
      >{#if model.dot}<span class="dot" style="background: {dots[model.dot]}" aria-hidden="true"
        ></span>{/if}{model.state}{#if running && session.settings.share_address}
        · {session.settings.share_address}{/if}</span
    >
    <PillButton
      variant={model.button.action === "serve" ? "solid" : "outline"}
      disabled={model.button.disabled}
      onclick={act}>{model.button.label}</PillButton
    >
  </div>
  {#if model.reason}<p class="t-caption reason">{model.reason}</p>{/if}
  <div class="facts">
    {#each facts as fact (fact.label)}
      <div class="fact">
        <span class="t-caption">{fact.label}</span>
        <span class="value">{fact.value}</span>
      </div>
    {/each}
  </div>
  <div class="share">
    <span class="text">
      <span class="name" id="share-label">
        Let your other PCs use this server
        <InfoButton
          label="About sharing"
          text="Your server then listens on this PC's network address, so a launcher on another PC on your network can use it, and the game no longer runs on this PC. Windows may ask you to allow it through the firewall. Takes effect when the server next starts."
        />
      </span>
      {#if code}
        <span class="t-data code" title={code}>{shortPairingCode(code)}</span>
      {:else if shared}
        <span class="t-caption">Serve once to get the pairing code.</span>
      {/if}
    </span>
    {#if code}
      <PillButton variant="text" onclick={copy}>
        <IconCopy size={16} stroke={1.8} aria-hidden="true" /> Copy
      </PillButton>
    {/if}
    <Toggle checked={shared} labelledby="share-label" disabled={running} onchange={share} />
  </div>
  {#if note}<Note kind={note.kind}>{note.text}</Note>{/if}
</Glass>

<style>
  :global(.card) {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px 24px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 14px;
  }
  h2 {
    margin: 0 auto 0 0;
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
  .reason {
    margin: -8px 0 0;
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
  .share {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 56px;
    padding-top: 12px;
    border-top: 1px solid var(--graphite-edge);
  }
  .text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .code {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
