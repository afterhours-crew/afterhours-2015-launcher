<script lang="ts">
  import { windowControl } from "$lib/api/tauri";
</script>

<button
  type="button"
  class="control"
  aria-label="Minimize"
  onclick={() => windowControl("minimize")}
>
  <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"
    ><path d="M2 10 H12" stroke="currentColor" stroke-width="1.6"></path></svg
  >
</button>
<button type="button" class="control" aria-label="Close" onclick={() => windowControl("close")}>
  <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true"
    ><path d="M2.5 2.5 L11.5 11.5 M11.5 2.5 L2.5 11.5" stroke="currentColor" stroke-width="1.6"
    ></path></svg
  >
</button>

<style>
  .control {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }
  .control:hover {
    background: var(--hover);
  }
</style>
