<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import { inTauri } from "$lib/api/tauri";
  import Glass from "$lib/components/Glass.svelte";
  import InfoButton from "$lib/components/InfoButton.svelte";
  import LogPanel from "$lib/components/LogPanel.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { formatDuration } from "$lib/state/format";
  import { hostModel } from "$lib/state/host";
  import { isLive } from "$lib/state/launchbar";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";

  // Host (H6): the local server on its own. Serve runs it without the game
  // (`serve`); its log fills the view and follows the newest line. While it
  // hosts, Play starts the game in the same session (`play`), or on an
  // older server restarts it with the game. The server listens on this PC.
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

  // "Running for" counts in seconds for its first minute, so it ticks every
  // second while the server runs, and not at all otherwise.
  let now = $state(Date.now());
  $effect(() => {
    if (!running) return;
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 1_000);
    return () => clearInterval(timer);
  });
  let runningFor = $derived(
    running && session.startedAt ? formatDuration(now - session.startedAt.getTime()) : null,
  );

  const dots = {
    ready: "var(--status-ready)",
    warn: "var(--status-warn)",
    info: "var(--status-info)",
  };

  function act() {
    if (model.button.action === "stop") void session.stop();
    else if (model.button.action === "serve") void session.start("serve");
  }
</script>

<main use:staggerIn>
  <div class="head" data-enter>
    <h1 class="t-view-title">Host</h1>
    <span class="chip"
      >{#if model.dot}<span class="dot" style="background: {dots[model.dot]}" aria-hidden="true"
        ></span>{/if}{model.state}</span
    >
    <PillButton
      variant={model.button.action === "serve" ? "solid" : "outline"}
      disabled={model.button.disabled}
      onclick={act}>{model.button.label}</PillButton
    >
  </div>
  {#if model.reason}<p class="t-caption reason" data-enter>{model.reason}</p>{/if}

  <div class="body">
    <div class="console" data-enter>
      <LogPanel
        title="Server log"
        lines={session.console}
        received={session.received}
        empty={running
          ? "Waiting for output…"
          : "Nothing yet. Serve starts your server here, and its log shows up as it runs."}
      />
    </div>

    <aside data-enter>
      <Glass radius="phone" label="Server" class="side">
        <h2 class="t-panel-title">Server</h2>
        <div class="rows">
          <div class="list-row">
            <span class="grow">Drivers</span><span class="t-caption">Only you</span>
          </div>
          {#if runningFor}
            <div class="list-row">
              <span class="grow">Running for</span><span class="t-num">{runningFor}</span>
            </div>
          {/if}
          <div class="list-row">
            <span class="grow">Version</span><span class="t-num"
              >{server?.pinned_tag ?? "unknown"}</span
            >
          </div>
          <div class="list-row">
            <span class="grow">Reachable from</span><span class="t-caption">This PC</span>
            <InfoButton
              label="About reaching your server"
              text="Your server listens on 127.0.0.1, so only this PC can join. Playing over a LAN needs server support."
            />
          </div>
        </div>
        <button type="button" class="link" onclick={() => router.go("logs")}
          >Earlier sessions are in Logs</button
        >
      </Glass>
    </aside>
  </div>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }
  /* The heading, the note and the log with its side panel share one
     centred width. */
  main > :global(*) {
    width: 100%;
    max-width: var(--page-wide);
    margin-inline: auto;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 16px;
  }
  h1 {
    margin: 0 auto 0 0;
  }
  .chip {
    height: 34px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: var(--radius-pill);
    background: var(--graphite);
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
    text-align: right;
  }
  .body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
  }
  .console {
    flex: 999 1 520px;
    min-width: 0;
    min-height: 280px;
    max-height: 100%;
    display: flex;
    flex-direction: column;
  }
  aside {
    flex: 1 1 280px;
    max-width: 320px;
    align-self: flex-start;
  }
  aside :global(.side) {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h2 {
    margin: 0;
    padding-bottom: 6px;
  }
  .link {
    align-self: flex-start;
    min-height: 38px;
    margin-top: 6px;
    font-size: 14px;
    color: var(--ink-soft);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .link:hover {
    color: var(--ink);
  }
</style>
