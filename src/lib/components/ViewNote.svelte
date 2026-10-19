<script lang="ts">
  import IconInfoCircle from "@tabler/icons-svelte/icons/info-circle";
  import type { Snippet } from "svelte";
  import type { Glyph as Icon } from "./glyph";
  // The one note a view gives about what the server cannot do yet. The
  // controls it is about are hidden, not shown disabled with explanations.
  let { icon: Glyph = IconInfoCircle, children }: { icon?: Icon; children: Snippet } = $props();
</script>

<div class="note" role="note">
  <Glyph size={20} stroke={1.6} aria-hidden="true" class="glyph" />
  <span class="text">{@render children()}</span>
</div>

<style>
  .note {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    border-radius: var(--radius-panel);
    background: var(--graphite);
    border: 1px solid rgba(169, 130, 255, 0.35);
    box-shadow: var(--shadow-panel);
  }
  .note :global(.glyph) {
    flex: 0 0 auto;
    color: var(--mods-ink);
  }
  .text {
    font-size: 16px;
    line-height: 1.5;
    max-width: 65ch;
  }
</style>
