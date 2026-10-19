<script lang="ts">
  import { api } from "$lib/api/tauri";
  import ComingLater from "$lib/components/ComingLater.svelte";
  import LogPanel from "$lib/components/LogPanel.svelte";
  import { isLive } from "$lib/state/launchbar";
  import { session } from "$lib/state/session.svelte";

  // The live session console now; the grouped logs dashboard comes later.
  let running = $derived(isLive(session.status?.state));
  let folderError = $state<string | null>(null);

  async function openSession() {
    folderError = null;
    try {
      await api.openFolder("session");
    } catch (e) {
      folderError = String(e instanceof Error ? e.message : e);
    }
  }
</script>

<main>
  <div class="console">
    <LogPanel
      lines={session.console}
      empty={running
        ? "Waiting for output…"
        : "Nothing yet. Press Play and the session's output shows up here."}
      onOpenFolder={openSession}
    />
    {#if folderError}<p class="error">{folderError}</p>{/if}
  </div>
  <aside>
    <ComingLater title="Logs" track="Track 2 · screens, from the Logs dashboard design">
      <p>
        Every log grouped by file and relevance: sessions, server recordings, game crash dumps.
        Until then, this console shows the session started from this window.
      </p>
    </ComingLater>
  </aside>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-6);
    min-height: 0;
    overflow: auto;
  }
  .console {
    flex: 999 1 520px;
    min-width: 0;
    min-height: 320px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  aside {
    flex: 1 1 300px;
    max-width: 380px;
  }
  .error {
    margin: 0;
    color: var(--warn-ink);
    font-size: 13px;
  }
</style>
