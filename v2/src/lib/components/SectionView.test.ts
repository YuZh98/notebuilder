import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import SectionView from './SectionView.svelte';
import { mode } from '../stores/mode';
import { session, resetSession } from '../session.svelte';
import type { Notebook, Section, Card } from '../types';

const cardView = createRawSnippet<[Section, Card, boolean]>((_section, card) => ({
  render: () => `<div class="t-card" data-card="${card().id}"></div>`,
}));

function card(id: string, over: Partial<Card> = {}): Card {
  return { id, sectionId: 's1', position: 0, slots: [], ...over };
}

function sec(over: Partial<Section> = {}): Section {
  return { id: 's1', notebookId: 'nb1', name: 'Sec', position: 0, cards: [], ...over };
}

function nbOf(sections: Section[]): Notebook {
  return { id: 'nb1', name: 'H', createdAt: 'x', updatedAt: 'x', sections };
}

function baseProps(section: Section) {
  return {
    section,
    notebook: nbOf([section]),
    visibleCardIds: null as Set<string> | null,
    selected: false,
    onselect: vi.fn(),
    onpatch: vi.fn(),
    collapsed: false,
    ontogglecollapse: vi.fn(),
    cardView,
  };
}

function dt(map: Record<string, string>) {
  return { types: Object.keys(map), getData: (k: string) => map[k] ?? '', setData: () => {}, dropEffect: 'none' };
}

beforeEach(() => resetSession());
afterEach(() => {
  resetSession();
  mode.set('edit');
});

describe('SectionView — service bar mount', () => {
  it('renders enabled bar chips in Edit mode', () => {
    const section = sec({ services: { search: true, shuffle: true } });
    const { container } = render(SectionView, { props: baseProps(section) });
    expect(container.querySelector('.svcbar')).toBeInTheDocument();
    expect(container.querySelectorAll('.svc-item[data-svcbtn]')).toHaveLength(2);
  });

  it('renders live study widgets when studying', () => {
    mode.set('study');
    const section = sec({ services: { search: true, archive: true }, cards: [card('c1')] });
    const { container } = render(SectionView, { props: baseProps(section) });
    expect(container.querySelector('[data-svcsearch="s1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-svcarch="s1"]')).toBeInTheDocument();
  });

  it('hides the bar while a section is collapsed in Study', () => {
    mode.set('study');
    const section = sec({ services: { search: true }, cards: [card('c1')] });
    const { container } = render(SectionView, { props: { ...baseProps(section), collapsed: true } });
    expect(container.querySelector('.svcbar')).toBeNull();
  });
});

describe('SectionView — study card list composition', () => {
  it('live search filters the grid to matching cards', () => {
    mode.set('study');
    const section = sec({
      services: { search: true },
      cards: [
        card('c1', { slots: [{ id: 's', type: 'text', props: { text: 'apple' } }] }),
        card('c2', { slots: [{ id: 's', type: 'text', props: { text: 'banana' } }] }),
      ],
    });
    session.search['s1'] = 'banana';
    const { container } = render(SectionView, { props: baseProps(section) });
    expect(container.querySelector('[data-card="c1"]')).toBeNull();
    expect(container.querySelector('[data-card="c2"]')).toBeInTheDocument();
  });

  it('archive view swaps the grid to archived cards only', async () => {
    mode.set('study');
    const section = sec({
      services: { archive: true },
      cards: [card('c1'), card('c2', { archived: true })],
    });
    const { container } = render(SectionView, { props: baseProps(section) });
    // live view: non-archived only
    expect(container.querySelector('[data-card="c1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-card="c2"]')).toBeNull();

    session.showArch['s1'] = true;
    await tick();
    expect(container.querySelector('[data-card="c1"]')).toBeNull();
    expect(container.querySelector('[data-card="c2"]')).toBeInTheDocument();
  });

  it('composes shuffle order with the matrix filter', () => {
    mode.set('study');
    const section = sec({ cards: [card('c1'), card('c2'), card('c3')] });
    session.shuf['s1'] = ['c3', 'c1', 'c2'];
    const { container } = render(SectionView, {
      props: { ...baseProps(section), visibleCardIds: new Set(['c1', 'c3']) },
    });
    const ids = [...container.querySelectorAll('[data-card]')].map((el) => el.getAttribute('data-card'));
    expect(ids).toEqual(['c3', 'c1']);
  });
});

describe('SectionView — Edit-mode matrix filter', () => {
  it('filters the Edit grid by visibleCardIds (search/archive stay Study-only)', () => {
    const section = sec({ cards: [card('c1'), card('c2'), card('c3')] });
    const { container } = render(SectionView, {
      props: { ...baseProps(section), visibleCardIds: new Set(['c1', 'c3']) },
    });
    expect(container.querySelector('[data-card="c1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-card="c2"]')).toBeNull();
    expect(container.querySelector('[data-card="c3"]')).toBeInTheDocument();
  });

  it('null filter shows all cards in Edit', () => {
    const section = sec({ cards: [card('c1'), card('c2')] });
    const { container } = render(SectionView, { props: baseProps(section) });
    expect(container.querySelectorAll('[data-card]')).toHaveLength(2);
  });
});

describe('SectionView — native service drop', () => {
  it('a text/nb-svc drop on the section body fires onsvcattach with the key', async () => {
    const section = sec();
    const onsvcattach = vi.fn();
    const { container } = render(SectionView, { props: { ...baseProps(section), onsvcattach } });
    const room = container.querySelector('[data-section="s1"]') as HTMLElement;
    await fireEvent.drop(room, { dataTransfer: dt({ 'text/nb-svc': 'shuffle' }) });
    expect(onsvcattach).toHaveBeenCalledWith('shuffle');
  });

  it('ignores a drop that carries no service payload', async () => {
    const section = sec();
    const onsvcattach = vi.fn();
    const { container } = render(SectionView, { props: { ...baseProps(section), onsvcattach } });
    const room = container.querySelector('[data-section="s1"]') as HTMLElement;
    await fireEvent.drop(room, { dataTransfer: dt({ 'text/nb-slot': 'text' }) });
    expect(onsvcattach).not.toHaveBeenCalled();
  });
});

describe('SectionView — study action run', () => {
  it('an action button fires onsvcrun with its key', async () => {
    mode.set('study');
    const section = sec({ services: { shuffle: true }, cards: [card('c1')] });
    const onsvcrun = vi.fn();
    const { container } = render(SectionView, { props: { ...baseProps(section), onsvcrun } });
    await fireEvent.click(container.querySelector('[data-svcrun="shuffle"]') as Element);
    expect(onsvcrun).toHaveBeenCalledWith('shuffle');
  });

  it('typing in the search input writes session.search', async () => {
    mode.set('study');
    const section = sec({ services: { search: true }, cards: [card('c1')] });
    const { container } = render(SectionView, { props: baseProps(section) });
    const input = container.querySelector('[data-svcsearch="s1"]') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'hello' } });
    expect(session.search['s1']).toBe('hello');
  });
});
