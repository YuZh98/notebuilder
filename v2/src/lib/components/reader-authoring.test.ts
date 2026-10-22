import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import Reader from './Reader.svelte';
import { mode } from '../stores/mode';
import { clearHistory, canUndo } from '../history.svelte';
import { resetSession } from '../session.svelte';
import type { Notebook, Section, Card } from '../types';

function card(id: string, sectionId: string, over: Partial<Card> = {}): Card {
  return {
    id,
    sectionId,
    position: 0,
    slots: [{ id: `${id}-s`, type: 'text', props: { text: `body-${id}` } }],
    ...over,
  };
}

function sec(id: string, over: Partial<Section> = {}): Section {
  return { id, notebookId: 'nb1', name: `name-${id}`, position: 0, cards: [], ...over };
}

/** One room, two cards, one free tag — enough for tag-everywhere and per-card ops. */
function nb(): Notebook {
  return {
    id: 'nb1',
    name: 'Shared Deck',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    cats: ['algebra'],
    sections: [sec('s1', { cards: [card('c1', 's1'), card('c2', 's1')] })],
  };
}

/** jsdom has no PointerEvent; the drag listeners key off the type string. */
const pev = (type: string, x: number, y = 0): PointerEvent =>
  new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }) as PointerEvent;

/** jsdom has no layout: the resize gesture divides a measured rect into 12 columns. */
function stubRect(el: Element, width: number) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  clearHistory();
  resetSession();
  mode.set('edit');
});

afterEach(() => {
  clearHistory();
  resetSession();
  mode.set('edit');
  delete document.body.dataset.theme;
});

const topBtn = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('#topright button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

const room = (c: HTMLElement, i = 0) => [...c.querySelectorAll<HTMLElement>('.room[data-section]')][i];
const sectionNames = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLInputElement>('input.section-name')].map((i) => i.value);
const cardIds = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>('.furn[data-card]')].map((f) => f.getAttribute('data-card')!);
const furn = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`.furn[data-card="${id}"]`)!;
/** A card's tags, straight off the rendered comma box — the DOM's view of `card.tags`. */
const tagsOf = (c: HTMLElement, id: string) =>
  furn(c, id).querySelector<HTMLInputElement>('.tags-input')!.value;

const undoBtn = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('#topright [title="Undo"]')!;
const clickUndo = async (c: HTMLElement) => {
  await fireEvent.click(undoBtn(c));
  await tick();
};

/** Remix unlocks authoring, then Edit swaps the locked Study boot for the author chrome. */
async function authoring(notebook: Notebook = nb()) {
  const { container } = render(Reader, { props: { notebook, shared: true } });
  await fireEvent.click(container.querySelector('[data-act="remix"]') as Element);
  await tick();
  await fireEvent.click(topBtn(container, 'Edit'));
  await tick();
  clearHistory(); // the unlock itself is not an author mutation
  return container;
}

/** Select a room (its own click handler); card clicks stopPropagation, so this is exclusive. */
async function selectSection(c: HTMLElement, i = 0) {
  await fireEvent.click(room(c, i));
  await tick();
}

async function selectCard(c: HTMLElement, id: string) {
  await fireEvent.click(furn(c, id));
  await tick();
}

/** Toggle a Section-ops chip in the sidebar onto/off the current selection. */
async function svcChip(c: HTMLElement, key: string) {
  const chip = c.querySelector<HTMLButtonElement>(`[data-svc="${key}"]`)!;
  await fireEvent.click(chip);
  await tick();
  return c.querySelector<HTMLButtonElement>(`[data-svc="${key}"]`)!;
}

