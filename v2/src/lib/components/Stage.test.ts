import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import Stage from './Stage.svelte';
import { mode } from '../stores/mode';
import type { Notebook, Section, Card } from '../types';

const cardView = createRawSnippet<[Section, Card, boolean]>((_section, card, editable) => ({
  render: () =>
    `<div class="t-card" data-card="${card().id}" data-editable="${String(editable())}"></div>`,
}));

function sec(id: string, over: Partial<Section> = {}): Section {
  return { id, notebookId: 'nb1', name: `name-${id}`, position: 0, cards: [], ...over };
}

function card(id: string, sectionId: string): Card {
  return { id, sectionId, position: 0, slots: [] };
}

function nbOf(sections: Section[]): Notebook {
  return {
    id: 'nb1',
    name: 'My House',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    sections,
  };
}

function patchSection(section: Section, patch: Partial<Section>) {
  const target = section as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete target[key];
    else target[key] = value;
  }
}

function baseProps(notebook: Notebook) {
  return {
    notebook,
    visibleCardIds: null,
    selSection: null,
    onselect: vi.fn(),
    onrename: vi.fn(),
    onsubtitle: vi.fn(),
    onpatchsection: patchSection,
    cardView,
  };
}

function chapteredNotebook(): Notebook {
  return nbOf([
    sec('s1', { cards: [card('c1', 's1')] }),
    sec('d1', { kind: 'divider', folded: true }),
    sec('s2', { cards: [card('c2', 's2')] }),
    sec('s3', { cards: [card('c3', 's3')] }),
    sec('d2', { kind: 'divider' }),
    sec('s4', { cards: [card('c4', 's4')] }),
  ]);
}

afterEach(() => mode.set('edit'));

describe('Stage — chapter folding', () => {
  it('a folded divider hides its sections until the next divider', () => {
    const { container } = render(Stage, { props: baseProps(chapteredNotebook()) });

    expect(container.querySelector('[data-card="c1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-card="c2"]')).toBeNull();
    expect(container.querySelector('[data-card="c3"]')).toBeNull();
    expect(container.querySelector('[data-card="c4"]')).toBeInTheDocument();
    expect(container.querySelectorAll('.room.divider')).toHaveLength(2);
  });

  it('a folded divider shows a section-count badge; an open one does not', () => {
    const { container } = render(Stage, { props: baseProps(chapteredNotebook()) });

    const [d1, d2] = Array.from(container.querySelectorAll('.room.divider'));
    expect(d1.textContent).toContain('2 sections');
    expect(d2.textContent).not.toContain('section');
  });

  it('the divider chevron unfolds the chapter and drops the badge', async () => {
    const { container } = render(Stage, { props: baseProps(chapteredNotebook()) });

    expect(container.querySelector('[data-card="c2"]')).toBeNull();
    const chev = container.querySelector('.room.divider .rcollapse');
    expect(chev).not.toBeNull();
    await fireEvent.click(chev as Element);

    expect(container.querySelector('[data-card="c2"]')).toBeInTheDocument();
    expect(container.querySelector('[data-card="c3"]')).toBeInTheDocument();
    const [d1] = Array.from(container.querySelectorAll('.room.divider'));
    expect(d1.textContent).not.toContain('2 sections');
  });
});

describe('Stage — locked sections', () => {
  it('locked section suppresses edit affordances and shows the lock meta', () => {
    const nb = nbOf([
      sec('s1', { locked: true, title: 'Locked title', cards: [card('c1', 's1')] }),
      sec('s2', { cards: [card('c2', 's2')] }),
    ]);
    const { container } = render(Stage, { props: baseProps(nb) });

    expect(container.querySelector('[data-card="c1"]')?.getAttribute('data-editable')).toBe('false');
    expect(container.querySelector('[data-card="c2"]')?.getAttribute('data-editable')).toBe('true');

    const locked = container.querySelector('[data-section="s1"]');
    expect(locked?.querySelector('.room-meta')?.textContent).toContain('locked');
    expect(locked?.querySelector('.room-lock')).toHaveClass('on');
    // titles are static, not click-to-edit
    expect(locked?.querySelector('.room-bar .ceview')).toBeNull();
    expect(container.querySelector('[data-section="s2"] .room-bar .ceview')).not.toBeNull();
  });

  it('locked empty section shows the "locked" empty state', () => {
    const nb = nbOf([sec('s1', { locked: true })]);
    const { container } = render(Stage, { props: baseProps(nb) });
    expect(container.querySelector('.empty')?.textContent?.trim()).toBe('locked');
  });

  it('the lock button toggles a section into the locked state', async () => {
    const nb = nbOf([sec('s1', { cards: [card('c1', 's1')] })]);
    const { container } = render(Stage, { props: baseProps(nb) });

    expect(container.querySelector('.room-bar .ceview')).not.toBeNull();
    await fireEvent.click(container.querySelector('.room-lock') as Element);

    expect(container.querySelector('.room-lock')).toHaveClass('on');
    expect(container.querySelector('.room-bar .ceview')).toBeNull();
    expect(container.querySelector('.room-meta')?.textContent).toContain('locked');
  });
});

