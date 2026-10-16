<script lang="ts">
  import { inTauri } from "$lib/api/tauri";
  import Backdrop from "$lib/components/Backdrop.svelte";
  import Header from "$lib/components/Header.svelte";
  import LaunchBar from "$lib/components/LaunchBar.svelte";
  import { detectPlatform, isLive, launchBarModel } from "$lib/state/launchbar";
  import { session } from "$lib/state/session.svelte";
  import type { View } from "$lib/state/views";
  import FirstRun from "$lib/views/FirstRun.svelte";
  import Garage from "$lib/views/Garage.svelte";
  import Host from "$lib/views/Host.svelte";
  import Settings from "$lib/views/Settings.svelte";

  const platform = detectPlatform(navigator.userAgent);
  let view = $state<View>("garage");
  let firstRun = $state(false);

  $effect(() => {
    session.load().then(() => {
      firstRun = !session.settings.first_run_done;
      if (!inTauri) {
        // Browser preview for styling work: no backend, so no wizard, and
        // `?view=host` opens a screen directly.
        firstRun = new URLSearchParams(location.search).get("view") === "firstrun";
        const wanted = new URLSearchParams(location.search).get("view");
        if (wanted && ["garage", "host", "settings"].includes(wanted)) {
          view = wanted as View;
        }
      }
    });
  });

  let model = $derived(
    launchBarModel({
      platform,
      cliReady: session.cliReady,
      gameChosen: session.settings.game_dir !== null,
      status: session.status,
      running: session.running,
    }),
  );

  function onPlay(action: "start" | "serve" | "stop") {
    if (action === "stop") void session.stop();
    else void session.start(action);
  }
</script>

<div class="window">
  <Backdrop dim={firstRun || view !== "garage"} radial={firstRun} />
  <Header
    {view}
    onNavigate={(v) => (view = v)}
    driverName={session.settings.player_name ?? "Driver"}
    online={isLive(session.status?.state)}
    showNav={!firstRun}
  />

  {#if !inTauri}
    <p class="banner">
      Browser preview: the desktop window is needed to run anything. Use <code>pnpm tauri dev</code
      >.
    </p>
  {/if}
  {#if session.error}
    <p class="banner warn">{session.error}</p>
  {/if}

  {#if firstRun}
    <FirstRun {platform} onDone={() => (firstRun = false)} />
    <p class="legal">
      Community preservation project. Not affiliated with Electronic Arts or Ghost Games.
    </p>
  {:else}
    {#if view === "garage"}
      <Garage />
    {:else if view === "host"}
      <Host />
    {:else}
      <Settings />
    {/if}
    <LaunchBar {model} {onPlay} />
  {/if}
</div>

<style>
  .window {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* The backdrop is the first child and stays absolute; everything after
     it stacks above the art. */
  .window > :global(:not(:first-child)) {
    position: relative;
    z-index: 1;
  }
  .banner {
    margin: 12px var(--space-6) 0;
    padding: 10px 14px;
    border-radius: var(--radius-row);
    background: var(--field);
    border: 1px solid var(--glass-edge);
    color: var(--ink-soft);
    font-size: 13px;
  }
  .banner.warn {
    background: var(--warn-soft);
    border-color: var(--warn-edge);
    color: var(--warn-ink);
  }
  code {
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .legal {
    margin: 0;
    padding: 0 var(--space-6) 18px;
    text-align: center;
    font-size: 12px;
    color: var(--ink-muted);
  }
</style>
