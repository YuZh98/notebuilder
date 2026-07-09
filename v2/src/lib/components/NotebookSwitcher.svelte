<script lang="ts">
  let {
    list,
    currentId,
    currentName,
    canSwitch,
    onswitch,
    oncreate,
    onrename,
    ondelete,
  }: {
    list: { id: string; name: string }[];
    currentId: string;
    currentName: string;
    canSwitch: boolean;
    onswitch: (id: string) => void;
    oncreate: () => void;
    onrename: (name: string) => void;
    ondelete: () => void;
  } = $props();

  let renaming = $state(false);
  let draft = $state('');

  function startRename() {
    draft = currentName;
    renaming = true;
  }

  function commitRename() {
    renaming = false;
    const name = draft.trim();
    if (name && name !== currentName) onrename(name);
  }
</script>

<div class="switcher">
  {#if renaming}
    <input
      class="rename-input"
      bind:value={draft}
      onkeydown={(e) => {
        if (e.key === 'Enter') commitRename();
        if (e.key === 'Escape') renaming = false;
      }}
      onblur={commitRename}
    />
  {:else if canSwitch && list.length > 1}
    <select value={currentId} onchange={(e) => onswitch(e.currentTarget.value)}>
      {#each list as nb (nb.id)}
        <option value={nb.id}>{nb.name}</option>
      {/each}
    </select>
  {:else}
    <h1>{currentName}</h1>
  {/if}
  <button title="Rename notebook" onclick={startRename}>✎</button>
  {#if canSwitch}
    <button title="New notebook" onclick={oncreate}>＋</button>
    <button title="Delete notebook" onclick={ondelete}>🗑</button>
  {/if}
</div>

<style>
  .switcher {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  h1 {
    font-size: 20px;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  select,
  .rename-input {
    font-size: 16px;
    font-weight: 600;
    background: var(--panel);
    color: inherit;
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 4px 8px;
    max-width: 320px;
  }
  button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 14px;
    opacity: 0.6;
    padding: 2px 4px;
  }
  button:hover {
    opacity: 1;
  }
</style>
