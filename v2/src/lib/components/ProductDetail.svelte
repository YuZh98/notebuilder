<script lang="ts">
  import CardView from './CardView.svelte';
  import { typePreviewCard, type CardType, type Variety } from '../card-types';
  import type { Card, SlotProps } from '../types';

  let {
    type,
    onplace,
    onclose,
  }: {
    type: CardType;
    onplace: (variety: Variety | null, draft: Record<string, SlotProps>) => void;
    onclose: () => void;
  } = $props();

  // v1 50-render:140 — structural keys the maker owns; only free-text content is user-editable.
  const STRUCTURAL = new Set(
    'key,min,max,value,step,target,metric,expr,fn,x0,x1,y0,y1,xticks,yticks,out,note,showName,showValue,showSlider,hover'.split(
      ',',
    ),
  );

  const noop = () => {};

  // This instance is keyed by product, so `type` never changes under it; snapshot off the
  // reactive proxy once so structuredClone (typePreviewCard) and payloads see plain data.
  const ct = $state.snapshot(type) as CardType;
  const base: Card = typePreviewCard(ct);

  // draft keyed by preview slot id → overridden props (front slots only, v1 productDetail).
  let draft = $state<Record<string, SlotProps>>({});
  let prevStudy = $state(false);
  let variety = $state<Variety | null>(ct.varieties?.[0] ?? null);

  const editable = (props: SlotProps): string[] =>
    Object.keys(props).filter((k) => typeof props[k] === 'string' && !STRUCTURAL.has(k));

  const varietyAccent = $derived(variety?.accent || ct.accent || undefined);

  const previewCard = $derived<Card>({
    ...base,
    slots: base.slots.map((s) => (draft[s.id] ? { ...s, props: { ...s.props, ...draft[s.id] } } : s)),
    ...(varietyAccent ? { accent: varietyAccent } : {}),
  });

  function setDraft(slotId: string, key: string, value: string) {
    draft[slotId] = { ...(draft[slotId] ?? {}), [key]: value };
  }

  function place() {
    // Map the id-keyed draft to slot indices; the placed card stamps `type.slots` in the same order.
    const indexed: Record<string, SlotProps> = {};
    base.slots.forEach((s, i) => {
      if (draft[s.id]) indexed[String(i)] = draft[s.id];
    });
    onplace(variety, indexed);
  }

  const previewProps = $derived({
    card: previewCard,
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
  });
</script>

<div class="sect">
  <h3>
    {ct.name}
    <button class="btn sm ghost" style="float:right" onclick={onclose}>close</button>
  </h3>

  {#if ct.note}
    <div class="note-deco" style="border-style:solid;border-color:var(--accent)">
      <b>from the maker</b> — {ct.note}
    </div>
  {/if}

  {#each base.slots as s (s.id)}
    {#each editable(s.props) as key (key)}
      <div class="kv" style="align-items:flex-start">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label>{key}</label>
        <input
          data-draft={s.id}
          data-key={key}
          value={(draft[s.id]?.[key] as string) ?? (s.props[key] as string)}
          oninput={(e) => setDraft(s.id, key, e.currentTarget.value)}
        />
      </div>
    {/each}
  {/each}

  <div class="row" style="margin-top:10px">
    <b class="sm">Live preview</b>
    <span class="spacer"></span>
    <div class="palette">
      <button class="chip sm" class:on={!prevStudy} onclick={() => (prevStudy = false)}>edit</button>
      <button class="chip sm" class:on={prevStudy} onclick={() => (prevStudy = true)}>study</button>
    </div>
  </div>

  <div class="prev-wrap">
    <div class="prev-stage">
      <div class="prev-card">
        <CardView {...previewProps} forceMode={prevStudy ? 'study' : 'edit'} />
      </div>
    </div>
  </div>

  {#if ct.varieties?.length}
    <div class="kv" style="margin-top:6px">
      <!-- svelte-ignore a11y_label_has_associated_control -->
      <label>Variety</label>
      <span class="palette" style="display:inline-flex;gap:4px">
        {#each ct.varieties as v (v.name)}
          <button
            class="chip"
            class:on={variety?.name === v.name}
            data-variety={v.name}
            style={v.accent ? `box-shadow:inset 3px 0 0 ${v.accent}` : ''}
            onclick={() => (variety = v)}>{v.name}</button>
        {/each}
      </span>
    </div>
  {/if}

  <div style="margin-top:8px">
    <button class="btn primary" data-act="placeprod" onclick={place}>＋ Place</button>
    <span class="muted sm">adds to the current section</span>
  </div>
</div>
