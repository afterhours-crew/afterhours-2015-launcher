<script lang="ts">
  import IconMessageCircle from "@tabler/icons-svelte/icons/message-circle";
  import Clock from "$lib/components/Clock.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import Soon from "$lib/components/Soon.svelte";
  import StatChip from "$lib/components/StatChip.svelte";
  import { featureReady } from "$lib/state/capabilities";
  import { formatMoney } from "$lib/state/format";
  import { stateWords } from "$lib/state/logs";
  import { current, records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";
  import { TRAFFIC_OPTIONS, worldWaits } from "$lib/state/world";

  // Garage home (A1). The floor holds the clock and tonight's facts; the
  // quick tune shows the world settings, which wait for the server's
  // `world-settings` capability, and Cops, which wait for research.
  let server = $derived(session.info?.server);
  let world = $derived(featureReady(server, "traffic"));
  let profile = $derived(current(records.profile));
  let canProfile = $derived(featureReady(server, "profile"));

  // The one message the launcher has to tell: how the last session ended.
  let last = $derived(session.status);
  let lastTime = $derived(
    last ? new Date(last.utc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
  );
</script>

<main>
  <section class="floor ah-on-art" aria-label="Tonight">
    <span class="eyebrow">Your server · Ventura Bay</span>
    <Clock />
    <span class="caption">Tonight on your server.</span>
    <div class="chips">
      <StatChip tone="off" text="Traffic · Coming later" />
      <StatChip tone="off" text="Rivals · Coming later" />
      <StatChip tone="off" text="Cops · Coming later" />
      {#if profile?.bank}
        <StatChip tone="info" text="Bank · {formatMoney(profile.bank.balance)}" />
      {/if}
      {#if profile?.reputation?.level != null}
        <StatChip tone="info" text="REP {profile.reputation.level}" />
      {/if}
      {#if !canProfile}
        <StatChip tone="off" text="Bank and REP · Coming later" />
      {/if}
    </div>
    <PillButton onclick={() => router.go("world")}>Tune the world</PillButton>
  </section>

  <aside>
    <Glass radius="phone" label="Quick tune and messages" class="quick">
      <div class="head">
        <h2 class="t-panel-title">Quick tune</h2>
      </div>
      <div class="group">
        <span class="label-row"><span class="t-label">Traffic</span><Soon /></span>
        <Segmented options={TRAFFIC_OPTIONS} value={null} label="Traffic density" disabled />
      </div>
      <div class="row">
        <span class="text">
          <span>Roaming rivals</span>
          <span class="hint">Rivals cruise the city and race you.</span>
        </span>
        <Soon />
      </div>
      <div class="row">
        <span class="text">
          <span>Cops</span>
          <span class="hint">Your server has no police yet.</span>
        </span>
        <Soon />
      </div>
      <p class="hint">{worldWaits(world)}</p>

      <div class="head messages">
        <h2 class="t-panel-title">Messages</h2>
      </div>
      {#if last}
        {@const words = stateWords(last.state)}
        <div class="message">
          <IconMessageCircle size={20} stroke={1.6} aria-hidden="true" class="glyph" />
          <span class="body">
            <span
              ><strong>Last session</strong> <span class="t-data-small time">{lastTime}</span></span
            >
            <span class="text-soft">{words.label} · {last.message}</span>
          </span>
        </div>
      {:else}
        <p class="hint">Nothing yet. Press Play and your server's news shows up here.</p>
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
  }
  .floor {
    flex: 999 1 480px;
    min-width: 0;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
  }
  .eyebrow {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .caption {
    font-size: 16px;
    color: var(--ink-soft);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin: 6px 0 4px;
  }
  aside {
    flex: 1 1 320px;
    max-width: 380px;
  }
  aside :global(.quick) {
    padding: 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 4px;
  }
  .head h2 {
    margin: 0;
  }
  .messages {
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 4px;
  }
  .group .t-label {
    color: var(--ink-soft);
  }
  .label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 46px;
    padding: 0 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .text {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }
  .hint {
    margin: 0;
    padding: 0 4px;
    font-size: 13px;
    color: var(--ink-soft);
  }
  .row .hint {
    padding: 0;
  }
  .message {
    display: flex;
    gap: 10px;
    padding: 4px 6px;
  }
  .message :global(.glyph) {
    flex: 0 0 auto;
    margin-top: 1px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .time {
    color: var(--ink-muted);
  }
  .text-soft {
    font-size: 14px;
    line-height: 1.35;
    color: var(--ink-soft);
  }
</style>
