import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from '../../App.svelte';
import { mode } from '../stores/mode';
import { place } from '../stores/place';
import { clearHistory, undo, canUndo } from '../history.svelte';
import { hydrateFactory } from '../bench.svelte';

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
const sectionCount = (c: HTMLElement) => c.querySelectorAll('.room[data-section]').length;

describe('undo coverage — discrete author mutations', () => {
  it('toolbar undo and Cmd+Z produce identical state', async () => {
    const { container } = render(App);
    await tick();
    const before = cardCount(container);
    // Delete a card to create an undo step
    const del = container.querySelector<HTMLButtonElement>('button[title="Delete card"]')!;
    await fireEvent.click(del);
    await tick();
    expect(cardCount(container)).toBe(before - 1);
    // Undo via toolbar button
    const undoBtn = container.querySelector<HTMLButtonElement>('button[title="Undo"]')!;
    expect(undoBtn.disabled).toBe(false);
    await fireEvent.click(undoBtn);
    await tick();
    expect(cardCount(container)).toBe(before);
    // Delete again, this time undo via Cmd+Z
    const del2 = container.querySelector<HTMLButtonElement>('button[title="Delete card"]')!;
    await fireEvent.click(del2);
    await tick();
    expect(cardCount(container)).toBe(before - 1);
    await fireEvent.keyDown(container, { key: 'z', metaKey: true });
    await tick();
    expect(cardCount(container)).toBe(before);
  });

  it('delete a card via the ✕ button, then undo restores it', async () => {
    const { container } = render(App);
    await tick();
    const before = cardCount(container);
    expect(before).toBeGreaterThan(0);
    const del = container.querySelector<HTMLButtonElement>('button[title="Delete card"]')!;
    await fireEvent.click(del);
    await tick();
    expect(cardCount(container)).toBe(before - 1);
    expect(canUndo()).toBe(true);
    undo();
    await tick();
    expect(cardCount(container)).toBe(before);
  });

  it('add a section, then undo removes it (single step)', async () => {
    const { container } = render(App);
    await tick();
    const before = sectionCount(container);
    const add = container.querySelector<HTMLButtonElement>('button.add-section')!;
    await fireEvent.click(add);
    await tick();
    expect(sectionCount(container)).toBe(before + 1);
    undo();
    await tick();
    expect(sectionCount(container)).toBe(before);
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

  it('coalesces a multi-keystroke tag edit into one undo step', async () => {
    const { container } = render(App);
    await tick();
    const tags = container.querySelector<HTMLInputElement>('input.tags-input')!;
    tags.focus();
    await fireEvent.input(tags, { target: { value: 'a' } });
    await fireEvent.input(tags, { target: { value: 'ab' } });
    await fireEvent.input(tags, { target: { value: 'abc' } });
    await tick();
    expect(canUndo()).toBe(true);
    undo();
    await tick();
    expect(canUndo()).toBe(false); // exactly one step
  });

  it('a reader flip in study mode creates no undo step', async () => {
    const { container } = render(App);
    mode.set('study');
    await tick();
    // The demo flip card exposes a "click to flip" affordance in study mode.
    const fc = container.querySelector<HTMLElement>('.fc');
    expect(fc).not.toBeNull();
    await fireEvent.click(fc!);
    await tick();
    expect(canUndo()).toBe(false);
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
