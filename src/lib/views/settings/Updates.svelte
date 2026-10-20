<script lang="ts">
  import type { UpdateMode } from "$lib/api/types";
  import Glass from "$lib/components/Glass.svelte";
  import InfoButton from "$lib/components/InfoButton.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import ShowMore from "$lib/components/ShowMore.svelte";
  import { session } from "$lib/state/session.svelte";
  import { updater } from "$lib/state/updater.svelte";
  import { effectiveMode, offeredModes } from "$lib/state/updates";
  import About from "./About.svelte";

  // Updates (H9): when the launcher installs updates, which version this is
  // and Check now. The rules live behind ⓘ; build details behind Show more.
  let { aboutOpen = false }: { aboutOpen?: boolean } = $props();

  const LABELS: Record<UpdateMode, string> = { ask: "Ask me", auto: "Automatic", off: "Off" };

  // A copy from the no-install ZIP cannot install, so it has no Automatic.
  let modes = $derived(
    offeredModes(updater.canInstall).map((value) => ({ value, label: LABELS[value] })),
  );
  let mode = $derived(effectiveMode(session.settings.updates.mode, updater.canInstall));
  let candidate = $derived(updater.candidate);
  let open = $state(false);
  $effect.pre(() => {
    if (aboutOpen) open = true;
  });

  let statusLine = $derived.by(() => {
    const at = updater.checkedAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const server = session.serverTag ? ` · server ${session.serverTag}` : "";
    switch (updater.phase) {
      case "checking":
        return "Checking…";
      case "current":
        return `Up to date${at ? ` · checked ${at}` : ""}${server}`;
      case "available":
      case "waiting":
      case "downloading":
      case "installing":
        return candidate ? `Version ${candidate.version} is available` : server.slice(3);
      case "refused":
        return "An update was found but is not offered";
      case "error":
        return "The last check failed";
      default:
        return (
          (mode === "off" ? "Automatic checks are off" : "Checks run in the background") + server
        );
    }
  });

  let serverLine = $derived.by(() => {
    const server = candidate?.server;
    if (!server) return null;
    return server.tag === session.serverTag
      ? `Bundles the same server, ${server.tag}.`
      : `Bundles server ${server.tag} (you have ${session.serverTag}). Your saves are copied to the data folder's backups first; the first start after it may rebuild the content cache.`;
  });
</script>

<Glass radius="panel" label="Updates" class="panel rows-panel">
  <div class="list-row tall">
    <span class="grow name">
      Updates
      <InfoButton
        label="About updates"
        text={updater.canInstall
          ? "Ask me checks in the background and asks before installing. Automatic installs when no session runs and restarts the launcher. Off checks only when you press Check now. Updates never install during a session, never go back a version, and copy your saves first when the bundled server changes."
          : "Ask me checks in the background and tells you when a new version is out. Off checks only when you press Check now. Download opens the new version's page; when it bundles a different server, your saves are copied first."}
      />
    </span>
    <Segmented
      options={modes}
      value={mode}
      label="Updates"
      onchange={(next) => void updater.setMode(next)}
    />
  </div>
  <div class="list-row tall">
    <span class="grow text">
      <span class="name">Afterhours {session.info?.launcher_version ?? ""}</span>
      <span class="t-caption">{statusLine}</span>
    </span>
    <PillButton variant="text" disabled={updater.busy} onclick={() => void updater.check(true)}
      >Check now</PillButton
    >
  </div>

  {#if candidate && updater.offer?.kind === "offer"}
    <section class="candidate" aria-label="Available update">
      <span class="name"
        >Afterhours {candidate.version}{#if candidate.date}<span class="t-data then">
            · {candidate.date.slice(0, 10)}</span
          >{/if}{#if updater.offer.skipped}<span class="t-data then">· skipped</span>{/if}</span
      >
      {#if serverLine}<p class="t-caption measure">{serverLine}</p>{/if}
      {#if candidate.notes}<pre class="notes">{candidate.notes}</pre>{/if}
      <div class="actions">
        <PillButton variant="text" onclick={() => void updater.skip()}>Skip this version</PillButton
        >
        {#if updater.canInstall}
          <PillButton
            variant="solid"
            disabled={updater.busy || updater.phase === "waiting"}
            onclick={() => void updater.install()}>Update</PillButton
          >
        {:else}
          <PillButton
            variant="solid"
            disabled={updater.busy}
            onclick={() => void updater.download()}>Download</PillButton
          >
        {/if}
      </div>
    </section>
  {/if}

  {#if updater.message && ["refused", "waiting", "error"].includes(updater.phase)}
    <div class="note"><Note kind="warn">{updater.message}</Note></div>
  {/if}
  {#if updater.opened}
    <div class="note">
      <Note kind="ready"
        >Download the ZIP, close the launcher, then replace the files in its folder with the new
        ones. Your saves are not in that folder.</Note
      >
    </div>
  {/if}
  {#if !updater.canInstall}
    <div class="note">
      <Note
        >This copy runs without installing, so it cannot update itself. When a new version is out,
        it opens the download page; the installer from that page updates by itself.</Note
      >
    </div>
  {/if}
  {#if updater.backup?.folder}
    <div class="note">
      <Note kind="ready">Saves copied to <span class="t-data">{updater.backup.folder}</span>.</Note>
    </div>
  {/if}
  {#if session.info && !session.info.updater.configured && updater.canInstall}
    <div class="note">
      <Note
        >This build has no update signing key, so it can look for updates but not install them.
        Released builds always have one.</Note
      >
    </div>
  {/if}

  <div class="more">
    <ShowMore label="About this build" summary="for troubleshooting" bind:open>
      <About />
    </ShowMore>
  </div>
</Glass>

<style>
  .tall {
    min-height: 72px;
    flex-wrap: wrap;
  }
  .text {
    display: flex;
    flex-direction: column;
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .candidate {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 12px;
    padding: 16px;
    border-radius: var(--radius-row);
    background: var(--graphite-raised);
  }
  .candidate p {
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
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  .note {
    padding-bottom: 12px;
  }
  .more {
    padding-bottom: 12px;
  }
</style>
