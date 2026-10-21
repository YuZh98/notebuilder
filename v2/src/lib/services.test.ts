// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  SERVICE_FEATURES,
  SERVICE_ACTIONS,
  SERVICE_ORDER,
  svcBarItems,
  reorderSvc,
  flipAllApplicable,
  cardMatchesSearch,
} from './services';
import type { Section, Card } from './types';

function section(over: Partial<Section> = {}): Section {
  return { id: 's1', notebookId: 'nb1', name: 'S', position: 0, cards: [], ...over };
}

function card(over: Partial<Card> = {}): Card {
  return { id: 'c1', sectionId: 's1', position: 0, slots: [], ...over };
}

describe('service registry (D4 split)', () => {
  it('features and actions cover the v1 six keys with v1 icons/labels, plus v2 notes', () => {
    expect(SERVICE_FEATURES).toEqual([
      { key: 'pin', label: 'Pin', icon: '📌' },
      { key: 'search', label: 'Search', icon: '🔎' },
      { key: 'archive', label: 'Archive', icon: '🗄' },
      { key: 'notes', label: 'Notes', icon: '✎' },
    ]);
    expect(SERVICE_ACTIONS).toEqual([
      { key: 'shuffle', label: 'Shuffle', icon: '🔀' },
      { key: 'flipAll', label: 'Flip all', icon: '⟳' },
      { key: 'reset', label: 'Reset', icon: '↺' },
    ]);
  });

  it('registry order matches v1 40-services declaration order', () => {
    expect(SERVICE_ORDER).toEqual([
      'pin',
      'shuffle',
      'flipAll',
      'reset',
      'search',
      'archive',
      'notes',
    ]);
  });

  it('the six keys are split with no overlap and no extras', () => {
    const keys = [...SERVICE_FEATURES, ...SERVICE_ACTIONS].map((s) => s.key).sort();
    expect(keys).toEqual([...SERVICE_ORDER].sort());
  });
});

describe('svcBarItems', () => {
  it('is empty when no services enabled and never includes pin', () => {
    expect(svcBarItems(section())).toEqual([]);
    expect(svcBarItems(section({ services: { pin: true } }))).toEqual([]);
  });

  it('returns enabled keys in default order search → archive → shuffle → flipAll → reset', () => {
    const s = section({
      services: { reset: true, search: true, flipAll: true, archive: true, shuffle: true, pin: true },
    });
    expect(svcBarItems(s)).toEqual(['search', 'archive', 'shuffle', 'flipAll', 'reset']);
  });

  it('filters to only enabled services', () => {
    expect(svcBarItems(section({ services: { search: true, reset: true } }))).toEqual([
      'search',
      'reset',
    ]);
  });

  it('respects svcOrder override, keeping omitted items in default order at the tail', () => {
    const s = section({
      services: { search: true, archive: true, shuffle: true },
      svcOrder: ['shuffle', 'search'],
    });
    expect(svcBarItems(s)).toEqual(['shuffle', 'search', 'archive']);
  });

  it('ignores unknown keys in svcOrder', () => {
    const s = section({
      services: { search: true, reset: true },
      svcOrder: ['bogus', 'reset', 'search'],
    });
    expect(svcBarItems(s)).toEqual(['reset', 'search']);
  });
});

describe('flipAllApplicable', () => {
  it('is true only when some card has a flip face', () => {
    expect(flipAllApplicable(section({ cards: [card()] }))).toBe(false);
    expect(flipAllApplicable(section({ cards: [card({ verbs: { flip: true } })] }))).toBe(true);
  });
});

describe('cardMatchesSearch', () => {
  it('empty query matches anything', () => {
    expect(cardMatchesSearch(card(), '')).toBe(true);
  });

  it('matches slot prop text case-insensitively', () => {
    const c = card({ slots: [{ id: 's', type: 'text', props: { text: 'Photosynthesis' } }] });
    expect(cardMatchesSearch(c, 'synth')).toBe(true);
    expect(cardMatchesSearch(c, 'SYNTH')).toBe(true);
    expect(cardMatchesSearch(c, 'mitosis')).toBe(false);
  });

  it('matches back-face content', () => {
    const c = card({
      slots: [{ id: 's', type: 'text', props: { text: 'front' } }],
      back: [{ id: 'b', type: 'text', props: { text: 'chloroplast' } }],
    });
    expect(cardMatchesSearch(c, 'chloroplast')).toBe(true);
  });

  it('matches tags', () => {
    const c = card({ tags: ['biology', 'unit-3'] });
    expect(cardMatchesSearch(c, 'unit-3')).toBe(true);
  });
});

describe('reorderSvc (v1 splice-before-target)', () => {
  const bar = ['search', 'archive', 'shuffle', 'reset'];

  it('moves a middle item to the front (no svcOrder yet)', () => {
    expect(reorderSvc(undefined, bar, 2, 0)).toEqual(['shuffle', 'search', 'archive', 'reset']);
  });

  it('appends when the drop index is past the last item', () => {
    expect(reorderSvc(undefined, bar, 0, 3)).toEqual(['archive', 'shuffle', 'reset', 'search']);
  });

  it('inserts before the item at the drop index', () => {
    expect(reorderSvc(undefined, bar, 0, 1)).toEqual(['archive', 'search', 'shuffle', 'reset']);
  });

  it('starts from svcOrder and preserves keys not in the bar', () => {
    const order = ['pin', 'search', 'archive', 'shuffle', 'reset'];
    expect(reorderSvc(order, bar, 3, 0)).toEqual(['pin', 'reset', 'search', 'archive', 'shuffle']);
  });

  it('returns a fresh copy of the base order when from is out of range', () => {
    const out = reorderSvc(undefined, bar, 9, 0);
    expect(out).toEqual(bar);
    expect(out).not.toBe(bar);
  });
});