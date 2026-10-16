<script lang="ts">
  import type { Snippet } from "svelte";
  // A glass surface. Light glass for small things on the Garage home, dense
  // glass for lists and forms. Radii follow the role.
  let {
    dense = false,
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

<section
  class="ah-glass {dense ? 'ah-glass-dense' : ''} {extra}"
  style="border-radius: var(--radius-{radius})"
  aria-label={label}
>
  {@render children()}
</section>
