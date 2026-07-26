import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import SectionView from './SectionView.svelte';
import { mode } from '../stores/mode';
import { session, resetSession } from '../session.svelte';
import { applyZoom } from '../zoom';
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

// The room width is committed into the section document and rendered as `width:${w}px` inside the
// zoomed <body>, so a viewport-space number would both mis-draw the room and persist corrupted.
describe('SectionView — room resize under app zoom', () => {
  function stubRect(el: Element, width: number) {
    (el as HTMLElement).getBoundingClientRect = () =>
      ({ left: 0, top: 0, width, height: 100, right: width, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  }

  function dragEdge(container: HTMLElement, roomWidth: number, shellWidth: number, toX: number) {
    const room = container.querySelector('.room') as HTMLElement;
    stubRect(room, roomWidth);
    if (room.parentElement) stubRect(room.parentElement, shellWidth);
    const handle = container.querySelector('.rz.room-edge') as HTMLElement;
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: toX, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: toX, bubbles: true }));
  }

  afterEach(() => applyZoom(1));

  it('commits the width the cursor drew at zoom 1', () => {
    const section = sec({ cards: [card('c1')] });
    const p = baseProps(section);
    const { container } = render(SectionView, { props: p });
    dragEdge(container, 600, 1200, 300);
    expect(p.onpatch).toHaveBeenCalledWith({ width: 900 });
  });

  it('commits a logical width when the app is zoomed', () => {
    applyZoom(1.5);
    const section = sec({ cards: [card('c1')] });
    const p = baseProps(section);
    const { container } = render(SectionView, { props: p });
    // The room reads 600 viewport px (400 logical) and the cursor travels 300 (200 logical).
    dragEdge(container, 600, 1200, 300);
    expect(p.onpatch).toHaveBeenCalledWith({ width: 600 });
  });

  it('clamps against the shell width in the same space', () => {
    applyZoom(1.5);
    const section = sec({ cards: [card('c1')] });
    const p = baseProps(section);
    const { container } = render(SectionView, { props: p });
    // Shell is 1200 viewport px = 800 logical: the ceiling is 800, not 1200.
    dragEdge(container, 600, 1200, 3000);
    expect(p.onpatch).toHaveBeenCalledWith({ width: 800 });
  });
});
