<script lang="ts">
  import type { Snippet } from 'svelte';
  import { mode } from '../stores/mode';
  import { renderMarkdown } from '../markdown';
  import { sectionsOfChapter } from '../notebook-ops';
  import { startEdgeResize } from '../drag/resize';
  import { clampRoomW } from '../drag/geometry';
  import { pushGestureSnapshot } from '../drag/gesture-history';
  import { session, studyOrder } from '../session.svelte';
  import { visibleCards, archivedCount } from '../service-ops';
  import { svcBarItems, reorderSvc, flipAllApplicable, type ServiceKey } from '../services';
  import CeText from './CeText.svelte';
  import ServiceBar from './ServiceBar.svelte';
  import type { Notebook, Section, Card } from '../types';

  let {
    section,
    notebook,
    visibleCardIds,
    selected,
    onselect,
    onpatch,
    collapsed,
    ontogglecollapse,
    ongrip,
    onsvcrun,
    onsvcattach,
    cardView,
    sectionTools,
    sectionFooter,
  }: {
    section: Section;
    notebook: Notebook;
    visibleCardIds: Set<string> | null;
    selected: boolean;
    onselect: () => void;
    /** Section field updates go through the notebook owner (undefined deletes the key). */
    onpatch: (patch: Partial<Section>) => void;
    /** Study-only per-section collapse — session state owned by Stage, never persisted. */
    collapsed: boolean;
    ontogglecollapse: () => void;
    /** Grip pointerdown → the App starts the engine drag with this .room as source. */
    ongrip?: (ev: PointerEvent, roomEl: HTMLElement) => void;
    /** Study action (shuffle/flipAll/reset) — App owns notebook + readerState. */
    onsvcrun?: (key: ServiceKey) => void;
    /** Native `text/nb-svc` chip dropped on the section body enables that service. */
    onsvcattach?: (key: ServiceKey) => void;
    cardView: Snippet<[Section, Card, boolean]>;
    sectionTools?: Snippet<[Section]>;
    sectionFooter?: Snippet<[Section]>;
  } = $props();

  const studying = $derived($mode === 'study');
  const editable = $derived(!studying && section.locked !== true);
  const title = $derived((section.title ?? '').trim());
  const subtitle = $derived((section.subtitle ?? '').trim());

  const q = $derived(session.search[section.id] ?? '');
  const showArch = $derived(session.showArch[section.id] === true);

  // Study grid = shuffle order ∩ archive/search filter ∩ matrix filter (v1 60-stage.js:159-160).
  const cards = $derived.by(() => {
    if (!studying) return section.cards;
    const ids = new Set(visibleCards(section, showArch, q).map((c) => c.id));
    let list = studyOrder(section).filter((c) => ids.has(c.id));
    if (visibleCardIds !== null) list = list.filter((c) => visibleCardIds.has(c.id));
    return list;
  });

  const svcState = $derived({
    q,
    showArch,
    archivedN: archivedCount(section),
    flipApplicable: flipAllApplicable(section),
  });

  // Bar keys in ServiceBar's exact display order — reorder indices are relative to this.
  const svcBarKeys = (): ServiceKey[] =>
    svcBarItems(section).filter((k) => k !== 'flipAll' || flipAllApplicable(section));

  // Reorder/resize are not undoable (D22): plain onpatch, no gesture snapshot.
  function setSvcW(key: ServiceKey, w: number) {
    onpatch({ svcW: { ...(section.svcW ?? {}), [key]: Math.round(w) } });
  }

  function removeSvc(key: ServiceKey) {
    const services = { ...(section.services ?? {}) };
    delete services[key];
    onpatch({ services: Object.keys(services).length ? services : undefined });
  }

  function svcDragOver(e: DragEvent) {
    if ((e.dataTransfer?.types ?? []).includes('text/nb-svc')) e.preventDefault();
  }

  function svcDrop(e: DragEvent) {
    const key = e.dataTransfer?.getData('text/nb-svc');
    if (!key) return;
    e.preventDefault();
    onsvcattach?.(key as ServiceKey);
  }
  const chapterCount = $derived(
    section.kind === 'divider' ? sectionsOfChapter(notebook, section.id).length : 0,
  );
  // Live gesture preview stays local; the model is only written via onpatch on commit.
  let liveW: number | null = $state(null);

  const widthStyle = $derived(
    liveW !== null
      ? `width:${liveW}px;max-width:100%`
      : typeof section.width === 'number' && section.width > 0
        ? `width:${section.width}px;max-width:100%`
        : undefined,
  );

  function gripDown(ev: PointerEvent) {
    const roomEl = (ev.currentTarget as Element).closest<HTMLElement>('.room');
    if (!roomEl) return;
    ev.preventDefault();
    ev.stopPropagation();
    ongrip?.(ev, roomEl);
  }

  // clampRoomW(startW+dx, shell width), live px while dragging, persist on commit
  // (v1 90-drag-engine.js:157). Pointercancel restores the start width (D12).
  function startRoomResize(ev: PointerEvent) {
    const roomEl = (ev.currentTarget as Element).closest<HTMLElement>('.room');
    const shell = roomEl?.parentElement;
    if (!roomEl || !shell) return;
    const startW = roomEl.getBoundingClientRect().width;
    const maxW = shell.getBoundingClientRect().width;
    let w: number | null = null;
    pushGestureSnapshot();
    startEdgeResize(
      ev,
      (dx) => {
        w = clampRoomW(startW + dx, maxW);
        liveW = w;
      },
      (mv) => {
        liveW = null;
        if (mv !== null && w !== null) onpatch({ width: w });
      },
    );
  }

  function select() {
    if (!studying) onselect();
  }

  function toggleFold() {
    onpatch({ folded: section.folded ? undefined : true });
  }

  function toggleLock() {
    onpatch({ locked: section.locked ? undefined : true });
  }

  function setTitle(v: string) {
    onpatch({ title: v.trim() ? v : undefined });
  }

  function setSubtitle(v: string) {
    onpatch({ subtitle: v.trim() ? v : undefined });
  }

  function chevKeydown(e: KeyboardEvent, toggle: () => void) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
  }
