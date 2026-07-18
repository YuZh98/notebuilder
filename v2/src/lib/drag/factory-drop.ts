import { toast } from '../toast.svelte';
import { pushGestureSnapshot } from './gesture-history';
import {
  factory,
  activeBench,
  addBench,
  delBench,
  deleteBenchSlot,
  moveBench,
  moveBenchSlot,
  typeToBench,
} from '../bench.svelte';
import type { CardType } from '../card-types';
import type { DragSource, DropTarget, EngineCallbacks } from './engine';

export type FactoryDropDeps = {
  cardType: (id: string) => CardType | undefined;
  /** Remap a product's store lane (null = Workshop) — v1 90:89-92. */
  setStore: (ct: CardType, store: string | null) => void;
  storeName: (store: string | null) => string;
  confirmDelete: (message: string, title: string) => Promise<boolean>;
};

/**
 * Drop rules for the Factory stage — v1 90-drag-engine.js:71,84,89-100. Products fork or
 * remap their store, benches and bench slots reorder or delete. No locked rules here.
 */
export function makeFactoryDropCallbacks(deps: FactoryDropDeps): EngineCallbacks {
  const dropProduct = (src: DragSource, t: DropTarget): void => {
    const ct = deps.cardType(src.id);
    if (!ct) return;
    if (t.kind === 'lane') {
      const raw = (t.el as HTMLElement).dataset.lane;
      const store = raw ? raw : null;
      pushGestureSnapshot();
      deps.setStore(ct, store);
      toast(store ? `moved to ${deps.storeName(store)}` : 'moved to Workshop');
      return;
    }
    if (t.kind !== 'grid') return;
    // Any factory grid (fac-grid / bench-grid) forks a fresh, editable copy — never a place (v1 :94).
    pushGestureSnapshot();
    addBench(typeToBench(structuredClone(ct)));
    toast(`forked "${ct.name}" — edit the copy`);
  };

  const dropBench = (src: DragSource, t: DropTarget): void => {
    if (t.kind === 'dust') {
      if (factory.benches.length <= 1) {
        toast('keep at least one container');
        return;
      }
      void deps.confirmDelete('Delete this container? (sealed products stay in Inventory. Undoable.)', 'Delete Container').then((ok) => {
        if (!ok) return;
        pushGestureSnapshot();
        delBench(src.id);
      });
      return;
    }
    if (t.kind !== 'grid') return;
    const from = factory.benches.findIndex((b) => b.id === src.id);
    if (from < 0) return;
    pushGestureSnapshot();
    moveBench(from, t.idx);
  };

  const dropSlot = (src: DragSource, t: DropTarget): void => {
    const b = activeBench();
    if (t.kind === 'dust') {
      pushGestureSnapshot();
      deleteBenchSlot(b, src.id);
      toast('slot deleted (Undo to restore)');
      return;
    }
    if (t.kind !== 'grid') return;
    // Only reorder within the active bench's own face row (v1 reorders the active face only).
    if ((t.grid as HTMLElement).closest('.faccard')?.getAttribute('data-bench') !== factory.active) return;
    const face = factory.face === 'back' ? (b.back ?? []) : b.slots;
    const from = face.findIndex((s) => s.id === src.id);
    if (from < 0) return;
    pushGestureSnapshot();
    moveBenchSlot(b, from, t.idx);
  };

  return {
    canDrag: () => true,
    canDrop: () => true,
    onDrop: (src, t) => {
      if (src.kind === 'product') dropProduct(src, t);
      else if (src.kind === 'bench') dropBench(src, t);
      else if (src.kind === 'slot') dropSlot(src, t);
    },
    phWidth: (src) => (src.kind === 'bench' ? 6 : src.kind === 'slot' ? 12 : 8),
  };
}
