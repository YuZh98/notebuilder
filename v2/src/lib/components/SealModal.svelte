<script lang="ts">
  import CardView from './CardView.svelte';
  import CeText from './CeText.svelte';
  import { PROD_ICONS, STORES, type CardType } from '../card-types';
  import { VAR } from '../var-colors';
  import { benchPreviewCard, type Bench } from '../bench.svelte';
  import { openSealDraft, sealAsNew, sealReplace, type SealOutcome } from '../seal';

  let {
    bench,
    existing,
    taken,
    onconfirm,
    oncancel,
  }: {
    bench: Bench;
    existing: CardType | null;
    taken: string[];
    onconfirm: (o: SealOutcome) => void;
    oncancel: () => void;
  } = $props();

  // Snapshot the live factory bench once: seal helpers structuredClone slot props, which fails on proxies.
  const benchSnap = $state.snapshot(bench) as Bench;

  let draft = $state(openSealDraft(benchSnap, existing));
  let conflict = $state(false);
  let error = $state('');
  let nameInput = $state<HTMLInputElement | null>(null);

  const noop = () => {};
  const swatches = VAR.filter((v) => v.accent);

  // Seal-as-new must reject the source's own name too — you can't fork under the original name.
  const blocked = $derived(existing ? [...taken, existing.name] : taken);
  const effIcon = $derived(draft.icon || (draft.name.trim().charAt(0) || '?').toUpperCase());

  const previewProps = {
    card: benchPreviewCard(benchSnap),
    editable: false,
    selected: false,
    state: {},
    notes: [],
    notesOpen: false,
    onselect: noop,
    onstate: noop,
    onmove: noop,
    ondelete: noop,
    onverb: noop,
    ontags: noop,
    onsavetype: noop,
    onupdateslot: noop,
    ondeleteslot: noop,
    onaddslot: noop,
    progresscompletion: () => ({ done: 0, total: 0, pct: 0 }),
    ontogglenotes: noop,
    onaddnote: noop,
    ondeletenote: noop,
    ongrip: noop,
    onresize: noop,
    onfusew: noop,
  };

  function setName(v: string) {
    draft.name = v;
    error = '';
  }

  function sealNew() {
    const out = sealAsNew(benchSnap, draft, blocked);
    if (out.kind === 'name-taken') {
      error = 'name already in use — pick another';
      nameInput?.focus();
      return;
    }
    onconfirm(out);
  }

  function confirmSeal() {
    if (existing && draft.name === existing.name) {
      conflict = true;
      return;
    }
    sealNew();
  }

  function replaceOriginal() {
    if (existing) onconfirm(sealReplace(benchSnap, draft, existing));
  }

  function setStore(id: string) {
    draft.store = draft.store === id ? null : id;
  }

  function addVariety() {
    draft.varieties = [...draft.varieties, { name: `Variety ${draft.varieties.length + 1}`, accent: '' }];
  }

  function delVariety(i: number) {
    draft.varieties = draft.varieties.filter((_, k) => k !== i);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="modal seal-modal" style="display:flex" onclick={(e) => e.target === e.currentTarget && oncancel()}>
  <div class="modal-box">
    <h3 style="margin:0 0 8px">🔒 Seal — confirm</h3>

    <div class="prev-wrap" style="margin:8px 0">
      <CardView {...previewProps} forceMode="study" />
    </div>

    <div class="kv">
      <label for="seal-name">Name</label>
      <input
        id="seal-name"
        data-seal="name"
        bind:this={nameInput}
        value={draft.name}
        oninput={(e) => setName(e.currentTarget.value)}
      />
    </div>
    {#if error}
      <div class="sm seal-error" data-seal="error">{error}</div>
    {/if}

    <div class="kv" style="align-items:flex-start">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label>Icon <span class="muted sm">({effIcon})</span></label>
      <div>
        <div class="palette seal-icons" style="margin:0 0 4px">
          <button class="chip xs" class:on={!draft.icon} title="auto: first letter of the name" onclick={() => (draft.icon = '')}>Aa</button>
          {#each PROD_ICONS as ic (ic)}
            <button class="chip xs" class:on={draft.icon === ic} onclick={() => (draft.icon = ic)}>{ic}</button>
          {/each}
        </div>
        <input
          data-seal="iconfree"
          value={draft.icon}
          maxlength="2"
          placeholder="or type a letter / emoji"
          style="width:12em"
          oninput={(e) => (draft.icon = e.currentTarget.value)}
        />
      </div>
    </div>

    <div class="kv" style="align-items:flex-start">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label>Maker note</label>
      <span style="flex:1">
        <CeText
          value={draft.note}
          onchange={(v) => (draft.note = v)}
          placeholder="optional · markdown + $math$"
        />
      </span>
    </div>

    <div class="muted sm" style="margin-top:6px">Store:</div>
    <div class="palette seal-stores" style="margin:6px 0">
      {#each STORES as s (s.id)}
        <button class="chip" class:on={draft.store === s.id} data-store={s.id} onclick={() => setStore(s.id)}>{s.name}</button>
      {/each}
    </div>

    <div class="muted sm" style="margin-top:6px">Varieties:</div>
    {#each draft.varieties as v, i (i)}
      <div class="row seal-var" style="gap:6px;margin:3px 0">
        <input
          data-seal="varname"
          value={v.name}
          placeholder="variety name"
          style="width:9em"
          oninput={(e) => (draft.varieties[i].name = e.currentTarget.value)}
        />
        {#each swatches as x (x.accent)}
          <button
            class="chip xs"
            class:on={v.accent === x.accent}
            title={x.name}
            aria-label={x.name}
            style="background:{x.accent}"
            onclick={() => (draft.varieties[i].accent = x.accent)}>&nbsp;</button>
        {/each}
        <button class="btn sm ghost" title="remove variety" onclick={() => delVariety(i)}>✕</button>
      </div>
    {/each}
    <div style="margin:4px 0 2px">
      <button class="btn sm" onclick={addVariety}>＋ variety</button>
    </div>

    {#if conflict}
      <div class="row" style="margin-top:10px">
        <span class="spacer"></span>
        <button class="btn" onclick={oncancel}>Cancel</button>
        <button class="btn" onclick={sealNew}>Seal as new</button>
        <button class="btn primary" onclick={replaceOriginal}>Replace original</button>
      </div>
    {:else}
      <div class="row" style="margin-top:12px">
        <span class="spacer"></span>
        <button class="btn" onclick={oncancel}>Cancel</button>
        <button class="btn primary" onclick={confirmSeal}>🔒 Confirm seal</button>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Backdrop positioning lives here so the modal works before the global CSS port (T8) lands. */
  .seal-modal {
    position: fixed;
    inset: 0;
    z-index: 80;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.55);
  }
  .seal-error {
    color: var(--warn, #ff6b81);
    margin: 2px 0 4px;
  }
</style>
