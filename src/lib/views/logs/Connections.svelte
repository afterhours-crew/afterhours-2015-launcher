<script lang="ts">
  import { untrack } from "svelte";
  import { staggerIn } from "$lib/motion";
  import IconArrowLeft from "@tabler/icons-svelte/icons/arrow-left";
  import { api } from "$lib/api/tauri";
  import type { OutputLine } from "$lib/api/types";
  import LogPanel from "$lib/components/LogPanel.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { sampleMode } from "$lib/state/preview";
  import { router } from "$lib/state/router.svelte";
  import { parseConnectionLog } from "$lib/state/serverpicker";
  import { servers } from "$lib/state/servers.svelte";

  // Connections: the launcher's own log of what happened with each server
  // (picked, connected, refused, not reachable, stop sent, a game
  // started), one server at a time, newest last. The server in use opens
  // first.
  let picked = $state<string | null | undefined>(undefined);
  let lines = $state<OutputLine[]>([]);
  let error = $state<string | null>(null);
  let loading = $state(false);

  let choices = $derived([
    { id: null, name: "This PC" },
    ...servers.list.servers.map((s) => ({ id: s.id, name: s.name })),
  ]);
  let shown = $derived(picked === undefined ? servers.list.in_use : picked);
  let name = $derived(choices.find((c) => c.id === shown)?.name ?? "This PC");

  async function load(id: string | null) {
    loading = true;
    error = null;
    try {
      if (sampleMode) {
        lines = parseConnectionLog(
          `${new Date().toISOString()}\tPicked ${name}\t\n${new Date().toISOString()}\tConnected to ${name}\t6 ms\n`,
        );
        return;
      }
      lines = parseConnectionLog(await api.connectionLog(id));
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const id = shown;
    untrack(() => void load(id));
  });
</script>

<div class="column" use:staggerIn>
  <div class="head" data-enter>
    <PillButton variant="text" onclick={() => router.go("logs", "sessions")}>
      <IconArrowLeft size={16} stroke={2} aria-hidden="true" /> Sessions
    </PillButton>
    <h1 class="t-view-title">Connections</h1>
  </div>
  <div class="pick" data-enter role="group" aria-label="Server">
    {#each choices as choice (choice.id ?? "this-pc")}
      <button
        type="button"
        class="tab"
        aria-pressed={choice.id === shown}
        onclick={() => (picked = choice.id)}>{choice.name}</button
      >
    {/each}
    <PillButton variant="text" onclick={() => load(shown)} disabled={loading}
      >{loading ? "Reading…" : "Refresh"}</PillButton
    >
  </div>
  {#if error}<div data-enter><Note kind="warn">{error}</Note></div>{/if}
  <div class="panel" data-enter>
    <LogPanel
      title="Connections · {name}"
      {lines}
      empty="Nothing yet. Picking, connecting to and stopping {name} will be noted here."
    />
  </div>
</div>

<style>
  .column {
    width: 100%;
    max-width: var(--page-wide);
    align-self: center;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  h1 {
    margin: 0;
  }
  .pick {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .tab {
    height: var(--control-height);
    padding: 0 16px;
    border-radius: var(--radius-pill);
    background: var(--graphite);
    border: 1px solid var(--graphite-edge);
    color: var(--ink-soft);
    font-size: 14px;
    font-weight: 600;
  }
  .tab[aria-pressed="true"] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--on-ink);
  }
  .panel {
    flex: 1 1 auto;
    min-height: 320px;
    display: flex;
    flex-direction: column;
  }
</style>
