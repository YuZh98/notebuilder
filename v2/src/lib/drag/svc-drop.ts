import type { DragSource, DropTarget, EngineCallbacks } from './engine';

export type SvcDropDeps = {
  /** Current left-to-right bar keys — the dragged chip's index is resolved against this. */
  barItems: () => string[];
  onreorder: (from: number, to: number) => void;
  onremove: (key: string) => void;
};

/**
 * Drop rules for the Edit-mode service bar (D5). A grid drop reorders inside the bar; the
 * dustbin disables the service (v1 130-boot.js:17-24 — confirmless, it is a toggle not data loss).
 */
export function makeSvcDropCallbacks(deps: SvcDropDeps): EngineCallbacks {
  const onDrop = (src: DragSource, t: DropTarget): void => {
    if (t.kind === 'dust') {
      deps.onremove(src.id);
      return;
    }
    if (t.kind !== 'grid') return;
    const from = deps.barItems().indexOf(src.id);
    if (from < 0) return;
    deps.onreorder(from, t.idx);
  };

  return {
    canDrag: () => true,
    canDrop: () => true,
    onDrop,
    phWidth: () => 8,
  };
}
