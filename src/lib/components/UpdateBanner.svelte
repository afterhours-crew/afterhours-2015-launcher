<script lang="ts">
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";
  import { updater } from "$lib/state/updater.svelte";
  import PillButton from "./PillButton.svelte";
  import StatusDot from "./StatusDot.svelte";

  // The Ask banner: version, the start of the notes, Update / Later / Skip.
  // It also carries a pending or running install. Never the play color:
  // Play stays the only accent on the screen.
  let candidate = $derived(updater.candidate);
  let serverLine = $derived.by(() => {
    const server = candidate?.server;
    const current = session.serverTag;
    if (!server || !current) return null;
    return server.tag === current
      ? `Same server, ${current}.`
      : `Server ${current} → ${server.tag}. Your saves are copied first.`;
  });
  let firstNotes = $derived(
    (candidate?.notes ?? "")
      .split(/\r?\n/)
      .map((l) => l.replace(/^[#*\-\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" "),
  );
  let progress = $derived.by(() => {
    const p = updater.progress;
    if (!p) return null;
    const mb = (n: number) => (n / 1_048_576).toFixed(1);
    return p.total ? `${mb(p.downloaded)} of ${mb(p.total)} MB` : `${mb(p.downloaded)} MB`;
  });
</script>

{#if candidate}
  <section class="banner ah-glass" aria-label="Launcher update" aria-live="polite">
    <div class="text">
      <span class="title">
        <StatusDot
          kind={updater.phase === "error" ? "warn" : "info"}
          label={`Launcher ${candidate.version} is ready`}
        />
      </span>
      {#if updater.phase === "downloading"}
        <span class="line">Downloading{progress ? ` · ${progress}` : "…"}</span>
      {:else if updater.phase === "installing"}
        <span class="line">Installing. The launcher closes and reopens by itself.</span>
      {:else if updater.phase === "waiting" || updater.phase === "error"}
        <span class="line warn">{updater.message}</span>
      {:else}
        {#if serverLine}<span class="line">{serverLine}</span>{/if}
        {#if firstNotes}<span class="line notes">{firstNotes}</span>{/if}
      {/if}
    </div>
    <div class="actions">
      {#if updater.phase !== "downloading" && updater.phase !== "installing"}
        <PillButton variant="text" onclick={() => router.go("settings", "updates")}
          >Details</PillButton
        >
        <PillButton variant="text" onclick={() => void updater.skip()}>Skip this version</PillButton
        >
        <PillButton variant="outline" onclick={() => updater.later()}>Later</PillButton>
        {#if updater.canInstall}
          <PillButton
            variant="solid"
            disabled={updater.phase === "waiting"}
            onclick={() => void updater.install()}>Update</PillButton
          >
        {:else}
          <PillButton variant="solid" onclick={() => void updater.download()}>Download</PillButton>
        {/if}
      {/if}
    </div>
  </section>
{/if}

<style>
  .banner {
    margin: 12px var(--space-6) 0;
    padding: 10px 10px 10px 16px;
    border-radius: var(--radius-row);
    background: var(--graphite);
    border: 1px solid var(--graphite-edge);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 320px;
  }
  .title :global(.status) {
    color: var(--ink);
    font-weight: 600;
    font-size: 16px;
  }
  .line {
    color: var(--ink-soft);
    font-size: 14px;
  }
  .notes {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .warn {
    color: var(--warn-ink);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
</style>
