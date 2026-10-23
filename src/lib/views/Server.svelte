<script lang="ts">
  import { untrack } from "svelte";
  import { staggerIn } from "$lib/motion";
  import LogPanel from "$lib/components/LogPanel.svelte";
  import Note from "$lib/components/Note.svelte";
  import { isLive } from "$lib/state/launchbar";
  import { records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";
  import { inUseEntry } from "$lib/state/serverpicker";
  import { servers } from "$lib/state/servers.svelte";
  import { session } from "$lib/state/session.svelte";
  import AddServer from "./server/AddServer.svelte";
  import RemoteCard from "./server/RemoteCard.svelte";
  import ServerList from "./server/ServerList.svelte";
  import ThisPcCard from "./server/ThisPcCard.svelte";

  // Server (I1 to I3): pick a server, your own included. The Servers panel
  // on the left lists this PC's own server and every saved one; pressing a
  // row shows its card on the right, and the card's Use button switches to
  // it. Play, World, Profile, Map and Logs all use the server in use. The
  // card of the server in use ends with its live log; another server's
  // card ends with the launcher's log of it.
  let entry = $derived(inUseEntry(servers.list));
  let shownId = $derived(servers.shown);
  let shownEntry = $derived(servers.list.servers.find((s) => s.id === shownId) ?? null);
  let shownInUse = $derived(shownId === servers.inUse);
  let running = $derived(isLive(session.status?.state));
  let logName = $derived(shownEntry ? shownEntry.name : "This PC");

  // "Running for" and "Checked … ago" tick every second while shown.
  let now = $state(Date.now());
  $effect(() => {
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 1_000);
    return () => clearInterval(timer);
  });

  // Every saved server is checked while this screen is open.
  $effect(() => untrack(() => servers.watch()));
  $effect(() => {
    if (records.canProfile) untrack(() => void records.loadProfiles());
  });
  // A server looked at from another one shows the launcher's log of it.
  $effect(() => {
    const id = shownId;
    const inUse = shownInUse;
    if (!inUse) untrack(() => void servers.loadBrowseLog(id));
  });
</script>

<main use:staggerIn>
  <div class="head" data-enter>
    <h1 class="t-view-title">Server</h1>
    <span class="t-caption"
      >{entry
        ? `Play starts the game on this PC and connects it to ${entry.name}.`
        : "Play, World, Profile and Map use the server in use."}</span
    >
  </div>
  {#if servers.busy || session.switching}
    <p class="t-caption busy" role="status" data-enter>{session.switching ?? servers.busy}</p>
  {/if}
  {#if servers.error && !servers.adding && !shownEntry}
    <div data-enter><Note kind="warn">{servers.error}</Note></div>
  {/if}

  <div class="body">
    <aside data-enter><ServerList {now} /></aside>

    <div class="main" data-enter>
      {#if servers.adding}
        <AddServer />
      {:else}
        {#if shownEntry}
          <RemoteCard entry={shownEntry} {now} inUse={shownInUse} />
        {:else}
          <ThisPcCard {now} inUse={shownInUse} />
        {/if}
        <div class="console">
          {#if shownInUse}
            <LogPanel
              title="Log · {logName}"
              lines={session.console}
              received={session.received}
              empty={running
                ? "Waiting for output…"
                : entry
                  ? `Nothing yet. ${entry.name}'s log shows here while it answers.`
                  : "Nothing yet. Serve starts your server here, and its log shows up as it runs."}
            />
          {:else}
            <LogPanel
              title="Connections · {logName}"
              lines={servers.browseLog}
              empty="Nothing yet. Using {logName}, connecting to it and stopping it will be noted here."
            />
          {/if}
          <button
            type="button"
            class="link"
            onclick={() => router.go("logs", shownEntry ? "connections" : "sessions")}
            >Earlier sessions and connections are in Logs</button
          >
        </div>
      {/if}
    </div>
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
  .busy {
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
  aside {
    flex: 1 1 300px;
    max-width: 320px;
    align-self: stretch;
  }
  /* The card takes its height; the log takes the rest and scrolls inside
     itself, never past the window's bottom edge. */
  .main {
    flex: 999 1 520px;
    min-width: 0;
    min-height: 0;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .console {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .console > :global(.log) {
    min-height: 120px;
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
