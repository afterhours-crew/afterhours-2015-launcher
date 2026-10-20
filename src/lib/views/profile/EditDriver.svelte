<script lang="ts">
  import { staggerIn } from "$lib/motion";
  import type { Profile } from "$lib/api/types";
  import Avatar from "$lib/components/Avatar.svelte";
  import Field from "$lib/components/Field.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import IconArrowLeft from "@tabler/icons-svelte/icons/arrow-left";
  import Note from "$lib/components/Note.svelte";
  import Upcoming from "$lib/components/Upcoming.svelte";
  import { driverName } from "$lib/state/profile";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";

  // Edit driver (H4), one column. The picture is the launcher's own
  // setting and saves at once. Name, bank and REP live in the save;
  // changing them needs the server's account edit command (track 4), so
  // they show read-only under the Upcoming pill.
  let { profile }: { profile: Profile | null; ready: boolean } = $props();

  const COLORS = [
    { id: "style", label: "Pink" },
    { id: "speed", label: "Blue" },
    { id: "build", label: "Yellow" },
    { id: "crew", label: "Green" },
    { id: "outlaw", label: "Purple" },
    { id: "peach", label: "Peach" },
  ];

  let name = $derived(driverName(profile) ?? session.settings.player_name ?? "Driver");
  let avatar = $derived(session.settings.avatar ?? "style");
  let saveError = $state<string | null>(null);

  async function pickColor(id: string) {
    saveError = null;
    try {
      await session.save({ avatar: id });
    } catch (e) {
      saveError = String(e instanceof Error ? e.message : e);
    }
  }
</script>

<div class="column" use:staggerIn>
  <span class="title" data-enter>
    <button type="button" class="back" onclick={() => router.go("profile", "overview")}
      ><IconArrowLeft size={16} stroke={1.8} aria-hidden="true" />Profile</button
    >
    <h1 class="t-view-title">Edit driver</h1>
  </span>

  <Glass radius="panel" label="Picture" class="panel">
    <h2 class="t-panel-title">Picture</h2>
    <div class="picture">
      <Avatar {name} color={avatar} size={72} />
      <div role="radiogroup" aria-label="Picture colour" class="swatches">
        {#each COLORS as color (color.id)}
          <button
            type="button"
            role="radio"
            aria-checked={avatar === color.id}
            aria-label={color.label}
            class="swatch"
            style="background: var(--{color.id})"
            onclick={() => pickColor(color.id)}
          ></button>
        {/each}
      </div>
    </div>
    {#if saveError}<Note kind="warn">{saveError}</Note>{/if}
  </Glass>

  <Glass radius="panel" label="Name, bank and REP" class="panel">
    <span class="head">
      <h2 class="t-panel-title">Name, bank and REP</h2>
      <Upcoming />
    </span>
    <Field id="driver-name" label="Driver name" value={name} readonly maxlength={16} />
    <div class="pair">
      <Field id="driver-bank" label="Bank" value={profile?.bank?.formatted ?? "—"} readonly />
      <Field
        id="driver-rep"
        label="REP level"
        value={profile?.reputation?.level != null ? String(profile.reputation.level) : "—"}
        readonly
      />
    </div>
  </Glass>
</div>

<style>
  .column {
    width: 100%;
    max-width: 680px;
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding-top: 12px;
  }
  .column :global(.panel) {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .title {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
  h1,
  h2 {
    margin: 0;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 18px;
  }
  .back {
    min-height: 38px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 4px;
    margin-left: -4px;
    border-radius: var(--radius-pill);
    font-size: 14px;
    color: var(--ink-soft);
  }
  .back:hover {
    color: var(--ink);
    background: var(--hover);
  }
  .picture {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 24px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .swatch {
    width: 38px;
    height: 38px;
    border-radius: 50%;
  }
  .swatch[aria-checked="true"] {
    box-shadow:
      0 0 0 3px var(--graphite),
      0 0 0 5px var(--ink);
  }
</style>
