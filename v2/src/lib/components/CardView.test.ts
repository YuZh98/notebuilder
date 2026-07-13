import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CardView from './CardView.svelte';
import { mode } from '../stores/mode';
import { CARD_STATE_KEY } from '../card-done';
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

// reveal key that never exists in scope -> the slot is hidden in Study
const hidden = { reveal: { key: 'nope', op: '==' as const, val: 1 } };

describe('CardView fuse chains', () => {
  it('groups consecutive fused slots into one .cardslot > .fusewrap with seams between cells', () => {
    const card = cardOf({
      slots: [
        slot('a', { fuse: true, w: 4 }),
        slot('b', { fuse: true, w: 4 }),
        slot('c', { w: 4 }),
        slot('d', { w: 6 }),
      ],
    });
    const { container } = render(CardView, { props: baseProps(card) });

    const wraps = container.querySelectorAll('.fusewrap');
    expect(wraps).toHaveLength(1);
    const cells = wraps[0].querySelectorAll('.fusecell');
    expect([...cells].map((c) => c.getAttribute('data-sid'))).toEqual(['a', 'b', 'c']);
    const guts = wraps[0].querySelectorAll('.fusegut');
    expect([...guts].map((g) => g.getAttribute('data-fusegut'))).toEqual(['a', 'b']);

    const chainSlot = wraps[0].closest('.cardslot');
    expect(chainSlot?.getAttribute('style')?.replace(/\s/g, '')).toContain('--sw:12');
    expect(chainSlot?.hasAttribute('data-sid')).toBe(false);

    const d = container.querySelector('.cardslot[data-sid="d"]');
    expect(d?.getAttribute('style')?.replace(/\s/g, '')).toContain('--sw:6');
    expect(d?.querySelector('.fusewrap')).toBeNull();
  });

  it('clamps the chain width at 12 and sizes cells by fuseW (default 1)', () => {
    const card = cardOf({
      slots: [slot('a', { fuse: true, w: 8, fuseW: 2 }), slot('b', { w: 8 })],
    });
    const { container } = render(CardView, { props: baseProps(card) });

    const chainSlot = container.querySelector('.fusewrap')?.closest('.cardslot');
    expect(chainSlot?.getAttribute('style')?.replace(/\s/g, '')).toContain('--sw:12');
    const a = container.querySelector('.fusecell[data-sid="a"]');
    const b = container.querySelector('.fusecell[data-sid="b"]');
    expect(a?.getAttribute('style')?.replace(/\s/g, '')).toContain('flex:2');
    expect(b?.getAttribute('style')?.replace(/\s/g, '')).toContain('flex:1');
  });

  it('a trailing fuse flag with no successor renders a plain slot', () => {
    const card = cardOf({ slots: [slot('a'), slot('b', { fuse: true })] });
    const { container } = render(CardView, { props: baseProps(card) });
    expect(container.querySelector('.fusewrap')).toBeNull();
    expect(container.querySelector('.cardslot[data-sid="b"]')).toBeInTheDocument();
  });

  it('drops a reveal-hidden cell from the chain without an orphan seam (Study)', () => {
    mode.set('study');
    const card = cardOf({
      slots: [
        slot('a', { fuse: true, w: 4 }),
        slot('b', { fuse: true, w: 4, verbs: hidden }),
        slot('c', { w: 4 }),
      ],
    });
    const { container } = render(CardView, {
      props: { ...baseProps(card), editable: false },
    });

    const cells = container.querySelectorAll('.fusecell');
    expect([...cells].map((c) => c.getAttribute('data-sid'))).toEqual(['a', 'c']);
    const guts = container.querySelectorAll('.fusegut');
    expect(guts).toHaveLength(1);
    // the seam belongs to the previous VISIBLE cell, not the hidden one
    expect(guts[0].getAttribute('data-fusegut')).toBe('a');
    // the chain keeps its full authored width even while a cell is hidden
    const chainSlot = container.querySelector('.fusewrap')?.closest('.cardslot');
    expect(chainSlot?.getAttribute('style')?.replace(/\s/g, '')).toContain('--sw:12');
  });

  it('drops the whole chain when every cell is hidden (Study), keeps it in Edit', () => {
    const slots = [
      slot('a', { fuse: true, verbs: hidden }),
      slot('b', { verbs: hidden }),
    ];
    mode.set('study');
    const study = render(CardView, {
      props: { ...baseProps(cardOf({ slots })), editable: false },
    });
    expect(study.container.querySelector('.cardslot')).toBeNull();
    expect(study.container.querySelector('.fusegut')).toBeNull();
    study.unmount();

    mode.set('edit');
    const edit = render(CardView, { props: baseProps(cardOf({ slots })) });
    expect(edit.container.querySelectorAll('.fusecell')).toHaveLength(2);
  });
});

