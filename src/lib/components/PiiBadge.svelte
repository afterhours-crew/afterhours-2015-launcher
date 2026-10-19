<script lang="ts">
  import IconAlertTriangle from "@tabler/icons-svelte/icons/alert-triangle";
  import IconUser from "@tabler/icons-svelte/icons/user";
  // "Personal info": high-contrast amber with an icon and words, never
  // colour alone. Its accessible name says what the source holds.
  let {
    label = "Personal info",
    holds = null,
    icon = "user",
  }: {
    label?: string;
    /** What of the player's it holds, added to the accessible name. */
    holds?: string | null;
    icon?: "user" | "alert";
  } = $props();
</script>

<span
  class="pii"
  role="img"
  aria-label={holds ? `${label}: ${holds}` : label}
  title={holds ?? undefined}
>
  {#if icon === "alert"}
    <IconAlertTriangle size={14} stroke={2} aria-hidden="true" />
  {:else}
    <IconUser size={14} stroke={2} aria-hidden="true" />
  {/if}
  <span aria-hidden="true">{label}</span>
</span>

<style>
  .pii {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border-radius: var(--radius-pill);
    background: var(--pii-soft);
    border: 1px solid var(--pii-edge);
    color: var(--warn-ink);
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }
  .pii :global(svg) {
    flex: 0 0 auto;
  }
</style>
