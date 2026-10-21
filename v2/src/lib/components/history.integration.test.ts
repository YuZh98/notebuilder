import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../App.svelte';
import { mode } from '../stores/mode';
import { place } from '../stores/place';
import { clearHistory, undo, canUndo } from '../history.svelte';
import { factory, hydrateFactory } from '../bench.svelte';

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  hydrateFactory(null);
  mode.set('edit');
  place.set('house');
  clearHistory();
});

afterEach(() => {
  mode.set('edit');
  place.set('house');
  vi.restoreAllMocks();
});

const cardCount = (c: HTMLElement) => c.querySelectorAll('[data-card]').length;

const stateShot = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>('.room[data-section]')].map((room) => ({
    id: room.getAttribute('data-section'),
    name: room.querySelector<HTMLInputElement>('input.section-name')?.value ?? '',
    cards: [...room.querySelectorAll<HTMLElement>('.furn[data-card]')].map((f) => ({
      id: f.getAttribute('data-card'),
      body: [...f.querySelectorAll('.slot')].map((s) => s.textContent?.trim() ?? '').join('|'),
    })),
  }));

describe('undo coverage — discrete author mutations', () => {
  it('toolbar undo and Cmd+Z land on the same state, not just the same count', async () => {
    const { container } = render(App);
    await tick();
    const before = stateShot(container);
    // Delete a card to create an undo step
    const del = container.querySelector<HTMLButtonElement>('button[title="Delete card"]')!;
    await fireEvent.click(del);
    await tick();
    expect(stateShot(container)).not.toEqual(before);
    // Undo via toolbar button
    const undoBtn = container.querySelector<HTMLButtonElement>('button[title="Undo"]')!;
    expect(undoBtn.disabled).toBe(false);
    await fireEvent.click(undoBtn);
    await tick();
    const viaToolbar = stateShot(container);
    expect(viaToolbar).toEqual(before);
    // Delete again, this time undo via Cmd+Z
    const del2 = container.querySelector<HTMLButtonElement>('button[title="Delete card"]')!;
    await fireEvent.click(del2);
    await tick();
    expect(stateShot(container)).not.toEqual(before);
    await fireEvent.keyDown(container, { key: 'z', metaKey: true });
    await tick();
    expect(stateShot(container)).toEqual(viaToolbar);
  });

  it('delete a card via the ✕ button, then undo restores it where it was', async () => {
    const { container } = render(App);
    await tick();
    const room = container.querySelector<HTMLElement>('.room[data-section]')!;
    const cardsOf = () =>
      [...room.querySelectorAll<HTMLElement>('.furn[data-card]')].map((f) => f.getAttribute('data-card'));
    const doomed = room.querySelector<HTMLElement>('.furn[data-card]')!;
    const id = doomed.getAttribute('data-card')!;
    const body = doomed.querySelector('.slot')!.textContent!.trim();
    const idsBefore = cardsOf();
    await fireEvent.click(doomed.querySelector<HTMLButtonElement>('button[title="Delete card"]')!);
    await tick();
    expect(container.querySelector(`[data-card="${id}"]`)).toBeNull();
    expect(canUndo()).toBe(true);
    undo();
    await tick();
    const back = container.querySelector<HTMLElement>(`.furn[data-card="${id}"]`)!;
    expect(back, 'the deleted card must come back').not.toBeNull();
    expect(back.querySelector('.slot')!.textContent!.trim()).toBe(body);
    expect(cardsOf(), 'and in its old position').toEqual(idsBefore);
  });

  it('add a section, then undo removes that section (single step)', async () => {
    const { container } = render(App);
    await tick();
    const before = stateShot(container);
    const add = container.querySelector<HTMLButtonElement>('button.add-section')!;
    await fireEvent.click(add);
    await tick();
    const added = stateShot(container).filter((s) => !before.some((b) => b.id === s.id));
    expect(added.map((s) => s.name), 'exactly one fresh, named section').toEqual([
      `Section ${before.length + 1}`,
    ]);
    undo();
    await tick();
    expect(stateShot(container)).toEqual(before);
    expect(canUndo()).toBe(false);
  });

  it('enable a section service from the sidebar, then undo disables it', async () => {
    const { container } = render(App);
    await tick();
    // Select a (non-divider) section so the Section-ops chips act on it.
    const room = container.querySelector<HTMLElement>('.room[data-section]')!;
    await fireEvent.click(room);
    await tick();
    const chip = container.querySelector<HTMLButtonElement>('button[data-svc="pin"]')!;
    await fireEvent.click(chip);
    await tick();
    expect(chip.classList.contains('on')).toBe(true);
    expect(canUndo()).toBe(true);
    undo();
    await tick();
    const chip2 = container.querySelector<HTMLButtonElement>('button[data-svc="pin"]')!;
    expect(chip2.classList.contains('on')).toBe(false);
  });

  it('coalesces a multi-keystroke tag edit into one undo step, and undo reverts it', async () => {
    const { container } = render(App);
    await tick();
    const tagsOf = () => container.querySelector<HTMLInputElement>('.furn[data-card] .tags-input')!;
    const tags = tagsOf();
    const original = tags.value;
    tags.focus();
    await fireEvent.input(tags, { target: { value: 'a' } });
    await fireEvent.input(tags, { target: { value: 'ab' } });
    await fireEvent.input(tags, { target: { value: 'abc' } });
    await fireEvent.change(tags);
    await tick();
    expect(tagsOf().value, 'the edit must reach the card').toBe('abc');
    expect(canUndo()).toBe(true);
    undo();
    await tick();
    expect(tagsOf().value).toBe(original);
    expect(canUndo()).toBe(false); // exactly one step
  });

  it('a reader flip in study mode creates no undo step', async () => {
    const { container } = render(App);
    mode.set('study');
    await tick();
    // The demo flip card exposes a "click to flip" affordance in study mode.
    const fc = container.querySelector<HTMLElement>('.fc');
    expect(fc).not.toBeNull();
    expect(fc!.classList.contains('flipped')).toBe(false);
    await fireEvent.click(fc!);
    await tick();
    expect(
      container.querySelector<HTMLElement>('.fc')!.classList.contains('flipped'),
      'the card must actually flip',
    ).toBe(true);
    expect(canUndo()).toBe(false);
  });

  it('deleting a card type from the Factory inventory is undoable', async () => {
    const { container } = render(App);
    place.set('factory');
    await tick();
    const chip = container.querySelector<HTMLElement>('.prodchip[data-prod="ct_note"]');
    expect(chip, 'the Note product is missing from the Inventory').not.toBeNull();
    const label = chip!.textContent!.trim();
    clearHistory();
    // The delete sits behind an async confirm, so the mutation lands a microtask after the click.
    await fireEvent.click(chip!.parentElement!.querySelector<HTMLButtonElement>('.chipx')!);
    await tick();
    await tick();
    expect(container.querySelector('[data-prod="ct_note"]'), 'the product must go').toBeNull();
    await fireEvent.click(container.querySelector<HTMLButtonElement>('button[title="Undo"]')!);
    await tick();
    expect(container.querySelector('[data-prod="ct_note"]')?.textContent?.trim()).toBe(label);
  });

  it('adding a Factory container is undoable', async () => {
    const { container } = render(App);
    place.set('factory');
    await tick();
    const benchIds = () => factory.benches.map((b) => b.id);
    const before = benchIds();
    const activeBefore = factory.active;
    expect(before.length, 'the Factory must open on a bench').toBeGreaterThan(0);
    clearHistory();
    await fireEvent.click(
      container.querySelector<HTMLButtonElement>('button[title="Add a new product container"]')!,
    );
    await tick();
    expect(benchIds().length).toBe(before.length + 1);
    expect(before).not.toContain(factory.active);
    await fireEvent.click(container.querySelector<HTMLButtonElement>('button[title="Undo"]')!);
    await tick();
    expect(benchIds()).toEqual(before);
    expect(factory.active).toBe(activeBefore);
  });
});

