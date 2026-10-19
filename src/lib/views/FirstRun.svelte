<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import { untrack } from "svelte";
  import IconCheck from "@tabler/icons-svelte/icons/check";
  import IconX from "@tabler/icons-svelte/icons/x";
  import { api, inTauri, pickFolder, preflightFromResult } from "$lib/api/tauri";
  import type { Preflight } from "$lib/api/types";
  import Field from "$lib/components/Field.svelte";
  import InfoButton from "$lib/components/InfoButton.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { firstRunChecks, initials, type Platform } from "$lib/state/launchbar";
  import { sampleCheck, sampleMode } from "$lib/state/preview";
  import { session } from "$lib/state/session.svelte";

  // First run (H10): three steps in one graphite card. The server is
  // bundled with the launcher, so there is nothing to locate besides the
  // game. Where a new driver starts and with what bank wait for the
  // server; they are not shown until it can choose.
  let { platform, onDone }: { platform: Platform; onDone: () => void } = $props();

  const STEPS = 3;
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
  let typing = $state(false);

  const colors = [
    { id: "style", label: "Pink" },
    { id: "speed", label: "Blue" },
    { id: "build", label: "Yellow" },
    { id: "crew", label: "Green" },
    { id: "outlaw", label: "Purple" },
    { id: "peach", label: "Peach" },
  ];

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
    // The browser preview has no disk to look at; `?sample` finds the usual place.
    (sampleMode ? Promise.resolve(["F:\\EA Games\\Need for Speed"]) : api.detectGameDirs())
      .then((dirs) => {
        detected = dirs;
        if (!gameDir && dirs[0]) gameDir = dirs[0];
      })
      .catch(() => {});
  });

  // The found install shows as one line with Change; typing a path is for
  // when nothing was found or the player asks to.
  let found = $derived(!typing && gameDir.trim().length > 0 && detected.includes(gameDir));

  async function browseGame() {
    const chosen = await pickFolder("Choose the Need for Speed (2015) folder");
    if (chosen) gameDir = chosen;
    else typing = true;
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
    step = Math.min(STEPS - 1, step + 1);
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

  let canGoBack = $derived(step > 0 && !(step === 1 && inFolder !== null));

  let canNext = $derived(
    step === 0
      ? gameDir.trim().length > 0 && session.serverReady
      : step === 1
        ? preflight !== null
        : name.trim().length > 0,
  );
</script>

<main use:staggerIn>
  <section class="card ah-glass" aria-labelledby="step-title">
    <div class="progress-head">
      <div class="steps" aria-hidden="true">
        {#each Array.from({ length: STEPS }, (_, i) => i) as i (i)}
          <span class:on={i <= step}></span>
        {/each}
      </div>
      <span class="t-caption">Step {step + 1} of {STEPS}</span>
    </div>

    {#if step === 0}
      <div class="intro">
        <span class="title-row">
          <h1 id="step-title" class="t-step-title">Find your game</h1>
          <InfoButton
            label="About the game folder"
            text="The folder with NFS16.exe. A launcher copied into the game folder uses that install by itself. Nothing in it is changed."
          />
        </span>
        <p class="lead">
          {found
            ? "We found your Need for Speed (2015) install."
            : "Point the launcher at your Need for Speed (2015) install."}
        </p>
      </div>
      {#if found}
        <div class="found">
          <IconCheck size={20} stroke={1.8} aria-hidden="true" class="ok" />
          <span class="grow">
            <span class="t-body-strong path">{gameDir}</span>
            <span class="t-caption">Found in the usual place</span>
          </span>
          <PillButton variant="text" onclick={browseGame}>Change</PillButton>
        </div>
      {:else}
        <Field
          id="game"
          label="Game folder"
          bind:value={gameDir}
          placeholder="F:\EA Games\Need for Speed"
        >
          {#snippet trailing()}<PillButton onclick={browseGame}>Browse</PillButton>{/snippet}
        </Field>
      {/if}
      {#if session.loaded && inTauri && !session.serverReady}
        <Note kind="warn"
          >The bundled server is missing: {session.info?.server.error ??
            "reinstall the launcher"}</Note
        >
      {/if}
    {:else if step === 1}
      <div class="intro">
        <h1 id="step-title" class="t-step-title">Check the files</h1>
        <p class="lead">
          Making sure the game is the supported build. Nothing is changed by this check.
        </p>
      </div>
      {#if inFolder}
        <div class="found">
          <IconCheck size={20} stroke={1.8} aria-hidden="true" class="ok" />
          <span class="grow">
            <span class="t-body-strong path">{inFolder}</span>
            <span class="t-caption">Using the game in this folder</span>
          </span>
        </div>
      {/if}
      {#if checking}
        <div class="bar"><div class="fill indeterminate"></div></div>
      {:else if checkError}
        <Note kind="warn">{checkError}</Note>
        <div><PillButton onclick={runCheck}>Check again</PillButton></div>
      {:else if preflight}
        <div class="rows">
          {#each firstRunChecks(preflight, platform) as row (row.label)}
            <div class="list-row">
              {#if row.ok}
                <IconCheck size={18} stroke={1.8} aria-hidden="true" class="ok" />
              {:else}
                <IconX size={18} stroke={1.8} aria-hidden="true" class="bad" />
              {/if}
              <span class="grow">{row.label}</span>
              <span class="t-data value">{row.value}</span>
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="intro">
        <h1 id="step-title" class="t-step-title">Make your driver</h1>
        <p class="lead">This is you on your own server. You can change the picture later.</p>
      </div>
      <div class="picture">
        <span class="me" style="background: var(--{avatar})" aria-hidden="true"
          >{initials(name)}</span
        >
        <div role="radiogroup" aria-label="Picture colour" class="swatches">
          {#each colors as color (color.id)}
            <button
              type="button"
              role="radio"
              aria-checked={avatar === color.id}
              aria-label={color.label}
              class="swatch"
              style="background: var(--{color.id})"
              onclick={() => (avatar = color.id)}
            ></button>
          {/each}
        </div>
      </div>
      <Field
        id="name"
        label="Driver name"
        bind:value={name}
        maxlength={16}
        hint="Your server names your new driver with this the first time you play."
      />
      {#if saveError}<Note kind="warn">{saveError}</Note>{/if}
    {/if}

    <div class="actions">
      <!-- Back only where there is a step to go back to: not on the first one,
           nor on the file check when the launcher sits in the game folder. -->
      {#if canGoBack}
        <PillButton variant="text" onclick={() => (step = Math.max(0, step - 1))}>Back</PillButton>
      {/if}
      {#if step < STEPS - 1}
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
    min-height: 0;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px var(--space-6);
  }
  .card {
    width: 100%;
    max-width: 560px;
    padding: 32px;
    border-radius: var(--radius-panel);
    box-shadow: var(--shadow-float);
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .progress-head {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .steps {
    display: flex;
    gap: 8px;
  }
  .steps span {
    flex: 1 1 0;
    height: 4px;
    border-radius: var(--radius-pill);
    background: var(--graphite-raised);
    transition: background-color var(--motion-base) var(--ease-out);
  }
  .steps span.on {
    background: var(--ink);
  }
  .intro {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .title-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  h1 {
    margin: 0;
  }
  .lead {
    margin: 0;
    color: var(--ink-soft);
  }
  .found {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: var(--radius-row);
    background: var(--graphite-raised);
    border: 1px solid rgba(61, 214, 140, 0.45);
  }
  .found .grow {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .path {
    overflow-wrap: anywhere;
  }
  .card :global(.ok) {
    flex: 0 0 auto;
    color: var(--crew);
  }
  .card :global(.bad) {
    flex: 0 0 auto;
    color: var(--build);
  }
  .value {
    text-align: right;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .bar {
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--graphite-raised);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    width: 100%;
    border-radius: var(--radius-pill);
    background: var(--ink);
  }
  .fill.indeterminate {
    width: 35%;
    animation: slide 1.2s var(--ease-out) infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(300%);
    }
  }
  .picture {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 24px;
  }
  .me {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--on-ink);
    font-weight: 700;
    font-size: 26px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .swatch {
    width: 38px;
    height: 38px;
    border-radius: 50%;
  }
  .swatch[aria-checked="true"] {
    box-shadow:
      0 0 0 3px var(--graphite),
      0 0 0 5px var(--ink);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
  }
  .next {
    min-width: 120px;
    height: 48px;
    padding: 0 28px;
    border-radius: var(--radius-play);
    background: var(--play);
    color: var(--on-ink);
    font-weight: 700;
    font-size: 18px;
    letter-spacing: 0.02em;
  }
  .next:hover:not(:disabled) {
    filter: brightness(1.06);
  }
  .next:disabled {
    background: var(--graphite-raised);
    color: var(--ink-faint);
    cursor: default;
  }
</style>
