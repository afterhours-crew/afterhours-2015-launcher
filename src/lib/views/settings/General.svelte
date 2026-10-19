<script lang="ts">
  import { api, pickFolder } from "$lib/api/tauri";
  import Glass from "$lib/components/Glass.svelte";
  import InfoButton from "$lib/components/InfoButton.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { sampleMode } from "$lib/state/preview";
  import { session } from "$lib/state/session.svelte";

  // Game and data (H9): where the game is and where the server keeps saves
  // and logs. Changing the game folder checks it at once. A launcher in the
  // game folder uses that game and offers no other; the folder is only read.
  let inFolder = $derived(session.info?.game_in_launcher_folder ?? null);
  let gameDir = $derived(inFolder ?? session.settings.game_dir);
  let dataDir = $derived(session.settings.data_dir ?? session.info?.data_dir ?? null);
  let note = $state<{ kind: "ready" | "warn"; text: string } | null>(null);
  let checking = $state(false);

  function failure(e: unknown): string {
    return String(e instanceof Error ? e.message : e);
  }

  async function check() {
    checking = true;
    note = null;
    try {
      const result = await api.runCheck();
      note =
        result.kind === "ok"
          ? { kind: "ready", text: "Supported build. Nothing was changed." }
          : { kind: "warn", text: result.message };
    } catch (e) {
      note = { kind: "warn", text: failure(e) };
    } finally {
      checking = false;
    }
  }

  async function changeGame() {
    const chosen = await pickFolder("Choose the Need for Speed (2015) folder");
    if (!chosen) return;
    await session.save({ game_dir: chosen });
    await session.refreshInfo();
    await check();
  }

  async function changeData() {
    const chosen = await pickFolder("Choose a data folder");
    if (!chosen) return;
    await session.save({ data_dir: chosen });
    await session.refreshInfo();
  }

  async function openData() {
    note = null;
    try {
      if (sampleMode) throw new Error("The browser preview cannot open folders.");
      await api.openFolder("data");
    } catch (e) {
      note = { kind: "warn", text: failure(e) };
    }
  }
</script>

<Glass radius="panel" label="Game and data" class="panel rows-panel">
  <div class="list-row tall">
    <span class="grow text">
      <span class="name">
        Game folder
        {#if inFolder}<InfoButton
            label="About the game folder"
            text="The launcher sits in this game folder, so it uses the game it is in and changes nothing there. To use another install, run the launcher from somewhere else."
          />{/if}
      </span>
      <span class="t-data path">{gameDir ?? "Not chosen yet"}</span>
    </span>
    {#if !inFolder}
      <PillButton onclick={changeGame} disabled={checking}
        >{checking ? "Checking…" : "Change"}</PillButton
      >
    {/if}
  </div>
  <div class="list-row tall">
    <span class="grow text">
      <span class="name">
        Saves and logs
        <InfoButton
          label="About the data folder"
          text="Accounts, prepared content, logs, sessions and update backups. Keep it outside the game folder."
        />
      </span>
      <span class="t-data path">{dataDir ?? "The server's default folder"}</span>
    </span>
    <PillButton variant="text" onclick={changeData}>Change</PillButton>
    <PillButton onclick={openData}>Open</PillButton>
  </div>
  {#if note}<div class="note"><Note kind={note.kind}>{note.text}</Note></div>{/if}
</Glass>

<style>
  .tall {
    min-height: 72px;
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
  .path {
    overflow-wrap: anywhere;
  }
  .note {
    padding: 4px 0 16px;
  }
</style>