describe('CardView flip faces', () => {
  const flipCard = (over: Partial<Card> = {}) =>
    cardOf({ verbs: { flip: true }, back: [slot('bk1')], ...over });

  it('Edit: renders .fc-edit with FRONT/BACK faceflags and both faces side by side', () => {
    const { container } = render(CardView, { props: baseProps(flipCard()) });
    const fcEdit = container.querySelector('.fc-edit');
    expect(fcEdit).toBeInTheDocument();
    const sides = fcEdit?.querySelectorAll('.fc-side') ?? [];
    expect(sides).toHaveLength(2);
    expect(sides[1].classList.contains('back')).toBe(true);
    expect(sides[0].querySelector('.faceflag')?.textContent).toBe('FRONT');
    expect(sides[1].querySelector('.faceflag')?.textContent).toBe('BACK');
    expect(sides[0].querySelector('.cardslot[data-sid="sl1"]')).toBeInTheDocument();
    expect(sides[1].querySelector('.cardslot[data-sid="bk1"]')).toBeInTheDocument();
    expect(container.querySelector('.fc')).toBeNull();
  });

  it('Study: renders the 3D stack with hint; clicking flips and records seenBack', async () => {
    mode.set('study');
    const props = { ...baseProps(flipCard()), editable: false };
    const { container, rerender } = render(CardView, { props });

    const fc = container.querySelector('.fc');
    expect(fc).toBeInTheDocument();
    expect(fc?.classList.contains('flipped')).toBe(false);
    const faces = container.querySelectorAll('.fc-stack .fc-face');
    expect(faces).toHaveLength(2);
    expect(faces[1].classList.contains('back')).toBe(true);
    expect(faces[0].querySelector('.cardslot[data-sid="sl1"]')).toBeInTheDocument();
    expect(faces[1].querySelector('.cardslot[data-sid="bk1"]')).toBeInTheDocument();
    expect(fc?.textContent).toContain('↻ click to flip');
    expect(container.querySelector('.fc-edit')).toBeNull();

    if (!fc) throw new Error('fc not found');
    await fireEvent.click(fc);
    expect(props.onstate).toHaveBeenCalledWith(CARD_STATE_KEY, {
      flipped: true,
      seenBack: true,
    });

    await rerender({ state: { [CARD_STATE_KEY]: { flipped: true, seenBack: true } } });
    expect(container.querySelector('.fc.flipped')).toBeInTheDocument();
  });

  it('Study: flipping back keeps seenBack true', async () => {
    mode.set('study');
    const props = {
      ...baseProps(flipCard()),
      editable: false,
      state: { [CARD_STATE_KEY]: { flipped: true, seenBack: true } },
    };
    const { container } = render(CardView, { props });
    const fc = container.querySelector('.fc');
    if (!fc) throw new Error('fc not found');
    await fireEvent.click(fc);
    expect(props.onstate).toHaveBeenCalledWith(CARD_STATE_KEY, {
      flipped: false,
      seenBack: true,
    });
  });

  it('Study: clicking interactive slot content does not flip', async () => {
    mode.set('study');
    const card = flipCard({ slots: [slot('ti', { type: 'text-input', props: {} })] });
    const props = { ...baseProps(card), editable: false };
    const { container } = render(CardView, { props });
    const input = container.querySelector('.fc input');
    if (!input) throw new Error('input not found');
    await fireEvent.click(input);
    expect(props.onstate).not.toHaveBeenCalled();
  });

  it('Study: the card is done only after the back was seen', async () => {
    mode.set('study');
    const props = { ...baseProps(flipCard()), editable: false };
    const { container, rerender } = render(CardView, { props });
    expect(container.querySelector('.done-badge')).toBeNull();

    await rerender({ state: { [CARD_STATE_KEY]: { flipped: true, seenBack: true } } });
    expect(container.querySelector('.done-badge')).toBeInTheDocument();

    // session flip state back to front — still done: both faces were seen
    await rerender({ state: { [CARD_STATE_KEY]: { flipped: false, seenBack: true } } });
    expect(container.querySelector('.done-badge')).toBeInTheDocument();
  });

  it('fused slots render inside a flip face (Study)', () => {
    mode.set('study');
    const card = flipCard({
      slots: [slot('a', { fuse: true, w: 6 }), slot('b', { w: 6 })],
    });
    const { container } = render(CardView, {
      props: { ...baseProps(card), editable: false },
    });
    const front = container.querySelector('.fc-face:not(.back)');
    expect(front?.querySelector('.fusewrap')).toBeInTheDocument();
    expect(front?.querySelectorAll('.fusecell')).toHaveLength(2);
  });

  it('Study: clicking a fuse seam does not flip', async () => {
    mode.set('study');
    const card = flipCard({
      slots: [slot('a', { fuse: true, w: 6 }), slot('b', { w: 6 })],
    });
    const props = { ...baseProps(card), editable: false };
    const { container } = render(CardView, { props });
    const gut = container.querySelector('.fc .fusegut');
    if (!gut) throw new Error('fuse seam not found');
    await fireEvent.click(gut);
    expect(props.onstate).not.toHaveBeenCalled();
    expect(container.querySelector('.fc.flipped')).toBeNull();
  });
});
