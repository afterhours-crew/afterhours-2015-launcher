<script lang="ts">
  // "Coming later": what the server cannot do yet. Never sample values.
  let { label = "Coming later" }: { label?: string } = $props();
</script>

<span class="soon">{label}</span>

<style>
  .soon {
    display: inline-flex;
    align-items: center;
    padding: 1px 9px;
    border-radius: var(--radius-pill);
    background: var(--mods-soft);
    color: var(--mods-ink);
    font: 800 10px/16px var(--font-ui);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    white-space: nowrap;
  }
</style>
