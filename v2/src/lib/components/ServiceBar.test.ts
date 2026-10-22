import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ServiceBar from './ServiceBar.svelte';
import { _setElementFromPoint } from '../drag/engine';
import { applyZoom } from '../zoom';
import type { Section, Card } from '../types';

// jsdom has no PointerEvent; listeners key off the type string, so a MouseEvent stand-in works.
function pev(type: string, x = 0, y = 0): PointerEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }) as PointerEvent;
}

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
    view: baseState(stateOver),
    onsearch: vi.fn(),
    ontogglearch: vi.fn(),
    onrun: vi.fn(),
    onreorder: vi.fn(),
    onresize: vi.fn(),
    onremove: vi.fn(),
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
    const on = render(ServiceBar, { props: { ...props(flippable, 'study'), view: baseState({ flipApplicable: true }) } });
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
    const live = render(ServiceBar, { props: { ...props(section, 'study'), view: baseState({ archivedN: 3 }) } });
    const btn = live.container.querySelector('[data-svcarch]') as HTMLElement;
    expect(btn.textContent).toContain('(3)');
    expect(btn.textContent).toContain('Archive');
    expect(btn.classList.contains('on')).toBe(false);
    live.unmount();

    const viewing = render(ServiceBar, { props: { ...props(section, 'study'), view: baseState({ showArch: true, archivedN: 3 }) } });
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
  // jsdom's real elementFromPoint throws; every drag runs on the injected hit-test seam.
  beforeEach(() => _setElementFromPoint(() => null));
  afterEach(() => {
    document.dispatchEvent(pev('pointercancel'));
    document.dispatchEvent(pev('pointerup'));
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })); // flush a live click suppressor
    _setElementFromPoint(null);
    applyZoom(1);
    document.body.innerHTML = '';
  });

  it('renders pointer-drag chips with resize handles, not native draggable or live widgets', () => {
    const section = sec({ services: { search: true, archive: true, shuffle: true } });
    const { container } = render(ServiceBar, { props: props(section, 'edit') });
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('[data-svcarch]')).toBeNull();
    const chips = [...container.querySelectorAll('.svc-item')];
    expect(chips.length).toBe(3);
    for (const c of chips) {
      expect(c.hasAttribute('draggable')).toBe(false);
      expect(c.hasAttribute('data-svcbtn')).toBe(true);
      expect(c.querySelector('[data-svcrz]')).toBeInTheDocument();
    }
  });

  it('resize handles are edit-only', () => {
    const section = sec({ services: { shuffle: true } });
    const { container } = render(ServiceBar, { props: props(section, 'study') });
    expect(container.querySelector('[data-svcrz]')).toBeNull();
  });

  it('a chip drag reorders and suppresses the trailing click (no chip action fires)', () => {
    const section = sec({ services: { search: true, shuffle: true } });
    const p = props(section, 'edit');
    const { container } = render(ServiceBar, { props: p });
    const search = container.querySelector('[data-svcbtn="search"]') as HTMLElement;
    const shuffle = container.querySelector('[data-svcbtn="shuffle"]') as HTMLElement;
    // Drop lands on the shuffle chip inside the bar.
    _setElementFromPoint(() => shuffle);

    search.dispatchEvent(pev('pointerdown', 0, 0));
    document.dispatchEvent(pev('pointermove', 40, 0)); // past the 5px threshold -> drag begins
    document.dispatchEvent(pev('pointerup', 40, 0));
    expect(p.onreorder).toHaveBeenCalledTimes(1);
    expect(p.onreorder.mock.calls[0][0]).toBe(0); // 'search' is bar index 0

    // The engine armed a capture-phase click suppressor: the post-drag click must not reach the chip.
    const clicked = vi.fn();
    search.addEventListener('click', clicked);
    search.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(clicked).not.toHaveBeenCalled();
  });

  it('dragging the resize handle commits a floored width via onresize', () => {
    const section = sec({ services: { shuffle: true } });
    const p = props(section, 'edit');
    const { container } = render(ServiceBar, { props: p });
    const handle = container.querySelector('[data-svcrz="shuffle"]') as HTMLElement;
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, bubbles: true, cancelable: true }));
    // jsdom has no layout, so startW is 0: dx=120 -> 120, dx=-500 clamps to the v1 70px floor.
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: -500, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: -500, bubbles: true }));
    expect(p.onresize).toHaveBeenCalledWith('shuffle', 70);
  });

  it('clamps the resize width at the v1 440px ceiling', () => {
    const section = sec({ services: { shuffle: true } });
    const p = props(section, 'edit');
    const { container } = render(ServiceBar, { props: p });
    const handle = container.querySelector('[data-svcrz="shuffle"]') as HTMLElement;
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 900, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 900, bubbles: true }));
    expect(p.onresize).toHaveBeenCalledWith('shuffle', 440);
  });

  // The committed width becomes `width:${w}px` inside the zoomed <body>: a viewport-space number
  // written there would store — and render — the chip `zoom` times too wide.
  it('commits a logical width when the app is zoomed', async () => {
    applyZoom(1.5);
    const section = sec({ services: { shuffle: true } });
    const p = props(section, 'edit');
    const { container } = render(ServiceBar, { props: p });
    const handle = container.querySelector('[data-svcrz="shuffle"]') as HTMLElement;
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, bubbles: true, cancelable: true }));
    // jsdom has no layout, so startW is 0: 300px of cursor travel is 200px of chip.
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, bubbles: true, cancelable: true }));
    await tick();
    const live = container.querySelector('[data-svcbtn="shuffle"]') as HTMLElement;
    expect(live.style.width).toBe('200px');
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 300, bubbles: true }));
    expect(p.onresize).toHaveBeenCalledWith('shuffle', 200);
  });

  it('applies a persisted svcW as an inline width in study mode too', () => {
    const section = sec({ services: { shuffle: true }, svcW: { shuffle: 180 } });
    const { container } = render(ServiceBar, { props: props(section, 'study') });
    const btn = container.querySelector('[data-svcrun="shuffle"]') as HTMLElement;
    expect(btn.style.width).toBe('180px');
  });
});
