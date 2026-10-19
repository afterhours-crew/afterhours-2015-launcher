<script lang="ts">
  import type { Profile } from "$lib/api/types";
  import Applies from "$lib/components/Applies.svelte";
  import Avatar from "$lib/components/Avatar.svelte";
  import Field from "$lib/components/Field.svelte";
  import Glass from "$lib/components/Glass.svelte";
  import Note from "$lib/components/Note.svelte";
  import IconCash from "@tabler/icons-svelte/icons/cash";
  import IconIdBadge2 from "@tabler/icons-svelte/icons/id-badge-2";
  import IconPhoto from "@tabler/icons-svelte/icons/photo";
  import IconTrophy from "@tabler/icons-svelte/icons/trophy";
  import PanelHeading from "$lib/components/PanelHeading.svelte";
  import PillButton from "$lib/components/PillButton.svelte";
  import Soon from "$lib/components/Soon.svelte";
  import { formatMoney } from "$lib/state/format";
  import { driverName } from "$lib/state/profile";
  import { router } from "$lib/state/router.svelte";
  import { session } from "$lib/state/session.svelte";

  // Edit driver (A2). The picture is the launcher's own setting and saves
  // at once. Name, bank and REP live in the save; changing them needs the
  // server's account edit command (track 4), so they show the save's
  // current values, read-only, until then.
  let { profile, ready }: { profile: Profile | null; ready: boolean } = $props();

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
  let level = $derived(profile?.reputation?.level ?? null);
  let maxLevel = $derived(profile?.reputation?.maximum_level ?? null);
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

<div class="layout">
  <Glass dense radius="panel" label="Driver" class="panel">
    <div class="head">
      <h1 class="t-view-title">Driver</h1>
      <PillButton variant="text" onclick={() => router.go("profile", "overview")}
        >Back to profile</PillButton
      >
    </div>

    <div class="grid">
      <div class="column">
        <PanelHeading icon={IconPhoto}>
          Picture
          {#snippet aside()}<Applies when="launcher" />{/snippet}
        </PanelHeading>
        <div class="picture">
          <Avatar {name} color={avatar} size={84} />
          <div role="radiogroup" aria-label="Avatar colour" class="swatches">
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
        <div class="line"><Soon /><span class="caption">Choose an image</span></div>
        <span class="caption"
          >Your picture shows in this launcher. It is not part of your save.</span
        >
      </div>

      <div class="column">
        <div class="setting">
          <PanelHeading icon={IconIdBadge2}>
            Name
            {#snippet aside()}<Soon />{/snippet}
          </PanelHeading>
          <Field id="driver-name" label="Driver name" value={name} readonly maxlength={16} />
          <span class="caption">
            Renaming a driver needs a server update. The name you chose at first run names a new
            driver only.
          </span>
        </div>

        <div class="setting rule">
          <PanelHeading icon={IconCash}>
            Bank
            {#snippet aside()}<Soon />{/snippet}
          </PanelHeading>
          {#if ready && profile?.bank}
            <Field
              id="driver-bank"
              label="Balance"
              value={formatMoney(profile.bank.balance)}
              readonly
              mono
            />
          {/if}
          <span class="caption">Setting your bank needs the server's account edit command.</span>
        </div>

        <div class="setting rule">
          <PanelHeading icon={IconTrophy}>
            REP level
            {#snippet aside()}<Soon />{/snippet}
          </PanelHeading>
          {#if ready && level !== null}
            <div class="range">
              <label for="rep-level" class="visually-hidden">REP level</label>
              <input
                id="rep-level"
                type="range"
                min="1"
                max={maxLevel ?? level}
                value={level}
                disabled
              />
              <span class="t-countdown"
                >{level}{#if maxLevel}<span class="of"> / {maxLevel}</span>{/if}</span
              >
            </div>
          {/if}
          <span class="caption"
            >Parts and events unlock by REP level. Setting it needs a server update.</span
          >
        </div>
      </div>
    </div>
  </Glass>

  <aside>
    <Glass radius="phone" label="Seen by others" class="side">
      <h2 class="t-panel-title">Seen by others</h2>
      <span class="caption">When hosting arrives, drivers who join you see this.</span>
      <div class="pill-preview ah-glass">
        <Avatar {name} color={avatar} ring="host" />
        <span class="who">
          <span class="name">{name}</span>
          <span class="t-data-small soft">{level !== null ? `REP ${level} · Host` : "Host"}</span>
        </span>
      </div>

      <div class="section">
        <h2 class="t-panel-title">Account</h2>
        {#if ready && profile}
          <dl class="facts">
            <dt class="t-label muted">ID</dt>
            <dd class="t-data">{profile.account_id}</dd>
            <dt class="t-label muted">Save</dt>
            <dd class="t-data">{profile.save.path}</dd>
          </dl>
        {:else}
          <span class="caption">Your server does not report its profile yet.</span>
        {/if}
        <div class="line"><Soon /><span class="caption">Back up driver, new driver</span></div>
      </div>
    </Glass>
  </aside>
</div>

<style>
  .layout {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    align-items: flex-start;
  }
  .layout :global(.panel) {
    flex: 999 1 560px;
    min-width: 0;
    padding: 22px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
  }
  h1,
  h2 {
    margin: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 28px;
  }
  .column {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .picture {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .swatch {
    width: 38px;
    height: 38px;
    border-radius: 50%;
  }
  .swatch[aria-checked="true"] {
    box-shadow:
      0 0 0 3px rgba(24, 21, 29, 0.9),
      0 0 0 5px var(--ink);
  }
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .caption {
    font-size: 13px;
    line-height: 18px;
    color: var(--ink-soft);
  }
  .setting {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rule {
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .range {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .range input {
    flex: 1 1 auto;
    accent-color: var(--ink);
    opacity: 0.6;
  }
  .of {
    font-size: 13px;
    color: var(--ink-soft);
  }
  aside {
    flex: 1 1 320px;
    max-width: 380px;
  }
  aside :global(.side) {
    padding: 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .pill-preview {
    align-self: flex-start;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 16px 4px 4px;
    border-radius: var(--radius-pill);
  }
  .who {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .name {
    font-weight: 700;
  }
  .soft {
    color: var(--ink-soft);
  }
  .muted {
    color: var(--ink-muted);
  }
  .section {
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .facts {
    margin: 0;
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    gap: 6px 12px;
    align-items: baseline;
  }
  .facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
