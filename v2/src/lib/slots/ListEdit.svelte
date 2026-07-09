<script lang="ts">
  import type { ListProps, ListStyle } from './list';

  let { props, onUpdate } = $props<{
    props: ListProps;
    onUpdate: (props: ListProps) => void;
  }>();

  function setStyle(e: Event) {
    const target = e.target as HTMLSelectElement;
    onUpdate({ ...props, style: target.value as ListStyle });
  }

  function setItem(index: number, e: Event) {
    const target = e.target as HTMLInputElement;
    const items = props.items.slice();
    items[index] = target.value;
    onUpdate({ ...props, items });
  }

  function addItem() {
    onUpdate({ ...props, items: [...props.items, ''] });
  }

  function removeItem(index: number) {
    const items = props.items.filter((_: string, i: number) => i !== index);
    onUpdate({ ...props, items: items.length > 0 ? items : [''] });
  }
</script>

<div class="list-edit">
  <label class="style-row">
    <span>Style</span>
    <select value={props.style} onchange={setStyle}>
      <option value="bullets">Bullets</option>
      <option value="numbered">Numbered</option>
      <option value="check">Checklist</option>
    </select>
  </label>

  <ul class="items">
    {#each props.items as item, i}
      <li>
        <input
          type="text"
          value={item}
          placeholder="Item {i + 1}"
          oninput={(e) => setItem(i, e)}
        />
        <button type="button" onclick={() => removeItem(i)} aria-label="Remove item">×</button>
      </li>
    {/each}
  </ul>

  <button type="button" class="add-btn" onclick={addItem}>+ Add item</button>
</div>

<style>
  .list-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .style-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .style-row span {
    width: 60px;
    flex-shrink: 0;
    opacity: 0.7;
  }
  .style-row select {
    padding: 4px 6px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-size: 13px;
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .items li {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .items input {
    flex: 1;
    padding: 5px 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-size: 13px;
    font-family: inherit;
  }
  .items button {
    background: none;
    border: none;
    color: var(--ink);
    opacity: 0.5;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    padding: 2px 4px;
  }
  .items button:hover {
    opacity: 1;
  }
  .add-btn {
    align-self: flex-start;
    background: none;
    border: 1px dashed var(--line);
    border-radius: 4px;
    color: var(--ink);
    cursor: pointer;
    font-size: 12px;
    padding: 4px 10px;
    opacity: 0.7;
  }
  .add-btn:hover {
    opacity: 1;
  }
</style>
