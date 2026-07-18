import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ServiceBar from './ServiceBar.svelte';
import type { Section, Card } from '../types';

function card(id: string, over: Partial<Card> = {}): Card {
  return { id, sectionId: 's1', position: 0, slots: [], ...over };
}

function sec(over: Partial<Section> = {}): Section {
  return { id: 's1', notebookId: 'nb1', name: 'Sec', position: 0, cards: [], ...over };
}

function baseState(over: Partial<{ q: string; showArch: boolean; archivedN: number; flipApplicable: boolean }> = {}) {
  return { q: '', showArch: false, archivedN: 0, flipApplicable: false, ...over };
}

function props(section: Section, mode: 'edit' | 'study', stateOver = {}) {
  return {
    section,
    mode,
    state: baseState(stateOver),
    onsearch: vi.fn(),
    ontogglearch: vi.fn(),
    onrun: vi.fn(),
  };
}

describe('ServiceBar — item selection & order', () => {
  it('renders nothing when no service is enabled', () => {
    const { container } = render(ServiceBar, { props: props(sec(), 'study') });
    expect(container.querySelector('.svcbar')).toBeNull();
  });

  it('renders only enabled services in v1 bar order (search, archive, then actions)', () => {
    const section = sec({ services: { reset: true, search: true, shuffle: true, archive: true } });
    const { container } = render(ServiceBar, { props: props(section, 'study') });
    const bar = container.querySelector('.svcbar');
    expect(bar).toBeInTheDocument();
    expect(container.querySelector('[data-svcsearch]')).toBeInTheDocument();
    expect(container.querySelector('[data-svcarch]')).toBeInTheDocument();
    // shuffle before reset; pin never in the bar
    const runs = [...container.querySelectorAll('[data-svcrun]')].map((b) => b.getAttribute('data-svcrun'));
    expect(runs).toEqual(['shuffle', 'reset']);
  });

  it('honours the section svcOrder override', () => {
    const section = sec({
      services: { search: true, shuffle: true, reset: true },
      svcOrder: ['reset', 'shuffle', 'search'],
    });
    const { container } = render(ServiceBar, { props: props(section, 'study') });
    const order = [...container.querySelectorAll('.svcbar > *')].map(
      (el) => el.getAttribute('data-svcrun') ?? (el.querySelector('[data-svcsearch]') ? 'search' : ''),
    );
    expect(order).toEqual(['reset', 'shuffle', 'search']);
  });

  it('hides flipAll when no card can flip, shows it when applicable', () => {
    const section = sec({ services: { flipAll: true }, cards: [card('c1')] });
    const off = render(ServiceBar, { props: props(section, 'study') });
    expect(off.container.querySelector('[data-svcrun="flipAll"]')).toBeNull();
    off.unmount();

    const flippable = sec({ services: { flipAll: true }, cards: [card('c1', { verbs: { flip: true } })] });
    const on = render(ServiceBar, { props: { ...props(flippable, 'study'), state: baseState({ flipApplicable: true }) } });
    expect(on.container.querySelector('[data-svcrun="flipAll"]')).toBeInTheDocument();
  });
});

describe('ServiceBar — study widgets', () => {
  it('search input reflects state.q and fires onsearch on input', async () => {
    const section = sec({ services: { search: true } });
    const p = props(section, 'study', { q: 'foo' });
    const { container } = render(ServiceBar, { props: p });
    const input = container.querySelector('[data-svcsearch]') as HTMLInputElement;
    expect(input.value).toBe('foo');
    await fireEvent.input(input, { target: { value: 'bar' } });
    expect(p.onsearch).toHaveBeenCalledWith('bar');
  });

  it('archive button shows the count badge and Archive/Archived label per showArch', () => {
    const section = sec({ services: { archive: true } });
    const live = render(ServiceBar, { props: { ...props(section, 'study'), state: baseState({ archivedN: 3 }) } });
    const btn = live.container.querySelector('[data-svcarch]') as HTMLElement;
    expect(btn.textContent).toContain('(3)');
    expect(btn.textContent).toContain('Archive');
    expect(btn.classList.contains('on')).toBe(false);
    live.unmount();

    const viewing = render(ServiceBar, { props: { ...props(section, 'study'), state: baseState({ showArch: true, archivedN: 3 }) } });
    const btn2 = viewing.container.querySelector('[data-svcarch]') as HTMLElement;
    expect(btn2.textContent).toContain('Archived');
    expect(btn2.classList.contains('on')).toBe(true);
  });

  it('archive button click fires ontogglearch', async () => {
    const section = sec({ services: { archive: true } });
    const p = props(section, 'study');
    const { container } = render(ServiceBar, { props: p });
    await fireEvent.click(container.querySelector('[data-svcarch]') as Element);
    expect(p.ontogglearch).toHaveBeenCalledTimes(1);
  });

  it('an action button fires onrun with its key', async () => {
    const section = sec({ services: { shuffle: true } });
    const p = props(section, 'study');
    const { container } = render(ServiceBar, { props: p });
    await fireEvent.click(container.querySelector('[data-svcrun="shuffle"]') as Element);
    expect(p.onrun).toHaveBeenCalledWith('shuffle');
  });
});

describe('ServiceBar — edit chips', () => {
  it('renders inert draggable chips, not live widgets', () => {
    const section = sec({ services: { search: true, archive: true, shuffle: true } });
    const { container } = render(ServiceBar, { props: props(section, 'edit') });
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('[data-svcarch]')).toBeNull();
    const chips = [...container.querySelectorAll('.svc-item')];
    expect(chips.length).toBe(3);
    for (const c of chips) {
      expect(c.getAttribute('draggable')).toBe('true');
      expect(c.hasAttribute('data-svcbtn')).toBe(true);
    }
  });
});
