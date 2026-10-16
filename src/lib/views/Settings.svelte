<script lang="ts">
  import { api, openPath, pickFolder } from "$lib/api/tauri";
  import Field from "$lib/components/Field.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { session } from "$lib/state/session.svelte";

  let name = $state(session.settings.player_name ?? "");
  let cliDir = $state(session.settings.cli_dir ?? "");
  let gameDir = $state(session.settings.game_dir ?? "");
  let dataDir = $state(session.settings.data_dir ?? "");
  let checkMessage = $state<{ kind: "ready" | "warn"; text: string } | null>(null);

  const colors = ["style", "speed", "build", "crew", "outlaw", "peach"];

  async function saveProfile() {
    await session.save({ player_name: name.trim() || null });
  }
  async function pick(setter: (v: string) => void, title: string) {
    const chosen = await pickFolder(title);
    if (chosen) setter(chosen);
  }
  async function saveFolders() {
    await session.save({
      cli_dir: cliDir.trim() || null,
      game_dir: gameDir.trim() || null,
      data_dir: dataDir.trim() || null,
    });
  }
  async function check() {
    await saveFolders();
    checkMessage = null;
    try {
      const result = await api.runCheck();
      checkMessage =
        result.kind === "ok"
          ? { kind: "ready", text: "Supported build. Nothing was changed." }
          : { kind: "warn", text: result.message };
    } catch (e) {
      checkMessage = { kind: "warn", text: String(e instanceof Error ? e.message : e) };
    }
  }
  async function openLogs() {
    const dir = await api.sessionDir().catch(() => null);
    if (dir) await openPath(dir);
    else if (dataDir) await openPath(dataDir);
  }
</script>

<main>
  <Glass dense label="Profile" class="panel">
    <div class="head">
      <span class="tile" style="background: var(--style)"></span>
      <h2 class="t-panel-title">Profile</h2>
    </div>
    <Field id="s-name" label="Driver name" bind:value={name} />
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
    <div class="actions"><PillButton variant="solid" onclick={saveProfile}>Save</PillButton></div>
  </Glass>

  <Glass dense label="Game files" class="panel">
    <div class="head">
      <span class="tile" style="background: var(--build)"></span>
      <h2 class="t-panel-title">Game files</h2>
    </div>
    <Field id="s-game" label="Install folder" bind:value={gameDir} mono>
      {#snippet trailing()}<PillButton
          onclick={() => pick((v) => (gameDir = v), "Choose the Need for Speed (2015) folder")}
          >Browse</PillButton
        >{/snippet}
    </Field>
    {#if checkMessage}<Note kind={checkMessage.kind}>{checkMessage.text}</Note>{/if}
    <div class="actions">
      <PillButton onclick={check}>Verify files</PillButton><PillButton
        variant="solid"
        onclick={saveFolders}>Save</PillButton
      >
    </div>
  </Glass>

  <Glass dense label="Launcher build" class="panel">
    <div class="head">
      <span class="tile" style="background: var(--crew)"></span>
      <h2 class="t-panel-title">Launcher build</h2>
    </div>
    <Field
      id="s-cli"
      label="Build folder"
      bind:value={cliDir}
      mono
      hint={session.cliReady
        ? `Using ${session.cli.version ?? "nfs-afterhours"}`
        : "nfs-afterhours and nfs-server were not found here."}
    >
      {#snippet trailing()}<PillButton
          onclick={() =>
            pick((v) => (cliDir = v), "Choose the folder with nfs-afterhours and nfs-server")}
          >Browse</PillButton
        >{/snippet}
    </Field>
    <div class="actions"><PillButton variant="solid" onclick={saveFolders}>Save</PillButton></div>
  </Glass>

  <Glass dense label="Saves and data" class="panel">
    <div class="head">
      <span class="tile" style="background: var(--speed)"></span>
      <h2 class="t-panel-title">Saves &amp; data</h2>
    </div>
    <Field
      id="s-data"
      label="Data folder"
      bind:value={dataDir}
      mono
      placeholder="Launcher default"
      hint="Accounts, content, logs and sessions. Keep it outside the game folder."
    >
      {#snippet trailing()}<PillButton
          onclick={() => pick((v) => (dataDir = v), "Choose a data folder")}>Browse</PillButton
        >{/snippet}
    </Field>
    <div class="actions">
      <PillButton onclick={openLogs}>Open logs</PillButton><PillButton
        variant="solid"
        onclick={saveFolders}>Save</PillButton
      >
    </div>
  </Glass>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6);
    min-height: 0;
    overflow: auto;
    align-content: start;
  }
  main :global(.panel) {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
    border-radius: 24px !important;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tile {
    width: 30px;
    height: 30px;
    border-radius: 10px;
  }
  h2 {
    margin: 0;
  }
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
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: auto;
  }
</style>
