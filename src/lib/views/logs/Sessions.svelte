<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import type { Glyph as Icon } from "$lib/components/glyph";
  import IconAlertTriangle from "@tabler/icons-svelte/icons/alert-triangle";
  import IconCheck from "@tabler/icons-svelte/icons/check";
  import IconChevronLeft from "@tabler/icons-svelte/icons/chevron-left";
  import IconChevronRight from "@tabler/icons-svelte/icons/chevron-right";
  import IconDeviceGamepad2 from "@tabler/icons-svelte/icons/device-gamepad-2";
  import IconFileDescription from "@tabler/icons-svelte/icons/file-description";
  import IconPackage from "@tabler/icons-svelte/icons/package";
  import IconRocket from "@tabler/icons-svelte/icons/rocket";
  import IconTerminal2 from "@tabler/icons-svelte/icons/terminal-2";
  import IconUserPlus from "@tabler/icons-svelte/icons/user-plus";
  import type { SessionList } from "$lib/api/types";
  import EmptyLine from "$lib/components/EmptyLine.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import InfoButton from "$lib/components/InfoButton.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import ShowMore from "$lib/components/ShowMore.svelte";
  import { formatCount, formatSaved } from "$lib/state/format";
  import { fileFacts, groupFiles, sessionLine, stateWords, summaryText } from "$lib/state/logs";
  import { logView } from "$lib/state/logview.svelte";
  import { records } from "$lib/state/records.svelte";

  // Logs (H7): one session at a time. "Start here" says what matters in a
  // line each; the files follow; everything rarely needed (EA Desktop
  // logs, recordings, crash dumps, raw records) waits behind Show more.
  let { list }: { list: SessionList } = $props();

  let shown = $derived(logView.session);
  let count = $derived(list.sessions.length);
  let index = $derived(Math.min(logView.index, Math.max(0, count - 1)));
  let groups = $derived(shown ? groupFiles(shown.files) : null);
  let files = $derived(groups ? [...groups.start, ...groups.breaks] : []);
  let words = $derived(stateWords(shown?.state ?? null));
  let warnings = $derived(shown?.server_log?.levels.warn ?? null);
  let kinds = $derived(shown?.server_log?.unsupported.length ?? 0);
  let crashes = $derived(shown?.crash_dumps ?? null);
  let when = $derived.by(() => {
    const utc = shown?.started_utc;
    if (!utc) return "Start unknown";
    const text = formatSaved(utc, new Date());
    return text.charAt(0).toUpperCase() + text.slice(1);
  });
  let note = $state<string | null>(null);

  const ICONS: Record<string, Icon> = {
    "Session summary": IconFileDescription,
    "Server log": IconTerminal2,
    "Startup report": IconRocket,
    "Content preparation": IconPackage,
    "Account creation": IconUserPlus,
    "Game console": IconDeviceGamepad2,
  };
  const dots = {
    ready: "var(--status-ready)",
    warn: "var(--status-warn)",
    info: "var(--status-info)",
  };

  async function copySummary() {
    if (!shown) return;
    note = null;
    try {
      await navigator.clipboard.writeText(summaryText(shown));
      note = "Summary copied.";
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

<div class="layout" use:staggerIn>
  <div class="main">
    <div class="head" data-enter>
      <span class="title">
        <h1 class="t-view-title">Logs</h1>
        {#if shown}
          <span class="t-data"
            >{#if words.dot}<span
                class="dot"
                style="background: {dots[words.dot]}"
                aria-hidden="true"
              ></span>{/if}{sessionLine(shown)}</span
          >
        {/if}
      </span>
      {#if shown}
        <span class="picker" role="group" aria-label="Session {index + 1} of {count}">
          <button
            type="button"
            class="arrow"
            aria-label="Newer session"
            disabled={index <= 0}
            onclick={() => logView.step(-1)}
            ><IconChevronLeft size={16} stroke={1.8} aria-hidden="true" /></button
          >
          <span class="when">{when}</span>
          <button
            type="button"
            class="arrow"
            aria-label="Older session"
            disabled={index >= count - 1}
            onclick={() => logView.step(1)}
            ><IconChevronRight size={16} stroke={1.8} aria-hidden="true" /></button
          >
        </span>
      {/if}
    </div>

    {#if !shown || !groups}
      <EmptyLine>No sessions yet. Press Play, and each session's files show up here.</EmptyLine>
    {:else}
      {#each shown.warnings as warning (warning)}<Note>{warning}</Note>{/each}

      <Glass radius="panel" label="Start here" class="panel">
        <h2 class="t-panel-title">Start here</h2>
        <div class="rows">
          {#if warnings !== null}
            <div class="list-row">
              {#if warnings > 0}
                <IconAlertTriangle size={20} stroke={1.6} aria-hidden="true" class="icon warn" />
                <span class="grow"
                  ><span class="t-body-strong"
                    >{formatCount(warnings)} {warnings === 1 ? "warning" : "warnings"}</span
                  >{#if kinds > 0}<span class="t-caption then">
                      · {kinds} {kinds === 1 ? "kind" : "kinds"}</span
                    >{/if}</span
                >
                <InfoButton
                  label="About warnings"
                  text="Things the game asked for that your server doesn't answer yet. Usually harmless. Include them in bug reports."
                />
                <PillButton onclick={() => logView.open("server.stderr.log", "warn")}
                  >View</PillButton
                >
              {:else}
                <IconCheck size={20} stroke={1.6} aria-hidden="true" class="icon ok" />
                <span class="grow">No warnings this session</span>
              {/if}
            </div>
          {/if}
          {#if shown.message}
            <div class="list-row">
              <IconFileDescription size={20} stroke={1.6} aria-hidden="true" class="icon" />
              <span class="grow">{words.label}: {shown.message}</span>
            </div>
          {/if}
          {#if crashes}
            <div class="list-row">
              {#if crashes.length > 0}
                <IconAlertTriangle size={20} stroke={1.6} aria-hidden="true" class="icon warn" />
                <span class="grow"
                  >{crashes.length}
                  {crashes.length === 1 ? "game crash dump" : "game crash dumps"} this session</span
                >
                <InfoButton
                  label="About crash dumps"
                  text="When the game crashes it saves a CrashDump file. Attach it to your report; it can hold personal information. {crashes
                    .map((d) => d.name)
                    .join(', ')}"
                />
              {:else}
                <IconCheck size={20} stroke={1.6} aria-hidden="true" class="icon ok" />
                <span class="grow">No game crash this session</span>
              {/if}
            </div>
          {/if}
        </div>
      </Glass>

      <Glass radius="panel" label="Files" class="panel">
        <h2 class="t-panel-title">Files</h2>
        <div class="rows">
          {#each files as entry (entry.title)}
            {@const Glyph = ICONS[entry.title] ?? IconFileDescription}
            <div class="list-row">
              <Glyph size={20} stroke={1.6} aria-hidden="true" class="icon" />
              <span class="grow file"
                ><span class="t-body-strong">{entry.title}</span>
                <InfoButton label="About {entry.title}" text={entry.about} size={16} /></span
              >
              <span class="t-data">{fileFacts(entry)}</span>
              <PillButton variant="text" onclick={() => logView.open(entry.names[0]!)}
                >Open</PillButton
              >
            </div>
          {/each}
        </div>
        <ShowMore label="More sources" summary="EA Desktop logs, recordings, crash dumps">
          <div class="rows">
            {#if list.ea_desktop_logs}
              <div class="list-row stack">
                <span>EA Desktop logs <span class="t-caption">· EA account details</span></span>
                <span class="t-data path">{list.ea_desktop_logs.path}</span>
                <span class="t-caption"
                  >Only matters when the launcher stopped at "EA activation needs your attention".</span
                >
              </div>
            {/if}
            <div class="list-row stack">
              <span>Protocol recording <span class="t-caption">· account identity</span></span>
              <span class="t-data path"
                >{shown.runs_directory_exists ? shown.runs_directory : "Off for this session"}</span
              >
            </div>
            {#if list.crash_dump_directory}
              <div class="list-row stack">
                <span>Game crash dumps <span class="t-caption">· personal information</span></span>
                <span class="t-data path">{list.crash_dump_directory.path}</span>
              </div>
            {/if}
            {#each groups.deep as entry (entry.title)}
              <div class="list-row stack">
                <span>{entry.title}</span>
                <span class="t-data path">{entry.names.join(", ")}</span>
              </div>
            {/each}
            <div class="list-row stack">
              <span>Session folder</span>
              <span class="t-data path">{shown.directory}</span>
            </div>
          </div>
        </ShowMore>
      </Glass>
      {#if list.truncated}<span class="t-caption"
          >Older sessions exist beyond the newest {count}.</span
        >{/if}
    {/if}
  </div>

  <aside data-enter>
    <Glass radius="phone" label="Report a problem" class="panel">
      <h2 class="t-panel-title">Report a problem</h2>
      <span class="measure"
        >Copy this session's summary into your report and attach files from its folder. Nothing is
        uploaded.</span
      >
      <div class="buttons">
        <PillButton variant="solid" disabled={!shown} onclick={copySummary}>Copy summary</PillButton
        >
        <PillButton disabled={!shown} onclick={openFolder}>Open folder</PillButton>
      </div>
      {#if note}<span class="t-caption" role="status">{note}</span>{/if}
      <span class="t-caption">Paths include your Windows user name. Look before you share.</span>
    </Glass>
  </aside>
</div>

<style>
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    align-items: flex-start;
  }
  .main {
    flex: 999 1 560px;
    min-width: 0;
    max-width: 820px;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  .layout :global(.panel) {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  aside {
    flex: 1 1 300px;
    max-width: 360px;
  }
  aside :global(.panel) {
    gap: 14px;
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
    gap: 4px;
  }
  h1,
  h2 {
    margin: 0;
  }
  h2 {
    padding-bottom: 6px;
  }
  aside h2 {
    padding: 0;
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: 8px;
    border-radius: 50%;
  }
  .picker {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .arrow {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  .arrow:hover:not(:disabled) {
    background: var(--hover);
  }
  .arrow:disabled {
    color: var(--ink-faint);
    cursor: default;
  }
  .when {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .rows :global(.icon) {
    flex: 0 0 auto;
    color: var(--ink-soft);
  }
  .rows :global(.icon.warn) {
    color: var(--build);
  }
  .rows :global(.icon.ok) {
    color: var(--crew);
  }
  .file {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .stack {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 10px 0;
  }
  .path {
    overflow-wrap: anywhere;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
