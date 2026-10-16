<script lang="ts">
  import { api, pickFolder, preflightFromResult } from "$lib/api/tauri";
  import type { Preflight } from "$lib/api/types";
  import Field from "$lib/components/Field.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { firstRunChecks, initials, type Platform } from "$lib/state/launchbar";
  import { session } from "$lib/state/session.svelte";

  // Five steps. "Build" is a development-only step: this launcher runs the
  // command-line launcher from an afterhours-2015 checkout, so it has to be
  // told where that build is. The remaining four follow the design.
  let { platform, onDone }: { platform: Platform; onDone: () => void } = $props();

  const steps = ["Build", "Game", "Files", "Driver", "Done"] as const;
  let step = $state(0);
  let cliDir = $state(session.settings.cli_dir ?? "");
  let gameDir = $state(session.settings.game_dir ?? "");
  let detected = $state<string[]>([]);
  let name = $state(session.settings.player_name ?? "Driver_01");
  let avatar = $state(session.settings.avatar ?? "style");
  let preflight = $state<Preflight | null>(null);
  let checkError = $state<string | null>(null);
  let checking = $state(false);
  let saving = $state(false);

  const colors = ["style", "speed", "build", "crew", "outlaw", "peach"];

  $effect(() => {
    api
      .detectGameDirs()
      .then((dirs) => {
        detected = dirs;
        if (!gameDir && dirs[0]) gameDir = dirs[0];
      })
      .catch(() => {});
  });

  async function browseCli() {
    const chosen = await pickFolder("Choose the folder with nfs-afterhours and nfs-server");
    if (chosen) cliDir = chosen;
  }
  async function browseGame() {
    const chosen = await pickFolder("Choose the Need for Speed (2015) folder");
    if (chosen) gameDir = chosen;
  }

  async function runCheck() {
    checking = true;
    checkError = null;
    preflight = null;
    try {
      await session.save({ cli_dir: cliDir || null, game_dir: gameDir || null });
      const result = await api.runCheck();
      if (result.kind === "error") checkError = result.message;
      else preflight = preflightFromResult(result);
    } catch (e) {
      checkError = String(e instanceof Error ? e.message : e);
    } finally {
      checking = false;
    }
  }

  async function next() {
    if (step === 0) await session.save({ cli_dir: cliDir || null });
    if (step === 1) {
      await session.save({ game_dir: gameDir || null });
      step = 2;
      await runCheck();
      return;
    }
    if (step === 3) await session.save({ player_name: name.trim() || "Driver", avatar });
    step = Math.min(steps.length - 1, step + 1);
  }

  async function finish() {
    saving = true;
    await session.save({ first_run_done: true });
    saving = false;
    onDone();
  }

  let canNext = $derived(
    step === 0
      ? cliDir.trim().length > 0 && session.cliReady
      : step === 1
        ? gameDir.trim().length > 0
        : step === 2
          ? preflight !== null
          : step === 3
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
      <h1 class="t-step-title">Find the launcher build</h1>
      <p>
        This is a development build. Point it at the <code>target/release</code> folder of your
        afterhours-2015 checkout, where <code>nfs-afterhours</code> and <code>nfs-server</code> are built.
      </p>
      <Field
        id="cli"
        label="Build folder"
        bind:value={cliDir}
        mono
        placeholder="…/afterhours-2015/target/release"
      >
        {#snippet trailing()}<PillButton onclick={browseCli}>Browse</PillButton>{/snippet}
      </Field>
      <PillButton variant="text" onclick={() => session.save({ cli_dir: cliDir || null })}
        >Look again</PillButton
      >
      {#if cliDir && session.loaded}
        {#if session.cliReady}
          <Note kind="ready"
            ><strong>Found {session.cli.version ?? "the launcher"}</strong> and nfs-server next to it.</Note
          >
        {:else}
          <Note kind="warn"
            >Not found yet. Build with <code
              >cargo build --release -p nfs-server -p nfs-afterhours --locked</code
            >, then look again.</Note
          >
        {/if}
      {/if}
    {:else if step === 1}
      <h1 class="t-step-title">Find your game</h1>
      <p>
        Point the launcher at your Need for Speed (2015) install. We looked in the usual places
        first.
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
    {:else if step === 2}
      <h1 class="t-step-title">Check the files</h1>
      <p>
        Making sure the game is the supported build and can talk to the rebuilt server. Nothing is
        changed by this check.
      </p>
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
    {:else if step === 3}
      <h1 class="t-step-title">Your driver</h1>
      <p>This is how you show up on servers. It stays on this PC.</p>
      <div class="driver">
        <span class="me" style="background: var(--{avatar})">{initials(name)}</span>
        <Field id="name" label="Driver name" bind:value={name} />
      </div>
      <div role="radiogroup" aria-label="Avatar color" class="swatches">
        {#each colors as color (color)}
          <button
            type="button"
            role="radio"
            aria-checked={avatar === color}
            aria-label={color}
            class="swatch"
            class:picked={avatar === color}
            style="background: var(--{color})"
            onclick={() => (avatar = color)}
          ></button>
        {/each}
      </div>
    {:else}
      <h1 class="t-step-title">You're set</h1>
      <p>The garage is yours. You can change any of this later in Settings.</p>
      <div class="tiles">
        <div class="tile">
          <span class="t-label">Game</span><span class="strong"
            >{preflight?.game_sha256 ? "Supported build" : "Unchecked"}</span
          >
        </div>
        <div class="tile">
          <span class="t-label">Server</span><span class="strong">This PC</span>
        </div>
        <div class="tile">
          <span class="t-label">Driver</span><span class="strong">{name}</span>
        </div>
      </div>
      <Note
        >Live acceptance of the Rust launcher on the real installation is still pending; this build
        is for development.</Note
      >
    {/if}

    <div class="actions">
      <PillButton
        variant="text"
        onclick={() => (step = Math.max(0, step - 1))}
        disabled={step === 0}>Back</PillButton
      >
      {#if step < steps.length - 1}
        <button type="button" class="next" disabled={!canNext || checking} onclick={next}
          >Next</button
        >
      {:else}
        <button type="button" class="next" disabled={saving} onclick={finish}>Open garage</button>
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
    border-radius: 30px;
    box-shadow: var(--shadow-float);
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
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
  code {
    font-family: var(--font-mono);
    font-size: 12px;
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
  .driver {
    display: flex;
    align-items: flex-end;
    gap: 14px;
  }
  .driver :global(.field) {
    flex: 1 1 auto;
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
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }
  .swatch.picked {
    box-shadow:
      0 0 0 3px rgba(24, 21, 29, 0.9),
      0 0 0 5px var(--ink);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    padding: 10px;
    border-radius: var(--radius-row);
    background: var(--field);
    display: flex;
    flex-direction: column;
  }
  .tile .t-label {
    color: var(--ink-muted);
  }
  .strong {
    font-weight: 700;
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
