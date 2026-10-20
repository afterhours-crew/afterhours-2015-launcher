<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import { untrack } from "svelte";
  import IconArrowLeft from "@tabler/icons-svelte/icons/arrow-left";
  import Glass from "$lib/components/Glass.svelte";
  import InfoButton from "$lib/components/InfoButton.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import ShowMore from "$lib/components/ShowMore.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { formatBytes, formatCount, formatSaved } from "$lib/state/format";
  import {
    FILE_INFO,
    LEVEL_WORDS,
    areaCounts,
    fieldSummary,
    filterLines,
    groupRepeats,
    parseLog,
    type Grouped,
    type LevelFilter,
  } from "$lib/state/logs";
  import { logView } from "$lib/state/logview.svelte";
  import { copyablePath } from "$lib/state/privacy";
  import { session as app } from "$lib/state/session.svelte";
  import { records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";

  // Log viewer (H8): one file of one session. Tracing logs are parsed into
  // rows (time, level, message), repeats grouped, and a picked row opens
  // with what it means and all its fields; other files show as text.
  /** Rows drawn at once; "Show more" adds this many again. */
  const PAGE = 1500;

  let shown = $derived(logView.session);
  let name = $derived(logView.file ?? "server.stderr.log");
  let file = $derived(logView.text.kind === "ready" ? logView.text.value : null);
  let info = $derived(FILE_INFO[name]);
  let tracing = $derived(name.endsWith(".stderr.log"));
  let parsed = $derived(file && tracing ? parseLog(file.text) : null);
  let areas = $derived(parsed ? areaCounts(parsed.lines) : []);
  let warnCount = $derived(parsed ? parsed.lines.filter((l) => l.level === "warn").length : 0);
  let errorCount = $derived(parsed ? parsed.lines.filter((l) => l.level === "error").length : 0);
  let levels = $derived([
    { value: "all" as const, label: "All" },
    { value: "warn" as const, label: `Warnings ${formatCount(warnCount)}` },
    { value: "error" as const, label: `Errors ${formatCount(errorCount)}` },
  ]);
  let when = $derived.by(() => {
    const utc = shown?.started_utc;
    return utc ? formatSaved(utc, new Date()) : "";
  });
  let hidden = $state<string[]>([]);
  let query = $state("");
  let grouping = $state(true);
  let limit = $state(PAGE);
  let picked = $state<number | null>(null);
  let note = $state<string | null>(null);

  let visible = $derived<Grouped[]>(
    parsed
      ? (() => {
          const filtered = filterLines(parsed.lines, {
            level: logView.level,
            query,
            areas: hidden.length
              ? new Set(areas.map((a) => a.area).filter((a) => !hidden.includes(a)))
              : null,
          });
          return grouping ? groupRepeats(filtered) : filtered.map((line) => ({ line, count: 1 }));
        })()
      : [],
  );

  $effect(() => {
    // Open the server log when the viewer is reached without a file.
    if (shown && logView.file === null) untrack(() => void logView.open("server.stderr.log"));
  });

  function toggleArea(area: string) {
    hidden = hidden.includes(area) ? hidden.filter((a) => a !== area) : [...hidden, area];
  }

  function setLevel(level: LevelFilter) {
    logView.level = level;
    limit = PAGE;
  }

  async function copyPath() {
    if (!shown) return;
    note = null;
    try {
      const separator = shown.directory.includes("\\") ? "\\" : "/";
      // "Hide my user name" (Logs › Report a problem) applies to every copy.
      const path = `${shown.directory}${separator}${name}`;
      await navigator.clipboard.writeText(copyablePath(path, app.privacy));
      note = app.hideUserName ? "Path copied, user name hidden." : "Path copied.";
    } catch {
      note = "Could not reach the clipboard.";
    }
  }

  async function openFolder() {
    if (!shown) return;
    note = null;
    try {
      await records.openSessionFolder(shown.id);
    } catch (e) {
      note = String(e instanceof Error ? e.message : e);
    }
  }
</script>

<div class="viewer" use:staggerIn>
  <div class="head" data-enter>
    <span class="title">
      <button type="button" class="back" onclick={() => router.go("logs", "sessions")}
        ><IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />Logs{when
          ? ` · ${when}`
          : ""}</button
      >
      <span class="name">
        <h1 class="t-view-title">{info?.title ?? name}</h1>
        {#if info}<InfoButton
            label="About this file"
            text="{info.about}{tracing ? ' Times are UTC.' : ''} File: {name}."
          />{/if}
      </span>
    </span>
    <span class="facts">
      {#if file}
        <span class="t-data"
          >{formatBytes(file.bytes)}{parsed
            ? ` · ${formatCount(parsed.lines.length)} lines`
            : ""}{file.truncated || parsed?.cut ? " · only the start is shown" : ""}</span
        >
      {/if}
      <PillButton variant="text" onclick={openFolder}>Show in folder</PillButton>
      <PillButton variant="text" onclick={copyPath}>Copy path</PillButton>
    </span>
  </div>
  {#if note}<span class="t-caption" role="status">{note}</span>{/if}

  {#if logView.text.kind === "error"}
    <Note kind="warn">Could not open {name}: {logView.text.message}</Note>
  {:else if logView.text.kind === "loading"}
    <p class="t-caption">Opening {name}…</p>
  {:else if file && parsed}
    <div class="controls" data-enter>
      <Segmented options={levels} value={logView.level} label="Show" onchange={setLevel} />
      <label for="log-search" class="visually-hidden">Search the log</label>
      <input
        id="log-search"
        class="search"
        type="search"
        placeholder="Search the log"
        spellcheck="false"
        bind:value={query}
      />
      <span class="group-switch">
        <span id="group-label">Group repeats</span>
        <Toggle bind:checked={grouping} labelledby="group-label" />
      </span>
    </div>
    {#if areas.length > 1}
      <ShowMore label="Areas" summary="{areas.length - hidden.length} of {areas.length} shown">
        <div role="group" aria-label="Areas" class="areas">
          {#each areas as area (area.area)}
            <button
              type="button"
              class="area"
              aria-pressed={!hidden.includes(area.area)}
              onclick={() => toggleArea(area.area)}
              >{area.area}<span class="t-data then">{formatCount(area.count)}</span></button
            >
          {/each}
        </div>
      </ShowMore>
    {/if}

    <Glass radius="panel" label="Log lines" class="lines-panel">
      <div class="lines" role="list" aria-label="Log lines">
        {#each visible.slice(0, limit) as row (row.line.index)}
          {@const line = row.line}
          <div role="listitem" class="item" class:picked={picked === line.index}>
            <button
              type="button"
              class="line"
              aria-expanded={picked === line.index}
              onclick={() => (picked = picked === line.index ? null : line.index)}
            >
              <span class="soft">{line.time?.slice(0, 8) ?? ""}</span>
              <span
                class="level"
                class:soft={line.level !== "warn" && line.level !== "error"}
                class:warn={line.level === "warn"}
                class:error={line.level === "error"}
              >
                {#if line.level === "warn" || line.level === "error"}<span
                    class="dot"
                    aria-hidden="true"
                  ></span>{/if}{line.level ? LEVEL_WORDS[line.level] : ""}
              </span>
              <span class="message"
                >{line.message}{#if fieldSummary(line)}<span class="soft then"
                    >{fieldSummary(line)}</span
                  >{/if}</span
              >
              <span class="soft count">{row.count > 1 ? `× ${formatCount(row.count)}` : ""}</span>
            </button>
            {#if picked === line.index}
              <div class="fields">
                <span class="soft">area</span><span
                  >{line.area}{line.target ? ` (${line.target})` : ""}</span
                >
                {#each line.fields as [key, value], i (`${key}-${i}`)}
                  <span class="soft">{key}</span><span>{value}</span>
                {/each}
                <span class="soft">line</span><span>{formatCount(line.index + 1)}</span>
              </div>
            {/if}
          </div>
        {:else}
          <p class="empty">
            {parsed.lines.length === 0 ? "This file is empty." : "No lines match."}
          </p>
        {/each}
      </div>
    </Glass>
    {#if visible.length > limit}
      <div>
        <PillButton onclick={() => (limit += PAGE)}
          >Show {formatCount(Math.min(PAGE, visible.length - limit))} more</PillButton
        >
      </div>
    {/if}
  {:else if file}
    {#if file.text.length === 0}
      <p class="t-caption">This file is empty.</p>
    {:else}
      <pre class="raw ah-glass">{file.text}</pre>
    {/if}
  {/if}
</div>

<style>
  .viewer {
    width: 100%;
    max-width: var(--page-wide);
    margin-inline: auto;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .title {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  h1 {
    margin: 0;
  }
  .back {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 4px;
    margin-left: -4px;
    border-radius: var(--radius-pill);
    font-size: 14px;
    color: var(--ink-soft);
  }
  .back:hover {
    color: var(--ink);
    background: var(--hover);
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 16px;
  }
  .search {
    flex: 1 1 240px;
    min-width: 0;
    height: 42px;
    padding: 0 14px;
    border-radius: var(--radius-field);
    border: 1px solid var(--graphite-edge);
    background: var(--graphite-raised);
    color: var(--ink);
    font: 400 16px var(--font-ui);
  }
  .group-switch {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .areas {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .area {
    min-height: var(--control-height);
    padding: 0 14px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--graphite-outline);
    font-weight: 600;
    font-size: 14px;
  }
  .area[aria-pressed="true"] {
    background: var(--graphite-raised);
  }
  .area[aria-pressed="false"] {
    color: var(--ink-faint);
  }
  .viewer :global(.lines-panel) {
    flex: 1 1 auto;
    min-height: 240px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .lines {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 8px 0;
    font-size: 14px;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
  }
  .item + .item {
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }
  .item.picked {
    margin: 4px 10px;
    border-radius: var(--radius-row);
    background: var(--graphite-raised);
    box-shadow: inset 0 0 0 1px var(--graphite-ring);
  }
  .item.picked + .item {
    border-top-color: transparent;
  }
  .line {
    width: 100%;
    display: grid;
    grid-template-columns: 70px 92px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: baseline;
    padding: 6px 18px;
    text-align: left;
    user-select: text;
    -webkit-user-select: text;
  }
  .item.picked .line {
    padding: 10px 8px 4px;
  }
  .item.picked .message {
    font-weight: 600;
  }
  .line:hover {
    background: var(--row-hover);
  }
  .message {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .soft {
    color: var(--ink-soft);
  }
  .warn {
    color: var(--warn-ink);
  }
  .error {
    color: var(--style);
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 8px;
    border-radius: 50%;
    background: currentColor;
  }
  .count {
    white-space: nowrap;
  }
  .fields {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 4px 14px;
    padding: 4px 8px 14px 192px;
    overflow-wrap: anywhere;
    user-select: text;
    -webkit-user-select: text;
  }
  .empty {
    margin: 0;
    padding: 10px 18px;
    color: var(--ink-soft);
  }
  .raw {
    margin: 0;
    padding: 18px;
    border-radius: var(--radius-panel);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--ink);
    max-height: 70vh;
    overflow: auto;
    user-select: text;
    -webkit-user-select: text;
  }
</style>