describe('Reader authoring — sections', () => {
  it('adds a section from the topbar and deletes it again, undoably', async () => {
    const c = await authoring();
    await fireEvent.click(topBtn(c, 'section'));
    await tick();
    expect(sectionNames(c)).toEqual(['name-s1', 'Section 2']);

    // The fresh section is empty, so the delete asks nothing.
    await fireEvent.click(
      room(c, 1).querySelector('.section-head [title="Delete section"]') as HTMLElement,
    );
    await tick();
    expect(sectionNames(c)).toEqual(['name-s1']);
    expect(window.confirm).not.toHaveBeenCalled();

    await clickUndo(c); // un-delete
    expect(sectionNames(c)).toEqual(['name-s1', 'Section 2']);
    await clickUndo(c); // un-add
    expect(sectionNames(c)).toEqual(['name-s1']);
  });

  it('deleting a section that holds cards confirms first, and a refusal changes nothing', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const c = await authoring();
    await fireEvent.click(
      room(c, 0).querySelector('.section-head [title="Delete section"]') as HTMLElement,
    );
    await tick();

    expect(window.confirm).toHaveBeenCalledWith('Delete section "name-s1" and its 2 card(s)?');
    expect(sectionNames(c)).toEqual(['name-s1']);
    expect(cardIds(c)).toEqual(['c1', 'c2']);
    expect(canUndo(), 'a refused delete costs no undo step').toBe(false);
  });

  it('renames a section through its name field, and Cmd+Z puts the old name back', async () => {
    const c = await authoring();
    const field = room(c, 0).querySelector<HTMLInputElement>('input.section-name')!;
    expect(field.getAttribute('data-history')).toBe('edit');

    field.value = 'Chapter One';
    await fireEvent.input(field);
    await fireEvent.change(field);
    await tick();
    expect(sectionNames(c)).toEqual(['Chapter One']);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    await tick();
    expect(sectionNames(c)).toEqual(['name-s1']);
  });
});

describe('Reader authoring — cards', () => {
  it('“+ note” appends a card to that section and the ✕ removes it, both undoable', async () => {
    const c = await authoring();
    const addNote = [...room(c, 0).querySelectorAll('.add-row button')].find((b) =>
      b.textContent?.includes('+ note'),
    ) as HTMLElement;

    await fireEvent.click(addNote);
    await tick();
    const ids = cardIds(c);
    expect(ids.slice(0, 2)).toEqual(['c1', 'c2']);
    expect(ids).toHaveLength(3);
    const added = ids[2];
    expect(furn(c, added).textContent).toContain('Write anything');

    await fireEvent.click(furn(c, added).querySelector('[title="Delete card"]') as HTMLElement);
    await tick();
    expect(cardIds(c)).toEqual(['c1', 'c2']);

    await clickUndo(c);
    expect(cardIds(c)).toEqual(['c1', 'c2', added]);
    await clickUndo(c);
    expect(cardIds(c)).toEqual(['c1', 'c2']);
  });

  it('stamps a gallery product into the section, closing the gallery behind it', async () => {
    const c = await authoring();
    const openGallery = [...room(c, 0).querySelectorAll('.add-row button')].find((b) =>
      b.textContent?.includes('gallery'),
    ) as HTMLElement;

    await fireEvent.click(openGallery);
    await tick();
    const stamp = [...c.querySelectorAll('.gallery-stamp')].find(
      (b) => b.querySelector('strong')?.textContent === 'Flashcard',
    ) as HTMLElement;
    expect(stamp).toBeDefined();

    await fireEvent.click(stamp);
    await tick();
    const added = cardIds(c)[2];
    expect(cardIds(c)).toHaveLength(3);
    expect(c.querySelector('.gallery'), 'stamping closes the gallery').toBeNull();
    // Flashcard, not a plain note: the stamped card carries the type's flip face.
    expect(furn(c, added).querySelector('.fc-edit')).not.toBeNull();

    await clickUndo(c);
    expect(cardIds(c)).toEqual(['c1', 'c2']);
  });

  it('drag-resizing a card writes its width through to the model', async () => {
    const c = await authoring();
    const target = furn(c, 'c1');
    stubRect(target.parentElement!, 1200); // 12 columns of 100px
    const rz = target.querySelector('.rz') as HTMLElement;

    await fireEvent(rz, pev('pointerdown', 400));
    document.dispatchEvent(pev('pointermove', 200)); // dx = -200 → 12 - 2 columns
    await tick();
    document.dispatchEvent(pev('pointerup', 200));
    await tick();

    // Committed, not merely previewed: the width survives the gesture's live layer being dropped.
    const w = () => furn(c, 'c1').style.getPropertyValue('--w').trim();
    expect(w()).toBe('10');
    await clickUndo(c);
    expect(w(), 'undo restores the default width').toBe('12');
  });
});

