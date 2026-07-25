import { describe, it, expect } from 'vitest';
import { visibleSections, visibleSectionCards, shuffledCards, type SectionView } from './visible-cards';
import type { Card, Notebook, Section } from './types';

const OPEN: SectionView = { search: '', showArch: false, shuffle: null, collapsed: false };

function card(id: string, over: Partial<Card> = {}): Card {
  return { id, sectionId: 's1', position: 0, slots: [], ...over };
}

function section(id: string, cards: Card[], over: Partial<Section> = {}): Section {
  return { id, notebookId: 'nb1', name: id, position: 0, cards, ...over };
}

function notebook(sections: Section[]): Notebook {
  return { id: 'nb1', name: 'nb', createdAt: '2026-01-01', updatedAt: '2026-01-01', sections };
}

const ids = (cards: Card[]) => cards.map((c) => c.id);

describe('shuffledCards', () => {
  it('keeps stored order without a shuffle', () => {
    const s = section('s1', [card('a'), card('b')]);
    expect(ids(shuffledCards(s, null))).toEqual(['a', 'b']);
  });

  it('follows the shuffle order', () => {
    const s = section('s1', [card('a'), card('b'), card('c')]);
    expect(ids(shuffledCards(s, ['c', 'a', 'b']))).toEqual(['c', 'a', 'b']);
  });
});

describe('visibleSections', () => {
  it('keeps every section when nothing filters', () => {
    const nb = notebook([section('s1', [card('a')]), section('s2', [card('b')])]);
    expect(visibleSections(nb, true, null).map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('a folded chapter divider swallows its sections until the next divider', () => {
    const nb = notebook([
      section('d1', [], { kind: 'divider', folded: true }),
      section('s1', [card('a')]),
      section('d2', [], { kind: 'divider' }),
      section('s2', [card('b')]),
    ]);
    expect(visibleSections(nb, true, null).map((s) => s.id)).toEqual(['d1', 'd2', 's2']);
  });

  it('the matrix filter drops sections with no matching card, in both modes', () => {
    const nb = notebook([section('s1', [card('a')]), section('s2', [card('b')])]);
    for (const studying of [true, false]) {
      expect(visibleSections(nb, studying, new Set(['b'])).map((s) => s.id)).toEqual(['s2']);
    }
  });

  it('Study hides a section that would render as nothing; Edit keeps it', () => {
    const nb = notebook([section('s1', [])]);
    expect(visibleSections(nb, true, null)).toEqual([]);
    expect(visibleSections(nb, false, null).map((s) => s.id)).toEqual(['s1']);
    const titled = notebook([section('s1', [], { title: 'Intro' })]);
    expect(visibleSections(titled, true, null).map((s) => s.id)).toEqual(['s1']);
  });
});

describe('visibleSectionCards', () => {
  const s = () =>
    section('s1', [
      card('a', { slots: [{ id: 'a1', type: 'text', props: { text: 'alpha' } }] }),
      card('b', { slots: [{ id: 'b1', type: 'text', props: { text: 'beta' } }] }),
      card('z', { archived: true, slots: [{ id: 'z1', type: 'text', props: { text: 'zeta' } }] }),
    ]);

  it('Edit shows every card, matrix filter aside', () => {
    expect(ids(visibleSectionCards(s(), false, OPEN, null))).toEqual(['a', 'b', 'z']);
    expect(ids(visibleSectionCards(s(), false, OPEN, new Set(['b'])))).toEqual(['b']);
  });

  it('Study hides archived cards, and the archive view shows only those', () => {
    expect(ids(visibleSectionCards(s(), true, OPEN, null))).toEqual(['a', 'b']);
    expect(ids(visibleSectionCards(s(), true, { ...OPEN, showArch: true }, null))).toEqual(['z']);
  });

  it('applies the section search', () => {
    expect(ids(visibleSectionCards(s(), true, { ...OPEN, search: 'beta' }, null))).toEqual(['b']);
  });

  it('renders in shuffle order', () => {
    expect(ids(visibleSectionCards(s(), true, { ...OPEN, shuffle: ['b', 'a'] }, null))).toEqual([
      'b',
      'a',
    ]);
  });

  it('renders nothing while the section is collapsed in Study', () => {
    expect(visibleSectionCards(s(), true, { ...OPEN, collapsed: true }, null)).toEqual([]);
    // Collapse is Study-only chrome — Edit ignores it.
    expect(ids(visibleSectionCards(s(), false, { ...OPEN, collapsed: true }, null))).toEqual([
      'a',
      'b',
      'z',
    ]);
  });

  it('intersects the matrix filter with the study filters', () => {
    expect(ids(visibleSectionCards(s(), true, OPEN, new Set(['b', 'z'])))).toEqual(['b']);
  });

  it('a divider holds no cards', () => {
    expect(visibleSectionCards(section('d', [card('a')], { kind: 'divider' }), true, OPEN, null)).toEqual(
      [],
    );
  });
});
