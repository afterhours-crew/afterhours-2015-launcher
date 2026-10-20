<script lang="ts">
  import { onMount } from "svelte";
  import { MOTION, countAt, reducedMotion } from "$lib/state/motion";

  // A number that counts up once, the first time it shows. Later changes
  // show at once. Tabular figures keep the width steady while it counts.
  let { value, format }: { value: number; format: (n: number) => string } = $props();
  let shown = $state<number | null>(null);

  onMount(() => {
    if (reducedMotion()) return;
    const target = value;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const elapsed = now - start;
      shown = countAt(target, elapsed, MOTION.slow);
      if (elapsed < MOTION.slow) frame = requestAnimationFrame(step);
      else shown = null;
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<span class="count-up">{format(shown ?? value)}</span>

<style>
  .count-up {
    font-variant-numeric: tabular-nums;
  }
</style>
