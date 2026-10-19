<script lang="ts">
  import type { OutputLine } from "$lib/api/types";
  // The log is read, not navigated, so it is not glass.
  let {
    lines,
    empty,
    title = "Log",
    onOpenFolder,
  }: { lines: OutputLine[]; empty: string; title?: string; onOpenFolder?: () => void } = $props();
  let element: HTMLDivElement | undefined = $state();
  $effect(() => {
    void lines.length;
    if (element) element.scrollTop = element.scrollHeight;
  });
  const colors: Record<string, string> = {
    preparing: "var(--speed)",
    starting: "var(--speed)",
    activation: "var(--build)",
    ready: "var(--crew)",
    stopping: "var(--build)",
    finished: "var(--crew)",
    failed: "var(--build)",
  };
</script>

<section class="log" aria-label={title}>
  <div class="head">
    <h2 class="t-label">{title}</h2>
    {#if onOpenFolder}<button type="button" class="t-data-small link" onclick={onOpenFolder}
        >Open folder</button
      >{/if}
  </div>
  <div class="lines" bind:this={element}>
    {#if lines.length === 0}
      <span class="empty">{empty}</span>
    {/if}
    {#each lines as line, i (i)}
      {#if line.kind === "status"}
        <div>
          <span style="color: {colors[line.state] ?? 'var(--ink-muted)'}">{line.time}</span>
          {line.state} · {line.message}
        </div>
      {:else}
        <div class="text">{line.text}</div>
      {/if}
    {/each}
  </div>
</section>

<style>
  .log {
    flex: 1 1 auto;
    min-height: 160px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    border-radius: var(--radius-panel);
    background: var(--log);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  h2 {
    margin: 0;
    color: var(--ink-muted);
  }
  .link {
    color: var(--ink-muted);
    text-decoration: underline;
  }
  .lines {
    flex: 1 1 auto;
    overflow: auto;
    font-family: var(--font-mono);
    font-size: 11.5px;
    line-height: 1.8;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--ink-muted);
    user-select: text;
    -webkit-user-select: text;
  }
  .text {
    color: var(--ink-faint);
  }
  .empty {
    color: var(--ink-faint);
  }
</style>
