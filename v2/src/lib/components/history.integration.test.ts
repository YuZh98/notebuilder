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
