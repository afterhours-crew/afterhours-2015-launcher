<script lang="ts">
  // One fact as a graphite chip, on the Garage home: bank, REP, cars.
  let { tone = null, text }: { tone?: "ready" | "warn" | "info" | null; text: string } = $props();
  const colors = {
    ready: "var(--status-ready)",
    warn: "var(--status-warn)",
    info: "var(--status-info)",
  };
</script>

<span class="chip"
  >{#if tone}<span class="dot" style="background: {colors[tone]}" aria-hidden="true"
    ></span>{/if}{text}</span
>

<style>
  .chip {
    height: 34px;
    padding: 0 14px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: var(--radius-pill);
    background: var(--graphite);
    border: 1px solid var(--graphite-edge);
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-shadow: none;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
