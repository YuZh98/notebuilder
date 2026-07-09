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
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
  }
</style>
