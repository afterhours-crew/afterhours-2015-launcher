<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import { untrack } from "svelte";
  import Stage from "$lib/components/Stage.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import ViewNote from "$lib/components/ViewNote.svelte";
  import { featureReady } from "$lib/state/capabilities";
  import { current, records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";
  import Connections from "./logs/Connections.svelte";
  import Sessions from "./logs/Sessions.svelte";
  import Viewer from "./logs/Viewer.svelte";

  // Logs (H7) and the log viewer (H8), from `sessions --json`, and the
  // launcher's own connection log per server. Without the `sessions`
  // capability the view gives one note; the live log of the server in use
  // is on Server either way.
  let ready = $derived(featureReady(session.info?.server, "logs"));
  let list = $derived(current(records.sessions));
  let section = $derived(router.route.section ?? "sessions");

  $effect(() => {
    if (ready) untrack(() => void records.loadSessions());
  });
</script>

<main>
  {#if section === "connections"}
    <Stage key="connections" flow>
      <Connections />
    </Stage>
  {:else if !ready}
    <div class="column" use:staggerIn>
      <h1 class="t-view-title" data-enter>Logs</h1>
      <div data-enter>
        <ViewNote>Earlier sessions, their files and what they say.</ViewNote>
      </div>
      <div class="now" data-enter>
        <span class="t-caption">The server in use shows its log live on Server.</span>
        <PillButton onclick={() => router.go("server")}>Open Server</PillButton>
        <PillButton variant="text" onclick={() => router.go("logs", "connections")}
          >Connections</PillButton
        >
      </div>
    </div>
  {:else if !list}
    <div class="column" use:staggerIn>
      {#if records.sessions.kind === "error"}
        <Note kind="warn">Could not list the sessions: {records.sessions.message}</Note>
        <div><PillButton onclick={() => records.loadSessions()}>Try again</PillButton></div>
      {:else}
        <p class="t-caption">Reading the session folders…</p>
      {/if}
    </div>
  {:else}
    <Stage key={section === "viewer" ? "viewer" : "sessions"} flow>
      {#if section === "viewer"}<Viewer />{:else}<Sessions {list} />{/if}
    </Stage>
  {/if}
</main>

<style>
  /* What works already, beside the coming note. */
  .now {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    padding: var(--space-6);
  }
  .column {
    width: 100%;
    max-width: 680px;
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  h1 {
    margin: 0;
  }
</style>
