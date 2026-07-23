import { toast } from '../toast.svelte';
import { pushGestureSnapshot } from './gesture-history';
import { deleteCard, deleteSection, findCard, moveCardBefore, moveSectionBefore } from '../notebook-ops';
import { applyTag, reorderTag } from '../tags';
import { placeType, type CardType, type Variety } from '../card-types';
import type { Notebook, Section } from '../types';
import type { DragSource, DropTarget, EngineCallbacks } from './engine';

export type NotebookDropDeps = {
  notebook: () => Notebook;
  selectedCard: () => string | null;
  selectedSection: () => string | null;
  clearSelection: () => void;
  confirmDelete: (message: string, title: string) => Promise<boolean>;
  /** Store-chip drags resolve the dragged product and its session-picked variety (v1 90:94). */
  cardType?: (id: string) => CardType | undefined;
  variety?: (ct: CardType) => Variety | null;
  /** Section-ops chip → section / dustbin (svcattach kind). The owner guards dividers and pushes history. */
  attachService?: (sectionId: string, key: string) => void;
  detachService?: (key: string) => void;
};

function sectionOf(nb: Notebook, cardId: string): Section | undefined {
  return nb.sections.find((s) => s.cards.some((c) => c.id === cardId));
}

/**
 * The engine's drop idx counts grid items minus the dragged one; resolve it against the
 * grid DOM (which already reflects chapter folds) to the id to insert before.
 * An idx past the end yields null → append, the v1 clamp (90-drag-engine.js:97).
 */
function idAt(grid: Element, itemSel: string, key: 'card' | 'section', srcId: string, idx: number): string | null {
  const ids = [...grid.children]
    .filter((c): c is HTMLElement => c instanceof HTMLElement && c.matches(itemSel) && !c.classList.contains('drag-ph'))
    .map((el) => el.dataset[key])
    .filter((id): id is string => typeof id === 'string' && id !== srcId);
  return ids[idx] ?? null;
}

/** Drop rules for the notebook stage — v1 90-drag-engine.js:23,61-62,82,85,95-101. */
export function makeNotebookDropCallbacks(deps: NotebookDropDeps): EngineCallbacks {
  const dropCard = (src: DragSource, t: DropTarget): void => {
    const nb = deps.notebook();
    if (t.kind === 'dust') {
      pushGestureSnapshot();
      if (deps.selectedCard() === src.id) deps.clearSelection();
      deleteCard(nb, src.id);
      toast('card deleted (Undo to restore)');
      return;
    }
    if (t.kind !== 'grid') return;
    const targetSectionId = (t.grid as HTMLElement).dataset.section;
    if (!targetSectionId) return;
    pushGestureSnapshot();
    moveCardBefore(nb, src.id, targetSectionId, idAt(t.grid, '.furn', 'card', src.id, t.idx));
  };

  const dropSection = (src: DragSource, t: DropTarget): void => {
    const nb = deps.notebook();
    if (t.kind === 'dust') {
      if (nb.sections.length <= 1) {
        toast('keep at least one section');
        return;
      }
      const section = nb.sections.find((s) => s.id === src.id);
      if (!section) return;
      void deps.confirmDelete(`Delete section "${section.name}"? (Undoable)`, 'Delete Section').then((ok) => {
        if (!ok) return;
        pushGestureSnapshot();
        const selectedCard = deps.selectedCard();
        if (deps.selectedSection() === src.id || section.cards.some((c) => c.id === selectedCard)) {
          deps.clearSelection();
        }
        deleteSection(deps.notebook(), src.id);
        toast('section deleted');
      });
      return;
    }
    if (t.kind !== 'grid') return;
    pushGestureSnapshot();
    moveSectionBefore(nb, src.id, idAt(t.grid, '.room', 'section', src.id, t.idx));
  };

  // Store chip → notebook: stamp the product into the target section at the computed index (v1 90:94).
  const dropProduct = (src: DragSource, t: DropTarget): void => {
    if (t.kind !== 'grid') return; // fac-grid forks and lanes remap happen in the factory, not here
    const ct = deps.cardType?.(src.id);
    if (!ct) return;
    const sectionId = (t.grid as HTMLElement).dataset.section;
    const section = deps.notebook().sections.find((s) => s.id === sectionId);
    if (!section || section.kind === 'divider') return;
    pushGestureSnapshot();
    const beforeId = idAt(t.grid, '.furn', 'card', src.id, t.idx);
    const at = beforeId ? section.cards.findIndex((c) => c.id === beforeId) : section.cards.length;
    const card = placeType(ct, section.id, 0, deps.variety?.(ct) ?? undefined);
    section.cards.splice(at < 0 ? section.cards.length : at, 0, card);
    section.cards.forEach((c, i) => (c.position = i));
    toast(`placed "${ct.name}"`);
  };

  // Section-ops chip → a room (the svcattach kind's laneSel) attaches; the dustbin detaches.
  const dropSvcAttach = (src: DragSource, t: DropTarget): void => {
    if (t.kind === 'dust') {
      deps.detachService?.(src.id);
      return;
    }
    if (t.kind !== 'lane') return;
    const sectionId = (t.el as HTMLElement).dataset.section;
    if (sectionId) deps.attachService?.(sectionId, src.id);
  };

  // Tag chip → a card (laneSel) applies; → the tag grid reorders cats (D26).
  const dropTag = (src: DragSource, t: DropTarget): void => {
    if (t.kind === 'lane') {
      const cardId = (t.el as HTMLElement).dataset.card;
      if (!cardId) return;
      pushGestureSnapshot();
      applyTag(deps.notebook(), cardId, src.id);
      toast(`tagged “${src.id}”`);
      return;
    }
    if (t.kind !== 'grid') return;
    const nb = deps.notebook();
    const cats = nb.cats ?? [];
    const from = cats.indexOf(src.id);
    if (from === -1) return;
    const ids = [...t.grid.children]
      .filter(
        (c): c is HTMLElement =>
          c instanceof HTMLElement && c.matches('[data-tagreorder]') && !c.classList.contains('drag-ph'),
      )
      .map((el) => el.dataset.tagreorder)
      .filter((id): id is string => typeof id === 'string' && id !== src.id);
    const before = ids[t.idx] ?? null;
    const rest = cats.filter((c) => c !== src.id);
    const to = before === null ? rest.length : rest.indexOf(before);
    if (to === -1) return;
    pushGestureSnapshot();
    reorderTag(nb, from, to);
  };

  return {
    canDrag: (src) => {
      if (src.kind !== 'card') return true;
      const from = sectionOf(deps.notebook(), src.id);
      return from !== undefined && from.locked !== true;
    },
    canDrop: (src, grid) => {
      if (src.kind !== 'card' && src.kind !== 'product') return true;
      const id = (grid as HTMLElement).dataset.section;
      const target = deps.notebook().sections.find((s) => s.id === id);
      return target !== undefined && target.kind !== 'divider' && target.locked !== true;
    },
    onDrop: (src, t) => {
      if (src.kind === 'card') dropCard(src, t);
      else if (src.kind === 'section') dropSection(src, t);
      else if (src.kind === 'product') dropProduct(src, t);
      else if (src.kind === 'tag') dropTag(src, t);
      else if (src.kind === 'svcattach') dropSvcAttach(src, t);
    },
    phWidth: (src) => (src.kind === 'card' ? (findCard(deps.notebook(), src.id)?.w ?? 12) : 8),
  };
}
