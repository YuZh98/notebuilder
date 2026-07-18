export type DragKind = 'card' | 'section' | 'qopt' | 'product' | 'slot' | 'bench' | 'tag';

export type KindSpec = {
  itemSel: string;
  gridSels: string[];
  horiz: (grid: Element) => boolean;
  deletable: boolean;
  /** false = the source element stays put (no hide, no source placeholder) — v1 90:34 (product). */
  ghostSource: boolean;
  /** kinds that can drop onto an inventory lane to remap their store — v1 90:48,89 (product). */
  laneSel?: string;
};

const alwaysHoriz = (): boolean => true;

/** v1 90-drag-engine.js:8-9 (DRAG_ITEM/DRAG_GRIDS) plus the vertical-grid rule at :65. */
export const DRAG_KINDS: Record<DragKind, KindSpec> = {
  card: {
    itemSel: '.furn',
    gridSels: ['.room-grid'],
    horiz: (grid) => !(grid.classList.contains('card-shell') || grid.classList.contains('ce-choice')),
    deletable: true,
    ghostSource: true,
  },
  section: {
    itemSel: '.room',
    gridSels: ['.card-shell'],
    horiz: (grid) => !(grid.classList.contains('card-shell') || grid.classList.contains('ce-choice')),
    deletable: true,
    ghostSource: true,
  },
  qopt: {
    itemSel: '[data-qrow]',
    gridSels: ['.ce-choice'],
    horiz: (grid) => !(grid.classList.contains('card-shell') || grid.classList.contains('ce-choice')),
    deletable: false,
    ghostSource: true,
  },
  // Store chip → notebook places among cards (itemSel .furn), → factory grids forks; the chip
  // itself never ghosts (v1 90:34) and can remap its store over an inventory lane (v1 90:48,89).
  product: {
    itemSel: '.furn',
    gridSels: ['.room-grid', '.fac-grid'],
    horiz: alwaysHoriz,
    deletable: false,
    ghostSource: false,
    laneSel: '.store-lane[data-lane]',
  },
  // A bench slot reorders inside its face row (.cardrow of .cardslot cells) — v2 renders slots
  // through CardView, so the grid is the row, not v1's flat .bench-grid.
  slot: { itemSel: '.cardslot', gridSels: ['.cardrow'], horiz: alwaysHoriz, deletable: true, ghostSource: true },
  bench: { itemSel: '.faccard', gridSels: ['.fac-grid'], horiz: alwaysHoriz, deletable: true, ghostSource: true },
  // P6: tag reorder lands with the tag bar.
  tag: { itemSel: '[data-tagreorder]', gridSels: [], horiz: alwaysHoriz, deletable: false, ghostSource: true },
};
