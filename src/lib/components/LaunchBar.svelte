<script lang="ts">
  import type { LaunchBarModel, PlayAction } from "$lib/state/launchbar";
  import PlayButton from "./PlayButton.svelte";
  import StatusDot from "./StatusDot.svelte";
  // On the Garage home, never in a panel: the server and Play sit on the floor.
  // It never shows a car.
  let { model, onPlay }: { model: LaunchBarModel; onPlay: (action: PlayAction) => void } = $props();
</script>

<footer class="ah-on-art">
  <div class="left">
    <span class="eyebrow">{model.eyebrow}</span>
    <span class="t-car-name">{model.title}</span>
    <span class="summary">{model.summary}</span>
  </div>
  <div class="right">
    <div class="state">
      <StatusDot kind={model.dot} label={model.stateLine} />
    </div>
    <PlayButton
      label={model.play.label}
      disabled={model.play.disabled}
      busy={model.play.busy}
      title={model.play.hint}
      onclick={() => model.play.action && onPlay(model.play.action)}
    />
  </div>
</footer>

<style>
  footer {
    /* Within the Garage's centred width, so its two ends stay near the middle. */
    box-sizing: border-box;
    width: 100%;
    max-width: calc(var(--page-wide) + 2 * var(--space-6));
    margin-inline: auto;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px 28px;
    padding: 0 var(--space-6) var(--launchbar-bottom);
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .eyebrow {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .summary {
    font-size: 14px;
    color: var(--ink-soft);
  }
  .right {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .state {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    text-align: right;
    max-width: 420px;
  }
</style>
