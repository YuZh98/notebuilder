<script lang="ts">
  let { props = $bindable(), onUpdate } = $props<{
    props: { text: string };
    onUpdate?: (props: { text: string }) => void;
  }>();

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    props.text = target.value;
    onUpdate?.(props);
  }
</script>

<div class="text-edit">
  <textarea
    value={props.text}
    oninput={handleInput}
    placeholder="Enter markdown text..."
    rows="4"
  ></textarea>
</div>

<style>
  .text-edit textarea {
    width: 100%;
    min-height: 80px;
    padding: 8px;
    border: 1px solid var(--border, #2a2a4a);
    border-radius: 4px;
    background: var(--surface, #16213e);
    color: var(--text, #e0e0e0);
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
  }
</style>