describe('undo keeps a still-valid selection (BL4 — D25 revised)', () => {
  it('a panel edit undone keeps the inspector open on the same card', async () => {
    const { container } = render(App);
    await tick();
    const furn = [...container.querySelectorAll<HTMLElement>('.furn')].find((f) =>
      f.querySelector('.text-input-edit'),
    )!;
    const cardId = furn.getAttribute('data-card');
    await fireEvent.click(furn);
    await tick();
    const input = container.querySelector<HTMLInputElement>(
      '#side .card-panel .text-input-edit input',
    )!;
    clearHistory();
    input.value = 'edited';
    await fireEvent.input(input);
    await fireEvent.focusOut(input);
    await tick();
    undo();
    await tick();
    expect(container.querySelector('#side .card-panel'), 'inspector must survive the undo').not.toBeNull();
    expect(container.querySelector(`.furn.sel[data-card="${cardId}"]`)).not.toBeNull();
  });

  it('a section stays selected across an undo of a service toggle', async () => {
    const { container } = render(App);
    await tick();
    const room = container.querySelector<HTMLElement>('.room[data-section]')!;
    await fireEvent.click(room);
    await tick();
    expect(container.querySelector('.room.sel')).not.toBeNull();
    clearHistory();
    await fireEvent.click(container.querySelector('#side [data-svc="pin"]')!);
    await tick();
    undo();
    await tick();
    expect(container.querySelector('.room.sel'), 'section selection must survive the undo').not.toBeNull();
  });

  it('redo of a removal clears the now-dangling card selection', async () => {
    const { container } = render(App);
    await tick();
    const furn = container.querySelector<HTMLElement>('.furn[data-card]')!;
    const cardId = furn.getAttribute('data-card')!;
    await fireEvent.click(furn);
    await tick();
    clearHistory();
    await fireEvent.click(container.querySelector('.card-panel button[title="Remove card"]')!);
    await tick();
    undo();
    await tick();
    await fireEvent.click(container.querySelector(`.furn[data-card="${cardId}"]`)!);
    await tick();
    expect(container.querySelector('#side .card-panel')).not.toBeNull();
    await fireEvent.keyDown(container, { key: 'z', metaKey: true, shiftKey: true });
    await tick();
    expect(container.querySelector(`.furn[data-card="${cardId}"]`)).toBeNull();
    expect(container.querySelector('#side .card-panel'), 'a dangling selection must clear').toBeNull();
  });
});

