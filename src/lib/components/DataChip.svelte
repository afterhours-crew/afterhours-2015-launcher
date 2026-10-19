<script lang="ts">
  // A fact in mono on a field pill: sizes, counts, versions.
  let { text, tone = "plain" }: { text: string; tone?: "plain" | "warn" } = $props();
</script>

<span class="t-data chip" class:warn={tone === "warn"}>{text}</span>

<style>
  .chip {
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    background: var(--field);
    white-space: nowrap;
  }
  .warn {
    background: var(--warn-soft);
    color: var(--warn-ink);
  }
</style>
