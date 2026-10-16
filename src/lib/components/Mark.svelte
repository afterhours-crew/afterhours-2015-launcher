<script lang="ts">
  // The Afterhours mark: two slanted bars, ink then play. Decorative here;
  // the wordmark next to it carries the name.
  let { height = 18 }: { height?: number } = $props();
</script>

<svg width={(height * 30) / 18} {height} viewBox="0 0 30 18" aria-hidden="true">
  <path d="M8 0 H19 L11 18 H0 Z" fill="var(--ink)"></path>
  <path d="M22 0 H30 L22 18 H14 Z" fill="var(--play)"></path>
</svg>
