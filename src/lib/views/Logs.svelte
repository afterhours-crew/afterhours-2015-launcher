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
  import Sessions from "./logs/Sessions.svelte";
  import Viewer from "./logs/Viewer.svelte";

  // Logs (H7) and the log viewer (H8), from `sessions --json`. Without the
  // `sessions` capability the view gives one note; the live log of a
  // session this window started is on Host either way.
  let ready = $derived(featureReady(session.info?.server, "logs"));
  let list = $derived(current(records.sessions));
  let viewer = $derived(router.route.section === "viewer");

  $effect(() => {
    if (ready) untrack(() => void records.loadSessions());
  });
</script>

<main>
  {#if !ready}
    <div class="column" use:staggerIn>
      <h1 class="t-view-title" data-enter>Logs</h1>
      <div data-enter>
        <ViewNote>
          Earlier sessions and their files arrive with a server update. The session you start here
          shows its log live on Host.
        </ViewNote>
      </div>
      <div data-enter><PillButton onclick={() => router.go("host")}>Open Host</PillButton></div>
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
