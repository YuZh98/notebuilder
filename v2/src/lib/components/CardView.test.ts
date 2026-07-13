import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CardView from './CardView.svelte';
import { mode } from '../stores/mode';
import type { Card, Slot } from '../types';

function slot(id: string, over: Partial<Slot> = {}): Slot {
  return { id, type: 'text', props: { text: `body of ${id}` }, ...over };
}

function cardOf(over: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    sectionId: 's1',
    position: 0,
    slots: [slot('sl1', { w: 4 }), slot('sl2')],
    ...over,
  };
}

function baseProps(card: Card) {
  return {
    card,
    editable: true,
    selected: false,
    state: {},
    notes: [],
    notesOpen: false,
    onselect: vi.fn(),
    onstate: vi.fn(),
    onmove: vi.fn(),
    ondelete: vi.fn(),
    onverb: vi.fn(),
    ontags: vi.fn(),
    onsavetype: vi.fn(),
    onupdateslot: vi.fn(),
    ondeleteslot: vi.fn(),
    onaddslot: vi.fn(),
    progresscompletion: vi.fn(() => ({ done: 0, total: 0, pct: 0 })),
    ontogglenotes: vi.fn(),
    onaddnote: vi.fn(),
    ondeletenote: vi.fn(),
    ondragstart: vi.fn(),
    ondragend: vi.fn(),
    ondragover: vi.fn(),
    ondrop: vi.fn(),
  };
}

afterEach(() => {
  mode.set('edit');
});

describe('CardView grid vars', () => {
  it('puts --w on the card shell (v2 default 12) and --cardc only when accented', () => {
    const { container, unmount } = render(CardView, { props: baseProps(cardOf()) });
    const furn = container.querySelector('.furn');
    expect(furn).toBeInTheDocument();
    expect(furn?.getAttribute('style')?.replace(/\s/g, '')).toContain('--w:12');
    expect(furn?.getAttribute('style')?.replace(/\s/g, '')).not.toContain('--cardc');
    unmount();

    const accented = render(CardView, {
      props: baseProps(cardOf({ w: 8, accent: '#ff0000' })),
    });
    const style = accented.container.querySelector('.furn')?.getAttribute('style')?.replace(/\s/g, '');
    expect(style).toContain('--w:8');
    expect(style).toContain('--cardc:#ff0000');
  });

  it('puts --sw on each .cardslot inside a .cardrow (slot.w, default 12)', () => {
    const { container } = render(CardView, { props: baseProps(cardOf()) });
    const row = container.querySelector('.cardrow');
    expect(row).toBeInTheDocument();
    const s1 = container.querySelector('.cardslot[data-sid="sl1"]');
    const s2 = container.querySelector('.cardslot[data-sid="sl2"]');
    expect(s1?.getAttribute('style')?.replace(/\s/g, '')).toContain('--sw:4');
    expect(s2?.getAttribute('style')?.replace(/\s/g, '')).toContain('--sw:12');
  });
});

describe('CardView chrome', () => {
  it('renders grip and inert rz when editable', () => {
    const { container } = render(CardView, { props: baseProps(cardOf()) });
    expect(container.querySelector('.furn .grip')).toBeInTheDocument();
    const rz = container.querySelector('.furn .rz');
    expect(rz).toBeInTheDocument();
    expect(rz?.getAttribute('title')).toBe('resize arrives with the drag engine');
  });

  it('suppresses grip, rz, and cardtools when not editable (locked section)', () => {
    const { container } = render(CardView, {
      props: { ...baseProps(cardOf()), editable: false },
    });
    expect(container.querySelector('.grip')).toBeNull();
    expect(container.querySelector('.rz')).toBeNull();
    expect(container.querySelector('.cardtools')).toBeNull();
  });

  it('marks a bare card with .bare so the ported CSS strips the frame', () => {
    const { container } = render(CardView, {
      props: baseProps(cardOf({ verbs: { bare: true } })),
    });
    expect(container.querySelector('.furn.bare')).toBeInTheDocument();
  });

  it('bare + accent still carries both hooks (class and --cardc)', () => {
    const { container } = render(CardView, {
      props: baseProps(cardOf({ verbs: { bare: true }, accent: '#00ff00' })),
    });
    const furn = container.querySelector('.furn.bare');
    expect(furn).toBeInTheDocument();
    expect(furn?.getAttribute('style')?.replace(/\s/g, '')).toContain('--cardc:#00ff00');
  });

  it('renders the shell without rows when the card has no slots', () => {
    const { container } = render(CardView, { props: baseProps(cardOf({ slots: [] })) });
    expect(container.querySelector('.furn')).toBeInTheDocument();
    expect(container.querySelector('.cardslot')).toBeNull();
  });
});

