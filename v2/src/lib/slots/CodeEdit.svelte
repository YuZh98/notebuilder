<script lang="ts">
  let { props, onUpdate } = $props<{
    props: { code: string; lang?: string };
    onUpdate?: (props: { code: string; lang?: string }) => void;
  }>();

  function handleCode(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    onUpdate?.({ ...props, code: target.value });
  }

  function handleLang(e: Event) {
    const target = e.target as HTMLInputElement;
    onUpdate?.({ ...props, lang: target.value });
  }
</script>

<div class="code-edit">
  <input
    class="lang"
    value={props.lang ?? ''}
    oninput={handleLang}
    placeholder="lang (e.g. py)"
  />
  <textarea
    value={props.code}
    oninput={handleCode}
    placeholder="Enter code..."
    rows="6"
    spellcheck="false"
  ></textarea>
</div>

<style>
  .code-edit {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .code-edit .lang {
    width: 160px;
    padding: 4px 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-size: 13px;
  }
  .code-edit textarea {
    width: 100%;
    min-height: 120px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: var(--panel);
    color: var(--ink);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 13px;
    resize: vertical;
  }
</style>
