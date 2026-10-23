<script lang="ts">
  import IconBrandPatreon from "@tabler/icons-svelte/icons/brand-patreon";
  import IconExternalLink from "@tabler/icons-svelte/icons/external-link";
  import { openUrl } from "$lib/api/tauri";
  import Glass from "$lib/components/Glass.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { supportHost, supportLinks } from "$lib/state/support";

  // Support the project (canvas J1): the permanent home of the Patreon
  // link. One line of context, then a row per link with Open, which goes
  // to the system browser. Rows without a page name stay out.
  let links = $derived(supportLinks());
  let note = $state<string | null>(null);

  async function open(url: string) {
    note = null;
    try {
      await openUrl(url);
    } catch (e) {
      note = String(e instanceof Error ? e.message : e);
    }
  }
</script>

{#if links.length > 0}
  <Glass radius="panel" label="Support the project" class="panel rows-panel">
    <div class="list-row intro">
      <span class="grow text">
        <span class="name">Support the project</span>
        <span class="t-caption"
          >Afterhours is free and stays free. If it keeps your garage open, you can chip in.</span
        >
      </span>
    </div>
    {#each links as link (link.key)}
      <div class="list-row tall">
        <span class="tile" aria-hidden="true"><IconBrandPatreon size={20} stroke={1.6} /></span>
        <span class="grow text">
          <span class="name">{link.label}</span>
          <span class="t-caption">{link.about} · {supportHost(link.url)}</span>
        </span>
        <PillButton onclick={() => open(link.url)}>
          Open <IconExternalLink size={14} stroke={1.8} aria-hidden="true" />
        </PillButton>
      </div>
    {/each}
    {#if note}<div class="note"><Note kind="warn">{note}</Note></div>{/if}
  </Glass>
{/if}

<style>
  .intro {
    min-height: 56px;
  }
  .tall {
    min-height: 72px;
  }
  .text {
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 600;
  }
  .tile {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-field);
    background: var(--graphite-raised);
    color: var(--ink);
  }
  .note {
    padding: 4px 0 16px;
  }
</style>