describe('CardView selection', () => {
  it('toggles .sel with the selected prop in Edit mode', async () => {
    const props = baseProps(cardOf());
    const { container, rerender } = render(CardView, { props: { ...props, selected: true } });
    expect(container.querySelector('.furn.sel')).toBeInTheDocument();

    await rerender({ selected: false });
    expect(container.querySelector('.furn.sel')).toBeNull();
  });

  it('never shows the selection ring in Study mode', () => {
    mode.set('study');
    const { container } = render(CardView, {
      props: { ...baseProps(cardOf()), selected: true },
    });
    expect(container.querySelector('.furn.sel')).toBeNull();
  });

  it('clicking the card body selects it in Edit mode', async () => {
    const props = baseProps(cardOf());
    const { container } = render(CardView, { props });
    const furn = container.querySelector('.furn');
    if (!furn) throw new Error('furn not found');
    await fireEvent.click(furn);
    expect(props.onselect).toHaveBeenCalledTimes(1);
  });

  it('clicking a control inside the card does not select it', async () => {
    const props = baseProps(cardOf());
    const { container } = render(CardView, { props });
    const up = container.querySelector('button[title="Move card up"]');
    if (!up) throw new Error('move button not found');
    await fireEvent.click(up);
    expect(props.onmove).toHaveBeenCalledWith(-1);
    expect(props.onselect).not.toHaveBeenCalled();
  });

  it('does not select when not editable', async () => {
    const props = { ...baseProps(cardOf()), editable: false };
    const { container } = render(CardView, { props });
    const furn = container.querySelector('.furn');
    if (!furn) throw new Error('furn not found');
    await fireEvent.click(furn);
    expect(props.onselect).not.toHaveBeenCalled();
  });
});

describe('CardView card controls', () => {
  it('checking the flip checkbox fires onverb without mutating card', async () => {
    const card = cardOf();
    const snapshot = JSON.parse(JSON.stringify(card));
    const props = baseProps(card);
    const { container } = render(CardView, { props });
    const boxes = container.querySelectorAll('.cardtools input[type="checkbox"]');
    const flipBox = boxes[0];
    if (!flipBox) throw new Error('flip checkbox not found');
    await fireEvent.click(flipBox);
    expect(props.onverb).toHaveBeenCalledWith('flip', true);
    expect(card).toEqual(snapshot);
  });

  it('checking the bare checkbox fires onverb without mutating card', async () => {
    const card = cardOf();
    const snapshot = JSON.parse(JSON.stringify(card));
    const props = baseProps(card);
    const { container } = render(CardView, { props });
    const boxes = container.querySelectorAll('.cardtools input[type="checkbox"]');
    const bareBox = boxes[1];
    if (!bareBox) throw new Error('bare checkbox not found');
    await fireEvent.click(bareBox);
    expect(props.onverb).toHaveBeenCalledWith('bare', true);
    expect(card).toEqual(snapshot);
  });

  it('changing the tags input fires ontags with the raw value, without mutating card', async () => {
    const card = cardOf({ tags: ['old'] });
    const snapshot = JSON.parse(JSON.stringify(card));
    const props = baseProps(card);
    const { container } = render(CardView, { props });
    const tagsInput = container.querySelector('.tags-input');
    if (!tagsInput) throw new Error('tags input not found');
    await fireEvent.change(tagsInput, { target: { value: 'a, b, c' } });
    expect(props.ontags).toHaveBeenCalledWith('a, b, c');
    expect(card).toEqual(snapshot);
  });
});
