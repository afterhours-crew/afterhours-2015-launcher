<script lang="ts">
  import { untrack } from "svelte";
  import { inTauri } from "$lib/api/tauri";
  import Backdrop from "$lib/components/Backdrop.svelte";
  import Header from "$lib/components/Header.svelte";
  import HeaderPlay from "$lib/components/HeaderPlay.svelte";
  import LaunchBar from "$lib/components/LaunchBar.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Stage from "$lib/components/Stage.svelte";
  import { toastIn } from "$lib/motion";
  import UpdateBanner from "$lib/components/UpdateBanner.svelte";
  import { hasCapability } from "$lib/state/capabilities";
  import { detectPlatform, isLive, launchBarModel, type PlayAction } from "$lib/state/launchbar";
  import { sampleMode } from "$lib/state/preview";
  import { driverName, headerLine } from "$lib/state/profile";
  import { current, records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";
  import { updater } from "$lib/state/updater.svelte";
  import { serverChangeNotice } from "$lib/state/updates";
  import FirstRun from "$lib/views/FirstRun.svelte";
  import Garage from "$lib/views/Garage.svelte";
  import Host from "$lib/views/Host.svelte";
  import Logs from "$lib/views/Logs.svelte";
  import MapView from "$lib/views/Map.svelte";
  import Profile from "$lib/views/Profile.svelte";
  import Settings from "$lib/views/Settings.svelte";
  import World from "$lib/views/World.svelte";

  const platform = detectPlatform(navigator.userAgent);
  let noticeDismissed = $state(false);

  $effect(() => {
    void session.load().then(() => {
      updater.start();
      // The header and the Garage show the active save's REP and bank.
      void records.loadProfile();
    });
  });

  // A session that ends has changed the save and the session list.
  let wasRunning = false;
  $effect(() => {
    const running = session.running;
    if (wasRunning && !running) untrack(() => void records.refreshAfterSession());
    wasRunning = running;
  });

  let profile = $derived(current(records.profile));

  // The wizard runs until it has been completed once; `#/first-run` shows it
  // in the browser preview.
  let firstRun = $derived(
    router.route.firstRun || (inTauri && session.loaded && !session.settings.first_run_done),
  );
  let view = $derived(router.route.view);

  let notice = $derived(
    session.serverTag && !noticeDismissed
      ? serverChangeNotice(session.settings.last_server_tag, session.serverTag)
      : null,
  );

  let model = $derived(
    launchBarModel({
      platform,
      serverReady: session.serverReady || !inTauri,
      updating: updater.holdsPlay,
      gameChosen: session.settings.game_dir !== null || !inTauri,
      status: session.status,
      // Restart with game holds Play between stopping and starting again.
      running: session.running || session.restarting,
      canPlay: hasCapability(session.info?.server, "play"),
    }),
  );

  function onPlay(action: PlayAction) {
    switch (action) {
      case "stop":
        void session.stop();
        break;
      case "play":
        void session.play();
        break;
      case "restart":
        void session.restartWithGame();
        break;
      default:
        void session.start(action);
    }
  }
</script>

<div class="window">
  <Backdrop dim={firstRun || view !== "garage"} radial={firstRun} />
  <Header
    {view}
    onNavigate={(v) => router.go(v)}
    driverName={driverName(profile) ?? session.settings.player_name ?? "Driver"}
    subline={headerLine(profile)}
    avatar={session.settings.avatar}
    online={isLive(session.status?.state)}
    showNav={!firstRun}
  >
    {#snippet play()}
      {#if !firstRun && view !== "garage"}<HeaderPlay pill={model.pill} {onPlay} />{/if}
    {/snippet}
  </Header>

  {#if !inTauri}
    <p class="banner" in:toastIn>
      {#if sampleMode}
        Sample data · browser preview only. Nothing here comes from a real save or session.
      {:else}
        Browser preview: the desktop window is needed to run anything. Use <code
          >pnpm tauri dev</code
        >. Add <code>?sample</code> to the address to look at the screens with made-up records.
      {/if}
    </p>
  {/if}
  {#if session.error}
    <p class="banner warn" in:toastIn>{session.error}</p>
  {/if}
  {#if session.closeBlocked}
    <div class="banner warn row" in:toastIn>
      <span
        >A session is running. Stop it before closing the launcher: closing now would end your game.</span
      >
      <PillButton variant="text" onclick={() => (session.closeBlocked = false)}>OK</PillButton>
    </div>
  {/if}
  {#if !firstRun && notice}
    <div class="banner row" in:toastIn>
      <span>{notice}</span>
      <PillButton variant="text" onclick={() => (noticeDismissed = true)}>OK</PillButton>
    </div>
  {/if}
  {#if !firstRun && updater.bannerVisible}
    <div in:toastIn><UpdateBanner /></div>
  {/if}

  {#if firstRun}
    <FirstRun {platform} onDone={() => router.go("garage")} />
    <p class="legal">
      Community preservation project. Not affiliated with Electronic Arts or Ghost Games.
    </p>
  {:else}
    <!-- Changing view: the old one fades out, the new one rises 8px as its
         panels fade in (Stage, staggerIn). -->
    <Stage key={view} rise={8}>
      {#if view === "garage"}
        <Garage />
      {:else if view === "profile"}
        <Profile />
      {:else if view === "world"}
        <World />
      {:else if view === "map"}
        <MapView />
      {:else if view === "host"}
        <Host />
      {:else if view === "logs"}
        <Logs />
      {:else}
        <Settings />
      {/if}
    </Stage>
    <!-- The full launch bar sits on the Garage home's floor only; every other
         view runs to the window's edge and has the compact Play in the header. -->
    {#if view === "garage"}<LaunchBar {model} {onPlay} />{/if}
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
    padding: 10px 16px;
    border-radius: var(--radius-row);
    background: var(--graphite);
    border: 1px solid var(--graphite-edge);
    color: var(--ink-soft);
    font-size: 14px;
  }
  .banner.row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 6px 4px 14px;
  }
  .banner.warn {
    background: var(--warn-soft);
    border-color: var(--warn-edge);
    color: var(--warn-ink);
  }
  code {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 14px;
  }
  .legal {
    margin: 0;
    padding: 0 var(--space-6) 18px;
    text-align: center;
    font-size: 14px;
    color: var(--ink-soft);
  }
</style>
