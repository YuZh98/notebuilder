<script lang="ts">
  import CeText from '../components/CeText.svelte';
  import type { Scope } from '../variable-graph';

  let { props = $bindable(), onUpdate, scope = {} } = $props<{
    props: { text: string };
    onUpdate?: (props: { text: string }) => void;
    scope?: Scope;
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
    {scope}
    viewClass="slot text"
    onchange={handleChange}
    placeholder="Write markdown…"
  />
</div>
