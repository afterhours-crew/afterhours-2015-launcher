<script lang="ts">
  import type { View } from "$lib/state/routes";
  let {
    current,
    items,
    onNavigate,
  }: {
    current: View;
    items: { id: View; label: string; dot?: string }[];
    onNavigate: (view: View) => void;
  } = $props();
</script>

<nav aria-label="Main" class="ah-glass flat">
  {#each items as item (item.id)}
    <button
      type="button"
      class="pill t-nav"
      aria-current={current === item.id ? "page" : undefined}
      onclick={() => onNavigate(item.id)}
    >
      {item.label}
      {#if item.dot}<span class="dot" style="background: {item.dot}" aria-hidden="true"></span>{/if}
    </button>
  {/each}
</nav>

<style>
  nav {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: 5px;
    border-radius: var(--radius-pill);
  }
  .pill[aria-current="page"] {
    font-weight: 800;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
</style>
