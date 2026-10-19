<script lang="ts">
  import { api, openUrl } from "$lib/api/tauri";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import StatusDot from "$lib/components/StatusDot.svelte";
  import { session } from "$lib/state/session.svelte";
  import { RELEASES_URL } from "$lib/state/updates";

  // About this build, behind Show more on Settings: the launcher and the
  // server it bundles, as the files on disk say, for troubleshooting.
  let info = $derived(session.info);
  let server = $derived(info?.server ?? null);
  let folderError = $state<string | null>(null);
  let refreshing = $state(false);

  let integrity = $derived.by(() => {
    if (!server) return null;
    if (server.source === "override") {
      return { kind: "warn" as const, text: "Development override (AFTERHOURS_EXE)" };
    }
    if (server.matches_pin === true) return { kind: "ready" as const, text: "Matches the pin" };
    if (server.matches_pin === false) {
      return { kind: "warn" as const, text: "Differs from the pin · reinstall" };
    }
    return { kind: "warn" as const, text: "Not found" };
  });

  async function refresh() {
    refreshing = true;
    await session.refreshInfo();
    refreshing = false;
  }
  async function openBackups() {
    folderError = null;
    try {
      await api.openFolder("backups");
    } catch (e) {
      folderError = String(e instanceof Error ? e.message : e);
    }
  }
</script>

{#if !info}
  <p class="t-caption">Versions show in the desktop window. This is the browser preview.</p>
{:else}
  <div class="rows">
    <div class="list-row">
      <span class="grow">Launcher</span>
      <span class="t-data"
        >{info.launcher_version}{info.debug_build ? " · development build" : ""}</span
      >
    </div>
    <div class="list-row">
      <span class="grow">Bundled server</span><span class="t-data">{server?.pinned_tag}</span>
    </div>
    <div class="list-row">
      <span class="grow">Server reports</span><span class="t-data value"
        >{server?.version_line ?? "—"}</span
      >
    </div>
    <div class="list-row">
      <span class="grow">Server file</span>
      {#if integrity}<StatusDot kind={integrity.kind} label={integrity.text} />{/if}
    </div>
    <div class="list-row">
      <span class="grow">Capabilities</span>
      <span class="t-data value"
        >{server?.capabilities
          ? server.capabilities.join(", ") || "none"
          : "not reported by this server"}</span
      >
    </div>
    <div class="list-row stack">
      <span>Pinned SHA-256</span><span class="t-data value">{server?.pinned_sha256}</span>
    </div>
    <div class="list-row stack">
      <span>Server path</span><span class="t-data value">{server?.path ?? "—"}</span>
    </div>
  </div>
  {#if server?.error}<Note kind="warn">{server.error}</Note>{/if}
{/if}
{#if folderError}<Note kind="warn">{folderError}</Note>{/if}
<div class="actions">
  <PillButton disabled={refreshing} onclick={refresh}>Check again</PillButton>
  <PillButton onclick={openBackups}>Open backups</PillButton>
  {#if server}
    <PillButton
      variant="text"
      onclick={() =>
        void openUrl(`https://github.com/${server.repository}/releases/tag/${server.pinned_tag}`)}
      >Server release</PillButton
    >
  {/if}
  <PillButton variant="text" onclick={() => void openUrl(RELEASES_URL)}
    >Launcher releases</PillButton
  >
</div>

<style>
  .value {
    text-align: right;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .stack {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 10px 0;
  }
  .stack .value {
    text-align: left;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 0 4px;
  }
</style>