describe('Stage — Study mode', () => {
  it('per-section collapse hides the card grid without touching section.folded', async () => {
    mode.set('study');
    const nb = nbOf([sec('s1', { title: 'Room', cards: [card('c1', 's1')] })]);
    const { container } = render(Stage, { props: baseProps(nb) });

    expect(container.querySelector('[data-card="c1"]')).toBeInTheDocument();
    await fireEvent.click(container.querySelector('.room .rcollapse') as Element);

    expect(container.querySelector('[data-card="c1"]')).toBeNull();
    expect(container.querySelector('.room-grid')).toBeNull();
    expect(nb.sections[0].folded).toBeUndefined();
  });

  it('matrix filter hides non-matching cards and fully filtered sections', () => {
    mode.set('study');
    const nb = nbOf([
      sec('s1', { cards: [card('c1', 's1'), card('c2', 's1')] }),
      sec('s2', { cards: [card('c3', 's2')] }),
    ]);
    const { container } = render(Stage, {
      props: { ...baseProps(nb), visibleCardIds: new Set(['c1']) },
    });

    expect(container.querySelector('[data-card="c1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-card="c2"]')).toBeNull();
    expect(container.querySelector('[data-section="s2"]')).toBeNull();
  });

  it('renders the static house header with subtitle', () => {
    mode.set('study');
    const nb = nbOf([sec('s1', { cards: [card('c1', 's1')] })]);
    nb.subtitle = 'A **bold** sub';
    const { container } = render(Stage, { props: baseProps(nb) });

    expect(container.querySelector('.house-title')?.textContent).toContain('🏠 My House');
    expect(container.querySelector('.house-sub b')?.textContent).toBe('bold');
    expect(container.querySelector('.ceview')).toBeNull();
  });
});

// jsdom has no PointerEvent; listeners key off the type string, so a MouseEvent stand-in works.
function pev(type: string, x: number, y = 0): PointerEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }) as PointerEvent;
}

// jsdom has no layout: rect-dependent gesture math reads getBoundingClientRect, stubbed here.
function stubWidth(el: Element, width: number) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

describe('Stage — section grip (engine drag affordance)', () => {
  it('renders data-roomgrip on rooms and dividers in Edit, never in Study', () => {
    const nb = nbOf([sec('s1'), sec('d1', { kind: 'divider' })]);
    const { container, unmount } = render(Stage, { props: baseProps(nb) });
    expect(container.querySelector('[data-section="s1"] [data-roomgrip="s1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-section="d1"] [data-roomgrip="d1"]')).toBeInTheDocument();
    expect(container.querySelector('[draggable]')).toBeNull();
    unmount();

    mode.set('study');
    const study = render(Stage, { props: baseProps(nbOf([sec('s1', { cards: [card('c1', 's1')] })])) });
    expect(study.container.querySelector('[data-roomgrip]')).toBeNull();
  });

  it('grip pointerdown fires onsectiongrip with the section and its .room element', async () => {
    const nb = nbOf([sec('s1'), sec('s2')]);
    const onsectiongrip = vi.fn();
    const { container } = render(Stage, { props: { ...baseProps(nb), onsectiongrip } });
    const grip = container.querySelector('[data-roomgrip="s2"]') as HTMLElement;
    const down = pev('pointerdown', 3, 3);
    await fireEvent(grip, down);
    expect(onsectiongrip).toHaveBeenCalledTimes(1);
    const [section, ev, el] = onsectiongrip.mock.calls[0] as [Section, PointerEvent, HTMLElement];
    expect(section.id).toBe('s2');
    expect(ev).toBe(down);
    expect(ev.defaultPrevented).toBe(true);
    expect(el).toBe(container.querySelector('[data-section="s2"]'));
  });
});

