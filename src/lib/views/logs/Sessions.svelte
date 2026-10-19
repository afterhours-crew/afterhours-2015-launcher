<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import type { Glyph as Icon } from "$lib/components/glyph";
  import IconDeviceGamepad2 from "@tabler/icons-svelte/icons/device-gamepad-2";
  import IconFileDescription from "@tabler/icons-svelte/icons/file-description";
  import IconFileText from "@tabler/icons-svelte/icons/file-text";
  import IconPackage from "@tabler/icons-svelte/icons/package";
  import IconRocket from "@tabler/icons-svelte/icons/rocket";
  import IconTerminal2 from "@tabler/icons-svelte/icons/terminal-2";
  import IconUserPlus from "@tabler/icons-svelte/icons/user-plus";
  import type { SessionList } from "$lib/api/types";
  import DataChip from "$lib/components/DataChip.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import LogPanel from "$lib/components/LogPanel.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Soon from "$lib/components/Soon.svelte";
  import StatusDot from "$lib/components/StatusDot.svelte";
  import { formatBytes, formatCount } from "$lib/state/format";
  import {
    fileLine,
    groupFiles,
    levelShares,
    sessionChips,
    sessionHeading,
    summaryText,
    warningGroups,
  } from "$lib/state/logs";
  import { logView } from "$lib/state/logview.svelte";
  import { records } from "$lib/state/records.svelte";
  import { session as live } from "$lib/state/session.svelte";

  // Logs dashboard (E1): one session at a time, its files grouped by how
  // useful they are when something goes wrong.
  let { list }: { list: SessionList } = $props();

  let shown = $derived(logView.session);
  let count = $derived(list.sessions.length);
  let heading = $derived(
    shown ? sessionHeading(shown, Math.min(logView.index, count - 1), count) : null,
  );
  let groups = $derived(shown ? groupFiles(shown.files) : null);
  let warnings = $derived(shown ? warningGroups(shown.server_log) : null);
  let serverLog = $derived(
    groups?.breaks.find((e) => e.names.includes("server.stderr.log")) ?? null,
  );
  let shares = $derived(shown?.server_log ? levelShares(shown.server_log) : []);
  let note = $state<string | null>(null);

  // Decorative, so drawn in ink; a file the launcher does not describe gets a page.
  const ICONS: Record<string, Icon> = {
    "Server log": IconTerminal2,
    "Startup report": IconRocket,
    "Content preparation": IconPackage,
    "Account creation": IconUserPlus,
    "Game console": IconDeviceGamepad2,
  };
  const shareColor = {
    info: "rgba(244, 240, 234, 0.35)",
    warn: "var(--build)",
    error: "var(--style)",
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
  <Glass dense radius="panel" label="Logs" class="panel">
    <div class="head">
      <span class="title">
        <h1 class="t-view-title">Logs</h1>
        {#if heading}
          <StatusDot
            kind={heading.dot}
            label={heading.message ? `${heading.state} · ${heading.message}` : heading.state}
          />
        {/if}
      </span>
      {#if heading}
        <div class="picker ah-glass">
          <button
            type="button"
            class="arrow"
            aria-label="Newer session"
            disabled={logView.index <= 0}
            onclick={() => logView.step(-1)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
              ><path d="M8 2 L4 6 L8 10" fill="none" stroke="currentColor" stroke-width="1.6"
              ></path></svg
            >
          </button>
          <span class="when">
            <span class="when-title">{heading.when}</span>
            <span class="t-data-small soft">{heading.position}</span>
          </span>
          <button
            type="button"
            class="arrow"
            aria-label="Older session"
            disabled={logView.index >= count - 1}
            onclick={() => logView.step(1)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
              ><path d="M4 2 L8 6 L4 10" fill="none" stroke="currentColor" stroke-width="1.6"
              ></path></svg
            >
          </button>
        </div>
      {/if}
    </div>

    {#if !shown || !groups}
      <p class="caption">No sessions yet. Press Play, and each session's files show up here.</p>
    {:else}
      <div class="chips">
        {#each sessionChips(shown) as chip (chip.text)}
          <DataChip text={chip.text} tone={chip.tone} />
        {/each}
      </div>
      {#each shown.warnings as warning (warning)}<Note>{warning}</Note>{/each}

      <section class="group" aria-labelledby="start-here" use:staggerIn={{ selector: ".card" }}>
        <div class="group-head">
          <h2 id="start-here" class="t-panel-title">Start here</h2>
          <span class="caption">Read these first when something goes wrong.</span>
        </div>
        <div class="cards">
          {#if warnings && serverLog}
            <button
              type="button"
              class="card"
              onclick={() => logView.open("server.stderr.log", "warn")}
            >
              <span class="card-head"
                ><span class="t-body-strong">Server warnings</span><span class="t-data warn"
                  >{formatCount(warnings.total)} · {warnings.kinds}
                  {warnings.kinds === 1 ? "kind" : "kinds"}</span
                ></span
              >
              <span class="caption"
                >Things the game asked for that your server doesn't answer yet. Usually harmless.
                Always include them in a bug report.</span
              >
              {#if warnings.rows.length > 0}
                <span class="routes">
                  {#each warnings.rows as row (row.label)}
                    <span class="t-data-small route"
                      ><span>{row.label}</span><span class="soft">{formatCount(row.count)}</span
                      ></span
                    >
                  {/each}
                  {#if warnings.more}
                    <span class="t-data-small route"
                      ><span
                        >+ {warnings.more.kinds} more {warnings.more.kinds === 1
                          ? "kind"
                          : "kinds"}</span
                      ><span class="soft">{formatCount(warnings.more.count)}</span></span
                    >
                  {/if}
                </span>
              {/if}
              <span class="t-data-small soft">from server.stderr.log</span>
            </button>
          {/if}
          {#each groups.start as entry (entry.title)}
            <button type="button" class="card" onclick={() => logView.open(entry.names[0]!)}>
              <span class="card-head"
                ><span class="t-body-strong">{entry.title}</span><span class="t-data soft"
                  >{formatBytes(entry.bytes)}</span
                ></span
              >
              <span class="caption">{entry.about}</span>
              <span class="t-data-small soft">{entry.names.join(", ")}</span>
            </button>
          {/each}
          <div class="card static">
            <span class="card-head">
              <span class="t-body-strong">Game crash dumps</span>
              {#if shown.crash_dumps}
                <StatusDot
                  kind={shown.crash_dumps.length ? "warn" : "ready"}
                  label={shown.crash_dumps.length
                    ? `${shown.crash_dumps.length} this session`
                    : "None this session"}
                />
              {:else}
                <span class="caption">Not looked for</span>
              {/if}
            </span>
            <span class="caption"
              >When the game crashes it saves a CrashDump file. Attach it to your report.</span
            >
            {#each shown.crash_dumps ?? [] as dump (dump.path)}
              <span class="t-data-small">{dump.name}</span>
            {/each}
            {#if list.crash_dump_directory}
              <span class="t-data-small soft path">{list.crash_dump_directory.path}</span>
            {/if}
            <span class="personal">Personal info</span>
          </div>
        </div>
      </section>

      <section class="group" aria-labelledby="when-breaks" use:staggerIn={{ selector: ".file" }}>
        <div class="group-head">
          <h2 id="when-breaks" class="t-panel-title">When something breaks</h2>
          <span class="caption">The full story, for when the warnings aren't enough.</span>
        </div>
        {#each groups.breaks as entry (entry.title)}
          {@const Glyph = ICONS[entry.title] ?? IconFileDescription}
          <button type="button" class="pick file" onclick={() => logView.open(entry.names[0]!)}>
            <Glyph size={20} stroke={1.6} aria-hidden="true" class="glyph" />
            <span class="file-body">
              <span class="file-head"
                ><span class="t-body-strong">{entry.title}</span><span class="t-data soft"
                  >{fileLine(entry)}</span
                ></span
              >
              <span class="caption">{entry.about}</span>
              {#if entry.names.includes("server.stderr.log") && shares.length > 0}
                <span
                  class="levels grow-x"
                  role="img"
                  aria-label={shares.map((s) => `${formatCount(s.count)} ${s.level}`).join(", ")}
                >
                  {#each shares as share (share.level)}
                    <span style="flex: {share.count} 0 0; background: {shareColor[share.level]}"
                    ></span>
                  {/each}
                </span>
              {/if}
            </span>
          </button>
        {/each}
        {#if list.ea_desktop_logs}
          <div class="pick file static">
            <IconFileText size={20} stroke={1.6} aria-hidden="true" class="glyph" />
            <span class="file-body">
              <span class="file-head"
                ><span class="t-body-strong">EA Desktop logs</span><span class="personal"
                  >EA account details</span
                ></span
              >
              <span class="caption"
                >Only matters when the launcher stopped at "EA activation needs your attention".
                Written by EA Desktop, not Afterhours.</span
              >
              <span class="t-data-small soft path">{list.ea_desktop_logs.path}</span>
            </span>
          </div>
        {/if}
      </section>

      <section class="group" aria-labelledby="deep-dive">
        <div class="group-head">
          <h2 id="deep-dive" class="t-panel-title">Deep dive</h2>
          <span class="caption">For developers. Big, technical, sometimes personal.</span>
        </div>
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col" class="t-label">What</th>
                <th scope="col" class="t-label">Where</th>
                <th scope="col" class="t-label">What it may contain</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="strong">Protocol recording</td>
                <td class="t-data-small soft"
                  >{shown.runs_directory_exists ? shown.runs_directory : "Off for this session"}</td
                >
                <td class="soft"
                  >Every message between game and server. Off by default. Includes account identity.</td
                >
              </tr>
              {#each groups.deep as entry (entry.title)}
                <tr>
                  <td class="strong">{entry.title}</td>
                  <td class="t-data-small soft">{entry.names.join(", ")}</td>
                  <td class="soft">{entry.about}</td>
                </tr>
              {/each}
              <tr>
                <td class="strong">Session folder</td>
                <td class="t-data-small soft path">{shown.directory}</td>
                <td class="soft">Every file above, as the server wrote it.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    {#if live.console.length > 0}
      <section class="group" aria-label="This window's session">
        <div class="group-head">
          <h2 class="t-panel-title">Live console</h2>
          <span class="caption">The session started from this window.</span>
        </div>
        <div class="console"><LogPanel lines={live.console} empty="" /></div>
      </section>
    {/if}
  </Glass>

  <aside>
    <Glass dense radius="phone" label="Report a problem" class="side">
      <div class="side-head">
        <h2 class="t-panel-title">Report a problem</h2>
        <Soon />
      </div>
      <span class="caption">
        Packing the files you pick into one .zip in your data folder comes later. Nothing is ever
        uploaded.
      </span>
      <Note kind="warn">Look before you share. File paths include your Windows user name.</Note>
      <div class="buttons">
        <PillButton variant="solid" disabled={!shown} onclick={copySummary}>Copy summary</PillButton
        >
        <PillButton variant="text" disabled={!shown} onclick={openFolder}
          >Open session folder</PillButton
        >
      </div>
      {#if note}<span class="caption" role="status">{note}</span>{/if}
      <div class="buttons">
        <PillButton variant="text" onclick={() => records.loadSessions()}>Refresh</PillButton>
      </div>
      {#if list.truncated}<span class="caption"
          >Older sessions exist beyond the newest {count}.</span
        >{/if}
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
  .layout :global(.panel) {
    flex: 999 1 640px;
    min-width: 0;
    padding: 20px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 16px;
  }
  .title {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  h1,
  h2 {
    margin: 0;
  }
  .picker {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
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
    opacity: 0.5;
    cursor: default;
  }
  .when {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.15;
    padding: 0 6px;
  }
  .when-title {
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .soft {
    color: var(--ink-soft);
  }
  .warn {
    color: var(--warn-ink);
  }
  .caption {
    margin: 0;
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-soft);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .group-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-radius: var(--radius-card);
    background: var(--field);
    border: 1px solid var(--glass-edge);
    text-align: left;
  }
  button.card:hover {
    background: var(--row-hover);
  }
  .card.static {
    cursor: default;
  }
  .card-head,
  .file-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 12px;
  }
  .routes {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .route {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .path {
    overflow-wrap: anywhere;
  }
  .personal {
    align-self: flex-start;
    padding: 1px 9px;
    border-radius: var(--radius-pill);
    background: var(--warn-soft);
    color: var(--warn-ink);
    font: 700 10px/16px var(--font-ui);
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .file {
    align-items: flex-start;
  }
  .file.static {
    cursor: default;
  }
  .file.static:hover {
    background: transparent;
  }
  .file :global(.glyph) {
    flex: 0 0 auto;
    margin: 1px 5px 0;
    color: var(--ink);
  }
  .file-body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .levels {
    display: flex;
    height: 6px;
    margin-top: 4px;
    border-radius: 999px;
    overflow: hidden;
  }
  .levels span {
    min-width: 6px;
  }
  .scroll {
    overflow-x: auto;
    border-radius: var(--radius-row);
    background: var(--field);
  }
  table {
    width: 100%;
    min-width: 560px;
    border-collapse: collapse;
    font-size: 14px;
  }
  th {
    text-align: left;
    padding: 10px 14px;
    color: var(--ink-muted);
  }
  td {
    padding: 8px 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    vertical-align: top;
  }
  .strong {
    font-weight: 700;
  }
  .console {
    display: flex;
    min-height: 220px;
  }
  aside {
    flex: 1 1 290px;
    max-width: 330px;
  }
  aside :global(.side) {
    padding: 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .side-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>
