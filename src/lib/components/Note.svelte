<script lang="ts">
  import type { Snippet } from "svelte";
  // Inline note: warn (something to act on) or plain (information).
  let { kind = "plain", children }: { kind?: "warn" | "plain" | "ready"; children: Snippet } =
    $props();
</script>

<div class="note {kind}">{@render children()}</div>

<style>
  .note {
    padding: 12px 14px;
    border-radius: var(--radius-row);
    background: var(--graphite-raised);
    border: 1px solid var(--graphite-edge);
    color: var(--ink);
    font-size: 16px;
    line-height: 1.5;
  }
  .warn {
    background: var(--warn-soft);
    border-color: var(--warn-edge);
    color: var(--warn-ink);
  }
  .ready {
    background: rgba(61, 214, 140, 0.14);
    border-color: rgba(61, 214, 140, 0.45);
    color: var(--ink);
  }
</style>
