<script lang="ts">
  import garage from "$lib/../assets/backdrops/garage-home.jpg";
  // The garage is home. Secondary views add a flat dim so dense glass reads.
  let { dim = false, radial = false }: { dim?: boolean; radial?: boolean } = $props();
</script>

<div class="art" style="background-image: url({garage})" aria-hidden="true">
  <div class="shade" class:dim class:radial></div>
</div>

<style>
  .art {
    position: absolute;
    inset: 0;
    background-color: var(--floor);
    background-size: cover;
    background-position: 46% 58%;
  }
  .shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(0deg, var(--shade) 0%, rgba(14, 12, 17, 0) 40%);
  }
  .shade.dim {
    background:
      linear-gradient(0deg, var(--shade) 0%, rgba(14, 12, 17, 0) 30%),
      linear-gradient(var(--shade-dim), var(--shade-dim));
  }
  .shade.radial {
    background: radial-gradient(
      ellipse 60% 70% at 50% 50%,
      rgba(14, 12, 17, 0.15) 0%,
      rgba(14, 12, 17, 0.65) 100%
    );
  }
</style>
