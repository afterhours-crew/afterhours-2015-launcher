<script lang="ts">
  import { untrack } from "svelte";
  import { api, inTauri, pickFolder, preflightFromResult } from "$lib/api/tauri";
  import type { Preflight } from "$lib/api/types";
  import Field from "$lib/components/Field.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import Soon from "$lib/components/Soon.svelte";
  import { firstRunChecks, initials, type Platform } from "$lib/state/launchbar";
  import { sampleCheck, sampleMode } from "$lib/state/preview";
  import { session } from "$lib/state/session.svelte";

  // Three steps, as designed (B2 is the last). The server is bundled with the launcher, so
  // there is nothing to locate besides the game.
  let { platform, onDone }: { platform: Platform; onDone: () => void } = $props();

  const steps = ["Game", "Files", "Driver"] as const;
  let step = $state(0);
  let gameDir = $state(session.settings.game_dir ?? "");
  let detected = $state<string[]>([]);
  let name = $state(session.settings.player_name ?? "Driver");
  let avatar = $state(session.settings.avatar ?? "style");
  let preflight = $state<Preflight | null>(null);
  let checkError = $state<string | null>(null);
  let checking = $state(false);
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  const colors = [
    { id: "style", label: "Pink" },
    { id: "speed", label: "Blue" },
    { id: "build", label: "Yellow" },
    { id: "crew", label: "Green" },
    { id: "outlaw", label: "Purple" },
    { id: "peach", label: "Peach" },
  ];
  // The server creates new drivers itself; choosing these needs its support.
  const START_OPTIONS = [
    { value: "prologue", label: "Prologue" },
    { value: "skip", label: "Skip prologue" },
  ] as const;
  const BANK_OPTIONS = [
    { value: "story", label: "Story" },
    { value: "250k", label: "$250K" },
    { value: "1m", label: "$1M" },
  ] as const;

  // A launcher copied into the game folder uses that folder: the Game step
  // is skipped and the file check runs at once. The folder is only read.
  let inFolder = $derived(session.info?.game_in_launcher_folder ?? null);
  let skippedGame = $state(false);
  $effect(() => {
    const folder = inFolder;
    if (!folder || skippedGame || step !== 0) return;
    skippedGame = true;
    untrack(() => {
      gameDir = folder;
      step = 1;
      void runCheck();
    });
  });

  $effect(() => {
    api
      .detectGameDirs()
      .then((dirs) => {
        detected = dirs;
        if (!gameDir && dirs[0]) gameDir = dirs[0];
      })
      .catch(() => {});
  });

  async function browseGame() {
    const chosen = await pickFolder("Choose the Need for Speed (2015) folder");
    if (chosen) gameDir = chosen;
  }

  async function runCheck() {
    checking = true;
    checkError = null;
    preflight = null;
    try {
      await session.save({ game_dir: gameDir || null });
      const result = sampleMode ? await sampleCheck() : await api.runCheck();
      if (result.kind === "error") checkError = result.message;
      else preflight = preflightFromResult(result);
    } catch (e) {
      checkError = String(e instanceof Error ? e.message : e);
    } finally {
      checking = false;
    }
  }

  async function next() {
    if (step === 0) {
      await session.save({ game_dir: gameDir || null });
      step = 1;
      await runCheck();
      return;
    }
    step = Math.min(steps.length - 1, step + 1);
  }

  async function finish() {
    saving = true;
    saveError = null;
    try {
      if (inTauri) {
        await session.save({ player_name: name.trim() || "Driver", avatar, first_run_done: true });
      }
      onDone();
    } catch (e) {
      saveError = String(e instanceof Error ? e.message : e);
    } finally {
      saving = false;
    }
  }

  let canNext = $derived(
    step === 0
      ? gameDir.trim().length > 0 && session.serverReady
      : step === 1
        ? preflight !== null
        : step === 2
          ? name.trim().length > 0
          : true,
  );
</script>

