import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeNotebookDropCallbacks, type NotebookDropDeps } from './notebook-drop';
import { startPointerDrag, isDragging, _setElementFromPoint } from './engine';
import { dustState } from './dust.svelte';
import { toastState, dismissToast } from '../toast.svelte';
import type { Notebook, Section, Card } from '../types';
import type { CardType } from '../card-types';
import { proxiedCardType, snapshotType } from './notebook-drop.proxy-fixture.svelte';
import { pev, stubRect } from '../test-utils';

function card(id: string, sectionId: string, w?: number): Card {
  return { id, sectionId, position: 0, slots: [], ...(w !== undefined ? { w } : {}) };
}

function sec(id: string, cards: Card[] = [], over: Partial<Section> = {}): Section {
  return { id, notebookId: 'nb', name: `name-${id}`, position: 0, cards, ...over };
}

function nbOf(sections: Section[]): Notebook {
  return { id: 'nb', name: 'NB', createdAt: '', updatedAt: '', sections };
}

/** DOM mirror of the notebook: .card-shell > .room[data-section] > .room-grid > .furn[data-card]. */
function buildDom(nb: Notebook): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'card-shell';
  for (const s of nb.sections) {
    const room = document.createElement('div');
    room.className = s.kind === 'divider' ? 'room divider' : 'room';
    room.dataset.section = s.id;
    if (s.kind !== 'divider') {
      const grid = document.createElement('div');
      grid.className = 'grid room-grid';
      grid.dataset.section = s.id;
      for (const c of s.cards) {
        const furn = document.createElement('div');
        furn.className = 'furn';
        furn.dataset.card = c.id;
        grid.appendChild(furn);
      }
      room.appendChild(grid);
    }
    shell.appendChild(room);
  }
  document.body.appendChild(shell);
  return shell;
}

function depsOf(nb: Notebook, over: Partial<NotebookDropDeps> = {}): NotebookDropDeps {
  return {
    notebook: () => nb,
    selectedCard: () => null,
    selectedSection: () => null,
    clearSelection: vi.fn(),
    confirmDelete: vi.fn(() => Promise.resolve(true)),
    ...over,
  };
}

const gridOf = (shell: Element, id: string) =>
  shell.querySelector(`.room-grid[data-section="${id}"]`) as HTMLElement;
const furnOf = (shell: Element, id: string) =>
  shell.querySelector(`.furn[data-card="${id}"]`) as HTMLElement;
const roomOf = (shell: Element, id: string) =>
  shell.querySelector(`.room[data-section="${id}"]`) as HTMLElement;
const cardIds = (nb: Notebook, sid: string) =>
  nb.sections.find((s) => s.id === sid)?.cards.map((c) => c.id);
const sectionIds = (nb: Notebook) => nb.sections.map((s) => s.id);
const flush = () => new Promise<void>((r) => setTimeout(r));

function fixture() {
  const nb = nbOf([
    sec('s1', [card('a', 's1', 5), card('b', 's1'), card('c', 's1')]),
    sec('s2', [card('d', 's2'), card('e', 's2')]),
    sec('s3', [card('f', 's3')], { locked: true }),
    sec('div1', [], { kind: 'divider' }),
  ]);
  const shell = buildDom(nb);
  return { nb, shell };
}

beforeEach(() => {
  dismissToast();
  _setElementFromPoint(() => null);
});

afterEach(() => {
  document.dispatchEvent(new MouseEvent('pointercancel'));
  document.dispatchEvent(new MouseEvent('pointerup'));
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  _setElementFromPoint(null);
  dustState.show = false;
  dustState.hot = false;
  document.body.innerHTML = '';
});

describe('canDrag', () => {
  it('allows a card from an unlocked section', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    expect(cb.canDrag({ kind: 'card', id: 'a', srcEl: furnOf(shell, 'a') })).toBe(true);
  });

  it('blocks a card whose source section is locked (v1 :23)', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    expect(cb.canDrag({ kind: 'card', id: 'f', srcEl: furnOf(shell, 'f') })).toBe(false);
  });

  it('blocks an unknown card id', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    expect(cb.canDrag({ kind: 'card', id: 'nope', srcEl: furnOf(shell, 'a') })).toBe(false);
  });

  it('always allows a section drag, even locked or divider', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    expect(cb.canDrag({ kind: 'section', id: 's3', srcEl: roomOf(shell, 's3') })).toBe(true);
    expect(cb.canDrag({ kind: 'section', id: 'div1', srcEl: roomOf(shell, 'div1') })).toBe(true);
  });
});

