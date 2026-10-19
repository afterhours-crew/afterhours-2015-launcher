<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import { untrack } from "svelte";
  import ComingLater from "$lib/components/ComingLater.svelte";
  import Stage from "$lib/components/Stage.svelte";
  import LogPanel from "$lib/components/LogPanel.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { featureReady } from "$lib/state/capabilities";
  import { isLive } from "$lib/state/launchbar";
  import { current, records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";
  import Sessions from "./logs/Sessions.svelte";
  import Viewer from "./logs/Viewer.svelte";

  // Logs (E1) and the log viewer (E2), from `sessions --json`. Without the
  // `sessions` capability the dashboard says "Coming later"; the console of
  // a session this window started is shown either way.
  let ready = $derived(featureReady(session.info?.server, "logs"));
  let list = $derived(current(records.sessions));
  let viewer = $derived(router.route.section === "viewer");
  let running = $derived(isLive(session.status?.state));

  $effect(() => {
    if (ready) untrack(() => void records.loadSessions());
  });
</script>

<main>
  {#if !ready}
    <div class="split" use:staggerIn>
      <div class="console" data-enter>
        <LogPanel
          lines={session.console}
          empty={running
            ? "Waiting for output…"
            : "Nothing yet. Press Play and the session's output shows up here."}
        />
      </div>
      <aside>
        <ComingLater title="Logs" track="Needs the server's sessions command (contract v1)">
          <p>
            Every session's files grouped by relevance: the server's warnings, its log, startup and
            content reports, and game crash dumps.
          </p>
          <p>
            Your server does not list its sessions yet. Until it does, this console shows the
            session started from this window.
          </p>
        </ComingLater>
      </aside>
    </div>
  {:else if !list}
    <div class="center" use:staggerIn>
      {#if records.sessions.kind === "error"}
        <Note kind="warn">Could not list the sessions: {records.sessions.message}</Note>
        <PillButton onclick={() => records.loadSessions()}>Try again</PillButton>
      {:else}
        <p class="status">Reading the session folders…</p>
      {/if}
    </div>
  {:else}
    <Stage key={viewer ? "viewer" : "sessions"} flow>
      {#if viewer}<Viewer />{:else}<Sessions {list} />{/if}
    </Stage>
  {/if}
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
    min-height: 0;
    overflow: auto;
  }
  .split {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    flex: 1 1 auto;
  }
  .console {
    flex: 999 1 520px;
    min-width: 0;
    min-height: 320px;
    display: flex;
    flex-direction: column;
  }
  aside {
    flex: 1 1 300px;
    max-width: 380px;
  }
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .status {
    margin: 24px 0;
    color: var(--ink-soft);
  }
</style>
