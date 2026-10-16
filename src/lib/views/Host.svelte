<script lang="ts">
  import { api, openPath } from "$lib/api/tauri";
  import Glass from "$lib/components/Glass.svelte";
  import LogPanel from "$lib/components/LogPanel.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Switch from "$lib/components/Switch.svelte";
  import { isLive } from "$lib/state/launchbar";
  import { session } from "$lib/state/session.svelte";

  // Host: the local server, which is `nfs-afterhours serve`. Visibility and
  // the switches are the design's; the server only listens on loopback
  // today, so they are shown disabled with the reason.
  let running = $derived(isLive(session.status?.state));
  let meta = $derived(
    running && session.status
      ? `${session.status.state} · server pid ${session.status.server_pid ?? "…"} · session ${session.status.id.slice(0, 8)}`
      : "not running",
  );

  async function openLogs() {
    const dir = await api.sessionDir().catch(() => null);
    if (dir) await openPath(dir);
  }
</script>

<main>
  <Glass dense label="Local server" class="panel">
    <div class="head">
      <div class="title">
        <h1 class="t-view-title">Local server</h1>
        <span class="t-data meta">{meta}</span>
      </div>
      <span class="chip" class:on={running}>{running ? "Running" : "Stopped"}</span>
      <div class="spacer"></div>
      {#if running}
        <PillButton onclick={() => session.stop()}>Stop server</PillButton>
      {:else}
        <PillButton
          variant="solid"
          disabled={!session.cliReady || !session.settings.game_dir}
          onclick={() => session.start("serve")}>Start server</PillButton
        >
      {/if}
    </div>

    <div class="grid">
      <div class="stat"><span class="t-label">Server name</span><span>This PC</span></div>
      <div class="stat">
        <span class="t-label">Listens on</span><span class="t-data">127.0.0.1 · loopback only</span>
      </div>
      <div class="stat">
        <span class="t-label">Max drivers</span><span class="t-data">1 · solo for now</span>
      </div>
    </div>

    <div class="switches">
      <Switch
        label="Start with the launcher"
        hint="Server is ready before you press Play."
        checked={true}
        disabled
      />
      <Switch
        label="Let friends on my network join"
        hint="Needs non-loopback listening; tracked in afterhours-2015 #78."
        disabled
      />
      <Switch
        label="Allow mods"
        hint="Mods arrive with the mod system; tracked in afterhours-2015 #60."
        disabled
      />
    </div>
  </Glass>

  <div class="side">
    <Glass dense label="Drivers" class="drivers">
      <div class="head small">
        <h2 class="t-panel-title">Drivers</h2>
        <span class="t-data count">{running ? "1/1" : "0/1"}</span>
      </div>
      {#if running}
        <div class="driver">
          <span class="avatar" style="background: var(--{session.settings.avatar ?? 'style'})"
            >{(session.settings.player_name ?? "D").slice(0, 2).toUpperCase()}</span
          >
          <span class="who"
            ><strong>{session.settings.player_name ?? "Driver"}</strong><span
              class="t-data-small sub">host · this PC</span
            ></span
          >
        </div>
      {:else}
        <span class="empty">Start the server to let drivers in.</span>
      {/if}
    </Glass>
    <LogPanel
      lines={session.console}
      empty={running ? "Waiting for output…" : "Server stopped. Start it to see its log here."}
      onOpenFolder={openLogs}
    />
  </div>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-6);
    min-height: 0;
  }
  main :global(.panel) {
    flex: 1 1 520px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
  }
  .head.small {
    justify-content: space-between;
    padding: 0 4px 4px;
  }
  .title {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  h1,
  h2 {
    margin: 0;
  }
  .meta {
    color: var(--ink-soft);
  }
  .chip {
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: var(--field);
    color: var(--ink-muted);
    border: 1px solid var(--glass-edge);
  }
  .chip.on {
    background: rgba(61, 214, 140, 0.2);
    color: #6be6a8;
    border-color: rgba(61, 214, 140, 0.5);
  }
  .spacer {
    flex: 1 1 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
    gap: 12px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .stat .t-label {
    color: var(--ink-muted);
  }
  .switches {
    display: flex;
    flex-direction: column;
  }
  .side {
    flex: 0 1 380px;
    min-width: 300px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
  }
  .side :global(.drivers) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px 14px;
  }
  .count,
  .sub {
    color: var(--ink-soft);
  }
  .driver {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 4px;
  }
  .avatar {
    width: var(--avatar-md);
    height: var(--avatar-md);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--on-ink);
    font-weight: 800;
    font-size: 12px;
  }
  .who {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .empty {
    padding: 6px 4px;
    color: var(--ink-muted);
  }
</style>
