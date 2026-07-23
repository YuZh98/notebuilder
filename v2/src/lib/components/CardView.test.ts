import { describe, it, expect, vi, afterEach } from 'vitest';
// @ts-expect-error -- node builtin, untyped in the browser-only tsconfig (test runs in vitest/node)
import { readFileSync } from 'node:fs';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
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
    surface: 'notebook' as const,
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
    ongrip: vi.fn(),
    onresize: vi.fn(),
    onfusew: vi.fn(),
    onpin: vi.fn(),
    onarchive: vi.fn(),
  };
}

// jsdom has no PointerEvent; listeners key off the type string, so a MouseEvent stand-in works.
function pev(type: string, x: number, y = 0): PointerEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }) as PointerEvent;
}

// jsdom has no layout: rect-dependent gesture math reads getBoundingClientRect, stubbed here.
function stubRect(el: Element, left: number, right: number) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left, right, top: 0, bottom: 0, width: right - left, height: 0, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
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
  it('renders grip and rz when editable', () => {
    const { container } = render(CardView, { props: baseProps(cardOf()) });
    expect(container.querySelector('.furn .grip')).toBeInTheDocument();
    const rz = container.querySelector('.furn .rz');
    expect(rz).toBeInTheDocument();
    expect(rz?.getAttribute('title')).toBeNull();
  });

  it('grip is engine-wired: no HTML5 draggable, pointerdown fires ongrip with the furn element', async () => {
    const props = baseProps(cardOf());
    const { container } = render(CardView, { props });
    const grip = container.querySelector('.grip') as HTMLElement;
    expect(grip.hasAttribute('draggable')).toBe(false);
    const down = pev('pointerdown', 5, 5);
    await fireEvent(grip, down);
    expect(props.ongrip).toHaveBeenCalledTimes(1);
    const [ev, el] = props.ongrip.mock.calls[0] as [PointerEvent, HTMLElement];
    expect(ev).toBe(down);
    expect(ev.defaultPrevented).toBe(true);
    expect(el).toBe(container.querySelector('.furn'));
  });

  it('carries no HTML5 drag attributes anywhere on the card shell', () => {
    const { container } = render(CardView, { props: baseProps(cardOf()) });
    expect(container.querySelector('[draggable]')).toBeNull();
  });

  it('suppresses grip, rz, and cardtools when not editable (locked section)', () => {
    const { container } = render(CardView, {
      props: { ...baseProps(cardOf()), surface: 'read' as const },
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

  // jsdom has no hit-testing, so the D1 fix is asserted as a CSS contract on app.css:
  // the hidden cardtools row (opacity<1 stacks above the positioned .grip) must be
  // pointer-events:none so the grip's pointerdown is never intercepted, and must get
  // pointer-events back exactly when revealed.
  it('hidden cardtools cannot intercept the grip pointerdown (app.css contract)', () => {
    const appCss: string = readFileSync('src/app.css', 'utf8');
    const rule = (selector: string) => {
      const at = appCss.indexOf(`${selector} {`);
      expect(at, `selector "${selector}" present`).toBeGreaterThan(-1);
      return appCss.slice(at, appCss.indexOf('}', at));
    };
    const hidden = rule('.cardtools');
    expect(hidden).toMatch(/opacity:\s*0\b/);
    expect(hidden).toMatch(/pointer-events:\s*none\b/);
    const revealed = rule('.furn:hover .cardtools,\n.cardtools:focus-within');
    expect(revealed).toMatch(/opacity:\s*1\b/);
    expect(revealed).toMatch(/pointer-events:\s*auto\b/);
  });

  it('grip pointerdown starts the gesture with the cardtools row present', async () => {
    const props = baseProps(cardOf());
    const { container } = render(CardView, { props });
    expect(container.querySelector('.cardtools')).toBeInTheDocument();
    await fireEvent(container.querySelector('.grip') as HTMLElement, pev('pointerdown', 12, 10));
    expect(props.ongrip).toHaveBeenCalledTimes(1);
  });

  it('renders the shell without rows when the card has no slots', () => {
    const { container } = render(CardView, { props: baseProps(cardOf({ slots: [] })) });
    expect(container.querySelector('.furn')).toBeInTheDocument();
    expect(container.querySelector('.cardslot')).toBeNull();
  });
});

describe('CardView surface boundaries', () => {
  it('surface="notebook" renders NO slot adder', () => {
    const { container } = render(CardView, { props: baseProps(cardOf()) });
    expect(container.querySelector('.slot-adder')).toBeNull();
  });

  it('surface="notebook" renders NO per-slot delete button', () => {
    const { container } = render(CardView, { props: baseProps(cardOf()) });
    expect(container.querySelector('.slot-del')).toBeNull();
  });

  it('surface="notebook" renders NO flip/bare checkboxes', () => {
    const { container } = render(CardView, {
      props: baseProps(cardOf({ verbs: { flip: true, bare: true } })),
    });
    const labels = container.querySelectorAll('.cardtools label');
    for (const l of labels) {
      expect(l.textContent).not.toMatch(/flip|bare/);
    }
  });

  it('surface="notebook" renders NO → type button', () => {
    const { container } = render(CardView, { props: baseProps(cardOf()) });
    const btns = [...container.querySelectorAll('.cardtools button')];
    expect(btns.find((b) => b.textContent?.includes('→ type'))).toBeUndefined();
  });

  it('surface="notebook" output contains no user-facing string "slot"', () => {
    const { container } = render(CardView, { props: baseProps(cardOf()) });
    const text = container.textContent ?? '';
    expect(text.toLowerCase()).not.toContain('slot');
  });

  it('surface="bench" renders NO card resize handle (.rz)', () => {
    const { container } = render(CardView, {
      props: { ...baseProps(cardOf()), surface: 'bench' as const },
    });
    expect(container.querySelector('.rz')).toBeNull();
  });

  it('surface="bench" keeps the slot adder', () => {
    const { container } = render(CardView, {
      props: { ...baseProps(cardOf()), surface: 'bench' as const },
    });
    expect(container.querySelector('.slot-adder')).toBeInTheDocument();
  });

  it('surface="bench" keeps per-slot delete', () => {
    const { container } = render(CardView, {
      props: { ...baseProps(cardOf()), surface: 'bench' as const },
    });
    expect(container.querySelector('.slot-del')).toBeInTheDocument();
  });

  it('surface="notebook" keeps grip and card resize', () => {
    const { container } = render(CardView, { props: baseProps(cardOf()) });
    expect(container.querySelector('.grip')).toBeInTheDocument();
    expect(container.querySelector('.rz')).toBeInTheDocument();
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
    const props = { ...baseProps(cardOf()), surface: 'read' as const };
    const { container } = render(CardView, { props });
    const furn = container.querySelector('.furn');
    if (!furn) throw new Error('furn not found');
    await fireEvent.click(furn);
    expect(props.onselect).not.toHaveBeenCalled();
  });
});

describe('CardView selectedSlotId (factory slot selection)', () => {
  it('puts .sel on the .cardslot whose data-sid matches, and only that one', () => {
    const { container } = render(CardView, {
      props: { ...baseProps(cardOf()), selectedSlotId: 'sl2' },
    });
    expect(container.querySelector('.cardslot[data-sid="sl1"]')?.classList.contains('sel')).toBe(false);
    expect(container.querySelector('.cardslot[data-sid="sl2"]')?.classList.contains('sel')).toBe(true);
    expect(container.querySelectorAll('.cardslot.sel')).toHaveLength(1);
  });

  it('moves .sel when selectedSlotId changes', async () => {
    const props = baseProps(cardOf());
    const { container, rerender } = render(CardView, { props: { ...props, selectedSlotId: 'sl1' } });
    expect(container.querySelector('.cardslot.sel')?.getAttribute('data-sid')).toBe('sl1');
    await rerender({ selectedSlotId: 'sl2' });
    expect(container.querySelector('.cardslot.sel')?.getAttribute('data-sid')).toBe('sl2');
  });

  it('marks a fused sub-cell (.fusecell) when it carries the matching data-sid', () => {
    const card = cardOf({ slots: [slot('a', { fuse: true, w: 6 }), slot('b', { w: 6 })] });
    const { container } = render(CardView, {
      props: { ...baseProps(card), selectedSlotId: 'b' },
    });
    expect(container.querySelector('.fusecell[data-sid="a"]')?.classList.contains('sel')).toBe(false);
    expect(container.querySelector('.fusecell[data-sid="b"]')?.classList.contains('sel')).toBe(true);
    // the fused group's outer .cardslot carries no data-sid and stays unselected
    expect(container.querySelector('.fusewrap')?.closest('.cardslot')?.classList.contains('sel')).toBe(false);
  });

  it('renders no .sel when the prop is omitted (notebook cards unaffected)', () => {
    const { container } = render(CardView, { props: baseProps(cardOf()) });
    expect(container.querySelector('.sel')).toBeNull();
  });

  it('renders no .sel when selectedSlotId is null', () => {
    const { container } = render(CardView, {
      props: { ...baseProps(cardOf()), selectedSlotId: null },
    });
    expect(container.querySelector('.sel')).toBeNull();
  });
});

describe('CardView card controls', () => {
  it('checking the flip checkbox fires onverb without mutating card', async () => {
    const card = cardOf();
    const snapshot = JSON.parse(JSON.stringify(card));
    const props = { ...baseProps(card), surface: 'bench' as const };
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
    const props = { ...baseProps(card), surface: 'bench' as const };
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

describe('CardView pin & archive buttons', () => {
  it('shows the pin button only when pinEnabled, in either mode, and reflects the pinned tag', async () => {
    const off = render(CardView, { props: baseProps(cardOf()) });
    expect(off.container.querySelector('[data-act="pin"]')).toBeNull();
    off.unmount();

    const props = { ...baseProps(cardOf()), pinEnabled: true };
    const { container } = render(CardView, { props });
    const btn = container.querySelector('[data-act="pin"]') as HTMLElement;
    expect(btn.textContent?.trim()).toBe('📍');
    await fireEvent.click(btn);
    expect(props.onpin).toHaveBeenCalledTimes(1);
  });

  it('renders 📌 when the card is already pinned', () => {
    const { container } = render(CardView, {
      props: { ...baseProps(cardOf({ tags: ['pinned'] })), pinEnabled: true },
    });
    expect(container.querySelector('[data-act="pin"]')?.textContent?.trim()).toBe('📌');
  });

  it('archive button shows 🗄 in the live view and ♻ in the archive view; fires onarchive', async () => {
    const live = { ...baseProps(cardOf()), archEnabled: true, showArch: false };
    const a = render(CardView, { props: live });
    const archBtn = a.container.querySelector('[data-act="arch"]') as HTMLElement;
    expect(archBtn.textContent?.trim()).toBe('🗄');
    await fireEvent.click(archBtn);
    expect(live.onarchive).toHaveBeenCalledTimes(1);
    a.unmount();

    const viewing = render(CardView, {
      props: { ...baseProps(cardOf()), archEnabled: true, showArch: true },
    });
    expect(viewing.container.querySelector('[data-act="arch"]')?.textContent?.trim()).toBe('♻');
  });

  it('hides the archive button when archEnabled is false', () => {
    const { container } = render(CardView, { props: baseProps(cardOf()) });
    expect(container.querySelector('[data-act="arch"]')).toBeNull();
  });
});

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
      props: { ...baseProps(card), surface: 'read' as const },
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

  it('renders two independent chains and a plain slot in one row', () => {
    const card = cardOf({
      slots: [
        slot('a', { fuse: true, w: 3 }),
        slot('b', { w: 3 }),
        slot('c', { w: 2 }),
        slot('d', { fuse: true, w: 2 }),
        slot('e', { w: 2 }),
      ],
    });
    const { container } = render(CardView, { props: baseProps(card) });

    const row = container.querySelector('.cardrow');
    const wraps = row?.querySelectorAll('.fusewrap') ?? [];
    expect(wraps).toHaveLength(2);
    expect([...wraps[0].querySelectorAll('.fusecell')].map((c) => c.getAttribute('data-sid'))).toEqual(['a', 'b']);
    expect([...wraps[1].querySelectorAll('.fusecell')].map((c) => c.getAttribute('data-sid'))).toEqual(['d', 'e']);
    // exactly one seam per chain, owned by that chain's left cell
    expect([...(row?.querySelectorAll('.fusegut') ?? [])].map((g) => g.getAttribute('data-fusegut'))).toEqual(['a', 'd']);
    // the slot between the chains stays plain
    const c = row?.querySelector('.cardslot[data-sid="c"]');
    expect(c).toBeInTheDocument();
    expect(c?.querySelector('.fusewrap')).toBeNull();
    expect(wraps[0].closest('.cardslot')?.getAttribute('style')?.replace(/\s/g, '')).toContain('--sw:6');
    expect(wraps[1].closest('.cardslot')?.getAttribute('style')?.replace(/\s/g, '')).toContain('--sw:4');
  });

  it('drops the whole chain when every cell is hidden (Study), keeps it in Edit', () => {
    const slots = [
      slot('a', { fuse: true, verbs: hidden }),
      slot('b', { verbs: hidden }),
    ];
    mode.set('study');
    const study = render(CardView, {
      props: { ...baseProps(cardOf({ slots })), surface: 'read' as const },
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
    const props = { ...baseProps(flipCard()), surface: 'read' as const };
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
      surface: 'read' as const,
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
    const props = { ...baseProps(card), surface: 'read' as const };
    const { container } = render(CardView, { props });
    const input = container.querySelector('.fc input');
    if (!input) throw new Error('input not found');
    await fireEvent.click(input);
    expect(props.onstate).not.toHaveBeenCalled();
  });

  it('Study: the card is done only after the back was seen', async () => {
    mode.set('study');
    const props = { ...baseProps(flipCard()), surface: 'read' as const };
    const { container, rerender } = render(CardView, { props });
    expect(container.querySelector('.done-badge')).toBeNull();

    await rerender({ state: { [CARD_STATE_KEY]: { flipped: true, seenBack: true } } });
    expect(container.querySelector('.done-badge')).toBeInTheDocument();

    // session flip state back to front — still done: both faces were seen
    await rerender({ state: { [CARD_STATE_KEY]: { flipped: false, seenBack: true } } });
    expect(container.querySelector('.done-badge')).toBeInTheDocument();
  });

  it('Edit: an empty flip face shows the muted "front empty"/"back empty" placeholder', () => {
    const { container } = render(CardView, {
      props: baseProps(cardOf({ verbs: { flip: true }, slots: [], back: [] })),
    });
    const sides = container.querySelectorAll('.fc-edit .fc-side');
    expect(sides[0].querySelector('.face-empty')?.textContent).toBe('front empty');
    expect(sides[1].querySelector('.face-empty')?.textContent).toBe('back empty');
  });

  it('Study: an empty flip face shows the placeholder; a filled face does not', () => {
    mode.set('study');
    const { container } = render(CardView, {
      props: { ...baseProps(cardOf({ verbs: { flip: true }, back: [] })), surface: 'read' as const },
    });
    const faces = container.querySelectorAll('.fc-stack .fc-face');
    expect(faces[0].querySelector('.face-empty')).toBeNull();
    expect(faces[1].querySelector('.face-empty')?.textContent).toBe('back empty');
  });

  it('a non-flip empty card renders no placeholder (unchanged shell)', () => {
    const { container } = render(CardView, { props: baseProps(cardOf({ slots: [] })) });
    expect(container.querySelector('.face-empty')).toBeNull();
  });

  it('fused slots render inside a flip face (Study)', () => {
    mode.set('study');
    const card = flipCard({
      slots: [slot('a', { fuse: true, w: 6 }), slot('b', { w: 6 })],
    });
    const { container } = render(CardView, {
      props: { ...baseProps(card), surface: 'read' as const },
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
    const props = { ...baseProps(card), surface: 'read' as const };
    const { container } = render(CardView, { props });
    const gut = container.querySelector('.fc .fusegut');
    if (!gut) throw new Error('fuse seam not found');
    await fireEvent.click(gut);
    expect(props.onstate).not.toHaveBeenCalled();
    expect(container.querySelector('.fc.flipped')).toBeNull();
  });
});

describe('CardView forceMode override', () => {
  const flipCard = (over: Partial<Card> = {}) =>
    cardOf({ verbs: { flip: true }, back: [slot('bk1')], ...over });

  it('forceMode="study" renders the interactive flip while the global mode is Edit', () => {
    mode.set('edit');
    const { container } = render(CardView, {
      props: { ...baseProps(flipCard()), surface: 'read' as const, forceMode: 'study' as const },
    });
    // interactive 3D stack, not the read-only fc-edit branch
    expect(container.querySelector('.fc')).toBeInTheDocument();
    expect(container.querySelector('.fc-edit')).toBeNull();
    expect(container.querySelector('.fc')?.textContent).toContain('↻ click to flip');
  });

  it('without forceMode, the global mode still governs (unchanged): Edit shows fc-edit', () => {
    mode.set('edit');
    const { container } = render(CardView, {
      props: { ...baseProps(flipCard()), surface: 'read' as const },
    });
    expect(container.querySelector('.fc-edit')).toBeInTheDocument();
    expect(container.querySelector('.fc')).toBeNull();
  });
});

describe('CardView card width resize', () => {
  function setup(w = 6) {
    const card = cardOf({ w });
    const snapshot = JSON.parse(JSON.stringify(card));
    const props = baseProps(card);
    const { container } = render(CardView, { props });
    const furn = container.querySelector('.furn') as HTMLElement;
    // colW = 1200 / 12 = 100px per column (v1: grid width / 12)
    stubRect(furn.parentElement as HTMLElement, 0, 1200);
    const rz = furn.querySelector('.rz') as HTMLElement;
    return { card, snapshot, props, furn, rz };
  }

  const wOf = (furn: HTMLElement) => furn.getAttribute('style')?.replace(/\s/g, '');

  it('updates --w live with .dragging during the drag, fires onresize with the snapped width on up', async () => {
    const { card, snapshot, props, furn, rz } = setup(6);
    await fireEvent(rz, pev('pointerdown', 100));
    document.dispatchEvent(pev('pointermove', 333)); // dx=233 → 6+2.33 → snaps to 8.35
    await tick();
    expect(wOf(furn)).toContain('--w:8.35');
    expect(furn.classList.contains('dragging')).toBe(true);
    expect(card).toEqual(snapshot); // live preview never touches the model

    document.dispatchEvent(pev('pointerup', 333));
    await tick();
    expect(props.onresize).toHaveBeenCalledWith(8.35);
    expect(furn.classList.contains('dragging')).toBe(false);
    expect(wOf(furn)).toContain('--w:6'); // back to the model value until App commits
    expect(card).toEqual(snapshot);
  });

  it('clamps to [3, 12]', async () => {
    const { furn, rz, props } = setup(6);
    await fireEvent(rz, pev('pointerdown', 100));
    document.dispatchEvent(pev('pointermove', 5000));
    await tick();
    expect(wOf(furn)).toContain('--w:12');
    document.dispatchEvent(pev('pointermove', -5000));
    await tick();
    expect(wOf(furn)).toContain('--w:3');
    document.dispatchEvent(pev('pointerup', -5000));
    await tick();
    expect(props.onresize).toHaveBeenCalledWith(3);
  });

  it('pointercancel restores the pre-drag --w and never fires onresize', async () => {
    const { card, snapshot, props, furn, rz } = setup(6);
    await fireEvent(rz, pev('pointerdown', 100));
    document.dispatchEvent(pev('pointermove', 300));
    await tick();
    expect(wOf(furn)).toContain('--w:8');
    document.dispatchEvent(pev('pointercancel', 300));
    await tick();
    expect(wOf(furn)).toContain('--w:6');
    expect(furn.classList.contains('dragging')).toBe(false);
    expect(props.onresize).not.toHaveBeenCalled();
    expect(card).toEqual(snapshot);
  });
});

describe('CardView fuse ratio resize', () => {
  function setup() {
    const card = cardOf({ slots: [slot('a', { fuse: true, w: 6 }), slot('b', { w: 6 })] });
    const snapshot = JSON.parse(JSON.stringify(card));
    const props = baseProps(card);
    const { container } = render(CardView, { props });
    const gut = container.querySelector('.fusegut') as HTMLElement;
    const lc = gut.previousElementSibling as HTMLElement;
    const rc = gut.nextElementSibling as HTMLElement;
    // ratio span: lb.left=0 .. rb.right=200 (v1: pointer x between the cell rects)
    stubRect(lc, 0, 95);
    stubRect(rc, 105, 200);
    return { card, snapshot, props, gut, lc, rc };
  }

  // jsdom normalizes the flex shorthand, so read the parsed grow factor, not the attribute text
  const flexOf = (el: HTMLElement) => el.style.flexGrow;

  it('updates both cells\' flex live and fires onfusew with both ids on up', async () => {
    const { card, snapshot, props, gut, lc, rc } = setup();
    await fireEvent(gut, pev('pointerdown', 100));
    document.dispatchEvent(pev('pointermove', 150)); // r=.75, T=2 → 1.5 / 0.5
    await tick();
    expect(flexOf(lc)).toBe('1.5');
    expect(flexOf(rc)).toBe('0.5');
    expect(card).toEqual(snapshot);

    document.dispatchEvent(pev('pointerup', 150));
    await tick();
    expect(props.onfusew).toHaveBeenCalledWith('a', 'b', 1.5, 0.5);
    expect(flexOf(lc)).toBe('1'); // back to model values until App commits
    expect(flexOf(rc)).toBe('1');
    expect(card).toEqual(snapshot);
  });

  it('clamps the ratio to [.15, .85]', async () => {
    const { props, gut, lc, rc } = setup();
    await fireEvent(gut, pev('pointerdown', 100));
    document.dispatchEvent(pev('pointermove', -500));
    await tick();
    expect(flexOf(lc)).toBe('0.3');
    expect(flexOf(rc)).toBe('1.7');
    document.dispatchEvent(pev('pointerup', -500));
    await tick();
    expect(props.onfusew).toHaveBeenCalledWith('a', 'b', 0.3, 1.7);
  });

  it('pointercancel restores both flex values and never fires onfusew', async () => {
    const { card, snapshot, props, gut, lc, rc } = setup();
    await fireEvent(gut, pev('pointerdown', 100));
    document.dispatchEvent(pev('pointermove', 150));
    await tick();
    expect(flexOf(lc)).toBe('1.5');
    document.dispatchEvent(pev('pointercancel', 150));
    await tick();
    expect(flexOf(lc)).toBe('1');
    expect(flexOf(rc)).toBe('1');
    expect(props.onfusew).not.toHaveBeenCalled();
    expect(card).toEqual(snapshot);
  });
});
