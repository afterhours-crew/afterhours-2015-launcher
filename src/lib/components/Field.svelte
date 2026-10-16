<script lang="ts">
  import type { Snippet } from "svelte";
  let {
    id,
    label,
    value = $bindable(""),
    placeholder = "",
    mono = false,
    readonly = false,
    hint,
    trailing,
  }: {
    id: string;
    label: string;
    value?: string;
    placeholder?: string;
    mono?: boolean;
    readonly?: boolean;
    hint?: string;
    trailing?: Snippet;
  } = $props();
</script>

<div class="field">
  <label for={id} class="t-label">{label}</label>
  <div class="row">
    <input {id} bind:value {placeholder} {readonly} class:mono spellcheck="false" />
    {#if trailing}{@render trailing()}{/if}
  </div>
  {#if hint}<span class="hint">{hint}</span>{/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  label {
    color: var(--ink-muted);
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  input {
    flex: 1 1 auto;
    min-width: 0;
    height: var(--field-height);
    padding: 0 14px;
    border: 1px solid var(--glass-edge);
    border-radius: var(--radius-field);
    background: var(--field);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: 15px;
  }
  input.mono {
    font-family: var(--font-mono);
    font-size: 13px;
  }
  input:read-only {
    color: var(--ink-soft);
  }
  .hint {
    font-size: 13px;
    color: var(--ink-soft);
  }
</style>
