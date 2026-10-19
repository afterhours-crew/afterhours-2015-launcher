<script lang="ts">
  import type { Snippet } from "svelte";
  let {
    variant = "outline",
    disabled = false,
    onclick,
    children,
  }: {
    variant?: "solid" | "outline" | "text";
    disabled?: boolean;
    onclick?: () => void;
    children: Snippet;
  } = $props();
</script>

<button type="button" class="pill-button {variant}" {disabled} {onclick}
  >{@render children()}</button
>

<style>
  .pill-button {
    height: var(--control-height);
    padding: 0 18px;
    border-radius: var(--radius-pill);
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
  }
  .solid {
    background: var(--ink);
    color: var(--on-ink);
  }
  .outline {
    border: 1px solid var(--graphite-outline);
    color: var(--ink);
  }
  .outline:hover:not(:disabled) {
    background: var(--hover);
  }
  .text {
    padding: 0 12px;
    color: var(--ink);
  }
  .text:hover:not(:disabled) {
    background: var(--hover);
  }
  .pill-button:disabled {
    color: var(--ink-faint);
    cursor: default;
  }
</style>
