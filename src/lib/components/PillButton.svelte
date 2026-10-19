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
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .solid {
    background: var(--ink);
    color: var(--on-ink);
    font-weight: 700;
  }
  .outline {
    border: 1px solid rgba(255, 255, 255, 0.35);
    color: var(--ink);
  }
  .outline:hover:not(:disabled) {
    background: var(--hover);
  }
  .text {
    color: var(--ink-soft);
  }
  .pill-button:disabled {
    color: var(--ink-faint);
    cursor: default;
  }
</style>
