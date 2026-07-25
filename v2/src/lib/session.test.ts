import { describe, it, expect, beforeEach } from 'vitest';
import { session, sessionView, shuffleSection, clearShuffle, resetSession } from './session.svelte';
import type { Section, Card } from './types';

function card(id: string): Card {
  return { id, sectionId: 's1', position: 0, slots: [] };
}

function section(cards: Card[]): Section {
  return { id: 's1', notebookId: 'nb1', name: 'S', position: 0, cards };
}

beforeEach(() => resetSession());

describe('shuffleSection', () => {
  it('stores a permutation of the section card ids', () => {
    const s = section([card('a'), card('b'), card('c'), card('d')]);
    shuffleSection(s);
    const order = session.shuf['s1'];
    expect([...order].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('hands the order to the render view', () => {
    session.shuf['s1'] = ['c', 'a', 'b'];
    expect(sessionView('s1').shuffle).toEqual(['c', 'a', 'b']);
  });
});

describe('clearShuffle', () => {
  it('drops the shuffle, so the view falls back to stored order', () => {
    session.shuf['s1'] = ['b', 'a'];
    clearShuffle('s1');
    expect(session.shuf['s1']).toBeUndefined();
    expect(sessionView('s1').shuffle).toBeNull();
  });
});

describe('sessionView', () => {
  it('reads the four per-section fields, with defaults for an untouched section', () => {
    expect(sessionView('s1')).toEqual({
      search: '',
      showArch: false,
      shuffle: null,
      collapsed: false,
    });
    session.search['s1'] = 'beta';
    session.showArch['s1'] = true;
    session.collapsed['s1'] = true;
    session.shuf['s1'] = ['b', 'a'];
    expect(sessionView('s1')).toEqual({
      search: 'beta',
      showArch: true,
      shuffle: ['b', 'a'],
      collapsed: true,
    });
  });
});

describe('resetSession', () => {
  it('wipes all five maps', () => {
    session.shuf['s1'] = ['a'];
    session.search['s1'] = 'q';
    session.showArch['s1'] = true;
    session.collapsed['s1'] = true;
    session.live['c1'] = { rate: 80 };
    resetSession();
    expect(session.shuf).toEqual({});
    expect(session.search).toEqual({});
    expect(session.showArch).toEqual({});
    expect(session.collapsed).toEqual({});
    expect(session.live).toEqual({});
  });
});

describe('session.live (v1 LIVE layer)', () => {
  it('holds per-card scope values keyed by variable name', () => {
    session.live['c1'] = { rate: 80 };
    expect(session.live['c1'].rate).toBe(80);
  });
});
