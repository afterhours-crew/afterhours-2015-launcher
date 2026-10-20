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
  import PiiBadge from "$lib/components/PiiBadge.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import ShowMore from "$lib/components/ShowMore.svelte";
  import Checkbox from "$lib/components/Checkbox.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { formatCount, formatSaved } from "$lib/state/format";
  import { fileFacts, groupFiles, sessionLine, stateWords } from "$lib/state/logs";
  import { logView } from "$lib/state/logview.svelte";
  import {
    REDACTED,
    copyablePath,
    personalSource,
    reportItems,
    reportSummary,
  } from "$lib/state/privacy";
  import { records } from "$lib/state/records.svelte";
  import { session as app } from "$lib/state/session.svelte";

  // Logs (H7): one session at a time. "Start here" says what matters in a
  // line each; then the session's files; then the sources that hold
  // personal information, always in view with their badges. Report a
  // problem warns before sharing, starts with personal sources unchecked
  // and hides the user name in what it copies.
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
  let sourceNote = $state<string | null>(null);

  const EA = personalSource("ea-desktop-logs")!;
  const CRASH = personalSource("crash-dumps")!;
  const RECORDING = personalSource("protocol-recording")!;

  // The report's checklist: what exists for this session, personal sources
  // unchecked until the player ticks them.
  let items = $derived(shown ? reportItems(shown, list) : []);
  let picks = $state<Record<string, boolean>>({});
  const pickKey = (id: string) => `${shown?.id}:${id}`;
  let included = $derived(
    new Set(items.filter((i) => picks[pickKey(i.id)] ?? !i.personal).map((i) => i.id)),
  );

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
      await navigator.clipboard.writeText(reportSummary(shown, items, included, app.privacy));
      note = app.hideUserName ? `Summary copied, user name hidden.` : "Summary copied.";
    } catch {
      note = "Could not reach the clipboard.";
    }
  }

  async function copyPath(path: string) {
    sourceNote = null;
    try {
      await navigator.clipboard.writeText(copyablePath(path, app.privacy));
      sourceNote = app.hideUserName ? "Path copied, user name hidden." : "Path copied.";
    } catch {
      sourceNote = "Could not reach the clipboard.";
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
                <PiiBadge holds={CRASH.holds} />
                <InfoButton
                  label="About crash dumps"
                  text="When the game crashes it saves a CrashDump file. It helps a bug report, but it can hold anything that was in the game's memory. {crashes
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
        <ShowMore label="Session records" summary="request, stop and the session folder">
          <div class="rows">
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

      <!-- Personal information is never folded away: the section and each
           source carry the badge and say what they hold. -->
      <Glass radius="panel" label="Sources with personal info" class="panel sources">
        <div class="section-head">
          <h2 class="t-panel-title">More sources</h2>
          <PiiBadge label="All contain personal info" icon="alert" />
        </div>
        <div class="rows">
          <div class="list-row">
            <span class="grow text"
              ><span class="t-body-strong">{EA.title}</span><span class="t-caption">{EA.holds}</span
              ></span
            >
            <PiiBadge holds={EA.holds} />
            {#if list.ea_desktop_logs?.exists}
              <PillButton variant="text" onclick={() => copyPath(list.ea_desktop_logs!.path)}
                >Copy path</PillButton
              >
            {:else}
              <span class="t-caption state">Not found</span>
            {/if}
          </div>
          <div class="list-row">
            <span class="grow text"
              ><span class="t-body-strong">{CRASH.title}</span><span class="t-caption"
                >{CRASH.holds}</span
              ></span
            >
            <PiiBadge holds={CRASH.holds} />
            {#if crashes?.length && list.crash_dump_directory}
              <PillButton variant="text" onclick={() => copyPath(list.crash_dump_directory!.path)}
                >Copy path</PillButton
              >
            {:else}
              <span class="t-caption state">{crashes ? "None this session" : "Not looked for"}</span
              >
            {/if}
          </div>
          <div class="list-row">
            <span class="grow text"
              ><span class="t-body-strong">{RECORDING.title}</span><span class="t-caption"
                >{RECORDING.holds}</span
              ></span
            >
            <PiiBadge holds={RECORDING.holds} />
            {#if shown.runs_directory_exists}
              <PillButton variant="text" onclick={() => copyPath(shown!.runs_directory)}
                >Copy path</PillButton
              >
            {:else}
              <span class="t-caption state">Off</span>
            {/if}
          </div>
        </div>
        {#if sourceNote}<span class="t-caption" role="status">{sourceNote}</span>{/if}
      </Glass>
      {#if list.truncated}<span class="t-caption"
          >Older sessions exist beyond the newest {count}.</span
        >{/if}
    {/if}
  </div>

  <aside data-enter>
    <Glass radius="phone" label="Report a problem" class="panel">
      <h2 class="t-panel-title">Report a problem</h2>
      <span class="t-caption"
        >Copy this session's summary, with the files to attach, into your report. Nothing is
        uploaded.</span
      >
      <div class="privacy" role="note" aria-labelledby="check-title">
        <h3 id="check-title">
          <IconAlertTriangle size={20} stroke={2} aria-hidden="true" />Check before you share
        </h3>
        <ul>
          <li>File paths show your Windows user name</li>
          <li>EA Desktop logs hold your EA account details</li>
          <li>Crash dumps can hold anything from memory</li>
        </ul>
      </div>
      {#if items.length > 0}
        <fieldset class="include">
          <legend class="t-label">Include</legend>
          {#each items as item (item.id)}
            <label class="check">
              <Checkbox
                checked={included.has(item.id)}
                onchange={(checked) => (picks[pickKey(item.id)] = checked)}
              />
              <span class="grow">{item.label}</span>
              {#if item.personal}<PiiBadge holds={item.personal.holds} />{/if}
            </label>
          {/each}
        </fieldset>
      {/if}
      <div class="list-row hide">
        <span class="grow text"
          ><span id="hide-name" class="t-body-strong">Hide my user name</span><span
            class="t-caption">Copied paths show {REDACTED}</span
          ></span
        >
        <Toggle bind:checked={app.hideUserName} labelledby="hide-name" />
      </div>
      <div class="buttons">
        <PillButton variant="solid" disabled={!shown} onclick={copySummary}>Copy summary</PillButton
        >
        <PillButton disabled={!shown} onclick={openFolder}>Open folder</PillButton>
      </div>
      {#if note}<span class="t-caption" role="status">{note}</span>{/if}
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
  .section-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    padding-bottom: 6px;
  }
  .section-head h2 {
    padding: 0;
  }
  .text {
    display: flex;
    flex-direction: column;
  }
  .state {
    text-align: right;
  }
  /* Badges line up: the last column is one width whatever it holds. */
  .layout :global(.sources .list-row > :last-child) {
    flex: 0 0 140px;
    display: flex;
    justify-content: flex-end;
  }
  /* "Check before you share": amber, titled, and a note to assistive tech. */
  .privacy {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 18px;
    border-radius: var(--radius-row);
    background: var(--pii-callout);
    border: 1px solid var(--pii-edge);
  }
  .privacy h3 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--warn-ink);
  }
  .privacy :global(svg) {
    flex: 0 0 auto;
  }
  .privacy ul {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 15px;
    line-height: 1.45;
  }
  .include {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
  }
  .include legend {
    padding: 0 0 4px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    cursor: pointer;
  }
  .check .grow {
    flex: 1 1 auto;
    min-width: 0;
  }
  .hide {
    border-top: 1px solid var(--graphite-edge);
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
