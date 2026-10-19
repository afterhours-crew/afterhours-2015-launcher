<script lang="ts">
  import { untrack } from "svelte";
  import Stage from "$lib/components/Stage.svelte";
  import { slidingIndicator, staggerIn } from "$lib/motion";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import ViewNote from "$lib/components/ViewNote.svelte";
  import { featureReady } from "$lib/state/capabilities";
  import { current, records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";
  import { SECTION_LABELS, type ProfileSection } from "$lib/state/routes";
  import { session } from "$lib/state/session.svelte";
  import Cars from "./profile/Cars.svelte";
  import EditDriver from "./profile/EditDriver.svelte";
  import Overview from "./profile/Overview.svelte";
  import SaveData from "./profile/SaveData.svelte";

  // Profile from the save (G1b) with Cars (H2) and Save data (H3) as tabs;
  // Edit driver (H4) opens from here. All read the server's
  // `profile --json`, so without the `profile` capability the view gives
  // one note instead. Edit driver's launcher-only picture works regardless.
  const tabs: ProfileSection[] = ["overview", "cars", "save-data"];
  let section = $derived((router.route.section ?? "overview") as ProfileSection);
  let ready = $derived(featureReady(session.info?.server, "profile"));
  let load = $derived(records.profile);
  let profile = $derived(current(load));

  $effect(() => {
    if (ready) untrack(() => void records.loadProfile());
  });
</script>

<main>
  {#if section !== "edit-driver" && ready}
    <nav
      aria-label="Profile"
      class="tabs ah-glass flat slider"
      use:slidingIndicator={{ selector: '[aria-current="page"]' }}
    >
      {#each tabs as id (id)}
        <button
          type="button"
          class="tab"
          aria-current={section === id ? "page" : undefined}
          onclick={() => router.go("profile", id)}>{SECTION_LABELS[id]}</button
        >
      {/each}
    </nav>
  {/if}

  <!-- The sub-views crossfade; their panels fade in one by one. -->
  <Stage key={section} flow>
    {#if section === "edit-driver"}
      <EditDriver {profile} {ready} />
    {:else if !ready}
      <div class="column" use:staggerIn>
        <h1 class="t-view-title" data-enter>Profile</h1>
        <div data-enter>
          <ViewNote>Your driver, cars and save data, read from your save.</ViewNote>
        </div>
        <div class="now" data-enter>
          <span class="t-caption">You can already pick your picture.</span>
          <PillButton onclick={() => router.go("profile", "edit-driver")}>Edit driver</PillButton>
        </div>
      </div>
    {:else if section === "save-data"}
      <SaveData />
    {:else if !profile}
      <div class="column" use:staggerIn>
        {#if load.kind === "error"}
          <Note kind="warn">Could not read your save: {load.message}</Note>
          <div><PillButton onclick={() => records.loadProfile()}>Try again</PillButton></div>
        {:else}
          <p class="t-caption">Reading your save…</p>
        {/if}
      </div>
    {:else}
      {#if load.kind === "error"}
        <div class="note"><Note kind="warn">Showing the last read. {load.message}</Note></div>
      {/if}
      {#if profile.warnings.length > 0}
        <div class="note"><Note>{profile.warnings.join(" ")}</Note></div>
      {/if}
      {#if section === "cars"}
        <Cars {profile} />
      {:else}
        <Overview {profile} />
      {/if}
    {/if}
  </Stage>
</main>

<style>
  /* What works already, beside the coming note. */
  .now {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-6) var(--space-6);
    min-height: 0;
    overflow: auto;
  }
  .tabs {
    align-self: center;
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
  }
  .tab {
    height: 38px;
    padding: 0 16px;
    border-radius: var(--radius-pill);
    color: var(--ink-soft);
    font-size: 14px;
    font-weight: 600;
  }
  .tab:hover:not([aria-current="page"]) {
    background: var(--hover);
    color: var(--ink);
  }
  .tab[aria-current="page"] {
    color: var(--on-ink);
  }
  .column {
    width: 100%;
    max-width: 680px;
    align-self: center;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-top: 12px;
  }
  .column h1 {
    margin: 0;
  }
  .note {
    max-width: 820px;
  }
</style>
