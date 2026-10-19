<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import Glass from "$lib/components/Glass.svelte";
  import Stage from "$lib/components/Stage.svelte";
  import { router } from "$lib/state/router.svelte";
  import { SECTION_LABELS, SECTIONS } from "$lib/state/routes";
  import About from "./settings/About.svelte";
  import General from "./settings/General.svelte";
  import Updates from "./settings/Updates.svelte";

  let section = $derived(router.route.section ?? "general");
</script>

<main use:staggerIn>
  <Glass dense radius="card" label="Settings sections" class="sections">
    <nav aria-label="Settings">
      {#each SECTIONS.settings as id (id)}
        <button
          type="button"
          class="section row-hover"
          aria-current={section === id ? "page" : undefined}
          onclick={() => router.go("settings", id)}>{SECTION_LABELS[id]}</button
        >
      {/each}
    </nav>
  </Glass>
  <div class="content">
    <Stage key={section ?? "general"} flow>
      {#if section === "updates"}
        <Updates />
      {:else if section === "about"}
        <About />
      {:else}
        <General />
      {/if}
    </Stage>
  </div>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
    min-height: 0;
    overflow: auto;
  }
  main :global(.sections) {
    flex: 0 0 200px;
    padding: 8px;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .section {
    min-height: var(--control-height);
    padding: 0 14px;
    border-radius: var(--radius-row);
    text-align: left;
    font-weight: 700;
    color: var(--ink-soft);
  }
  .section[aria-current="page"] {
    background: var(--selected);
    box-shadow: inset 0 0 0 1px var(--selected-edge);
    color: var(--ink);
  }
  .content {
    flex: 1 1 520px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .content :global(.scene) {
    gap: var(--space-4);
  }
  .content :global(.panel) {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
  }
  .content :global(.panel h2) {
    margin: 0;
  }
  .content :global(.actions) {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }
  .content :global(.rows) {
    display: flex;
    flex-direction: column;
  }
  .content :global(.row) {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 16px;
    padding: 9px 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .content :global(.row .t-label) {
    color: var(--ink-soft);
  }
  .content :global(.row .value) {
    color: var(--ink-soft);
    text-align: right;
    overflow-wrap: anywhere;
    min-width: 0;
  }
</style>
