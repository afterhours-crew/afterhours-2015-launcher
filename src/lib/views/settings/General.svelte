<script lang="ts">
  import { api, pickFolder } from "$lib/api/tauri";
  import Field from "$lib/components/Field.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { session } from "$lib/state/session.svelte";

  // Driver, game folder and data folder. The server owns everything inside
  // the data folder; this only says where it is.
  let name = $state(session.settings.player_name ?? "");
  let gameDir = $state(session.settings.game_dir ?? "");
  let dataDir = $state(session.settings.data_dir ?? "");
  let note = $state<{ kind: "ready" | "warn"; text: string } | null>(null);
  let checking = $state(false);

  const colors = ["style", "speed", "build", "crew", "outlaw", "peach"];

  function failure(e: unknown): string {
    return String(e instanceof Error ? e.message : e);
  }
  async function pick(setter: (v: string) => void, title: string) {
    const chosen = await pickFolder(title);
    if (chosen) setter(chosen);
  }
  async function saveDriver() {
    await session.save({ player_name: name.trim() || null });
  }
  async function saveFolders() {
    await session.save({ game_dir: gameDir.trim() || null, data_dir: dataDir.trim() || null });
    await session.refreshInfo();
  }
  async function verify() {
    checking = true;
    note = null;
    try {
      await saveFolders();
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
  async function openData() {
    try {
      await api.openFolder("data");
    } catch (e) {
      note = { kind: "warn", text: failure(e) };
    }
  }
</script>

<Glass dense radius="card" label="Driver" class="panel">
  <h2 class="t-panel-title">Driver</h2>
  <Field
    id="s-name"
    label="Driver name"
    bind:value={name}
    hint="Used when your local account is first created. It does not rename an existing save."
  />
  <div role="radiogroup" aria-label="Avatar color" class="swatches">
    {#each colors as color (color)}
      <button
        type="button"
        role="radio"
        aria-checked={session.settings.avatar === color}
        aria-label={color}
        class="swatch"
        class:picked={session.settings.avatar === color}
        style="background: var(--{color})"
        onclick={() => session.save({ avatar: color })}
      ></button>
    {/each}
  </div>
  <div class="actions"><PillButton variant="solid" onclick={saveDriver}>Save</PillButton></div>
</Glass>

<Glass dense radius="card" label="Game and data" class="panel">
  <h2 class="t-panel-title">Game &amp; data</h2>
  <Field id="s-game" label="Install folder" bind:value={gameDir} mono>
    {#snippet trailing()}<PillButton
        onclick={() => pick((v) => (gameDir = v), "Choose the Need for Speed (2015) folder")}
        >Browse</PillButton
      >{/snippet}
  </Field>
  <Field
    id="s-data"
    label="Data folder"
    bind:value={dataDir}
    mono
    placeholder={session.info?.data_dir ?? "Server default"}
    hint="Accounts, content, logs, sessions and update backups. Keep it outside the game folder."
  >
    {#snippet trailing()}<PillButton
        onclick={() => pick((v) => (dataDir = v), "Choose a data folder")}>Browse</PillButton
      >{/snippet}
  </Field>
  {#if note}<Note kind={note.kind}>{note.text}</Note>{/if}
  <div class="actions">
    <PillButton onclick={openData}>Open data folder</PillButton>
    <PillButton onclick={verify} disabled={checking}
      >{checking ? "Checking…" : "Verify files"}</PillButton
    >
    <PillButton variant="solid" onclick={saveFolders}>Save</PillButton>
  </div>
</Glass>

<style>
  .swatches {
    display: flex;
    gap: 10px;
  }
  .swatch {
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }
  .swatch.picked {
    box-shadow:
      0 0 0 3px rgba(24, 21, 29, 0.9),
      0 0 0 5px var(--ink);
  }
</style>