</script>

{#snippet roomGrip()}
  {#if !studying}
    <span
      class="rgrip"
      role="presentation"
      data-roomgrip={section.id}
      title="drag to reorder section"
      onpointerdown={gripDown}
    >⠿</span>
  {/if}
{/snippet}

{#snippet staticTitles(withMeta: boolean)}
  <div class="room-title">
    {#if title}{@html renderMarkdown(title)}{:else}<span class="muted sm">{section.name}</span>{/if}
  </div>
  {#if subtitle}<div class="room-sub">{@html renderMarkdown(subtitle)}</div>{/if}
  {#if withMeta}<div class="room-meta muted sm">🔒 locked</div>{/if}
{/snippet}

{#snippet editTitles()}
  <CeText
    value={section.title ?? ''}
    multiline={false}
    placeholder="room title (optional · ## = heading · $math$)"
    viewClass="room-title"
    editClass="ce-title"
    onchange={setTitle}
  />
  <CeText
    value={section.subtitle ?? ''}
    placeholder="subtitle (optional)"
    viewClass="room-sub"
    editClass="ce-sub"
    onchange={setSubtitle}
  />
{/snippet}

{#if section.kind === 'divider'}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="room divider {studying ? 'study' : 'edit'}"
    class:sel={selected && !studying}
    data-section={section.id}
    onclick={select}
  >
    {@render roomGrip()}
    {#if !studying && sectionTools}{@render sectionTools(section)}{/if}
    <div class="row" style="align-items:flex-start;gap:6px">
      <span
        class="rcollapse"
        role="button"
        tabindex="0"
        title={section.folded ? 'expand chapter' : 'collapse chapter'}
        onclick={(e) => {
          e.stopPropagation();
          toggleFold();
        }}
        onkeydown={(e) => chevKeydown(e, toggleFold)}
      >{section.folded ? '▸' : '▾'}</span>
      <span style="flex:1">
        {#if studying}
          {#if title}<span class="room-title">{@html renderMarkdown(title)}</span>{:else}<span
              class="muted sm">{section.name}</span>{/if}
        {:else}
          {@render editTitles()}
        {/if}
      </span>
      {#if section.folded && chapterCount > 0}
        <span class="muted sm">{chapterCount} section{chapterCount > 1 ? 's' : ''}</span>
      {/if}
    </div>
  </div>
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="room {studying ? 'study' : 'edit'}"
    class:sel={selected && !studying}
    data-section={section.id}
    style={widthStyle}
    onclick={select}
    ondragover={svcDragOver}
    ondrop={svcDrop}
  >
    {@render roomGrip()}
    {#if !studying && sectionTools}{@render sectionTools(section)}{/if}
    {#if !studying}
      <button
        class="room-lock"
        class:on={section.locked}
        title={section.locked ? 'locked — click to unlock' : 'unlocked — click to lock'}
        onclick={(e) => {
          e.stopPropagation();
          toggleLock();
        }}
      >{section.locked ? '🔒' : '🔓'}</button>
    {/if}
    <div class="room-bar">
      {#if studying}
        <div class="room-title">
          <span
            class="rcollapse"
            role="button"
            tabindex="0"
            title={collapsed ? 'expand' : 'collapse'}
            onclick={(e) => {
              e.stopPropagation();
              ontogglecollapse();
            }}
            onkeydown={(e) => chevKeydown(e, ontogglecollapse)}
          >{collapsed ? '▸' : '▾'}</span>
          {#if title}{@html renderMarkdown(title)}{:else}<span class="muted sm">{section.name}</span>{/if}
        </div>
        {#if subtitle && !collapsed}<div class="room-sub">{@html renderMarkdown(subtitle)}</div>{/if}
      {:else if section.locked}
        {@render staticTitles(true)}
      {:else}
        {@render editTitles()}
      {/if}
    </div>
    {#if !(studying && collapsed)}
      <ServiceBar
        {section}
        mode={studying ? 'study' : 'edit'}
        view={svcState}
        onsearch={(v) => (session.search[section.id] = v)}
        ontogglearch={() => (session.showArch[section.id] = !showArch)}
        onrun={(k) => onsvcrun?.(k)}
        onreorder={(from, to) => onpatch({ svcOrder: reorderSvc(section.svcOrder, svcBarKeys(), from, to) })}
        onresize={setSvcW}
        onremove={removeSvc}
      />
      <div class="rgwrap">
        <div class="grid room-grid" data-section={section.id} style="flex:1 1 auto">
          {#if cards.length === 0 && !studying}
            <div class="empty" style="flex:1 0 100%">
              {section.locked
                ? 'locked'
                : 'Empty — drag a product here from the Store, or click a product → Place.'}
            </div>
          {/if}
          {#each cards as card (card.id)}
            {@render cardView(section, card, editable)}
          {/each}
        </div>
      </div>
      {#if editable && sectionFooter}{@render sectionFooter(section)}{/if}
    {/if}
    {#if !studying}
      <span
        class="rz room-edge"
        role="presentation"
        data-roomrz={section.id}
        title="drag the edge to resize this section"
        onpointerdown={startRoomResize}
      ></span>
    {/if}
  </div>
{/if}
