import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { installEditCoalescing } from './history-focus';
import ChoiceEdit from './slots/ChoiceEdit.svelte';
import {
  registerHistory,
  clearHistory,
  canUndo,
  undo,
  type HistSnapshot,
} from './history.svelte';

// Fake author state: a single scalar the fake capture/restore round-trips.
const live = { v: 0 };
function snapFor(v: number): HistSnapshot {
  return { notebook: {} as HistSnapshot['notebook'], cardTypes: [], benches: [], benchActive: String(v) };
}

let teardown: () => void;

beforeEach(() => {
  live.v = 0;
  registerHistory({
    capture: () => snapFor(live.v),
    restore: (s) => (live.v = Number(s.benchActive)),
  });
  clearHistory();
  document.body.innerHTML = `
    <div data-history="edit">
      <input id="author" /><textarea id="authorta"></textarea>
      <input id="authorcheck" type="checkbox" />
      <select id="authorsel"><option value="0">0</option><option value="1">1</option></select>
    </div>
    <input id="reader" />
    <select id="readersel"><option value="0">0</option><option value="1">1</option></select>`;
  teardown = installEditCoalescing(window);
});

afterEach(() => {
  teardown();
  document.body.innerHTML = '';
});

function type(el: HTMLElement) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function changeOnly(el: HTMLElement) {
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// A discrete control the browser toggles: jsdom-style, fires input then change.
function toggle(el: HTMLElement) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('installEditCoalescing', () => {
  it('coalesces multiple inputs in one focus session into a single step', () => {
    const el = document.getElementById('author')!;
    live.v = 0;
    type(el);
    live.v = 1;
    type(el);
    live.v = 2;
    expect(canUndo()).toBe(true);
    expect(undo()).toBe(true);
    expect(live.v).toBe(0); // one step back to pre-edit
    expect(canUndo()).toBe(false);
  });

  it('starts a new step after focusout', () => {
    const el = document.getElementById('author')!;
    type(el);
    live.v = 1;
    el.dispatchEvent(new Event('focusout', { bubbles: true }));
    type(el);
    live.v = 2;
    expect(undo()).toBe(true);
    expect(live.v).toBe(1);
    expect(undo()).toBe(true);
    expect(live.v).toBe(0);
  });

  it('ignores input from fields outside a data-history region', () => {
    type(document.getElementById('reader')!);
    expect(canUndo()).toBe(false);
  });

  it('coalesces a checkbox input+change into a single step', () => {
    const el = document.getElementById('authorcheck')!;
    live.v = 0;
    toggle(el); // input arms beginEdit; change is idempotent
    live.v = 1;
    expect(canUndo()).toBe(true);
    expect(undo()).toBe(true);
    expect(live.v).toBe(0); // one step back to pre-toggle
    expect(canUndo()).toBe(false); // exactly one step, not two
  });

  it('arms on a change-only control (webview firing no input)', () => {
    const el = document.getElementById('authorsel')!;
    live.v = 0;
    changeOnly(el);
    live.v = 1;
    expect(canUndo()).toBe(true);
    expect(undo()).toBe(true);
    expect(live.v).toBe(0);
  });

  it('ignores change from a control outside a data-history region', () => {
    changeOnly(document.getElementById('readersel')!);
    expect(canUndo()).toBe(false);
  });

  it('a ChoiceEdit checkbox toggle inside an edit region is exactly one step', async () => {
    const { container } = render(ChoiceEdit, {
      props: { props: { options: ['A', 'B', 'C'], answer: [], multi: false }, onUpdate: () => {} },
    });
    container.setAttribute('data-history', 'edit');
    await tick();
    const check = container.querySelector<HTMLInputElement>('.multi-toggle input[type="checkbox"]')!;
    await fireEvent.click(check);
    await tick();
    expect(canUndo()).toBe(true);
    expect(undo()).toBe(true);
    expect(canUndo()).toBe(false); // one history step despite input+change both firing
  });
});
