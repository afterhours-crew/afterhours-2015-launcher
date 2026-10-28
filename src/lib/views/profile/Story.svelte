<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import IconArchive from "@tabler/icons-svelte/icons/archive";
  import IconCheck from "@tabler/icons-svelte/icons/check";
  import IconEye from "@tabler/icons-svelte/icons/eye";
  import IconFlag3 from "@tabler/icons-svelte/icons/flag-3";
  import IconListCheck from "@tabler/icons-svelte/icons/list-check";
  import IconMap2 from "@tabler/icons-svelte/icons/map-2";
  import IconRefresh from "@tabler/icons-svelte/icons/refresh";
  import garage from "$lib/../assets/backdrops/garage-home.jpg";
  import CarImage from "$lib/components/CarImage.svelte";
  import EmptyLine from "$lib/components/EmptyLine.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import Note from "$lib/components/Note.svelte";
  import PanelHeading from "$lib/components/PanelHeading.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Upcoming from "$lib/components/Upcoming.svelte";
  import ViewNote from "$lib/components/ViewNote.svelte";
  import { slideUp, staggerIn, toastIn } from "$lib/motion";
  import { featureReady, hasCapability } from "$lib/state/capabilities";
  import { carPicture } from "$lib/state/carimages";
  import { carName } from "$lib/state/cars";
  import { isLive } from "$lib/state/launchbar";
  import { staggerDelay } from "$lib/state/motion";
  import { current, records } from "$lib/state/records.svelte";
  import { viaApi } from "$lib/state/server";
  import { session } from "$lib/state/session.svelte";
  import { newlyDone, previewMarks, storyStops, storySummary } from "$lib/state/story";
  import { followStory } from "$lib/state/story-follow.svelte";
  import { StoryEditor, type StoryEdit } from "$lib/state/story-editor";
  import { listText } from "$lib/state/upcoming";
  import type { StoryReport } from "$lib/api/types";

  // Profile › Story (canvas row K). One stop per intro objective, then
  // Prologue complete. Green is played, dashed peach is set in the launcher,
  // the archive mark is complete in an older save; the white ring is where
  // the save is. Picking a stop only previews: the server answers with the
  // exact change, Apply asks it to make that change, Cancel goes back.
  // While a game runs, the window reads the story again every few seconds
  // (src/lib/state/story-live.ts) and newly finished steps fill in.

  let ready = $derived(featureReady(session.info?.server, "story"));
  let load = $derived(records.story);
  let story = $derived(current(load));
  let stops = $derived(story ? storyStops(story) : []);
  let summary = $derived(story ? storySummary(story) : null);
  let saved = $derived(
    Math.max(
      0,
      stops.findIndex((s) => s.saved),
    ),
  );
  let selected = $state(0);
  let chosen = $derived(stops[selected]);
  let previewing = $derived(stops.length > 0 && selected !== saved);
  let edit = $state<StoryEdit>({ kind: "idle" });
  // While a picked first car is checked again, the last preview stays in view.
  let preview = $derived(
    edit.kind === "ready" || edit.kind === "applying"
      ? edit.preview
      : edit.kind === "loading"
        ? edit.last
        : null,
  );
  let starters = $derived(preview?.starters ?? []);
  let picked = $derived(edit.kind === "loading" ? edit.starter : (preview?.starter ?? null));
  let pickedName = $derived(starters.find((c) => c.id === picked)?.name ?? null);
  let marks = $derived(preview ? previewMarks(stops, preview.completes, preview.reopens) : []);

  let profile = $derived(current(records.profile));
  let car = $derived(profile?.cars?.find((c) => c.location === "active") ?? null);
  let picture = $derived(
    car && profile
      ? carPicture(
          car.image,
          "large",
          featureReady(session.info?.server, "car-images"),
          profile.car_images,
          viaApi(session.settings),
        )
      : null,
  );
  // A save that has been read and has no car yet: the prologue gives the first one.
  let noCar = $derived(profile?.cars != null && car === null);

  let live = $derived(isLive(session.status?.state) && session.status?.game_running === true);

  const scope = () =>
    JSON.stringify([session.settings.data_dir, session.settings.server?.url ?? null]);
  const editor = new StoryEditor(
    {
      preview: (account, target, starter) => records.previewStory(account, target, starter),
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

  function choose(index: number) {
    if (applying || index < 0 || index >= stops.length) return;
    selected = index;
    const stop = stops[index];
    if (stop) editor.select(stop.id);
  }
  function cancel() {
    editor.cancel();
    selected = saved;
  }

  // Steps a live read found finished: they fill in, and one line says so.
  let justDone = $state<string[]>([]);
  let finished = $state<string | null>(null);
  let previous: StoryReport | null = null;
  let clearDone: ReturnType<typeof setTimeout> | undefined;

  followStory();
  onDestroy(() => {
    editor.cancel();
    clearTimeout(clearDone);
  });

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
  $effect(() => {
    const next = story;
    if (!next) return;
    untrack(() => {
      const done = newlyDone(previous, next);
      previous = next;
      if (done.length === 0) return;
      justDone = done;
      const last = next.checkpoints.find((p) => p.id === done.at(-1));
      finished = last ? `${last.label} done` : null;
      clearTimeout(clearDone);
      clearDone = setTimeout(() => {
        justDone = [];
        finished = null;
      }, 4000);
    });
  });

  // The banner says where things stand, or what the preview would do.
  let banner = $derived.by(() => {
    if (!summary || !chosen) return null;
    const carLine = car ? `In your ${carName(car)}` : null;
    if (previewing) {
      const skip = chosen.terminal && !summary.complete;
      return {
        tone: "var(--peach)",
        eyebrow: "Preview · not saved yet",
        title: skip ? "Skip the prologue" : `Preview: ${chosen.label}`,
        line: skip ? "Go straight to the garage and free roam." : carLine,
      };
    }
    if (summary.complete)
      return {
        tone: "var(--status-ready)",
        eyebrow: "Prologue complete",
        title: "Ventura Bay is open",
        line: carLine,
      };
    if (!summary.started)
      return {
        tone: "var(--status-info)",
        eyebrow: "Prologue · not started",
        title: "Your story starts tonight",
        line: "Press Play to begin with the game's opening scene.",
      };
    return {
      tone: "var(--status-ready)",
      eyebrow: `Prologue · ${summary.done} of ${summary.total} done`,
      title: `Next: ${summary.next}`,
      line: carLine,
    };
  });

  function tag(index: number): { text: string; quiet: boolean } | null {
    if (index === selected && previewing) return { text: "Preview", quiet: false };
    if (index !== saved) return null;
    if (previewing) return { text: "Saved", quiet: true };
    return {
      text: summary?.started || summary?.complete ? "You are here" : "Start here",
      quiet: false,
    };
  }

  function stepLine(index: number): string {
    const stop = stops[index];
    if (!stop || !summary) return "";
    if (stop.terminal) return "Your saved position";
    return `Step ${index + 1} of ${summary.total} · your saved position`;
  }

  function savedText(): string {
    if (!summary || !chosen) return "";
    if (summary.complete) {
      if (summary.how === "set")
        return "You skipped the prologue here, so its races were not played.";
      if (summary.how === "kept")
        return "Your save finished the prologue before Afterhours kept a record of how.";
      return "You played the prologue through. The rest of the story is open in the game.";
    }
    if (!summary.started)
      return "Press Play to start with the game's opening scene. You choose your first car along the way.";
    return "Play carries on from here. Pick another stop to preview a change; nothing is saved until you apply it.";
  }
</script>

<div class="story" use:staggerIn>
  {#if !ready}
    <h1 class="t-view-title">Story</h1>
    <ViewNote>Your prologue progress and a timeline for replaying or skipping it.</ViewNote>
  {:else if !story}
    <h1 class="t-view-title">Story</h1>
    {#if load.kind === "error"}
      <Note kind="warn">Could not read your story: {load.message}</Note>
      <div><PillButton onclick={() => records.loadStory()}>Try again</PillButton></div>
    {:else}
      <p class="t-caption">Reading your story…</p>
    {/if}
  {:else}
    <div class="columns">
      <div class="main">
        {#if banner}
          <div class="banner" data-enter>
            {#if picture && car}
              <CarImage {picture} alt={carName(car)} ratio="4 / 1" icon={36} radius="0" />
            {:else}
              <span class="art" style="background-image: url({garage})" aria-hidden="true"></span>
            {/if}
            <span class="shade" aria-hidden="true"></span>
            {#key banner.title}
              <div class="banner-text" in:toastIn>
                <span class="eyebrow"
                  ><span class="dot" style="background: {banner.tone}" aria-hidden="true"
                  ></span>{banner.eyebrow}</span
                >
                <h1 class="banner-title">{banner.title}</h1>
                {#if banner.line}<span class="banner-line">{banner.line}</span>{/if}
              </div>
            {/key}
          </div>
        {/if}

        {#if load.kind === "error"}
          <Note kind="warn">Showing the last read. {load.message}</Note>
        {/if}

        <Glass radius="panel" label="Prologue" class="panel">
          <PanelHeading icon={IconFlag3}>
            Prologue
            {#snippet aside()}
              <span class="heading-aside">
                {#if live}
                  <span
                    class="live"
                    title="Your story is read again every few seconds while the game runs."
                    ><span class="dot" aria-hidden="true"></span>Live</span
                  >
                {/if}
                {#if summary}
                  <span class="chip"
                    ><span
                      class="dot"
                      style="background: {summary.complete || summary.started
                        ? 'var(--status-ready)'
                        : 'var(--status-info)'}"
                      aria-hidden="true"
                    ></span>{summary.complete
                      ? "Complete"
                      : summary.started
                        ? `${summary.done} of ${summary.total} done`
                        : "Not started"}</span
                  >
                {/if}
                <button
                  type="button"
                  class="icon-button"
                  aria-label="Read again from your save"
                  title="Read again from your save"
                  disabled={applying}
                  onclick={() => {
                    editor.cancel();
                    void records.loadStory();
                  }}><IconRefresh size={18} stroke={1.6} /></button
                >
              </span>
            {/snippet}
          </PanelHeading>

          <div class="track" style="--count: {stops.length}">
            <input
              class="range"
              type="range"
              min="0"
              max={stops.length - 1}
              step="1"
              bind:value={selected}
              disabled={applying}
              aria-label="Story position"
              oninput={() => editor.cancel()}
              onchange={() => choose(selected)}
              aria-valuetext={`${chosen?.label}${selected === saved ? ", your saved position" : ", preview only"}`}
            />
            <ol class="stops" aria-hidden="true">
              {#each stops as stop, i (stop.id)}
                {@const mark = marks[i] ?? null}
                {@const label = tag(i)}
                <li
                  class="stop {stop.kind}"
                  class:picked={i === selected}
                  class:fresh={justDone.includes(stop.id)}
                  class:will={mark === "will-complete"}
                  class:reopen={mark === "will-reopen"}
                >
                  {#if i < stops.length - 1}
                    <span class="line"
                      ><span
                        class="fill grow-x"
                        class:on={stop.done || mark === "will-complete"}
                        style="--grow-delay: {120 + staggerDelay(i, 40)}ms"
                      ></span></span
                    >
                  {/if}
                  {#if label}
                    {#key label.text}
                      <span class="tag" class:quiet={label.quiet} in:toastIn>{label.text}</span>
                    {/key}
                  {/if}
                  <span class="marker">
                    {#if stop.done}
                      {#if stop.kind === "kept"}<IconArchive
                          size={14}
                          stroke={2}
                        />{:else}<IconCheck size={14} stroke={3} />{/if}
                    {:else if stop.terminal}<IconFlag3 size={14} stroke={2} />
                    {:else if !stop.saved}{i + 1}{/if}
                  </span>
                  <span class="name">{stop.label}</span>
                  <span class="word"
                    >{mark === "will-complete"
                      ? "Will be done"
                      : mark === "will-reopen"
                        ? "Opens again"
                        : stop.word}</span
                  >
                </li>
              {/each}
            </ol>
          </div>

          {#if stops.some((s) => s.kind === "set" || s.kind === "kept")}
            <div class="key t-caption" aria-label="Key">
              <span><span class="mini played" aria-hidden="true"></span>Played</span>
              <span><span class="mini set" aria-hidden="true"></span>Set in launcher</span>
              <span
                ><IconArchive size={16} stroke={1.8} aria-hidden="true" />From an older save</span
              >
            </div>
          {/if}

          {#if finished}
            <div class="finished" role="status" in:toastIn out:fade={{ duration: 150 }}>
              <span class="dot" aria-hidden="true"></span>{finished}
            </div>
          {/if}

          <div class="detail" class:previewing aria-live="polite">
            {#if previewing && chosen}
              <span class="t-caption eyebrow-line"
                ><IconEye size={16} stroke={1.6} aria-hidden="true" />Preview only · your save has
                not changed</span
              >
              <h2 class="detail-title">{chosen.label}</h2>
              {#if edit.kind === "loading" && !preview}
                <span class="t-caption">Checking this change with your server…</span>
              {:else if preview}
                {#if starters.length}
                  <fieldset class="starters" disabled={applying}>
                    <legend class="t-body-strong">Choose your first car</legend>
                    <span class="t-caption"
                      >The prologue normally gives you this choice. Skipping it, you pick here.</span
                    >
                    <div class="cars">
                      {#each starters as starter (starter.id)}
                        <label class="car" class:on={picked === starter.id}>
                          <input
                            type="radio"
                            name="starter"
                            value={starter.id}
                            aria-label={starter.name ?? "Unnamed car"}
                            checked={picked === starter.id}
                            onchange={() => editor.pickStarter(starter.id)}
                          />
                          <CarImage
                            picture={null}
                            alt={starter.name ?? "First car"}
                            ratio="16 / 9"
                            icon={28}
                            radius="var(--radius-thumb)"
                          />
                          {#if picked === starter.id}<span
                              class="badge"
                              aria-hidden="true"
                              in:toastIn><IconCheck size={14} stroke={3} /></span
                            >{/if}
                          <span class="car-name">{starter.name ?? "Unnamed car"}</span>
                        </label>
                      {/each}
                    </div>
                    {#if edit.kind === "loading"}
                      <span class="t-caption">Checking your pick with your server…</span>
                    {/if}
                  </fieldset>
                {/if}
                <div class="rows" in:slideUp>
                  {#if preview.completes.length}
                    <div class="list-row">
                      <IconListCheck size={20} stroke={1.6} aria-hidden="true" class="row-icon" />
                      <span class="grow"
                        >Marks as done: {listText(
                          preview.completes.map((p) => p.label),
                        )}{#if pickedName}, and puts the {pickedName} in garage slot 0{/if}</span
                      >
                    </div>
                  {/if}
                  {#if preview.reopens.length}
                    <div class="list-row">
                      <IconRefresh size={20} stroke={1.6} aria-hidden="true" class="row-icon" />
                      <span class="grow"
                        >Opens again: {listText(preview.reopens.map((p) => p.label))}</span
                      >
                    </div>
                  {/if}
                  <div class="list-row">
                    <IconArchive size={20} stroke={1.6} aria-hidden="true" class="row-icon" />
                    <span class="grow">Backs up your save before the change.</span>
                  </div>
                </div>
                {#each preview.reasons as reason (reason)}<Note>{reason}</Note>{/each}
              {:else if edit.kind === "error"}
                <Note kind="warn">{edit.message}</Note>
              {/if}
              {#if story.session_running}
                <Note>Close the game and stop the server before changing story progress.</Note>
              {/if}
              <div class="detail-actions">
                <PillButton variant="text" disabled={applying} onclick={cancel}>Cancel</PillButton>
                <PillButton variant="solid" disabled={!canApply} onclick={() => void editor.apply()}
                  >{applying ? "Applying…" : "Apply"}</PillButton
                >
              </div>
            {:else if chosen}
              <span class="t-caption">{stepLine(selected)}</span>
              <h2 class="detail-title">{chosen.label}</h2>
              <span class="soft">{savedText()}</span>
              {#if edit.kind === "applied"}
                <span class="t-caption eyebrow-line" in:toastIn
                  ><IconArchive size={16} stroke={1.6} aria-hidden="true" />Story progress updated.
                  Backed up first: {edit.result.backup.id}</span
                >
              {/if}
            {/if}
          </div>

          <div class="actions">
            {#if summary?.started || summary?.complete}
              <PillButton disabled={applying} onclick={() => choose(0)}>Replay prologue</PillButton>
            {/if}
            {#if !summary?.complete}
              <PillButton disabled={applying} onclick={() => choose(stops.length - 1)}
                >Skip prologue</PillButton
              >
            {/if}
          </div>
        </Glass>

        {#if summary?.complete}
          <Glass radius="panel" label="Main story" class="panel">
            <PanelHeading icon={IconMap2}>
              Main story
              {#snippet aside()}<Upcoming />{/snippet}
            </PanelHeading>
            <EmptyLine
              >The story objectives that open after the prologue will be listed here, with what's
              done and what's next.</EmptyLine
            >
          </Glass>
        {/if}

        <ViewNote>Starting the game from a step you pick here.</ViewNote>
        {#each story.warnings as warning (warning)}
          <Note>{warning}</Note>
        {/each}
      </div>

      <aside>
        <Glass radius="phone" label="Your progress" class="panel side">
          <h2 class="t-panel-title">Your progress</h2>
          {#if car}
            <CarImage {picture} alt={carName(car)} ratio="16 / 9" icon={32} />
            <div class="list-row stacked">
              <span class="t-caption">Current car</span>
              <span class="t-body-strong">{carName(car)}</span>
            </div>
          {:else if noCar}
            <EmptyLine>No car yet. You pick your first one in the prologue.</EmptyLine>
          {/if}
          {#if profile?.reputation?.level != null}
            <div class="list-row">
              <span class="grow">REP level</span><span class="t-num"
                >{profile.reputation.level}</span
              >
            </div>
          {/if}
          <div class="list-row">
            <span class="grow">Main story</span>
            <span class="t-caption"
              >{summary?.complete ? "Open in the game" : "Opens after the prologue"}</span
            >
          </div>
          <span class="t-caption foot"
            >{live
              ? "Following your game: finished steps show here within seconds."
              : "Read from your save. It updates when a session ends."}</span
          >
        </Glass>
      </aside>
    </div>
  {/if}
</div>

<style>
  .story {
    width: 100%;
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
  .columns {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    align-items: flex-start;
    justify-content: center;
  }
  .main {
    flex: 999 1 560px;
    min-width: 0;
    max-width: 820px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  aside {
    flex: 1 1 300px;
    max-width: 360px;
  }
  .columns :global(.panel) {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  aside :global(.side) {
    gap: 8px;
  }

  /* The banner: the active car's own picture, or the garage art. */
  .banner {
    position: relative;
    aspect-ratio: 4 / 1;
    min-height: 180px;
    border-radius: var(--radius-panel);
    overflow: hidden;
    border: 1px solid var(--graphite-edge);
    background: var(--floor);
    box-shadow: var(--shadow-panel);
  }
  .banner :global(.box) {
    position: absolute !important;
    inset: 0;
    width: 100% !important;
    height: 100%;
  }
  .art {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: 46% 58%;
  }
  .shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(14, 12, 17, 0.92) 0%,
      rgba(14, 12, 17, 0.6) 45%,
      rgba(14, 12, 17, 0) 80%
    );
  }
  .banner-text {
    position: absolute;
    inset: 0;
    max-width: 62%;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 4px;
  }
  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .banner-title {
    font-size: 30px;
    line-height: 1.15;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .banner-line {
    color: #d6d7db;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
    display: inline-block;
  }

  /* Heading: live state, progress chip and refresh. */
  .heading-aside {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .chip,
  .live {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 12px;
    border-radius: var(--radius-pill);
    background: var(--graphite-raised);
    border: 1px solid var(--graphite-edge);
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .live {
    color: var(--crew);
  }
  .live .dot {
    background: var(--crew);
  }
  .icon-button {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--ink-soft);
  }
  .icon-button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--ink);
  }
  .icon-button:hover:not(:disabled) :global(svg) {
    transform: rotate(-60deg);
  }
  .icon-button :global(svg) {
    transition: transform var(--motion-base) var(--ease-out);
  }

  /* The track: a native range on top of the drawn stops. */
  .track {
    position: relative;
    padding-top: 34px;
  }
  /* Invisible, over the whole track: a click or drag anywhere snaps to the
     nearest stop, and its ends sit on the first and last stop's centre. */
  .range {
    position: absolute;
    left: calc(50% / var(--count));
    right: calc(50% / var(--count));
    top: 34px;
    bottom: 0;
    width: auto;
    height: auto;
    margin: 0;
    opacity: 0;
    cursor: pointer;
    z-index: 2;
  }
  .range:hover:not(:disabled) + .stops .name {
    color: var(--ink);
  }
  .range:focus-visible + .stops .picked .marker {
    outline: 2px solid var(--ink);
    outline-offset: 6px;
  }
  .stops {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(var(--count), minmax(0, 1fr));
    align-items: start;
  }
  .stop {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    text-align: center;
    padding: 0 4px;
  }
  .line {
    position: absolute;
    top: 13px;
    left: 50%;
    width: 100%;
    height: 3px;
    border-radius: 2px;
    background: var(--graphite-edge);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0;
    transform-origin: left center;
    transform: scaleX(0);
    transition: transform var(--motion-slow) var(--ease-out);
  }
  .fill.on {
    transform: scaleX(1);
  }
  .fill:not(.on) {
    animation: none;
  }
  .played .fill {
    background: var(--crew);
  }
  .set .fill,
  .will .fill {
    background: repeating-linear-gradient(90deg, var(--peach) 0 6px, transparent 6px 12px);
  }
  .kept .fill {
    background: var(--ink-soft);
  }
  .marker {
    position: relative;
    z-index: 1;
    box-sizing: border-box;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--graphite);
    border: 2px solid var(--graphite-edge);
    color: var(--ink-soft);
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    transition:
      transform var(--motion-fast) var(--ease-out),
      background-color var(--motion-slow) var(--ease-out),
      border-color var(--motion-slow) var(--ease-out),
      box-shadow var(--motion-base) var(--ease-out);
  }
  .played .marker {
    background: var(--crew);
    border-color: var(--crew);
    color: var(--on-ink);
  }
  .set .marker,
  .will .marker {
    border-color: var(--peach);
    border-style: dashed;
    color: var(--peach);
  }
  .kept .marker {
    border-color: var(--ink-soft);
    color: var(--ink);
  }
  .here .marker {
    border: 3px solid var(--ink);
  }
  .here .marker::before {
    content: "";
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--ink);
  }
  .reopen .marker {
    opacity: 0.55;
  }
  .picked .marker {
    box-shadow:
      0 0 0 4px var(--graphite),
      0 0 0 6px var(--ink);
  }
  .fresh .marker {
    animation: arrive var(--motion-slow) var(--ease-out) both;
  }
  @keyframes arrive {
    from {
      transform: scale(0.7);
    }
    to {
      transform: scale(1);
    }
  }
  .name {
    font-size: 14px;
    line-height: 1.3;
    font-weight: 600;
    transition: color var(--motion-base) var(--ease-out);
  }
  .ahead .name {
    color: var(--ink-soft);
    font-weight: 500;
  }
  .word {
    font-size: 13px;
    line-height: 1.3;
    color: var(--ink-soft);
  }
  .played .word {
    color: var(--crew);
  }
  .set .word,
  .will .word {
    color: var(--peach);
  }
  .tag {
    position: absolute;
    top: -32px;
    left: 50%;
    translate: -50% 0;
    height: 24px;
    padding: 0 10px;
    border-radius: var(--radius-pill);
    background: var(--ink);
    color: var(--on-ink);
    font-size: 12px;
    font-weight: 700;
    line-height: 24px;
    white-space: nowrap;
  }
  .tag.quiet {
    background: var(--graphite-raised);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--graphite-ring);
  }

  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 20px;
  }
  .key > span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .mini {
    box-sizing: border-box;
    width: 14px;
    height: 14px;
    border-radius: 50%;
  }
  .mini.played {
    background: var(--crew);
  }
  .mini.set {
    border: 2px dashed var(--peach);
  }
  .finished {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
    height: 32px;
    padding: 0 12px;
    border-radius: var(--radius-pill);
    background: var(--graphite-raised);
    color: var(--crew);
    font-size: 14px;
    font-weight: 600;
  }
  .finished .dot {
    background: var(--crew);
  }

  /* The selected stop: the saved one, or what a preview would change. */
  .detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 18px 20px;
    border-radius: var(--radius-row);
    background: var(--graphite-raised);
    transition: box-shadow var(--motion-base) var(--ease-out);
  }
  .detail.previewing {
    box-shadow: inset 0 0 0 1px var(--graphite-ring);
  }
  .detail-title {
    font-size: 20px;
    line-height: 1.3;
    font-weight: 700;
  }
  .soft {
    color: var(--ink-soft);
  }
  .eyebrow-line {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .detail :global(.row-icon) {
    flex: 0 0 auto;
    color: var(--ink-soft);
  }
  .starters {
    margin: 4px 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .starters legend {
    padding: 0;
  }
  .cars {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 6px;
  }
  .car {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 8px 10px;
    border-radius: var(--radius-card);
    background: var(--graphite);
    border: 1px solid var(--graphite-edge);
    cursor: pointer;
    transition:
      border-color var(--motion-base) var(--ease-out),
      box-shadow var(--motion-base) var(--ease-out),
      transform var(--motion-fast) var(--ease-out);
  }
  .car:hover {
    transform: translateY(-2px);
    border-color: var(--graphite-ring);
  }
  .car.on {
    border-color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--ink);
  }
  .car:has(input:focus-visible) {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  .car input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .badge {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--ink);
    color: var(--on-ink);
    display: grid;
    place-items: center;
  }
  .car-name {
    font-size: 14px;
    line-height: 1.3;
    font-weight: 600;
  }
  .detail-actions,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .detail-actions {
    justify-content: flex-end;
    padding-top: 6px;
  }
  .stacked {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    border-top: 0;
  }
  .foot {
    padding-top: 10px;
    border-top: 1px solid var(--graphite-edge);
  }
</style>