describe('tags panel — one undo step per operation (D)', () => {
  async function selectFirstCard(container: HTMLElement) {
    const furn = container.querySelector<HTMLElement>('.furn')!;
    await fireEvent.click(furn);
    await tick();
    return furn;
  }

  async function addTag(container: HTMLElement, name: string) {
    const input = container.querySelector<HTMLInputElement>('.tags-panel .tag-add input')!;
    input.value = name;
    await fireEvent.input(input);
    await fireEvent.click(container.querySelector('.tags-panel .tag-add button')!);
    await tick();
  }

  const cardTagsInput = (furn: HTMLElement) =>
    furn.querySelector<HTMLInputElement>('.tags-input')!;

  const tagsOf = (container: HTMLElement, cardId: string) =>
    container.querySelector<HTMLInputElement>(`.furn[data-card="${cardId}"] .tags-input`)!;

  async function selectCard(container: HTMLElement, cardId: string) {
    await fireEvent.click(container.querySelector<HTMLElement>(`.furn[data-card="${cardId}"]`)!);
    await tick();
  }

  async function clickChip(container: HTMLElement, name: string) {
    await fireEvent.click(container.querySelector(`.tags-panel [data-tag="${name}"]`)!);
    await tick();
  }

  /** D26: the add input creates a FREE tag; a chip click applies it to the selection. */
  async function addAndApply(container: HTMLElement, name: string) {
    await addTag(container, name);
    await clickChip(container, name);
  }

  /** Put `name` on two demo cards, so an everywhere-op has more than one card to prove itself on. */
  async function tagTwoCards(container: HTMLElement, name: string) {
    await selectCard(container, 'card_1');
    await addAndApply(container, name);
    await selectCard(container, 'card_2');
    await clickChip(container, name);
    expect(tagsOf(container, 'card_1').value).toContain(name);
    expect(tagsOf(container, 'card_2').value).toContain(name);
  }

  it('creating a free tag needs no selection, touches no card, and is one undo step', async () => {
    const { container } = render(App);
    await tick();
    clearHistory();
    await addTag(container, 'algebra');
    expect(container.querySelector('.tags-panel [data-tag="algebra"]')).not.toBeNull();
    for (const input of container.querySelectorAll<HTMLInputElement>('.tags-input')) {
      expect(input.value).not.toContain('algebra');
    }
    expect(canUndo()).toBe(true);
    undo();
    await tick();
    expect(canUndo(), 'create-tag must be exactly one undo entry').toBe(false);
    expect(container.querySelector('.tags-panel [data-tag="algebra"]')).toBeNull();
  });

  it('renaming updates every tagged card and the chip in one undo step', async () => {
    const { container } = render(App);
    await tick();
    await tagTwoCards(container, 'old');
    clearHistory();
    const rename = container.querySelector<HTMLInputElement>(
      '.tags-panel [data-tag="old"] input',
    )!;
    rename.value = 'new';
    await fireEvent.change(rename);
    await tick();
    expect(container.querySelector('.tags-panel [data-tag="new"]')).not.toBeNull();
    expect(container.querySelector('.tags-panel [data-tag="old"]')).toBeNull();
    for (const id of ['card_1', 'card_2']) {
      expect(tagsOf(container, id).value).toContain('new');
      expect(tagsOf(container, id).value).not.toContain('old');
    }
    expect(canUndo()).toBe(true);
    undo();
    await tick();
    expect(canUndo(), 'rename must be exactly one undo entry').toBe(false);
    for (const id of ['card_1', 'card_2']) {
      expect(tagsOf(container, id).value).toContain('old');
      expect(tagsOf(container, id).value).not.toContain('new');
    }
  });

  it('deleting a tag strips it from every card behind a confirm, one undo step', async () => {
    const { container } = render(App);
    await tick();
    await tagTwoCards(container, 'gone');
    clearHistory();
    await fireEvent.click(container.querySelector('.tags-panel [data-tag="gone"] .tagx')!);
    await tick();
    expect(window.confirm).toHaveBeenCalled();
    expect(container.querySelector('.tags-panel [data-tag="gone"]')).toBeNull();
    for (const id of ['card_1', 'card_2']) {
      expect(tagsOf(container, id).value).not.toContain('gone');
    }
    expect(canUndo()).toBe(true);
    undo();
    await tick();
    expect(canUndo(), 'delete must be exactly one undo entry').toBe(false);
    for (const id of ['card_1', 'card_2']) {
      expect(tagsOf(container, id).value).toContain('gone');
    }
  });

  it('clicking a chip toggles the tag on the selected card; the free chip survives removal', async () => {
    const { container } = render(App);
    await tick();
    const furn = await selectFirstCard(container);
    await addTag(container, 'togg');
    clearHistory();
    await fireEvent.click(container.querySelector('.tags-panel [data-tag="togg"]')!);
    await tick();
    expect(cardTagsInput(furn).value, 'first click applies').toContain('togg');
    await fireEvent.click(container.querySelector('.tags-panel [data-tag="togg"]')!);
    await tick();
    expect(cardTagsInput(furn).value, 'second click removes').not.toContain('togg');
    expect(
      container.querySelector('.tags-panel [data-tag="togg"]'),
      'a zero-card tag keeps its chip (D26)',
    ).not.toBeNull();
    expect(canUndo()).toBe(true);
  });
});