describe('canDrop', () => {
  it('allows a card into an unlocked, non-divider section grid', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    const src = { kind: 'card' as const, id: 'a', srcEl: furnOf(shell, 'a') };
    expect(cb.canDrop(src, gridOf(shell, 's2'))).toBe(true);
  });

  it('blocks a card into a locked section grid (v1 :62)', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    const src = { kind: 'card' as const, id: 'a', srcEl: furnOf(shell, 'a') };
    expect(cb.canDrop(src, gridOf(shell, 's3'))).toBe(false);
  });

  it('blocks a card into a divider or unknown grid (v1 :61-62)', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    const src = { kind: 'card' as const, id: 'a', srcEl: furnOf(shell, 'a') };
    const orphan = document.createElement('div');
    orphan.className = 'grid room-grid';
    orphan.dataset.section = 'div1'; // a grid claiming a divider section
    expect(cb.canDrop(src, orphan)).toBe(false);
    delete orphan.dataset.section;
    expect(cb.canDrop(src, orphan)).toBe(false);
  });

  it('always allows a section onto the shell', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    expect(cb.canDrop({ kind: 'section', id: 's1', srcEl: roomOf(shell, 's1') }, shell)).toBe(true);
  });
});

describe('phWidth', () => {
  it('card → card.w, defaulting to 12; section → 8', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    expect(cb.phWidth({ kind: 'card', id: 'a', srcEl: furnOf(shell, 'a') })).toBe(5);
    expect(cb.phWidth({ kind: 'card', id: 'b', srcEl: furnOf(shell, 'b') })).toBe(12);
    expect(cb.phWidth({ kind: 'section', id: 's1', srcEl: roomOf(shell, 's1') })).toBe(8);
  });
});

describe('onDrop — card onto a grid', () => {
  it('reorders within the section (idx counts items minus the dragged card)', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    cb.onDrop({ kind: 'card', id: 'a', srcEl: furnOf(shell, 'a') }, { kind: 'grid', grid: gridOf(shell, 's1'), idx: 1 });
    expect(cardIds(nb, 's1')).toEqual(['b', 'a', 'c']);
    expect(nb.sections[0].cards.map((c) => c.position)).toEqual([0, 1, 2]);
  });

  it('dropping at its own position is a no-op on the order', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    cb.onDrop({ kind: 'card', id: 'a', srcEl: furnOf(shell, 'a') }, { kind: 'grid', grid: gridOf(shell, 's1'), idx: 0 });
    expect(cardIds(nb, 's1')).toEqual(['a', 'b', 'c']);
  });

  it('moves across sections at the given index and rewrites sectionId', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    cb.onDrop({ kind: 'card', id: 'a', srcEl: furnOf(shell, 'a') }, { kind: 'grid', grid: gridOf(shell, 's2'), idx: 0 });
    expect(cardIds(nb, 's1')).toEqual(['b', 'c']);
    expect(cardIds(nb, 's2')).toEqual(['a', 'd', 'e']);
    expect(nb.sections[1].cards[0].sectionId).toBe('s2');
  });

  it('clamps an index past the end to append (v1 :97)', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    cb.onDrop({ kind: 'card', id: 'a', srcEl: furnOf(shell, 'a') }, { kind: 'grid', grid: gridOf(shell, 's2'), idx: 9 });
    expect(cardIds(nb, 's2')).toEqual(['d', 'e', 'a']);
  });

  it('drops into an empty section', () => {
    const nb = nbOf([sec('s1', [card('a', 's1')]), sec('s2', [])]);
    const shell = buildDom(nb);
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    cb.onDrop({ kind: 'card', id: 'a', srcEl: furnOf(shell, 'a') }, { kind: 'grid', grid: gridOf(shell, 's2'), idx: 0 });
    expect(cardIds(nb, 's1')).toEqual([]);
    expect(cardIds(nb, 's2')).toEqual(['a']);
  });
});

describe('onDrop — card onto the dustbin (v1 :82)', () => {
  it('deletes the card and toasts', () => {
    const { nb, shell } = fixture();
    const deps = depsOf(nb);
    const cb = makeNotebookDropCallbacks(deps);
    cb.onDrop({ kind: 'card', id: 'b', srcEl: furnOf(shell, 'b') }, { kind: 'dust' });
    expect(cardIds(nb, 's1')).toEqual(['a', 'c']);
    expect(toastState.message).toBe('card deleted (Undo to restore)');
    expect(deps.clearSelection).not.toHaveBeenCalled();
  });

  it('clears the selection when the deleted card was selected', () => {
    const { nb, shell } = fixture();
    const deps = depsOf(nb, { selectedCard: () => 'b' });
    const cb = makeNotebookDropCallbacks(deps);
    cb.onDrop({ kind: 'card', id: 'b', srcEl: furnOf(shell, 'b') }, { kind: 'dust' });
    expect(deps.clearSelection).toHaveBeenCalledTimes(1);
  });
});

