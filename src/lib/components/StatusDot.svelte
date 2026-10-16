<script lang="ts">
  // A status is always a word plus a dot, never color alone.
  let { kind, label }: { kind: "ready" | "warn" | "info" | "mods" | null; label: string } =
    $props();
  const colors = {
    ready: "var(--status-ready)",
    warn: "var(--status-warn)",
    info: "var(--status-info)",
    mods: "var(--status-mods)",
  };
</script>

<span class="status">
  {#if kind}<span class="dot" style="background: {colors[kind]}" aria-hidden="true"></span>{/if}
  <span>{label}</span>
</span>

<style>
  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-soft);
    font-size: 13px;
    line-height: 18px;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: 0 0 auto;
  }
</style>
