<script lang="ts">
  import type { ServerCheck } from "$lib/api/types";
  import Field from "$lib/components/Field.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { isLive } from "$lib/state/launchbar";
  import { checkWords, parsePairing } from "$lib/state/serverpicker";
  import { servers } from "$lib/state/servers.svelte";
  import { session } from "$lib/state/session.svelte";

  // Add a server (I3): a name and the pairing code from the other PC's
  // Server screen. Check asks that server what it is before anything is
  // saved; the result says what works here and why a server cannot be
  // used. Save and use picks it at once; Save for later keeps it in the
  // list.
  let name = $state("");
  let pairing = $state("");
  let checking = $state(false);
  let saving = $state(false);
  let result = $state<ServerCheck | null>(null);
  let problem = $state<string | null>(null);

  let thisPcRuns = $derived(servers.inUse === null && isLive(session.status?.state));
  let words = $derived(result ? checkWords(result, name, thisPcRuns) : null);

  const dots = {
    ready: "var(--status-ready)",
    warn: "var(--status-warn)",
    info: "var(--status-info)",
  };

  function valid(): boolean {
    const parsed = parsePairing(pairing);
    if (!parsed.ok) {
      problem = parsed.message;
      return false;
    }
    if (!parsed.value.token) {
      problem =
        "The pairing code has no token. Copy the whole code from that server's Server screen.";
      return false;
    }
    return true;
  }

  async function check() {
    problem = null;
    result = null;
    if (!valid()) return;
    checking = true;
    try {
      result = await servers.check(pairing);
    } catch (e) {
      problem = String(e instanceof Error ? e.message : e);
    } finally {
      checking = false;
    }
  }

  async function save(useNow: boolean) {
    problem = null;
    if (!valid()) return;
    saving = true;
    try {
      await servers.add(name, pairing, useNow);
    } catch (e) {
      problem = String(e instanceof Error ? e.message : e);
    } finally {
      saving = false;
    }
  }

  function cancel() {
    servers.adding = false;
  }
</script>

<Glass radius="panel" label="Add a server" class="card add">
  <div class="head">
    <h2 class="t-panel-title">Add a server</h2>
    <PillButton variant="text" onclick={cancel} disabled={saving}>Cancel</PillButton>
  </div>
  <div class="fields">
    <Field id="add-name" label="Name" placeholder="Garage PC" bind:value={name} maxlength={48} />
    <Field
      id="add-code"
      label="Pairing code"
      placeholder="192.168.1.32:61234/…"
      mono
      bind:value={pairing}
    />
  </div>
  <span class="t-caption hint"
    >On the other PC: Server › Let your other PCs use this server › Copy. Paste the whole code, or
    the address and then the token.</span
  >
  {#if words}
    <div class="found" role="status">
      <div class="line">
        {#if words.dot}<span class="dot" style="background: {dots[words.dot]}" aria-hidden="true"
          ></span>{/if}
        <span class="title">{words.title}</span>
        {#if result?.state === "online"}<span class="t-caption ms">{result.ping_ms} ms</span>{/if}
      </div>
      {#if words.features.length > 0}
        <div class="features">
          <span class="t-caption">Works here</span>
          {#each words.features as feature (feature)}<span class="feat">{feature}</span>{/each}
        </div>
      {/if}
      <span class="t-caption">{words.line}</span>
    </div>
  {/if}
  {#if problem}<Note kind="warn">{problem}</Note>{/if}
  <div class="actions">
    {#if words?.ok}
      <PillButton variant="solid" onclick={() => save(true)} disabled={saving}
        >{saving ? "Saving…" : "Save and use"}</PillButton
      >
      <PillButton onclick={() => save(false)} disabled={saving}>Save for later</PillButton>
      <span class="spacer"></span>
      <PillButton variant="text" onclick={check} disabled={checking || saving}
        >{checking ? "Checking…" : "Check again"}</PillButton
      >
    {:else}
      <PillButton variant="solid" onclick={check} disabled={checking || saving}
        >{checking ? "Checking…" : "Check"}</PillButton
      >
    {/if}
  </div>
</Glass>

<style>
  :global(.card.add) {
    max-width: 720px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  h2 {
    margin: 0 auto 0 0;
  }
  .fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 16px;
  }
  .hint {
    margin-top: -6px;
  }
  .found {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 18px;
    border-radius: var(--radius-row);
    background: var(--graphite-raised);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
  .title {
    font-weight: 600;
  }
  .ms {
    margin-left: auto;
  }
  .features {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .feat {
    display: inline-flex;
    align-items: center;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--radius-pill);
    background: var(--graphite);
    border: 1px solid var(--graphite-edge);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .spacer {
    flex: 1 1 auto;
  }
</style>
