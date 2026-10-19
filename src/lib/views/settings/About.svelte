<script lang="ts">
  import IconServer from "@tabler/icons-svelte/icons/server";
  import PanelHeading from "$lib/components/PanelHeading.svelte";
  import { api, openUrl } from "$lib/api/tauri";
  import Glass from "$lib/components/Glass.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import StatusDot from "$lib/components/StatusDot.svelte";
  import { session } from "$lib/state/session.svelte";
  import { RELEASES_URL } from "$lib/state/updates";

  // The launcher and the server it bundles, as the files on disk say.
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
  async function openData() {
    folderError = null;
    try {
      await api.openFolder("data");
    } catch (e) {
      folderError = String(e instanceof Error ? e.message : e);
    }
  }
</script>

<Glass dense radius="card" label="About" class="panel">
  <PanelHeading icon={IconServer}>About</PanelHeading>
  {#if !info}
    <Note>Versions show in the desktop window. This is the browser preview.</Note>
  {:else}
    <div class="rows">
      <div class="row">
        <span class="t-label">Launcher</span>
        <span class="value t-data"
          >{info.launcher_version}{info.debug_build ? " · development build" : ""}</span
        >
      </div>
      <div class="row">
        <span class="t-label">Bundled server</span>
        <span class="value t-data">{server?.pinned_tag}</span>
      </div>
      <div class="row">
        <span class="t-label">Server reports</span>
        <span class="value t-data">{server?.version_line ?? "—"}</span>
      </div>
      <div class="row">
        <span class="t-label">Server file</span>
        <span class="value">
          {#if integrity}<StatusDot kind={integrity.kind} label={integrity.text} />{/if}
        </span>
      </div>
      <div class="row">
        <span class="t-label">Pinned SHA-256</span>
        <span class="value t-data-small">{server?.pinned_sha256}</span>
      </div>
      <div class="row">
        <span class="t-label">Capabilities</span>
        <span class="value t-data-small"
          >{server?.capabilities
            ? server.capabilities.join(", ") || "none"
            : "not reported by this server"}</span
        >
      </div>
      <div class="row">
        <span class="t-label">Server path</span>
        <span class="value t-data-small">{server?.path ?? "—"}</span>
      </div>
      <div class="row">
        <span class="t-label">Data folder</span>
        <span class="value t-data-small">{info.data_dir ?? "—"}</span>
      </div>
    </div>
    {#if server?.error}<Note kind="warn">{server.error}</Note>{/if}
  {/if}
  {#if folderError}<Note kind="warn">{folderError}</Note>{/if}
  <p class="fine">
    Afterhours is a community preservation project, not affiliated with Electronic Arts or Ghost
    Games. The launcher is MPL-2.0; the server's license and third-party notices are installed
    beside it in <span class="t-data">afterhours-server</span>.
  </p>
  <div class="actions">
    <PillButton disabled={refreshing} onclick={refresh}>Check again</PillButton>
    <PillButton onclick={openData}>Open data folder</PillButton>
    {#if server}
      <PillButton
        onclick={() =>
          void openUrl(`https://github.com/${server.repository}/releases/tag/${server.pinned_tag}`)}
        >Server release</PillButton
      >
    {/if}
    <PillButton onclick={() => void openUrl(RELEASES_URL)}>Launcher releases</PillButton>
  </div>
</Glass>

<style>
  .fine {
    margin: 0;
    color: var(--ink-soft);
    font-size: 13px;
  }
</style>