describe('Stage — section width resize (data-roomrz)', () => {
  function setup(width?: number) {
    const nb = nbOf([sec('s1', width !== undefined ? { width } : {}), sec('d1', { kind: 'divider' })]);
    // render() wraps props in $state, so model writes land on the proxy — record the
    // patches themselves and let patchSection apply them for the DOM assertions.
    const patches: Partial<Section>[] = [];
    const { container } = render(Stage, {
      props: {
        ...baseProps(nb),
        onpatchsection: (s: Section, p: Partial<Section>) => {
          patches.push(p);
          patchSection(s, p);
        },
      },
    });
    const room = container.querySelector('[data-section="s1"]') as HTMLElement;
    stubWidth(room, 400);
    stubWidth(room.parentElement as HTMLElement, 1000); // the .card-shell
    const rz = room.querySelector('[data-roomrz="s1"]') as HTMLElement;
    return { nb, patches, container, room, rz };
  }

  it('renders the handle on rooms only, in Edit only', () => {
    const { container, unmount } = render(Stage, {
      props: baseProps(nbOf([sec('s1'), sec('d1', { kind: 'divider' })])),
    });
    expect(container.querySelector('[data-section="s1"] [data-roomrz="s1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-section="d1"] [data-roomrz]')).toBeNull();
    unmount();

    mode.set('study');
    const study = render(Stage, { props: baseProps(nbOf([sec('s1', { cards: [card('c1', 's1')] })])) });
    expect(study.container.querySelector('[data-roomrz]')).toBeNull();
  });

  it('live-updates the room width while dragging, commits section.width on up (v1 :157)', async () => {
    const { patches, room, rz } = setup();
    await fireEvent(rz, pev('pointerdown', 500));
    document.dispatchEvent(pev('pointermove', 700)); // dx=200 → 400+200
    await tick();
    expect(room.style.width).toBe('600px');
    expect(patches).toEqual([]); // live preview never touches the model

    document.dispatchEvent(pev('pointerup', 700));
    await tick();
    expect(patches).toEqual([{ width: 600 }]);
    expect(room.style.width).toBe('600px');
  });

  it('clamps to [240, shell width]', async () => {
    const { patches, room, rz } = setup();
    await fireEvent(rz, pev('pointerdown', 500));
    document.dispatchEvent(pev('pointermove', 5000));
    await tick();
    expect(room.style.width).toBe('1000px');
    document.dispatchEvent(pev('pointermove', -5000));
    await tick();
    expect(room.style.width).toBe('240px');
    document.dispatchEvent(pev('pointerup', -5000));
    await tick();
    expect(patches).toEqual([{ width: 240 }]);
  });

  it('pointercancel restores the pre-drag width and commits nothing (D12)', async () => {
    const { patches, room, rz } = setup(420);
    await fireEvent(rz, pev('pointerdown', 500));
    document.dispatchEvent(pev('pointermove', 700));
    await tick();
    expect(room.style.width).toBe('600px');
    document.dispatchEvent(pev('pointercancel', 700));
    await tick();
    expect(room.style.width).toBe('420px');
    expect(patches).toEqual([]);
  });
});

describe('Stage — Edit selection and house header', () => {
  it('clicking a section selects it and .sel marks the selected one', async () => {
    const nb = nbOf([sec('s1'), sec('s2')]);
    const props = baseProps(nb);
    const { container, rerender } = render(Stage, { props });

    await fireEvent.click(container.querySelector('[data-section="s2"]') as Element);
    expect(props.onselect).toHaveBeenCalledWith('s2');

    await rerender({ ...props, selSection: 's2' });
    expect(container.querySelector('[data-section="s2"]')).toHaveClass('sel');
    expect(container.querySelector('[data-section="s1"]')).not.toHaveClass('sel');
  });

  it('applies the stored per-section width as an inline style', () => {
    const nb = nbOf([sec('s1', { width: 420 }), sec('s2')]);
    const { container } = render(Stage, { props: baseProps(nb) });

    const room = container.querySelector<HTMLElement>('[data-section="s1"]');
    expect(room?.style.width).toBe('420px');
    expect(room?.style.maxWidth).toBe('100%');
    expect(container.querySelector('[data-section="s2"]')?.getAttribute('style')).toBeNull();
  });

  it('edit mode shows the 🏠-prefixed editable house title with v1 placeholders', () => {
    const nb = nbOf([sec('s1')]);
    const { container } = render(Stage, { props: baseProps(nb) });

    expect(container.querySelector('.ceview.house-title')?.textContent).toContain('🏠 My House');
    expect(container.querySelector('.ceview.house-sub')?.textContent).toContain(
      'optional subtitle · markdown + $math$',
    );
  });
});
