// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  UNTAG,
  matrixDims,
  effectiveAxes,
  cardHas,
  cellKey,
  mtxCount,
  toggleCells,
  pruneCells,
  cardMatchesFilter,
  type AxisDim,
  type MatrixAxis,
} from './coverage-matrix';
import type { Card, Notebook, Section } from './types';
import type { CardType } from './card-types';

const types: CardType[] = [
  { id: 't1', name: 'Flashcard', slots: [] },
  { id: 't2', name: 'Quiz', slots: [] },
];

function card(over: Partial<Card> & { id: string; sectionId: string }): Card {
  return { position: 0, slots: [], ...over };
}

const c1 = card({ id: 'c1', sectionId: 's1', typeId: 't1', tags: ['math', 'algebra'] });
const c2 = card({ id: 'c2', sectionId: 's1', typeId: 't2', tags: ['math'] });
const c3 = card({ id: 'c3', sectionId: 's2', typeId: 't1', tags: ['science'] });
const c4 = card({ id: 'c4', sectionId: 's2' }); // untyped, untagged
const c5 = card({ id: 'c5', sectionId: 's2', typeId: 'tX', tags: [] }); // unknown type, empty tags

function section(id: string, name: string, cards: Card[], kind?: 'divider'): Section {
  return { id, notebookId: 'nb', name, position: 0, cards, ...(kind ? { kind } : {}) };
}

const nb: Notebook = {
  id: 'nb',
  name: 'NB',
  createdAt: '',
  updatedAt: '',
  sections: [
    section('s1', 'Intro', [c1, c2]),
    section('s2', 'Body', [c3, c4, c5]),
    section('d1', 'Break', [], 'divider'),
  ],
};

describe('matrixDims', () => {
  const dims = matrixDims(nb, types);
  const byKey = (k: MatrixAxis) => dims.find((d) => d.key === k)!;

  it('returns axes in [section, product, tag] order', () => {
    expect(dims.map((d) => d.key)).toEqual(['section', 'product', 'tag']);
  });

  it('section: non-divider sections, reorderable', () => {
    const s = byKey('section');
    expect(s.reorderable).toBe(true);
    expect(s.values).toEqual([
      { id: 's1', label: 'Intro' },
      { id: 's2', label: 'Body' },
    ]);
  });

  it('product: distinct type names first-seen + untyped bucket, not reorderable', () => {
    const p = byKey('product');
    expect(p.reorderable).toBe(false);
    expect(p.values).toEqual([
      { id: 'Flashcard', label: 'Flashcard' },
      { id: 'Quiz', label: 'Quiz' },
      { id: UNTAG, label: 'untyped' },
    ]);
  });

  it('tag: notebook-wide first-seen tags + UNTAG always, not reorderable', () => {
    const t = byKey('tag');
    expect(t.reorderable).toBe(false);
    expect(t.values).toEqual([
      { id: 'math', label: 'math' },
      { id: 'algebra', label: 'algebra' },
      { id: 'science', label: 'science' },
      { id: UNTAG, label: 'untagged' },
    ]);
  });

  it('product ∅ bucket appears only when some card is untyped/unknown', () => {
    const typed = matrixDims(
      { ...nb, sections: [section('s1', 'Intro', [c1, c2])] },
      types,
    );
    const p = typed.find((d) => d.key === 'product')!;
    expect(p.values.some((v) => v.id === UNTAG)).toBe(false);
  });

  it('tag UNTAG bucket is present even when no card is untagged', () => {
    const tagged = matrixDims(
      { ...nb, sections: [section('s1', 'Intro', [c1, c2, c3])] },
      types,
    );
    const t = tagged.find((d) => d.key === 'tag')!;
    expect(t.values[t.values.length - 1]).toEqual({ id: UNTAG, label: 'untagged' });
  });
});

describe('cardHas', () => {
  it('section by card.sectionId', () => {
    expect(cardHas(c1, 'section', 's1', types)).toBe(true);
    expect(cardHas(c1, 'section', 's2', types)).toBe(false);
  });

  it('product by resolved type name, ∅ for untyped/unknown', () => {
    expect(cardHas(c1, 'product', 'Flashcard', types)).toBe(true);
    expect(cardHas(c1, 'product', 'Quiz', types)).toBe(false);
    expect(cardHas(c4, 'product', UNTAG, types)).toBe(true);
    expect(cardHas(c5, 'product', UNTAG, types)).toBe(true); // unknown typeId
    expect(cardHas(c1, 'product', UNTAG, types)).toBe(false);
  });

  it('tag by includes, ∅ for no tags', () => {
    expect(cardHas(c1, 'tag', 'math', types)).toBe(true);
    expect(cardHas(c1, 'tag', 'science', types)).toBe(false);
    expect(cardHas(c4, 'tag', UNTAG, types)).toBe(true); // no tags field
    expect(cardHas(c5, 'tag', UNTAG, types)).toBe(true); // empty array
    expect(cardHas(c1, 'tag', UNTAG, types)).toBe(false);
  });
});

describe('cellKey', () => {
  it('joins with the unit-separator', () => {
    expect(cellKey('s1', 'Flashcard')).toBe('s1␟Flashcard');
  });
});

