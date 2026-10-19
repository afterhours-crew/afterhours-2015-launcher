<script lang="ts">
  import ComingLater from "$lib/components/ComingLater.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import { hasCapability } from "$lib/state/capabilities";
  import { router } from "$lib/state/router.svelte";
  import { SECTION_LABELS, type ProfileSection } from "$lib/state/routes";
  import { session } from "$lib/state/session.svelte";

  // Profile from the save (D1) with two sub-views, Cars (D3) and Save data
  // (D2); Edit driver (A2) opens from here. All read the server's profile
  // command, so they say "Coming later" until the server reports it.
  const tabs: ProfileSection[] = ["overview", "cars", "save-data"];
  let section = $derived((router.route.section ?? "overview") as ProfileSection);
  let ready = $derived(hasCapability(session.info?.server, "profile"));
  let waits = $derived(
    ready
      ? "Your server reports its profile; this screen is built next."
      : "Your server does not report its profile yet. It arrives with a server update.",
  );
</script>

<main>
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

  {#if section === "cars"}
    <ComingLater title="Cars" track="Track 2 · screens, from the Cars design (D3)">
      <p>Every car you own, in the garage and in the warehouse, with its slot and setup.</p>
      <p>{waits}</p>
    </ComingLater>
  {:else if section === "save-data"}
    <ComingLater title="Save data" track="Track 2 · screens, from the Save data design (D2)">
      <p>
        What your account database holds, table by table, read without changing it. Values are the
        raw stored numbers until their units are confirmed.
      </p>
      <p>{waits}</p>
    </ComingLater>
  {:else if section === "edit-driver"}
    <ComingLater
      title="Edit driver"
      track="Track 4 · account edits, from the Edit driver design (A2)"
    >
      <p>Change your driver's name, bank and REP. Changes apply the next time you launch.</p>
      <p>Needs the server's account edit command, which does not exist yet.</p>
      <div class="actions">
        <PillButton onclick={() => router.go("profile", "overview")}>Back to profile</PillButton>
      </div>
    </ComingLater>
  {:else}
    <ComingLater title="Profile" track="Track 1a · profile --json, then track 2 · screens">
      <p>Your driver as your save records it: REP, bank, garage slots and stats.</p>
      <p>{waits}</p>
      <div class="actions">
        <PillButton onclick={() => router.go("profile", "edit-driver")}>Edit driver</PillButton>
      </div>
    </ComingLater>
  {/if}
</main>

<style>
  main {
    position: relative;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6);
    min-height: 0;
    overflow: auto;
  }
  .tabs {
    display: flex;
    gap: var(--space-1);
    padding: 5px;
    border-radius: var(--radius-pill);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
