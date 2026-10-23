<script lang="ts">
  import { untrack } from "svelte";
  import { staggerIn } from "$lib/motion";
  import IconAlertTriangle from "@tabler/icons-svelte/icons/alert-triangle";
  import IconBrandPatreon from "@tabler/icons-svelte/icons/brand-patreon";
  import IconX from "@tabler/icons-svelte/icons/x";
  import { openUrl } from "$lib/api/tauri";
  import Clock from "$lib/components/Clock.svelte";
  import EmptyLine from "$lib/components/EmptyLine.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import Mark from "$lib/components/Mark.svelte";
  import StatChip from "$lib/components/StatChip.svelte";
  import { formatCount, formatMoney } from "$lib/state/format";
  import { lastSession } from "$lib/state/garage";
  import { current, records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";
  import { supportLinks } from "$lib/state/support";

  // Garage home (H1). The floor holds the clock and tonight's facts from
  // the save; the side panel says how the last session went. World
  // settings live on World, where the server's support decides what shows.
  // Now and then (not every open: src/lib/state/support.ts) the panel ends
  // with one quiet line and the Patreon link (canvas J2).
  let profile = $derived(current(records.profile));
  let support = $derived(session.supportNudge ? supportLinks() : []);
  let sessions = $derived(current(records.sessions)?.sessions ?? null);
  let last = $derived(lastSession(session.status, sessions, new Date()));

  $effect(() => {
    if (records.canSessions) untrack(() => void records.loadSessions());
  });

  const dots = {
    ready: "var(--status-ready)",
    warn: "var(--status-warn)",
    info: "var(--status-info)",
  };
</script>

<main use:staggerIn>
  <section class="floor ah-on-art" aria-label="Tonight" data-enter>
    <span class="where">Your server · Ventura Bay</span>
    <Clock />
    {#if profile}
      <div class="chips">
        {#if profile.bank}<StatChip text={formatMoney(profile.bank.balance)} />{/if}
        {#if profile.reputation?.level != null}<StatChip
            text="REP {profile.reputation.level}"
          />{/if}
        {#if profile.cars}<StatChip
            text="{formatCount(profile.cars.length)} {profile.cars.length === 1 ? 'car' : 'cars'}"
          />{/if}
      </div>
    {/if}
  </section>

  <aside data-enter>
    <Glass radius="phone" label="Last session and messages" class="side">
      {#if last}
        <h2 class="t-panel-title">{last.title}</h2>
        <div class="rows">
          <div class="list-row">
            {#if last.dot}<span class="dot" style="background: {dots[last.dot]}" aria-hidden="true"
              ></span>{/if}
            <span class="grow">{last.state}</span>
            {#if last.when}<span class="t-data">{last.when}</span>{/if}
          </div>
          {#if last.warnings}
            <div class="list-row">
              <IconAlertTriangle size={18} stroke={1.6} aria-hidden="true" class="warn" />
              <span class="grow"
                >{formatCount(last.warnings)}
                {last.warnings === 1 ? "warning" : "warnings"}</span
              >
              <button type="button" class="link" onclick={() => router.go("logs")}>View logs</button
              >
            </div>
          {/if}
        </div>
        {#if last.message}
          <h2 class="t-panel-title messages">Messages</h2>
          <div class="message">
            <span class="badge" aria-hidden="true"><Mark height={14} /></span>
            <span class="body">
              <span class="from"
                >Afterhours{#if last.when}<span class="t-data"> {last.when}</span>{/if}</span
              >
              <span class="t-caption">{last.message}</span>
            </span>
          </div>
        {/if}
      {:else}
        <h2 class="t-panel-title">Last session</h2>
        <EmptyLine>No sessions yet. Press Play to start one.</EmptyLine>
      {/if}
      {#if support.length > 0}
        <div class="support" role="note" aria-label="Support the project">
          <IconBrandPatreon size={20} stroke={1.6} aria-hidden="true" class="cup" />
          <span class="support-body">
            <span class="t-caption"
              >Afterhours is free. If it keeps your garage open, you can chip in.</span
            >
            <span class="support-links">
              {#each support as link (link.key)}
                <button type="button" class="link" onclick={() => void openUrl(link.url)}
                  >{link.short}</button
                >
              {/each}
            </span>
          </span>
          <button
            type="button"
            class="dismiss"
            aria-label="Hide for now"
            onclick={() => session.dismissNudge()}><IconX size={16} stroke={1.8} /></button
          >
        </div>
      {/if}
    </Glass>
  </aside>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-6);
    min-height: 0;
    overflow: auto;
    align-items: flex-start;
    justify-content: center;
  }
  .floor {
    flex: 999 1 480px;
    min-width: 0;
    /* With the side panel, no wider than the shared page width. */
    max-width: calc(var(--page-wide) - 360px - var(--space-5));
    align-self: stretch;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
  }
  .where {
    font-size: 14px;
    color: var(--ink);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 10px;
  }
  aside {
    flex: 1 1 320px;
    max-width: 360px;
  }
  aside :global(.side) {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .support {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-top: 12px;
    padding-top: 14px;
    border-top: 1px solid var(--graphite-edge);
  }
  .support :global(.cup) {
    flex: 0 0 auto;
    margin-top: 2px;
    color: var(--ink-soft);
  }
  .support-body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .support-links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  .dismiss {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    margin: -6px -6px 0 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--ink-soft);
  }
  .dismiss:hover {
    background: var(--hover);
    color: var(--ink);
  }
  h2 {
    margin: 0;
    padding-bottom: 6px;
  }
  .messages {
    padding-top: 16px;
    margin-top: 6px;
    border-top: 1px solid var(--graphite-edge);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .rows :global(.warn) {
    flex: 0 0 auto;
    color: var(--build);
  }
  .link {
    min-height: 38px;
    padding: 0 6px;
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .message {
    display: flex;
    gap: 12px;
    padding: 4px 0;
  }
  .badge {
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    border-radius: var(--radius-row);
    background: var(--graphite-raised);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .from {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-weight: 600;
    font-size: 15px;
  }
</style>
