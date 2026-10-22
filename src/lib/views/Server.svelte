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
  // on the left lists this PC's own server and every saved one; the right
  // side shows the picked server's card and its live log, or the Add form.
  // Play, World, Profile, Map and Logs all use the server picked here.
  let entry = $derived(inUseEntry(servers.list));
  let running = $derived(isLive(session.status?.state));
  let logName = $derived(entry ? entry.name : "This PC");

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
</script>

<main use:staggerIn>
  <div class="head" data-enter>
    <h1 class="t-view-title">Server</h1>
    <span class="t-caption"
      >{entry
        ? `Play starts the game on this PC and connects it to ${entry.name}.`
        : "Play, World, Profile and Map use the server you pick here."}</span
    >
  </div>
  {#if servers.busy || session.switching}
    <p class="t-caption busy" role="status" data-enter>{session.switching ?? servers.busy}</p>
  {/if}
  {#if servers.error && !servers.adding && !entry}
    <div data-enter><Note kind="warn">{servers.error}</Note></div>
  {/if}

  <div class="body">
    <aside data-enter><ServerList {now} /></aside>

    <div class="main" data-enter>
      {#if servers.adding}
        <AddServer />
      {:else}
        {#if entry}
          <RemoteCard {entry} {now} />
        {:else}
          <ThisPcCard {now} />
        {/if}
        <div class="console">
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
          <button
            type="button"
            class="link"
            onclick={() => router.go("logs", entry ? "connections" : "sessions")}
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
  .main {
    flex: 999 1 520px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .console {
    flex: 1 1 auto;
    min-height: 240px;
    display: flex;
    flex-direction: column;
    gap: 6px;
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