describe('onDrop — product onto a room grid (v1 :94)', () => {
  const prodType: CardType = {
    id: 'ct_note',
    name: 'Note',
    accent: '#111111',
    slots: [{ type: 'text', props: { text: 'hi' } }],
    varieties: [{ name: 'Blue', accent: '#2222ff' }, { name: 'Red', accent: '#ff2222' }],
  };
  const prodDeps = (nb: Notebook, over: Partial<NotebookDropDeps> = {}) =>
    depsOf(nb, {
      cardType: (id) => (id === prodType.id ? prodType : undefined),
      variety: (ct) => ct.varieties?.[0] ?? null,
      ...over,
    });

  it('stamps the product into the target section at the computed index', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(prodDeps(nb));
    cb.onDrop(
      { kind: 'product', id: 'ct_note', srcEl: document.createElement('button') },
      { kind: 'grid', grid: gridOf(shell, 's1'), idx: 1 },
    );
    const s1 = nb.sections[0];
    expect(s1.cards).toHaveLength(4);
    expect(s1.cards[1].typeId).toBe('ct_note'); // inserted before the old b
    expect([s1.cards[0].id, s1.cards[2].id, s1.cards[3].id]).toEqual(['a', 'b', 'c']);
    expect(s1.cards.map((c) => c.position)).toEqual([0, 1, 2, 3]);
    expect(toastState.message).toBe('placed "Note"');
  });

  it('applies the session-picked variety accent, defaulting to the first', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(
      prodDeps(nb, { variety: (ct) => ct.varieties?.find((v) => v.name === 'Red') ?? null }),
    );
    cb.onDrop(
      { kind: 'product', id: 'ct_note', srcEl: document.createElement('button') },
      { kind: 'grid', grid: gridOf(shell, 's2'), idx: 9 },
    );
    const placed = nb.sections[1].cards.at(-1)!;
    expect(placed.accent).toBe('#ff2222');
  });

  it('is a no-op for an unknown product or a lane target', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(prodDeps(nb));
    cb.onDrop(
      { kind: 'product', id: 'nope', srcEl: document.createElement('button') },
      { kind: 'grid', grid: gridOf(shell, 's1'), idx: 0 },
    );
    cb.onDrop(
      { kind: 'product', id: 'ct_note', srcEl: document.createElement('button') },
      { kind: 'lane', el: document.createElement('div') },
    );
    expect(cardIds(nb, 's1')).toEqual(['a', 'b', 'c']);
  });

  it('canDrop honours locked/divider sections for a product', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(prodDeps(nb));
    const src = { kind: 'product' as const, id: 'ct_note', srcEl: document.createElement('button') };
    expect(cb.canDrop(src, gridOf(shell, 's2'))).toBe(true);
    expect(cb.canDrop(src, gridOf(shell, 's3'))).toBe(false); // locked
    expect(cb.canDrag(src)).toBe(true);
    expect(cb.phWidth(src)).toBe(8);
  });

  // Regression: a live $state CardType proxy reaches stampSlot's structuredClone and throws
  // DataCloneError unless the injected cardType dep un-proxies first (App boundary snapshot).
  it('places a product resolved from a live $state proxy (no DataCloneError)', () => {
    const proxied = proxiedCardType();
    // Sanity: the raw proxy is genuinely un-cloneable, which is what broke drag-place.
    expect(() => structuredClone(proxied.slots[0].props)).toThrow();

    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(
      depsOf(nb, {
        cardType: (id) => (id === proxied.id ? snapshotType(proxied) : undefined),
        variety: (ct) => ct.varieties?.[0] ?? null,
      }),
    );
    expect(() =>
      cb.onDrop(
        { kind: 'product', id: proxied.id, srcEl: document.createElement('button') },
        { kind: 'grid', grid: gridOf(shell, 's1'), idx: 0 },
      ),
    ).not.toThrow();
    expect(nb.sections[0].cards[0].typeId).toBe('ct_proxy');
  });
});