describe('card panel — two write paths, one history (C)', () => {
  /** Select the demo quiz card (text-input slot) and return its panel + on-card inputs. */
  async function openPanel(container: HTMLElement) {
    const furn = [...container.querySelectorAll<HTMLElement>('.furn')].find((f) =>
      f.querySelector('.text-input-edit'),
    )!;
    expect(furn, 'no card with a text-input slot in the demo').toBeDefined();
    await fireEvent.click(furn);
    await tick();
    const panelInput = container.querySelector<HTMLInputElement>(
      '#side .card-panel .text-input-edit input',
    )!;
    const cardInput = furn.querySelector<HTMLInputElement>('.text-input-edit input')!;
    expect(panelInput).not.toBeNull();
    expect(cardInput).not.toBeNull();
    return { furn, panelInput, cardInput };
  }

  async function editSession(input: HTMLInputElement, value: string) {
    input.value = value;
    await fireEvent.input(input);
    await fireEvent.focusOut(input);
    await tick();
  }

  it('a panel edit and a card edit each cost exactly one undo entry and land in the same state', async () => {
    const { container } = render(App);
    await tick();
    const { panelInput, cardInput } = await openPanel(container);
    const original = cardInput.value;

    // Path 1: sidebar panel
    clearHistory();
    await editSession(panelInput, 'From panel');
    expect(cardInput.value, 'panel edit must reach the card live').toBe('From panel');
    expect(canUndo()).toBe(true);
    undo();
    await tick();
    expect(canUndo(), 'a panel edit session must be exactly one undo entry').toBe(false);
    expect(container.querySelector<HTMLInputElement>('.furn .text-input-edit input')!.value).toBe(original);

    // Path 2: on the card — indistinguishable from the panel path
    const again = await openPanel(container);
    clearHistory();
    await editSession(again.cardInput, 'From card');
    expect(again.panelInput.value, 'card edit must reach the panel live').toBe('From card');
    expect(canUndo()).toBe(true);
    undo();
    await tick();
    expect(canUndo(), 'a card edit session must be exactly one undo entry').toBe(false);
    expect(container.querySelector<HTMLInputElement>('.furn .text-input-edit input')!.value).toBe(original);
  });

  it('Duplicate inserts below as one undo step; the copy carries content with fresh ids', async () => {
    const { container } = render(App);
    await tick();
    const { furn } = await openPanel(container);
    const srcId = furn.getAttribute('data-card')!;
    const before = cardCount(container);
    const idsBefore = [...container.querySelectorAll('[data-card]')].map((e) => e.getAttribute('data-card'));
    clearHistory();
    await fireEvent.click(container.querySelector('.card-panel button[title="Duplicate card"]')!);
    await tick();
    expect(cardCount(container)).toBe(before + 1);
    const ids = [...container.querySelectorAll('[data-card]')].map((e) => e.getAttribute('data-card'));
    const fresh = ids.filter((i) => !idsBefore.includes(i));
    expect(fresh, 'exactly one new card id').toHaveLength(1);
    expect(ids[ids.indexOf(srcId) + 1], 'copy sits directly below the source').toBe(fresh[0]);
    undo();
    await tick();
    expect(cardCount(container)).toBe(before);
    expect(canUndo(), 'Duplicate must be exactly one undo entry').toBe(false);
  });

  it('Remove deletes the card, clears the selection, and is one undo step', async () => {
    const { container } = render(App);
    await tick();
    const { furn } = await openPanel(container);
    const srcId = furn.getAttribute('data-card')!;
    const before = cardCount(container);
    clearHistory();
    await fireEvent.click(container.querySelector('.card-panel button[title="Remove card"]')!);
    await tick();
    expect(cardCount(container)).toBe(before - 1);
    expect(container.querySelector(`[data-card="${srcId}"]`)).toBeNull();
    expect(container.querySelector('.card-panel'), 'selection must clear with the card').toBeNull();
    undo();
    await tick();
    expect(cardCount(container)).toBe(before);
    expect(canUndo(), 'Remove must be exactly one undo entry').toBe(false);
  });
});
