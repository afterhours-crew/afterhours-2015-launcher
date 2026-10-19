<script lang="ts">
  import { initials } from "$lib/state/launchbar";
  import { NAV, type View } from "$lib/state/routes";
  import Mark from "./Mark.svelte";
  import NavPills from "./NavPills.svelte";
  import WindowControls from "./WindowControls.svelte";

  let {
    view,
    onNavigate,
    driverName,
    subline = null,
    avatar = null,
    online = false,
    showNav = true,
  }: {
    view: View;
    onNavigate: (view: View) => void;
    driverName: string;
    /** "REP 18 · $250,000" from the save; nothing without the profile. */
    subline?: string | null;
    avatar?: string | null;
    online?: boolean;
    showNav?: boolean;
  } = $props();
  const COLORS = ["style", "speed", "build", "crew", "outlaw", "peach"];
  let fill = $derived(COLORS.includes(avatar ?? "") ? `var(--${avatar})` : "var(--style)");

  const items: { id: View; label: string; dot?: string }[] = NAV;
</script>

<header data-tauri-drag-region>
  <button type="button" class="brand" onclick={() => onNavigate("garage")} aria-label="Garage">
    <Mark />
    <span class="wordmark">Afterhours</span>
  </button>
  {#if showNav}
    <NavPills current={view} {items} {onNavigate} />
  {:else}
    <span></span>
  {/if}
  <div class="profile ah-glass">
    {#if showNav}
      <span class="avatar" class:online style="background: {fill}" aria-hidden="true"
        >{initials(driverName)}</span
      >
      <span class="who">
        <span class="name">{driverName}</span>
        {#if subline}<span class="t-data-small sub">{subline}</span>{/if}
      </span>
    {/if}
    <WindowControls />
  </div>
</header>

<style>
  header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    padding: var(--header-top) var(--space-6) 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .wordmark {
    font-weight: 800;
    font-size: 21px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .profile {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 6px 4px 4px;
    border-radius: var(--radius-pill);
  }
  .avatar {
    width: var(--avatar-md);
    height: var(--avatar-md);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--on-ink);
    font-weight: 800;
    font-size: 13px;
  }
  .avatar.online {
    box-shadow:
      0 0 0 2px rgba(18, 16, 21, 0.8),
      0 0 0 4px var(--crew);
  }
  .who {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .name {
    font-weight: 700;
  }
  .sub {
    color: var(--ink-soft);
  }
</style>