describe('onDrop — section onto the shell', () => {
  it('reorders sections, dividers included', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    cb.onDrop({ kind: 'section', id: 's1', srcEl: roomOf(shell, 's1') }, { kind: 'grid', grid: shell, idx: 1 });
    expect(sectionIds(nb)).toEqual(['s2', 's1', 's3', 'div1']);
    expect(nb.sections.map((s) => s.position)).toEqual([0, 1, 2, 3]);
  });

  it('an index past the end appends', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    cb.onDrop({ kind: 'section', id: 's1', srcEl: roomOf(shell, 's1') }, { kind: 'grid', grid: shell, idx: 9 });
    expect(sectionIds(nb)).toEqual(['s2', 's3', 'div1', 's1']);
  });

  it('dropping at its own position is a no-op on the order', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    cb.onDrop({ kind: 'section', id: 's1', srcEl: roomOf(shell, 's1') }, { kind: 'grid', grid: shell, idx: 0 });
    expect(sectionIds(nb)).toEqual(['s1', 's2', 's3', 'div1']);
  });
});

describe('onDrop — section onto the dustbin (v1 :85)', () => {
  it('keep-at-least-one guard: last section only toasts, no confirm', async () => {
    const nb = nbOf([sec('s1', [card('a', 's1')])]);
    const shell = buildDom(nb);
    const deps = depsOf(nb);
    const cb = makeNotebookDropCallbacks(deps);
    cb.onDrop({ kind: 'section', id: 's1', srcEl: roomOf(shell, 's1') }, { kind: 'dust' });
    await flush();
    expect(toastState.message).toBe('keep at least one section');
    expect(deps.confirmDelete).not.toHaveBeenCalled();
    expect(sectionIds(nb)).toEqual(['s1']);
  });

  it('confirms, deletes, and toasts', async () => {
    const { nb, shell } = fixture();
    const deps = depsOf(nb);
    const cb = makeNotebookDropCallbacks(deps);
    cb.onDrop({ kind: 'section', id: 's2', srcEl: roomOf(shell, 's2') }, { kind: 'dust' });
    await flush();
    expect(deps.confirmDelete).toHaveBeenCalledWith('Delete section "name-s2"? (Undoable)', 'Delete Section');
    expect(sectionIds(nb)).toEqual(['s1', 's3', 'div1']);
    expect(toastState.message).toBe('section deleted');
    expect(deps.clearSelection).not.toHaveBeenCalled();
  });

  it('a declined confirm deletes nothing', async () => {
    const { nb, shell } = fixture();
    const deps = depsOf(nb, { confirmDelete: vi.fn(() => Promise.resolve(false)) });
    const cb = makeNotebookDropCallbacks(deps);
    cb.onDrop({ kind: 'section', id: 's2', srcEl: roomOf(shell, 's2') }, { kind: 'dust' });
    await flush();
    expect(sectionIds(nb)).toEqual(['s1', 's2', 's3', 'div1']);
  });

  it('clears the selection when the section or one of its cards was selected', async () => {
    const { nb, shell } = fixture();
    const bySection = depsOf(nb, { selectedSection: () => 's2' });
    makeNotebookDropCallbacks(bySection).onDrop(
      { kind: 'section', id: 's2', srcEl: roomOf(shell, 's2') },
      { kind: 'dust' },
    );
    await flush();
    expect(bySection.clearSelection).toHaveBeenCalledTimes(1);

    const nb2 = nbOf([sec('s1', [card('a', 's1')]), sec('s2', [card('d', 's2')])]);
    const shell2 = buildDom(nb2);
    const byCard = depsOf(nb2, { selectedCard: () => 'd' });
    makeNotebookDropCallbacks(byCard).onDrop(
      { kind: 'section', id: 's2', srcEl: roomOf(shell2, 's2') },
      { kind: 'dust' },
    );
    await flush();
    expect(byCard.clearSelection).toHaveBeenCalledTimes(1);
  });
});