<main>
  <section class="card ah-glass" aria-label="Setup">
    <ol class="steps" aria-label="Steps">
      {#each steps as label, i (label)}
        <li>
          <span class="bar" class:done={i <= step}></span>
          <span class="t-label" class:current={i === step} class:faint={i !== step}>{label}</span>
        </li>
      {/each}
    </ol>

    {#if step === 0}
      <h1 class="t-step-title">Find your game</h1>
      <p>
        Point the launcher at your Need for Speed (2015) install. We looked in the usual places
        first. A launcher copied into the game folder, next to NFS16.exe, uses that install by
        itself.
      </p>
      {#if detected.length > 0}
        <Note kind="ready">
          <strong>Found an install</strong>
          <span class="t-data path">{detected[0]}</span>
        </Note>
      {/if}
      <Field
        id="game"
        label="Install folder"
        bind:value={gameDir}
        mono
        placeholder="F:\EA Games\Need for Speed"
      >
        {#snippet trailing()}<PillButton onclick={browseGame}>Change</PillButton>{/snippet}
      </Field>
      {#if session.loaded && inTauri && !session.serverReady}
        <Note kind="warn"
          >The bundled server is missing: {session.info?.server.error ??
            "reinstall the launcher"}</Note
        >
      {/if}
    {:else if step === 1}
      <h1 class="t-step-title">Check the files</h1>
      <p>
        Making sure the game is the supported build and can talk to the rebuilt server. Nothing is
        changed by this check.
      </p>
      {#if inFolder}
        <Note kind="ready">
          <strong>Using the game in this folder</strong>
          <span class="t-data path">{inFolder}</span>
        </Note>
      {/if}
      {#if checking}
        <div class="progress"><div class="fill indeterminate"></div></div>
      {:else if checkError}
        <Note kind="warn">{checkError}</Note>
        <PillButton onclick={runCheck}>Check again</PillButton>
      {:else if preflight}
        <div class="progress"><div class="fill"></div></div>
        <div class="checks">
          {#each firstRunChecks(preflight, platform) as row (row.label)}
            <div class="check">
              <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
                {#if row.ok}
                  <path
                    d="M5 10.2 L8.4 13.6 L15 6.5"
                    fill="none"
                    stroke="var(--crew)"
                    stroke-width="2"
                  ></path>
                {:else}
                  <path
                    d="M6 6 L14 14 M14 6 L6 14"
                    fill="none"
                    stroke="var(--build)"
                    stroke-width="2"
                  ></path>
                {/if}
              </svg>
              <span class="label">{row.label}</span>
              <span class="t-data value">{row.value}</span>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <h1 class="t-step-title">Make your driver</h1>
      <p>This is you on your own server. You can change the picture later in Profile.</p>
      <div class="picture">
        <span class="me" style="background: var(--{avatar})" aria-hidden="true"
          >{initials(name)}</span
        >
        <div class="picture-controls">
          <div role="radiogroup" aria-label="Avatar colour" class="swatches">
            {#each colors as color (color.id)}
              <button
                type="button"
                role="radio"
                aria-checked={avatar === color.id}
                aria-label={color.label}
                class="swatch"
                class:picked={avatar === color.id}
                style="background: var(--{color.id})"
                onclick={() => (avatar = color.id)}
              ></button>
            {/each}
          </div>
          <span class="later"><Soon /><span class="hint">Or choose an image</span></span>
        </div>
      </div>
      <Field
        id="name"
        label="Driver name"
        bind:value={name}
        maxlength={16}
        hint="Your server names your new driver with this the first time you play."
      />
      <div class="choices">
        <div class="choice">
          <span class="choice-head"><span class="t-label">Where to start</span><Soon /></span>
          <Segmented options={START_OPTIONS} value={null} label="Where to start" disabled />
          <span class="hint">Choosing needs a server update.</span>
        </div>
        <div class="choice">
          <span class="choice-head"><span class="t-label">Starting bank</span><Soon /></span>
          <Segmented options={BANK_OPTIONS} value={null} label="Starting bank" disabled />
          <span class="hint">Choosing needs a server update.</span>
        </div>
      </div>
      {#if saveError}<Note kind="warn">{saveError}</Note>{/if}
    {/if}

    <div class="actions">
      <PillButton
        variant="text"
        onclick={() => (step = Math.max(0, step - 1))}
        disabled={step === 0 || (step === 1 && inFolder !== null)}>Back</PillButton
      >
      {#if step < steps.length - 1}
        <button type="button" class="next" disabled={!canNext || checking} onclick={next}
          >Next</button
        >
      {:else}
        <button
          type="button"
          class="next"
          disabled={saving || name.trim().length === 0}
          onclick={finish}>Finish</button
        >
      {/if}
    </div>
  </section>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
  }
  .card {
    width: 100%;
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 28px;
    border-radius: var(--radius-phone);
    box-shadow: var(--shadow-float);
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .steps li {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.2);
  }
  .bar.done {
    background: var(--ink);
  }
  .current {
    color: var(--ink);
  }
  .faint {
    color: var(--ink-faint);
  }
  h1 {
    margin: 0;
  }
  p {
    margin: 0;
    color: var(--ink-soft);
  }
  .path {
    display: block;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .progress {
    height: 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }
  .fill {
    width: 100%;
    height: 100%;
    background: var(--crew);
  }
  .fill.indeterminate {
    width: 40%;
    background: var(--speed);
    animation: slide 1.2s ease-in-out infinite alternate;
  }
  @keyframes slide {
    to {
      transform: translateX(150%);
    }
  }
  .checks {
    display: flex;
    flex-direction: column;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .check .label {
    flex: 1 1 auto;
  }
  .check .value {
    color: var(--ink-muted);
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .picture {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 18px;
  }
  .picture-controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .later,
  .choice-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .choice-head {
    justify-content: space-between;
  }
  .choice-head .t-label {
    color: var(--ink-muted);
  }
  .hint {
    font-size: 13px;
    color: var(--ink-soft);
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
  }
  .choice {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .me {
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--on-ink);
    font-weight: 800;
    font-size: 22px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .swatch {
    width: 38px;
    height: 38px;
    border-radius: 50%;
  }
  .swatch.picked {
    box-shadow:
      0 0 0 3px rgba(24, 21, 29, 0.9),
      0 0 0 5px var(--ink);
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 4px;
  }
  .next {
    min-width: 160px;
    height: 50px;
    padding: 0 26px;
    border-radius: 14px;
    background: var(--play);
    color: var(--on-ink);
    font-weight: 800;
    font-size: 18px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .next:disabled {
    background: var(--field);
    color: var(--ink-faint);
    cursor: default;
  }
</style>
