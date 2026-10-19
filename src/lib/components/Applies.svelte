<script lang="ts">
  // When a setting takes effect, as a word plus a dot.
  let { when }: { when: "live" | "next-launch" | "launcher" } = $props();
  const words = { live: "Live", "next-launch": "Next launch", launcher: "This launcher" };
  const dots = {
    live: "var(--status-ready)",
    "next-launch": "var(--status-info)",
    launcher: "var(--status-info)",
  };
</script>

<span class="applies"
  ><span class="dot" style="background: {dots[when]}" aria-hidden="true"></span>{words[when]}</span
>

<style>
  .applies {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    line-height: 16px;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: var(--ink-soft);
    white-space: nowrap;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
