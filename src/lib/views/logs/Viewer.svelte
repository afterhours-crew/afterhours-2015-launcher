<script lang="ts">
  import { untrack } from "svelte";
  import Field from "$lib/components/Field.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import Switch from "$lib/components/Switch.svelte";
  import { formatBytes, formatCount } from "$lib/state/format";
  import {
    FILE_INFO,
    areaCounts,
    fieldSummary,
    filterLines,
    groupFiles,
    groupRepeats,
    parseLog,
    sessionHeading,
    type FileGroup,
    type Grouped,
    type LevelFilter,
  } from "$lib/state/logs";
  import { logView } from "$lib/state/logview.svelte";
  import { records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";

  // Log viewer (E2): one file of one session. Tracing logs are parsed into
  // lines with level, area and fields; other files show as text.
  const LEVELS = [
    { value: "all", label: "All" },
    { value: "warn", label: "Warnings" },
    { value: "error", label: "Errors" },
  ] as const;
  const GROUP_TITLES: Record<FileGroup, string> = {
    start: "Start here",
    breaks: "When something breaks",
    deep: "Deep dive",
  };
  /** Rows drawn at once; "Show more" adds this many again. */
  const PAGE = 1500;

  let shown = $derived(logView.session);
  // Only files the launcher describes open here; they are the names
  // src-tauri/src/reads.rs allows. Others are listed on the dashboard.
  let groups = $derived(shown ? groupFiles(shown.files.filter((f) => f.name in FILE_INFO)) : null);
  let name = $derived(logView.file ?? "server.stderr.log");
  let file = $derived(logView.text.kind === "ready" ? logView.text.value : null);
  let info = $derived(FILE_INFO[name]);
  let tracing = $derived(name.endsWith(".stderr.log"));
  let parsed = $derived(file && tracing ? parseLog(file.text) : null);
  let areas = $derived(parsed ? areaCounts(parsed.lines) : []);
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
      await navigator.clipboard.writeText(`${shown.directory}${separator}${name}`);
      note = "Path copied.";
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

  const dots: Record<string, string> = {
    error: "var(--style)",
    warn: "var(--status-warn)",
    info: "var(--ink-faint)",
    debug: "var(--ink-faint)",
    trace: "var(--ink-faint)",
  };
  const words: Record<string, string> = {
    error: "Error",
    warn: "Warning",
    info: "Info",
    debug: "Debug",
    trace: "Trace",
  };
</script>

<div class="layout">
  <Glass dense radius="phone" label="Log files" class="files">
    <PillButton variant="text" onclick={() => router.go("logs", "sessions")}
      >Back to logs</PillButton
    >
    {#if groups}
      {#each ["start", "breaks", "deep"] as const as group (group)}
        {#if groups[group].length > 0}
          <span class="t-label muted group">{GROUP_TITLES[group]}</span>
          {#each groups[group] as entry (entry.title)}
            {#each entry.names as fileName (fileName)}
              <button
                type="button"
                class="pick file"
                aria-current={fileName === name ? "page" : undefined}
                onclick={() => logView.open(fileName)}
              >
                <span>{entry.names.length > 1 ? fileName : entry.title}</span>
                <span class="t-data-small soft"
                  >{formatBytes(shown?.files.find((f) => f.name === fileName)?.bytes ?? 0)}</span
                >
              </button>
            {/each}
          {/each}
        {/if}
      {/each}
    {/if}
  </Glass>

  <Glass dense radius="panel" label={info?.title ?? name} class="panel">
    <div class="head">
      <span class="title">
        <span class="t-label soft">Logs / {shown ? sessionHeading(shown, 0, 1).when : ""}</span>
        <h1 class="t-view-title">{info?.title ?? name}</h1>
        {#if file}
          <span class="t-data soft">
            {name} · {formatBytes(file.bytes)}{parsed
              ? ` · ${formatCount(parsed.lines.length)} lines`
              : ""}
            · {file.truncated || parsed?.cut ? "only the start is shown" : "complete"}
          </span>
        {/if}
      </span>
      <div class="buttons">
        <PillButton onclick={openFolder}>Show in folder</PillButton>
        <PillButton variant="text" onclick={copyPath}>Copy path</PillButton>
      </div>
    </div>
    {#if note}<span class="caption" role="status">{note}</span>{/if}

    {#if info}
      <div class="about">
        <span class="t-label muted">What's in this file</span>
        <span class="about-text">{info.about}{tracing ? " Times are UTC." : ""}</span>
      </div>
    {/if}

    {#if logView.text.kind === "error"}
      <Note kind="warn">Could not open {name}: {logView.text.message}</Note>
    {:else if logView.text.kind === "loading"}
      <p class="caption">Opening {name}…</p>
    {:else if file && parsed}
      <div class="controls">
        <Segmented options={LEVELS} value={logView.level} label="Level" onchange={setLevel} />
        <div role="group" aria-label="Areas" class="areas">
          {#each areas as area (area.area)}
            <button
              type="button"
              class="area"
              aria-pressed={!hidden.includes(area.area)}
              onclick={() => toggleArea(area.area)}
              >{area.area} <span class="t-data-small soft">{formatCount(area.count)}</span></button
            >
          {/each}
        </div>
        <div class="group-switch"><Switch bind:checked={grouping} label="Group repeats" /></div>
      </div>
      <Field
        id="log-search"
        label="Search"
        type="search"
        placeholder="Search messages, routes or values"
        bind:value={query}
      />

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
              <span class="t-data-small soft">{line.time ?? ""}</span>
              <span
                class="level"
                class:warn={line.level === "warn"}
                class:error={line.level === "error"}
              >
                {#if line.level}<span
                    class="dot"
                    style="background: {dots[line.level]}"
                    aria-hidden="true"
                  ></span>{words[line.level]}{/if}
              </span>
              <span class="t-label muted">{line.area}</span>
              <span class="message"
                >{line.message}
                <span class="t-data-small soft">{fieldSummary(line)}</span></span
              >
              <span class="count"
                >{#if row.count > 1}<span class="t-data-small badge">×{formatCount(row.count)}</span
                  >{/if}</span
              >
            </button>
            {#if picked === line.index}
              <div class="fields">
                {#if line.target}<span class="muted">area</span><span>{line.target}</span>{/if}
                {#each line.fields as [key, value], i (`${key}-${i}`)}
                  <span class="muted">{key}</span><span>{value}</span>
                {/each}
                <span class="muted">line</span><span>{formatCount(line.index + 1)}</span>
              </div>
            {/if}
          </div>
        {:else}
          <p class="caption empty">
            {parsed.lines.length === 0 ? "This file is empty." : "No lines match."}
          </p>
        {/each}
      </div>
      {#if visible.length > limit}
        <div class="buttons">
          <PillButton onclick={() => (limit += PAGE)}
            >Show {formatCount(Math.min(PAGE, visible.length - limit))} more</PillButton
          >
        </div>
      {/if}
    {:else if file}
      {#if file.text.length === 0}
        <p class="caption">This file is empty.</p>
      {:else}
        <pre class="raw">{file.text}</pre>
      {/if}
    {/if}
  </Glass>
</div>

<style>
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    align-items: flex-start;
  }
  .layout :global(.files) {
    flex: 1 1 240px;
    max-width: 270px;
    padding: 14px 10px 18px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .group {
    padding: 12px 10px 4px;
  }
  .file {
    min-height: var(--control-height);
    padding: 6px 10px;
    justify-content: space-between;
  }
  .layout :global(.panel) {
    flex: 999 1 640px;
    min-width: 0;
    padding: 20px 24px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px 16px;
  }
  .title {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  h1 {
    margin: 0;
  }
  .soft {
    color: var(--ink-soft);
  }
  .muted {
    color: var(--ink-muted);
  }
  .caption {
    margin: 0;
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-soft);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .about {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    border-radius: var(--radius-row);
    background: var(--field);
  }
  .about-text {
    font-size: 14px;
    line-height: 20px;
    color: var(--ink-soft);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
  }
  .areas {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .area {
    min-height: var(--control-height);
    padding: 0 12px;
    border-radius: var(--radius-pill);
    border: 1px solid rgba(255, 255, 255, 0.4);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .area[aria-pressed="true"] {
    background: var(--selected);
  }
  .area[aria-pressed="false"] {
    color: var(--ink-faint);
  }
  .area .t-data-small {
    text-transform: none;
  }
  .group-switch {
    margin-left: auto;
    min-width: 200px;
  }
  .group-switch :global(.switch-row) {
    border-top: 0;
  }
  .lines {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-row);
    background: var(--log);
    overflow: hidden;
    user-select: text;
    -webkit-user-select: text;
  }
  .item {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .item.picked {
    background: var(--selected);
    box-shadow: inset 0 0 0 1px var(--selected-edge);
  }
  .line {
    width: 100%;
    min-height: var(--control-height);
    display: grid;
    grid-template-columns: 96px 84px 110px minmax(0, 1fr) 56px;
    gap: 12px;
    align-items: baseline;
    padding: 7px 14px;
    text-align: left;
  }
  .line:hover {
    background: var(--row-hover);
  }
  .level {
    font-size: 13px;
    color: var(--ink-soft);
  }
  .level.warn {
    color: var(--warn-ink);
  }
  .level.error {
    color: #ff9ccb;
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }
  .message {
    font-size: 14px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .count {
    text-align: right;
  }
  .badge {
    padding: 0 6px;
    border-radius: 999px;
    background: var(--field);
  }
  .fields {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr);
    gap: 2px 10px;
    padding: 0 14px 12px 122px;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    line-height: 16px;
    overflow-wrap: anywhere;
  }
  .empty {
    padding: 14px;
  }
  .raw {
    margin: 0;
    padding: 14px;
    border-radius: var(--radius-row);
    background: var(--log);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 11.5px;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--ink-muted);
    max-height: 60vh;
    overflow: auto;
    user-select: text;
    -webkit-user-select: text;
  }
</style>
