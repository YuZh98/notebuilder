<script lang="ts">
  import type { Snippet } from 'svelte';
  import { mode } from '../stores/mode';
  import { renderInline, renderMarkdown } from '../markdown';
  import CeText from './CeText.svelte';
  import SectionView from './SectionView.svelte';
  import { visibleSections } from '../visible-cards';
  import { session } from '../session.svelte';
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
    cardView: Snippet<[Section, Card, boolean]>;
    matrix?: Snippet;
    sectionTools?: Snippet<[Section]>;
    sectionFooter?: Snippet<[Section]>;
    stageFooter?: Snippet;
  } = $props();

  const studying = $derived($mode === 'study');
  const hsub = $derived((notebook.subtitle ?? '').trim());

  // Chapter folds and the matrix filter both drop rows; the study cursor walks the same list.
  const rows = $derived(visibleSections(notebook, studying, visibleCardIds));

</script>

<div class="card-shell hw-{notebook.width ?? 'medium'}">
  <div class="row house-head">
    {#if studying}
      <div class="hh-titles">
        <div class="house-title">🏠 {@html renderInline(notebook.name)}</div>
        {#if hsub}<div class="house-sub">{@html renderMarkdown(hsub)}</div>{/if}
      </div>
    {:else}
      <div class="hh-titles" data-history="edit">
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
      collapsed={session.collapsed[section.id] === true}
      ontogglecollapse={() => (session.collapsed[section.id] = session.collapsed[section.id] !== true)}
      ongrip={(ev, el) => onsectiongrip?.(section, ev, el)}
      onsvcrun={(k) => onsvcrun?.(section, k)}
      {cardView}
      {sectionTools}
      {sectionFooter}
    />
  {/each}
  {#if stageFooter}{@render stageFooter()}{/if}
</div>
