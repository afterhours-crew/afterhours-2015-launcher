<script lang="ts">
  import { initials } from "$lib/state/launchbar";
  // A driver: initials on one of the six avatar colors.
  let {
    name,
    color = "style",
    size = 34,
    ring,
  }: { name: string; color?: string | null; size?: number; ring?: "online" | "host" } = $props();
  const COLORS = ["style", "speed", "build", "crew", "outlaw", "peach"];
  let fill = $derived(COLORS.includes(color ?? "") ? `var(--${color})` : "var(--style)");
</script>

<span
  class="avatar {ring ?? ''}"
  aria-hidden="true"
  style="width: {size}px; height: {size}px; background: {fill}; font-size: {Math.round(
    size * 0.36,
  )}px">{initials(name)}</span
>

<style>
  .avatar {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: var(--on-ink);
    font-weight: 700;
    text-shadow: none;
  }
  .online {
    box-shadow:
      0 0 0 2px rgba(18, 16, 21, 0.8),
      0 0 0 4px var(--crew);
  }
  .host {
    box-shadow:
      0 0 0 2px rgba(18, 16, 21, 0.8),
      0 0 0 4px var(--ink);
  }
</style>
