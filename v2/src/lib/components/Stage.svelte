<script lang="ts">
  import type { Snippet } from 'svelte';
  import { mode } from '../stores/mode';
  import { renderInline, renderMarkdown } from '../markdown';
  import CeText from './CeText.svelte';
  import SectionView from './SectionView.svelte';
  import type { ServiceKey } from '../services';
  import type { Notebook, Section, Card } from '../types';

  let {
    notebook,
    visibleCardIds,
    selSection,
    onselect,
    onrename,
    onsubtitle,
    onpatchsection,
    onsectiongrip,
    onsvcrun,
    onsvcattach,
    cardView,
    matrix,
    sectionTools,
    sectionFooter,
    stageFooter,
  }: {
    notebook: Notebook;
    visibleCardIds: Set<string> | null;
    selSection: string | null;
    onselect: (id: string | null) => void;
    onrename: (name: string) => void;
    onsubtitle: (v: string) => void;
    onpatchsection: (section: Section, patch: Partial<Section>) => void;
    /** Section grip pointerdown → the App starts the engine drag for this section. */
    onsectiongrip?: (section: Section, ev: PointerEvent, roomEl: HTMLElement) => void;
    /** Study action run for a section (shuffle/flipAll/reset). */
    onsvcrun?: (section: Section, key: ServiceKey) => void;
    /** Native service chip dropped on a section body enables it. */
    onsvcattach?: (section: Section, key: ServiceKey) => void;
    cardView: Snippet<[Section, Card, boolean]>;
    matrix?: Snippet;
    sectionTools?: Snippet<[Section]>;
    sectionFooter?: Snippet<[Section]>;
    stageFooter?: Snippet;
  } = $props();

  const studying = $derived($mode === 'study');
  const hsub = $derived((notebook.subtitle ?? '').trim());

  // Study-only per-section collapse — session state, distinct from the persisted chapter fold.
  const studyCollapsed: Record<string, boolean> = $state({});

  // v1 chapFold: a folded divider hides its sections until the next divider.
  const rows = $derived.by(() => {
    let chapFold = false;
    const out: Section[] = [];
    for (const s of notebook.sections) {
      const divider = s.kind === 'divider';
      if (!divider && chapFold) continue;
      // Matrix filter hides sections with no matching card in BOTH modes (v1 60-stage:119).
      if (
        !divider &&
        visibleCardIds !== null &&
        !s.cards.some((c) => visibleCardIds.has(c.id))
      ) {
        continue;
      }
      if (
        !divider &&
        studying &&
        s.cards.length === 0 &&
        !(s.title ?? '').trim() &&
        !(s.subtitle ?? '').trim()
      ) {
        continue;
      }
      if (divider) chapFold = s.folded === true;
      out.push(s);
    }
    return out;
  });

</script>

<div class="card-shell hw-{notebook.width ?? 'medium'}">
  <div class="row house-head">
    {#if studying}
      <div class="hh-titles">
        <div class="house-title">🏠 {@html renderInline(notebook.name)}</div>
        {#if hsub}<div class="house-sub">{@html renderMarkdown(hsub)}</div>{/if}
      </div>
    {:else}
      <div class="hh-titles">
        <CeText
          value={notebook.name}
          multiline={false}
          placeholder="house name"
          preview={'🏠 ' + renderInline(notebook.name)}
          viewClass="house-title"
          editClass="ce-htitle"
          onchange={onrename}
        />
        <CeText
          value={notebook.subtitle ?? ''}
          placeholder="optional subtitle · markdown + $math$"
          viewClass="house-sub"
          editClass="ce-hsub"
          onchange={onsubtitle}
        />
      </div>
    {/if}
  </div>
  {#if matrix}{@render matrix()}{/if}
  {#each rows as section (section.id)}
    <SectionView
      {section}
      {notebook}
      {visibleCardIds}
      selected={selSection === section.id}
      onselect={() => onselect(section.id)}
      onpatch={(patch) => onpatchsection(section, patch)}
      collapsed={studyCollapsed[section.id] === true}
      ontogglecollapse={() => (studyCollapsed[section.id] = studyCollapsed[section.id] !== true)}
      ongrip={(ev, el) => onsectiongrip?.(section, ev, el)}
      onsvcrun={(k) => onsvcrun?.(section, k)}
      onsvcattach={(k) => onsvcattach?.(section, k)}
      {cardView}
      {sectionTools}
      {sectionFooter}
    />
  {/each}
  {#if stageFooter}{@render stageFooter()}{/if}
</div>
