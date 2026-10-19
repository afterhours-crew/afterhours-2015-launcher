<script lang="ts">
  import type { Snippet } from "svelte";
  // An empty state, collapsed to one line: "No driving stats yet".
  let { children }: { children: Snippet } = $props();
</script>

<p class="empty">{@render children()}</p>

<style>
  .empty {
    margin: 0;
    padding: 16px 18px;
    border-radius: var(--radius-row);
    background: var(--graphite-raised);
    color: var(--ink-soft);
    font-size: 16px;
    line-height: 1.5;
  }
</style>
