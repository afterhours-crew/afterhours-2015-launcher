<script lang="ts">
  import { onMount } from "svelte";
  import { onMaximizedChange, windowControl, type Unlisten } from "$lib/api/tauri";
  import { windowButtons } from "$lib/state/windowcontrols";
  // The window's own buttons with the Windows glyphs, square hovers and a
  // red Close, so they never read as actions on the profile beside them.
  let maximized = $state(false);
  let buttons = $derived(windowButtons(maximized));

  onMount(() => {
    let stop: Unlisten | null = null;
    let gone = false;
    void onMaximizedChange((value) => (maximized = value)).then((unlisten) => {
      if (gone) unlisten();
      else stop = unlisten;
    });
    return () => {
      gone = true;
      stop?.();
    };
  });
</script>

<div class="controls" role="group" aria-label="Window">
  {#each buttons as button (button.action)}
    <button
      type="button"
      class="control"
      class:close={button.action === "close"}
      aria-label={button.label}
      title={button.label}
      onclick={() => windowControl(button.action)}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        {#if button.glyph === "minimize"}
          <path d="M0 5.5 H10" stroke="currentColor"></path>
        {:else if button.glyph === "maximize"}
          <rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor"></rect>
        {:else if button.glyph === "restore"}
          <rect x="0.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor"></rect>
          <path
            d="M2.5 2.5 V1.5 a1 1 0 0 1 1 -1 H8.5 a1 1 0 0 1 1 1 V6.5 a1 1 0 0 1 -1 1 H7.5"
            stroke="currentColor"
          ></path>
        {:else}
          <path d="M0.5 0.5 L9.5 9.5 M9.5 0.5 L0.5 9.5" stroke="currentColor"></path>
        {/if}
      </svg>
    </button>
  {/each}
</div>

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .control {
    width: var(--control-height);
    height: var(--control-height);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-field);
    color: var(--ink);
  }
  .control:hover {
    background: var(--hover);
  }
  .control:active {
    background: var(--row-hover);
  }
  .control.close:hover {
    background: var(--window-close);
  }
  .control.close:active {
    background: var(--window-close-press);
  }
</style>
