import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installEditCoalescing } from './history-focus';
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
    <div data-history="edit"><input id="author" /><textarea id="authorta"></textarea></div>
    <input id="reader" />`;
  teardown = installEditCoalescing(window);
});

afterEach(() => {
  teardown();
  document.body.innerHTML = '';
});

function type(el: HTMLElement) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
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
});
