<script lang="ts">
  let { props }: {
    props: { src: string; alt?: string };
    scope?: Record<string, unknown>;
  } = $props();
</script>

<div class="image-study">
  {#if props.src}
    <img src={props.src} alt={props.alt ?? ''} />
  {:else}
    <div class="placeholder">No image</div>
  {/if}
</div>

<style>
  .image-study img {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
  }
  .image-study .placeholder {
    padding: 16px;
    border: 1px dashed var(--line);
    border-radius: 4px;
    color: var(--muted, #888);
    font-size: 13px;
    text-align: center;
  }
</style>
