<script lang="ts">
  let { props, onUpdate }: {
    props: { src: string; alt?: string };
    onUpdate?: (props: { src: string; alt?: string }) => void;
  } = $props();

  function handleSrc(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    onUpdate?.({ ...props, src: target.value });
  }

  function handleAlt(e: Event) {
    const target = e.target as HTMLInputElement;
    onUpdate?.({ ...props, alt: target.value });
  }
</script>

<div class="image-edit">
  <textarea
    value={props.src}
    oninput={handleSrc}
    placeholder="Paste a data: URL or image path..."
    rows="3"
  ></textarea>
  <input
    type="text"
    value={props.alt ?? ''}
    oninput={handleAlt}
    placeholder="Alt text"
  />
</div>

<style>
  .image-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .image-edit textarea,
  .image-edit input {
    width: 100%;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-family: inherit;
    font-size: 14px;
  }
  .image-edit textarea {
    resize: vertical;
  }
</style>
