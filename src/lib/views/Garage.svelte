<script lang="ts">
  import Clock from "$lib/components/Clock.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import { session } from "$lib/state/session.svelte";

  // Garage home: the floor holds the clock; the side panel holds messages.
  let messages = $derived.by(() => {
    const list: { from: string; text: string; time: string }[] = [];
    if (session.status) {
      list.push({
        from: "Launcher",
        text: `${session.status.state}: ${session.status.message}`,
        time: session.status.utc.slice(11, 16),
      });
    }
    list.push({
      from: "Afterhours",
      text: "Development build. The Rust launcher's live run on the real game is still pending; servers and mods are previews.",
      time: "",
    });
    return list;
  });
</script>

<main>
  <div class="floor">
    <Clock />
  </div>
  <Glass radius="phone" label="Messages" class="side">
    <div class="head">
      <h2 class="t-panel-title">Messages</h2>
      {#if messages.length > 0}<span class="count">{messages.length}</span>{/if}
    </div>
    {#each messages as m, i (i)}
      <div class="message row-hover">
        <span class="avatar">{m.from.slice(0, 2).toUpperCase()}</span>
        <span class="body">
          <span class="from"
            ><strong>{m.from}</strong> <span class="t-data-small time">{m.time}</span></span
          >
          <span class="text">{m.text}</span>
        </span>
      </div>
    {/each}
  </Glass>
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-6);
    min-height: 0;
  }
  .floor {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  main :global(.side) {
    flex: 0 0 340px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px 14px;
    align-self: flex-start;
    max-height: 100%;
    overflow: auto;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0 4px 6px;
  }
  h2 {
    margin: 0;
  }
  .count {
    min-width: 22px;
    padding: 0 7px;
    border-radius: var(--radius-pill);
    background: var(--play);
    color: var(--on-ink);
    font-weight: 800;
    font-size: 12px;
    text-align: center;
  }
  .message {
    display: flex;
    gap: 10px;
    padding: 8px 6px;
    border-radius: var(--radius-row);
  }
  .avatar {
    flex: 0 0 auto;
    width: var(--avatar-md);
    height: var(--avatar-md);
    border-radius: var(--radius-thumb);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--field);
    font-weight: 800;
    font-size: 12px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .time {
    color: var(--ink-muted);
  }
  .text {
    color: var(--ink-soft);
    font-size: 14px;
    line-height: 1.35;
  }
</style>
