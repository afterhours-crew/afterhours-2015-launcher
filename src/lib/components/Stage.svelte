<script lang="ts">
  import type { Snippet } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import { MOTION, reducedMotion } from "$lib/state/motion";

  // Swaps its content when `key` changes. The outgoing scene fades out and
  // takes no input; the incoming one rises `rise` px while its panels fade
  // in one by one (staggerIn). Both share one grid cell, so nothing below
  // jumps. The rise only moves: fading a whole scene would switch off the
  // glass blur of every panel in it until the fade ends.
  let {
    key,
    rise = 0,
    flow = false,
    children,
  }: {
    key: string;
    rise?: number;
    /** Inside a scrolling view: as tall as its content, not the space left. */
    flow?: boolean;
    children: Snippet;
  } = $props();
  const still = reducedMotion();

  // The outgoing scene takes no input and sits under the incoming one.
  function leave(scene: HTMLElement) {
    scene.inert = true;
    scene.style.zIndex = "0";
  }

  function rising(_node: Element, { y, duration }: { y: number; duration: number }) {
    return {
      duration: still || y === 0 ? 0 : duration,
      easing: cubicOut,
      css: (t: number) => `transform: translateY(${(1 - t) * y}px)`,
    };
  }
</script>

<div class="stage" class:flow>
  {#key key}
    <div
      class="scene"
      in:rising={{ y: rise, duration: MOTION.slow }}
      out:fade={{ duration: still ? 0 : MOTION.fast }}
      onoutrostart={(e) => leave(e.currentTarget as HTMLElement)}
    >
      {@render children()}
    </div>
  {/key}
</div>

<style>
  .stage {
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  }
  .stage.flow {
    flex: 0 0 auto;
    grid-template-rows: auto;
  }
  .scene {
    position: relative;
    z-index: 1;
    grid-area: 1 / 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
</style>
