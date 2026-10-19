<script lang="ts">
  import { untrack } from "svelte";
  import ComingLater from "$lib/components/ComingLater.svelte";
  import Note from "$lib/components/Note.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { featureReady } from "$lib/state/capabilities";
  import { current, records } from "$lib/state/records.svelte";
  import { router } from "$lib/state/router.svelte";
  import { SECTION_LABELS, type ProfileSection } from "$lib/state/routes";
  import { session } from "$lib/state/session.svelte";
  import Cars from "./profile/Cars.svelte";
  import EditDriver from "./profile/EditDriver.svelte";
  import Overview from "./profile/Overview.svelte";
  import SaveData from "./profile/SaveData.svelte";

  // Profile from the save (D1) with two sub-views, Cars (D3) and Save data
  // (D2); Edit driver (A2) opens from here. All read the server's
  // `profile --json`, so without the `profile` capability they say
  // "Coming later". Edit driver's launcher-only picture works regardless.
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
  {#if section !== "edit-driver"}
    <nav aria-label="Profile" class="tabs ah-glass">
      {#each tabs as id (id)}
        <button
          type="button"
          class="pill t-nav"
          aria-current={section === id ? "page" : undefined}
          onclick={() => router.go("profile", id)}>{SECTION_LABELS[id]}</button
        >
      {/each}
    </nav>
  {/if}

  {#if section === "edit-driver"}
    <EditDriver {profile} {ready} />
  {:else if !ready}
    <div class="center">
      {#if section === "cars"}
        <ComingLater title="Cars" track="Needs the server's profile command (contract v1)">
          <p>
            Every car you own, in the garage and in the warehouse, with its parts and sale value.
          </p>
          <p>Your server does not report its profile yet. It arrives with a server update.</p>
        </ComingLater>
      {:else if section === "save-data"}
        <ComingLater title="Save data" track="Needs the server's profile command (contract v1)">
          <p>What your save holds, table by table, read without changing it.</p>
          <p>Your server does not report its profile yet. It arrives with a server update.</p>
        </ComingLater>
      {:else}
        <ComingLater title="Profile" track="Needs the server's profile command (contract v1)">
          <p>Your driver as your save records it: REP, bank, cars and stats.</p>
          <p>Your server does not report its profile yet. It arrives with a server update.</p>
          <div class="actions">
            <PillButton onclick={() => router.go("profile", "edit-driver")}>Edit driver</PillButton>
          </div>
        </ComingLater>
      {/if}
    </div>
  {:else if section === "save-data"}
    <SaveData />
  {:else if !profile}
    <div class="center">
      {#if load.kind === "error"}
        <Note kind="warn">Could not read your save: {load.message}</Note>
        <PillButton onclick={() => records.loadProfile()}>Try again</PillButton>
      {:else}
        <p class="status">Reading your save…</p>
      {/if}
    </div>
  {:else}
    {#if load.kind === "error"}
      <div class="note"><Note kind="warn">Showing the last read. {load.message}</Note></div>
    {/if}
    {#if profile.warnings.length > 0}
      <div class="note">
        <Note>{profile.warnings.join(" ")}</Note>
      </div>
    {/if}
    {#if section === "cars"}
      <Cars {profile} />
    {:else}
      <Overview {profile} />
    {/if}
  {/if}
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6);
    min-height: 0;
    overflow: auto;
  }
  .tabs {
    align-self: center;
    display: flex;
    gap: var(--space-1);
    padding: 5px;
    border-radius: var(--radius-pill);
  }
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  .status {
    margin: 24px 0;
    color: var(--ink-soft);
  }
  .note {
    max-width: 720px;
    align-self: center;
  }
</style>