// Full gesture through the engine: pointerdown on a grip → moves → up, with the
// hit-test probe injected (jsdom has no layout).
describe('engine integration — grip pointer sequence', () => {
  it('moves a card within its section', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    const a = furnOf(shell, 'a');
    const c = furnOf(shell, 'c');
    stubRect(furnOf(shell, 'b'), { left: 0, width: 100, height: 40 });
    stubRect(c, { left: 100, width: 100, height: 40 });
    _setElementFromPoint(() => c);
    startPointerDrag({ kind: 'card', id: 'a', srcEl: a }, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 180, 20)); // past c's midpoint → after c
    document.dispatchEvent(pev('pointerup', 180, 20));
    expect(cardIds(nb, 's1')).toEqual(['b', 'c', 'a']);
  });

  it('moves a card across sections', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    const a = furnOf(shell, 'a');
    const d = furnOf(shell, 'd');
    stubRect(d, { left: 0, width: 100, height: 40 });
    stubRect(furnOf(shell, 'e'), { left: 100, width: 100, height: 40 });
    _setElementFromPoint(() => d);
    startPointerDrag({ kind: 'card', id: 'a', srcEl: a }, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 20, 20)); // before d's midpoint
    document.dispatchEvent(pev('pointerup', 20, 20));
    expect(cardIds(nb, 's1')).toEqual(['b', 'c']);
    expect(cardIds(nb, 's2')).toEqual(['a', 'd', 'e']);
  });

  it('a locked source never starts a gesture', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    startPointerDrag({ kind: 'card', id: 'f', srcEl: furnOf(shell, 'f') }, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 100, 100));
    expect(isDragging()).toBe(false);
    document.dispatchEvent(pev('pointerup', 100, 100));
    expect(cardIds(nb, 's3')).toEqual(['f']);
  });

  it('a locked target grid yields no drop', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    const f = furnOf(shell, 'f');
    stubRect(f, { left: 0, width: 100, height: 40 });
    _setElementFromPoint(() => f);
    startPointerDrag({ kind: 'card', id: 'a', srcEl: furnOf(shell, 'a') }, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 20, 20));
    expect(gridOf(shell, 's3').classList.contains('drop-on')).toBe(false);
    document.dispatchEvent(pev('pointerup', 20, 20));
    expect(cardIds(nb, 's1')).toEqual(['a', 'b', 'c']);
    expect(cardIds(nb, 's3')).toEqual(['f']);
  });

  it('reorders sections via the shell grid (vertical midpoint)', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    const r1 = roomOf(shell, 's1');
    const r3 = roomOf(shell, 's3');
    stubRect(r3, { top: 200, width: 600, height: 100 });
    stubRect(roomOf(shell, 's2'), { top: 100, width: 600, height: 100 });
    _setElementFromPoint(() => r3);
    startPointerDrag({ kind: 'section', id: 's1', srcEl: r1 }, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 10, 280)); // past s3's vertical midpoint → after s3
    document.dispatchEvent(pev('pointerup', 10, 280));
    expect(sectionIds(nb)).toEqual(['s2', 's3', 's1', 'div1']);
  });

  it('drops a tag chip onto a card and applies the tag (pointer engine, lane target)', () => {
    const { nb, shell } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    const chip = document.createElement('span');
    chip.dataset.tag = 'algebra';
    document.body.appendChild(chip);
    const b = furnOf(shell, 'b');
    _setElementFromPoint(() => b);
    startPointerDrag({ kind: 'tag', id: 'algebra', srcEl: chip }, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 50, 20));
    expect(b.classList.contains('drop-on')).toBe(true);
    document.dispatchEvent(pev('pointerup', 50, 20));
    expect(nb.sections[0].cards.find((c) => c.id === 'b')?.tags).toEqual(['algebra']);
  });

  it('a tag dropped within the tag grid reorders cats (D26)', () => {
    const { nb } = fixture();
    nb.cats = ['p', 'q', 'r'];
    const grid = document.createElement('div');
    grid.className = 'palette tag-grid';
    const chips: Record<string, HTMLElement> = {};
    for (const t of nb.cats) {
      const c = document.createElement('span');
      c.className = 'chip';
      c.dataset.tagreorder = t;
      grid.appendChild(c);
      chips[t] = c;
    }
    document.body.appendChild(grid);
    stubRect(chips.q, { left: 0, width: 100, height: 40 });
    stubRect(chips.r, { left: 100, width: 100, height: 40 });
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    _setElementFromPoint(() => chips.r);
    startPointerDrag({ kind: 'tag', id: 'p', srcEl: chips.p }, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 180, 20)); // past r's midpoint → after r
    document.dispatchEvent(pev('pointerup', 180, 20));
    expect(nb.cats).toEqual(['q', 'r', 'p']);
  });

  it('a tag dropped on empty space applies nothing', () => {
    const { nb } = fixture();
    const cb = makeNotebookDropCallbacks(depsOf(nb));
    const chip = document.createElement('span');
    document.body.appendChild(chip);
    _setElementFromPoint(() => null);
    startPointerDrag({ kind: 'tag', id: 'algebra', srcEl: chip }, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 50, 20));
    document.dispatchEvent(pev('pointerup', 50, 20));
    for (const s of nb.sections) for (const c of s.cards) expect(c.tags).toBeUndefined();
  });
});