describe('Reader authoring — tags across cards', () => {
  it('applies a tag to two cards, renames it everywhere, then deletes it everywhere', async () => {
    const c = await authoring();
    const chip = () => c.querySelector<HTMLElement>('.tagchip[data-tag]')!;

    await selectCard(c, 'c1');
    await fireEvent.click(chip());
    await tick();
    expect(tagsOf(c, 'c1')).toBe('algebra');
    expect(tagsOf(c, 'c2')).toBe('');

    await selectCard(c, 'c2');
    await fireEvent.click(chip());
    await tick();
    expect(tagsOf(c, 'c2')).toBe('algebra');

    // Rename everywhere, straight through the chip's own inline input.
    const tagInput = chip().querySelector<HTMLInputElement>('.taginput')!;
    tagInput.value = 'linear';
    await fireEvent.change(tagInput);
    await tick();
    expect(chip().getAttribute('data-tag')).toBe('linear');
    expect([tagsOf(c, 'c1'), tagsOf(c, 'c2')]).toEqual(['linear', 'linear']);

    // Delete everywhere (confirmed), then undo restores both cards and the chip.
    await fireEvent.click(chip().querySelector('.tagx') as HTMLElement);
    await tick();
    expect(window.confirm).toHaveBeenCalledWith(
      'Delete tag “linear”?\nIt will be removed from 2 cards. (Undoable)',
    );
    expect(c.querySelector('.tagchip[data-tag]')).toBeNull();
    expect([tagsOf(c, 'c1'), tagsOf(c, 'c2')]).toEqual(['', '']);

    await clickUndo(c);
    expect(chip().getAttribute('data-tag')).toBe('linear');
    expect([tagsOf(c, 'c1'), tagsOf(c, 'c2')]).toEqual(['linear', 'linear']);
  });

  it('a second click on the chip takes the tag off the selected card only', async () => {
    const c = await authoring();
    const chip = () => c.querySelector<HTMLElement>('.tagchip[data-tag]')!;
    await selectCard(c, 'c1');
    await fireEvent.click(chip());
    await selectCard(c, 'c2');
    await fireEvent.click(chip());
    await tick();

    await selectCard(c, 'c1');
    await fireEvent.click(chip());
    await tick();
    expect([tagsOf(c, 'c1'), tagsOf(c, 'c2')]).toEqual(['', 'algebra']);
    // The tag survives as a free tag even when no longer on that card.
    expect(chip().getAttribute('data-tag')).toBe('algebra');
  });
});

describe('Reader authoring — section services', () => {
  it('a chip attaches a service to the selected section and detaches it again', async () => {
    const c = await authoring();
    await selectSection(c);
    expect(room(c).querySelector('.svcbar')).toBeNull();

    expect((await svcChip(c, 'search')).classList.contains('on')).toBe(true);
    expect(room(c).querySelector('[data-svcbtn="search"]'), 'the bar gains the item').not.toBeNull();

    expect((await svcChip(c, 'search')).classList.contains('on')).toBe(false);
    expect(room(c).querySelector('[data-svcbtn="search"]')).toBeNull();

    await clickUndo(c);
    expect(room(c).querySelector('[data-svcbtn="search"]')).not.toBeNull();
  });

  it('with nothing selected the chip refuses rather than guessing a section', async () => {
    const c = await authoring();
    await svcChip(c, 'search');
    expect(room(c).querySelector('[data-svcbtn="search"]')).toBeNull();
    expect(canUndo()).toBe(false);
  });

  it('the pin service arms the per-card pin, which writes the pinned tag', async () => {
    const c = await authoring();
    expect(c.querySelector('[data-act="pin"]')).toBeNull();
    await selectSection(c);
    await svcChip(c, 'pin');

    const pin = () => furn(c, 'c1').querySelector<HTMLElement>('[data-act="pin"]')!;
    expect(pin().textContent?.trim()).toBe('📍');
    await fireEvent.click(pin());
    await tick();
    expect(tagsOf(c, 'c1')).toBe('pinned');
    expect(pin().textContent?.trim()).toBe('📌');
    expect(tagsOf(c, 'c2'), 'pinning is per card').toBe('');

    await clickUndo(c);
    expect(tagsOf(c, 'c1')).toBe('');
    expect(pin().textContent?.trim()).toBe('📍');
  });

  it('the archive service hides the card from the study grid, and undo brings it back', async () => {
    const c = await authoring();
    await selectSection(c);
    await svcChip(c, 'archive');
    await fireEvent.click(topBtn(c, 'Study'));
    await tick();

    const arch = furn(c, 'c1').querySelector<HTMLElement>('[data-act="arch"]')!;
    expect(arch).not.toBeNull();
    await fireEvent.click(arch);
    await tick();
    expect(cardIds(c), 'the archived card leaves the live view').toEqual(['c2']);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true }));
    await tick();
    expect(cardIds(c)).toEqual(['c1', 'c2']);
  });
});
