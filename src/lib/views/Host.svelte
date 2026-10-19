<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import { inTauri } from "$lib/api/tauri";
  import Glass from "$lib/components/Glass.svelte";
  import LogPanel from "$lib/components/LogPanel.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Soon from "$lib/components/Soon.svelte";
  import StatusDot from "$lib/components/StatusDot.svelte";
  import { hostModel } from "$lib/state/host";
  import { isLive } from "$lib/state/launchbar";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";

  // Host: the local server on its own. Serve runs the server without the
  // game (`serve`), and its console lines show below as they arrive. While
  // it hosts, Play starts the game in the same session (`play`), or on an
  // older server restarts it with the game. The server listens on this PC
  // only; LAN play needs server support.
  let model = $derived(
    hostModel({
      serverReady: session.serverReady || !inTauri,
      gameChosen: session.settings.game_dir !== null || !inTauri,
      status: session.status,
      running: session.running,
    }),
  );
  let server = $derived(session.info?.server ?? null);
  let running = $derived(isLive(session.status?.state));

  function act() {
    if (model.button.action === "stop") void session.stop();
    else if (model.button.action === "serve") void session.start("serve");
  }
</script>

<main use:staggerIn>
  <div class="console" data-enter>
    <LogPanel
      title="Server log"
      lines={session.console}
      received={session.received}
      empty={running
        ? "Waiting for output…"
        : "Nothing yet. Serve starts your server here, and its output shows up as it runs."}
    />
    <div class="below">
      <span class="caption"
        >This window's session only. Earlier sessions and their full logs are in Logs.</span
      >
      <PillButton variant="text" onclick={() => router.go("logs")}>Open logs</PillButton>
    </div>
  </div>

  <aside>
    <Glass dense radius="phone" label="Local server" class="side">
      <h1 class="t-view-title">Local server</h1>
      <StatusDot kind={model.dot} label={model.state} />
      <div class="buttons">
        <PillButton variant="solid" disabled={model.button.disabled} onclick={act}
          >{model.button.label}</PillButton
        >
      </div>
      {#if model.reason}<span class="caption">{model.reason}</span>{/if}
      <span class="caption">
        Serve runs the server without the game. Play runs both. Stop ends either.
      </span>

      <div class="section">
        <h2 class="t-panel-title">How it listens</h2>
        <dl class="facts">
          <dt class="t-label muted">Address</dt>
          <dd class="t-data">127.0.0.1 · this PC only</dd>
          <dt class="t-label muted">Drivers</dt>
          <dd class="t-data">one, you</dd>
          <dt class="t-label muted">Build</dt>
          <dd class="t-data">{server?.version_line ?? server?.pinned_tag ?? "unknown"}</dd>
        </dl>
        <div class="line"><Soon /><span class="caption">LAN play and who is connected</span></div>
      </div>
    </Glass>
  </aside>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-6) var(--space-6);
    min-height: 0;
    overflow: auto;
    align-items: stretch;
  }
  /* The server log runs the full height of the view and scrolls inside
     itself; the page around it does not scroll for it. */
  .console {
    flex: 999 1 520px;
    align-self: stretch;
    min-width: 0;
    min-height: 320px;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  aside {
    flex: 1 1 300px;
    max-width: 380px;
    align-self: flex-start;
  }
  aside :global(.side) {
    padding: 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h1,
  h2 {
    margin: 0;
  }
  .caption {
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-soft);
  }
  .below {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .section {
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .muted {
    color: var(--ink-muted);
  }
  .facts {
    margin: 0;
    display: grid;
    grid-template-columns: 70px minmax(0, 1fr);
    gap: 4px 12px;
    align-items: baseline;
  }
  .facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