describe('mtxCount', () => {
  const dims = matrixDims(nb, types);
  const S = dims.find((d) => d.key === 'section')!;
  const P = dims.find((d) => d.key === 'product')!;
  const T = dims.find((d) => d.key === 'tag')!;

  it('counts cards matching both axis values across all sections', () => {
    expect(mtxCount(nb, types, S, P, 's1', 'Flashcard')).toBe(1); // c1
    expect(mtxCount(nb, types, S, P, 's2', UNTAG)).toBe(2); // c4, c5
    expect(mtxCount(nb, types, S, T, 's1', 'math')).toBe(2); // c1, c2
    expect(mtxCount(nb, types, S, T, 's2', 'science')).toBe(1); // c3
    expect(mtxCount(nb, types, S, P, 's1', 'Quiz')).toBe(1); // c2
  });

  it('counts archived cards too (no exclusion, v1 parity)', () => {
    const arch: Card = { ...c1, id: 'c1a', archived: true };
    const nb2: Notebook = { ...nb, sections: [section('s1', 'Intro', [c1, arch])] };
    expect(mtxCount(nb2, types, S, P, 's1', 'Flashcard')).toBe(2);
  });
});

describe('toggleCells', () => {
  it('adds all keys when none/some selected', () => {
    expect(toggleCells([], ['a', 'b'])).toEqual(['a', 'b']);
    expect(toggleCells(['a'], ['a', 'b'])).toEqual(['a', 'b']); // add missing only
  });

  it('removes all keys when every key already selected', () => {
    expect(toggleCells(['a', 'b'], ['a', 'b'])).toEqual([]);
    expect(toggleCells(['a', 'b', 'c'], ['a', 'b'])).toEqual(['c']);
  });

  it('no-op for empty gesture; returns a fresh array', () => {
    const sel = ['x'];
    const out = toggleCells(sel, []);
    expect(out).toEqual(['x']);
    expect(out).not.toBe(sel);
  });
});

describe('pruneCells', () => {
  const R: AxisDim = {
    key: 'section',
    label: 'Sections',
    reorderable: true,
    values: [
      { id: 's1', label: 'Intro' },
      { id: 's2', label: 'Body' },
    ],
  };
  const C: AxisDim = {
    key: 'product',
    label: 'Products',
    reorderable: false,
    values: [
      { id: 'Flashcard', label: 'Flashcard' },
      { id: UNTAG, label: 'untyped' },
    ],
  };

  it('drops keys whose parts are not live on R/C', () => {
    const sel = [
      cellKey('s1', 'Flashcard'),
      cellKey('s2', UNTAG),
      cellKey('sX', 'Flashcard'), // stale row
      cellKey('s1', 'Gone'), // stale col
    ];
    expect(pruneCells(sel, R, C)).toEqual([cellKey('s1', 'Flashcard'), cellKey('s2', UNTAG)]);
  });

  it('empty selection stays empty', () => {
    expect(pruneCells([], R, C)).toEqual([]);
  });
});

describe('cardMatchesFilter', () => {
  const dims = matrixDims(nb, types);
  const S = dims.find((d) => d.key === 'section')!;
  const P = dims.find((d) => d.key === 'product')!;

  it('empty selection matches everything', () => {
    expect(cardMatchesFilter(c1, 's1', [], S, P, types)).toBe(true);
  });

  it('matches when any selected cell hits both axes', () => {
    const sel = [cellKey('s1', 'Flashcard')];
    expect(cardMatchesFilter(c1, 's1', sel, S, P, types)).toBe(true); // s1 + Flashcard
    expect(cardMatchesFilter(c2, 's1', sel, S, P, types)).toBe(false); // s1 but Quiz
    expect(cardMatchesFilter(c3, 's2', sel, S, P, types)).toBe(false); // Flashcard but s2
  });

  it('uses the passed section context for the section axis', () => {
    const sel = [cellKey('s2', 'Flashcard')];
    // c3 lives in s2 with Flashcard → matches when rendered under s2
    expect(cardMatchesFilter(c3, 's2', sel, S, P, types)).toBe(true);
    // same card rendered under s1 context → section axis fails
    expect(cardMatchesFilter(c3, 's1', sel, S, P, types)).toBe(false);
  });
});

describe('effectiveAxes', () => {
  const dim = (key: MatrixAxis, n: number, reorderable = false): AxisDim => ({
    key,
    label: key,
    reorderable,
    values: Array.from({ length: n }, (_, i) => ({ id: `${key}${i}`, label: `${key}${i}` })),
  });

  it('defaults to [section, product] when nothing requested', () => {
    const d = [dim('section', 2, true), dim('product', 3), dim('tag', 2)];
    expect(effectiveAxes(d, null, null).map((x) => x.key)).toEqual(['section', 'product']);
  });

  it('honors a valid distinct request', () => {
    const d = [dim('section', 2, true), dim('product', 3), dim('tag', 2)];
    expect(effectiveAxes(d, 'tag', 'section').map((x) => x.key)).toEqual(['tag', 'section']);
  });

  it('falls back to first two qualifying on duplicate axes', () => {
    const d = [dim('section', 2, true), dim('product', 3), dim('tag', 2)];
    expect(effectiveAxes(d, 'section', 'section').map((x) => x.key)).toEqual([
      'section',
      'product',
    ]);
  });

  it('falls back when a requested axis does not qualify', () => {
    const d = [dim('section', 2, true), dim('product', 1), dim('tag', 2)];
    expect(effectiveAxes(d, 'product', 'tag').map((x) => x.key)).toEqual(['section', 'tag']);
  });

  it('returns the requested/default axes when fewer than two qualify (degenerate)', () => {
    const d = [dim('section', 2, true), dim('product', 1), dim('tag', 1)];
    expect(effectiveAxes(d, null, null).map((x) => x.key)).toEqual(['section', 'product']);
    expect(effectiveAxes(d, 'tag', 'product').map((x) => x.key)).toEqual(['tag', 'product']);
  });
});