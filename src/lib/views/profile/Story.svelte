<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import ViewNote from "$lib/components/ViewNote.svelte";
  import { featureReady, hasCapability } from "$lib/state/capabilities";
  import { current, records } from "$lib/state/records.svelte";
  import { session } from "$lib/state/session.svelte";
  import { StoryEditor, type StoryEdit } from "$lib/state/story-editor";

  let ready = $derived(featureReady(session.info?.server, "story"));
  let load = $derived(records.story);
  let story = $derived(current(load));
  let selected = $state(0);
  let saved = $derived(
    Math.max(0, story?.checkpoints.findIndex((c) => c.id === story.current_checkpoint) ?? 0),
  );
  let checkpoint = $derived(story?.checkpoints[selected]);
  let edit = $state<StoryEdit>({ kind: "idle" });
  const scope = () =>
    JSON.stringify([session.settings.data_dir, session.settings.server?.url ?? null]);
  const editor = new StoryEditor(
    {
      preview: (account, target) => records.previewStory(account, target),
      apply: (preview) => records.applyStory(preview),
    },
    () => ({
      scope: scope(),
      story,
      fresh: load.kind === "ready",
      canPreview: hasCapability(session.info?.server, "story-preview"),
    }),
    (value) => (edit = value),
    () => records.loadStory(),
  );
  let applying = $derived(edit.kind === "applying");
  let canApply = $derived(edit.kind === "ready" && editor.canApply);
  function previewSelection() {
    if (checkpoint) editor.select(checkpoint.id);
  }
  function choose(index: number) {
    selected = index;
    previewSelection();
  }
  function cancel() {
    editor.cancel();
    selected = saved;
  }
  onDestroy(() => editor.cancel());

  $effect(() => {
    const selectedScope = scope();
    if (ready && selectedScope) untrack(() => void records.loadStory());
  });
  $effect(() => {
    // A new saved generation replaces the preview. Dragging itself never writes.
    const generation = story?.generation;
    const account = story?.account_id;
    const selectedScope = scope();
    if (generation !== undefined && account && selectedScope)
      untrack(() => {
        selected = saved;
        editor.cancel();
      });
  });
</script>

<div class="story">
  <h1 class="t-view-title">Story</h1>
  {#if !ready}
    <ViewNote>Your prologue progress and a timeline for replaying or skipping it.</ViewNote>
  {:else if !story}
    {#if load.kind === "error"}
      <Note kind="warn">Could not read your story: {load.message}</Note>
      <div><PillButton onclick={() => records.loadStory()}>Try again</PillButton></div>
    {:else}
      <p class="t-caption">Reading your story…</p>
    {/if}
  {:else}
    {#if load.kind === "error"}
      <Note kind="warn">Showing the last read. {load.message}</Note>
    {/if}
    <section class="panel" aria-labelledby="prologue-title">
      <div class="heading">
        <h2 id="prologue-title" class="t-panel-title">Prologue</h2>
        <PillButton
          disabled={applying}
          onclick={() => {
            editor.cancel();
            void records.loadStory();
          }}>Refresh</PillButton
        >
      </div>
      <p class="t-caption">Saved position: {story.checkpoints[saved]?.label}</p>
      <label for="story-position" class="t-caption">Preview a checkpoint</label>
      <input
        id="story-position"
        type="range"
        min="0"
        max={story.checkpoints.length - 1}
        step="1"
        bind:value={selected}
        disabled={applying}
        oninput={() => editor.cancel()}
        onchange={previewSelection}
        aria-valuetext={`${checkpoint?.label}${selected === saved ? ", saved position" : ", preview only"}`}
      />
      <ol class="checkpoints">
        {#each story.checkpoints as point, index (point.id)}
          <li>
            <button
              type="button"
              class:selected={index === selected}
              class:completed={point.completed}
              aria-current={index === saved ? "step" : undefined}
              aria-pressed={index === selected}
              disabled={applying}
              onclick={() => choose(index)}
            >
              <span class="marker" aria-hidden="true">{point.completed ? "✓" : index + 1}</span>
              <span>
                <span class="name">{point.label}</span>
                <span class="t-caption status">
                  {index === saved ? "Saved position · " : ""}
                  {point.played
                    ? "Played"
                    : point.completed
                      ? "Complete"
                      : point.active
                        ? "Current"
                        : "Ahead"}
                  {point.edited ? " · Set in launcher" : ""}
                  {point.existing ? " · Existing save" : ""}
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ol>
      <div class="preview" aria-live="polite">
        <strong>{checkpoint?.label}</strong>
        <p class="t-caption">
          {applying
            ? "Updating your saved position…"
            : edit.kind === "applied"
              ? "Story progress updated."
              : selected === saved
                ? "Your saved position."
                : "Preview only. Your save has not changed."}
        </p>
        {#if edit.kind === "loading"}<p class="t-caption">Reviewing this checkpoint…</p>{/if}
        {#if edit.kind === "ready"}
          {#if edit.preview.completes.length}
            <p class="t-caption">
              Will mark complete: {edit.preview.completes.map((point) => point.label).join(", ")}
            </p>
          {/if}
          {#if edit.preview.reopens.length}
            <p class="t-caption">
              Will reopen: {edit.preview.reopens.map((point) => point.label).join(", ")}
            </p>
          {/if}
          {#each edit.preview.reasons as reason}<Note>{reason}</Note>{/each}
        {:else if edit.kind === "error"}<Note kind="warn">{edit.message}</Note>{/if}
      </div>
      <div class="actions">
        <PillButton disabled={applying} onclick={() => choose(0)}>Replay prologue</PillButton>
        <PillButton disabled={applying} onclick={() => choose(story!.checkpoints.length - 1)}
          >Skip prologue</PillButton
        >
        <PillButton
          disabled={applying || (selected === saved && edit.kind === "idle")}
          onclick={cancel}>Cancel</PillButton
        >
        <PillButton disabled={!canApply} onclick={() => void editor.apply()}
          >{applying ? "Applying…" : "Apply"}</PillButton
        >
      </div>
      {#if story.session_running}
        <Note>Close the game and stop the server before changing story progress.</Note>
      {/if}
      <ViewNote>Starting the game from a selected story checkpoint.</ViewNote>
    </section>
    {#each story.warnings as warning}
      <Note>{warning}</Note>
    {/each}
  {/if}
</div>

<style>
  .story {
    width: 100%;
    max-width: 820px;
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-top: 12px;
  }
  h1,
  h2,
  p {
    margin: 0;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
    border: 1px solid var(--graphite-edge);
    border-radius: var(--radius-panel);
    background: var(--graphite);
  }
  .heading,
  .actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }
  .heading {
    justify-content: space-between;
  }
  input[type="range"] {
    width: 100%;
    min-height: 38px;
    accent-color: var(--play);
    cursor: pointer;
  }
  .checkpoints {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .checkpoints button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 54px;
    padding: 10px 12px;
    border: 1px solid transparent;
    border-radius: var(--radius-field);
    text-align: left;
  }
  .checkpoints button:hover,
  .selected {
    background: var(--graphite-raised);
  }
  .checkpoints button.selected {
    border-color: var(--play);
  }
  .marker {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border: 1px solid var(--graphite-edge);
    border-radius: 50%;
    font-variant-numeric: tabular-nums;
  }
  .completed .marker {
    color: var(--play);
  }
  .name,
  .status {
    display: block;
  }
  .status {
    color: var(--ink-soft);
  }
  .preview {
    padding: 16px;
    border-radius: var(--radius-field);
    background: var(--graphite-raised);
  }
</style>
