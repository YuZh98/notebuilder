<script lang="ts">
  import CeText from '../components/CeText.svelte';

  let { props = $bindable(), onUpdate } = $props<{
    props: { text: string };
    onUpdate?: (props: { text: string }) => void;
  }>();

  function handleChange(value: string) {
    props.text = value;
    onUpdate?.(props);
  }
</script>

<div class="text-edit">
  <CeText
    value={props.text}
    multiline
    scope={{}}
    onchange={handleChange}
    placeholder="Write markdown…"
  />
</div>
