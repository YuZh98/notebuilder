export type DragKind = 'card' | 'section' | 'qopt' | 'product' | 'slot' | 'bench' | 'tag';

export type KindSpec = {
  itemSel: string;
  gridSels: string[];
  horiz: (grid: Element) => boolean;
  deletable: boolean;
};

const alwaysHoriz = (): boolean => true;

/** v1 90-drag-engine.js:8-9 (DRAG_ITEM/DRAG_GRIDS) plus the vertical-grid rule at :65. */
export const DRAG_KINDS: Record<DragKind, KindSpec> = {
  card: {
    itemSel: '.furn',
    gridSels: ['.room-grid'],
    horiz: (grid) => !(grid.classList.contains('card-shell') || grid.classList.contains('ce-choice')),
    deletable: true,
  },
  section: {
    itemSel: '.room',
    gridSels: ['.card-shell'],
    horiz: (grid) => !(grid.classList.contains('card-shell') || grid.classList.contains('ce-choice')),
    deletable: true,
  },
  qopt: {
    itemSel: '[data-qrow]',
    gridSels: ['.ce-choice'],
    horiz: (grid) => !(grid.classList.contains('card-shell') || grid.classList.contains('ce-choice')),
    deletable: false,
  },
  // P5/P6: store/factory drag kinds land with their own grid selectors; item
  // selectors carried over from v1 :8 for reference, gridSels stay empty till then.
  product: { itemSel: '.furn', gridSels: [], horiz: alwaysHoriz, deletable: false },
  slot: { itemSel: '.benchslot', gridSels: [], horiz: alwaysHoriz, deletable: false },
  bench: { itemSel: '.faccard', gridSels: [], horiz: alwaysHoriz, deletable: false },
  tag: { itemSel: '[data-tagreorder]', gridSels: [], horiz: alwaysHoriz, deletable: false },
};
