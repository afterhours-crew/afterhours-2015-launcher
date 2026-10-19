<script lang="ts">
  import { api, openUrl } from "$lib/api/tauri";
  import type { UpdateMode } from "$lib/api/types";
  import Glass from "$lib/components/Glass.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { session } from "$lib/state/session.svelte";
  import { updater } from "$lib/state/updater.svelte";
  import { RELEASES_URL } from "$lib/state/updates";

  const modes: { id: UpdateMode; label: string; hint: string }[] = [
    {
      id: "ask",
      label: "Ask me",
      hint: "Check in the background and ask before installing.",
    },
    {
      id: "auto",
      label: "Install automatically",
      hint: "Install when no session is running. The launcher restarts by itself.",
    },
    { id: "off", label: "Off", hint: "Only check when you press Check for updates." },
  ];

  let mode = $derived(session.settings.updates.mode);
  let candidate = $derived(updater.candidate);
  let folderError = $state<string | null>(null);

  let statusLine = $derived.by(() => {
    const at = updater.checkedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    switch (updater.phase) {
      case "checking":
        return "Checking…";
      case "current":
        return `You have the latest launcher${at ? ` · checked ${at}` : ""}.`;
      case "available":
      case "waiting":
      case "downloading":
      case "installing":
        return candidate ? `Launcher ${candidate.version} is available.` : "";
      case "refused":
        return "An update was found but is not offered.";
      case "error":
        return "The last attempt failed.";
      default:
        return mode === "off"
          ? "Automatic checks are off."
          : "Checks run in the background and stay quiet offline.";
    }
  });

  let serverLine = $derived.by(() => {
    const server = candidate?.server;
    if (!server) return null;
    return server.tag === session.serverTag
      ? `Bundles the same server, ${server.tag}.`
      : `Bundles server ${server.tag} (you have ${session.serverTag}). Your saves are copied to the data folder's backups first; the first start after it may rebuild the content cache.`;
  });

  async function openBackups() {
    folderError = null;
    try {
      await api.openFolder("backups");
    } catch (e) {
      folderError = String(e instanceof Error ? e.message : e);
    }
  }
</script>

<Glass dense radius="card" label="Updates" class="panel">
  <h2 class="t-panel-title">Updates</h2>

  <div role="radiogroup" aria-label="When updates install" class="modes">
    {#each modes as option (option.id)}
      <button
        type="button"
        role="radio"
        aria-checked={mode === option.id}
        class="mode row-hover"
        onclick={() => void updater.setMode(option.id)}
      >
        <span class="radio" aria-hidden="true"></span>
        <span class="mode-text">
          <span class="mode-label">{option.label}{option.id === "ask" ? " (default)" : ""}</span>
          <span class="hint">{option.hint}</span>
        </span>
      </button>
    {/each}
  </div>

  <div class="check">
    <span class="status">{statusLine}</span>
    <PillButton disabled={updater.busy} onclick={() => void updater.check(true)}
      >Check for updates</PillButton
    >
  </div>

  {#if candidate && updater.offer?.kind === "offer"}
    <section class="candidate" aria-label="Available update">
      <div class="candidate-head">
        <strong>Launcher {candidate.version}</strong>
        {#if candidate.date}<span class="t-data-small date">{candidate.date.slice(0, 10)}</span
          >{/if}
        {#if updater.offer.skipped}<span class="t-data-small date">skipped</span>{/if}
      </div>
      {#if serverLine}<p class="server">{serverLine}</p>{/if}
      {#if candidate.notes}<pre class="notes">{candidate.notes}</pre>{/if}
      <div class="actions">
        <PillButton variant="text" onclick={() => void updater.skip()}>Skip this version</PillButton
        >
        <PillButton
          variant="solid"
          disabled={updater.busy || updater.phase === "waiting"}
          onclick={() => void updater.install()}>Update</PillButton
        >
      </div>
    </section>
  {/if}

  {#if updater.message && ["refused", "waiting", "error"].includes(updater.phase)}
    <Note kind="warn">{updater.message}</Note>
  {/if}
  {#if updater.backup?.folder}
    <Note kind="ready">Saves copied to <span class="t-data">{updater.backup.folder}</span>.</Note>
  {/if}
  {#if session.info && !session.info.updater.configured}
    <Note
      >This build has no update signing key, so it can look for updates but not install them.
      Released builds always have one.</Note
    >
  {/if}

  <ul class="rules">
    <li>Updates never install while a session runs, even one started outside this window.</li>
    <li>
      Before an update that changes the bundled server, your saves are copied to
      <span class="t-data">backups</span> in the data folder.
    </li>
    <li>Older versions of the launcher or its server are never offered.</li>
    <li>Checks are quiet offline and never hold up Play.</li>
  </ul>

  {#if folderError}<Note kind="warn">{folderError}</Note>{/if}
  <div class="actions">
    <PillButton onclick={openBackups}>Open backups</PillButton>
    <PillButton onclick={() => void openUrl(RELEASES_URL)}>Release notes on GitHub</PillButton>
  </div>
</Glass>

<style>
  .modes {
    display: flex;
    flex-direction: column;
  }
  .mode {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 54px;
    padding: 6px 8px;
    border-radius: var(--radius-row);
    text-align: left;
  }
  .radio {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--ink-muted);
  }
  .mode[aria-checked="true"] .radio {
    border-color: var(--ink);
    background: radial-gradient(circle, var(--ink) 0 4px, transparent 5px);
  }
  .mode-text {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .mode-label {
    font-weight: 700;
  }
  .hint,
  .status,
  .date,
  .server {
    color: var(--ink-soft);
    font-size: 13px;
  }
  .check {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    padding-top: 10px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .candidate {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    border-radius: var(--radius-row);
    background: var(--field);
  }
  .candidate-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .server {
    margin: 0;
  }
  .notes {
    margin: 0;
    max-height: 180px;
    overflow: auto;
    white-space: pre-wrap;
    font-family: var(--font-ui);
    font-size: 14px;
    color: var(--ink-soft);
    user-select: text;
    -webkit-user-select: text;
  }
  .rules {
    margin: 0;
    padding-left: 18px;
    color: var(--ink-soft);
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
