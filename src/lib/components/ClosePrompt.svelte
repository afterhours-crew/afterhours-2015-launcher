<script lang="ts">
  import Checkbox from "./Checkbox.svelte";
  import PillButton from "./PillButton.svelte";
  import { servers } from "$lib/state/servers.svelte";
  import { session } from "$lib/state/session.svelte";

  // Closing while this PC's shared server runs: your other PCs may be on
  // it, so the window asks whether to keep it running (the launcher closes
  // and the server stays, shown on Server next time) or stop it first. An
  // unshared server is stopped without asking. "Always do this" remembers
  // the answer (Settings keeps it changeable).
  let remember = $state(false);
  let busy = $state(false);

  async function answer(keep: boolean) {
    busy = true;
    try {
      await servers.closeDecision(keep, remember);
    } finally {
      busy = false;
    }
  }
</script>

<div class="dim" aria-hidden="true"></div>
<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="close-title">
  <h2 id="close-title">Keep your server running?</h2>
  <p>
    It is shared with your other PCs. If it keeps running, Server shows it next time and you can
    stop it there.
  </p>
  <label class="remember">
    <Checkbox bind:checked={remember} />
    <span>Always do this when I close the launcher</span>
  </label>
  <div class="actions">
    <PillButton variant="text" onclick={() => (session.closeAsk = false)} disabled={busy}
      >Cancel</PillButton
    >
    <span class="spacer"></span>
    <PillButton onclick={() => answer(false)} disabled={busy}>Stop and close</PillButton>
    <PillButton variant="solid" onclick={() => answer(true)} disabled={busy}
      >Keep running</PillButton
    >
  </div>
</div>

<style>
  .dim {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: rgba(14, 12, 17, 0.6);
  }
  .dialog {
    position: fixed;
    left: 50%;
    top: 50%;
    z-index: 21;
    width: min(480px, calc(100vw - 48px));
    box-sizing: border-box;
    padding: 24px;
    border-radius: var(--radius-phone);
    background: var(--graphite);
    border: 1px solid var(--graphite-edge);
    box-shadow: var(--shadow-float);
    translate: -50% -50%;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }
  p {
    margin: 0;
    font-size: 16px;
    line-height: 1.5;
    color: var(--ink-soft);
  }
  .remember {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 38px;
    font-size: 15px;
    color: var(--ink-soft);
    cursor: pointer;
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
