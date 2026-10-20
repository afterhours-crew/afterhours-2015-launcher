<script lang="ts">
  import type { Snippet } from "svelte";
  // A panel: opaque graphite (app.css `.ah-glass`). Radii follow the role.
  // `dense` is accepted for old call sites and changes nothing.
  let {
    dense: _dense = false,
    radius = "panel",
    class: extra = "",
    label,
    children,
  }: {
    dense?: boolean;
    radius?: "panel" | "phone" | "card" | "row" | "pill";
    class?: string;
    label?: string;
    children: Snippet;
  } = $props();
</script>

<section class="ah-glass {extra}" style="border-radius: var(--radius-{radius})" aria-label={label}>
  {@render children()}
</section>
