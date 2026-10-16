<script lang="ts">
  import Glass from "$lib/components/Glass.svelte";
  // Servers and Mods exist in the design but not yet in the server. Shown
  // as honest previews rather than empty controls.
  let { title, text, issue }: { title: string; text: string; issue: string } = $props();
</script>

<main>
  <Glass dense label={title} class="panel">
    <div class="head">
      <h1 class="t-view-title">{title}</h1>
      <span class="badge">Preview</span>
    </div>
    <p>{text}</p>
    <p class="t-data where">Tracked in afterhours-2015 {issue}.</p>
  </Glass>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    padding: var(--space-5) var(--space-6);
    min-height: 0;
  }
  main :global(.panel) {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  h1 {
    margin: 0;
  }
  .badge {
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    background: var(--mods-soft);
    color: var(--mods-ink);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  p {
    margin: 0;
    color: var(--ink-soft);
    max-width: 60ch;
  }
  .where {
    color: var(--ink-muted);
  }
</style>
