<script lang="ts">
  // One fact with a status dot, on glass: the Garage home's chips.
  let { tone = "ready", text }: { tone?: "ready" | "warn" | "info" | "off"; text: string } =
    $props();
  const colors = {
    ready: "var(--status-ready)",
    warn: "var(--status-warn)",
    info: "var(--status-info)",
    off: "var(--ink-faint)",
  };
</script>

<span class="chip ah-glass"
  ><span class="dot" style="background: {colors[tone]}" aria-hidden="true"></span>{text}</span
>

<style>
  .chip {
    height: 34px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: var(--radius-pill);
    font-size: 13px;
    font-weight: 700;
    text-shadow: none;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
