// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerHistory,
  pushHistory,
  pushSnapshot,
  captureNow,
  beginEdit,
  endEdit,
  abortEdit,
  undo,
  redo,
  canUndo,
  canRedo,
  clearHistory,
  type HistSnapshot,
} from './history.svelte';

// The core never inspects snapshot fields, so a fake capture/restore that stashes a single
// scalar in `benchActive` fully exercises the stacks.
const live = { v: 0 };

function snapFor(v: number): HistSnapshot {
  return { notebook: {} as HistSnapshot['notebook'], cardTypes: [], benches: [], benchActive: String(v) };
}

beforeEach(() => {
  live.v = 0;
  registerHistory({
    capture: () => snapFor(live.v),
    restore: (s) => {
      live.v = Number(s.benchActive);
    },
  });
  clearHistory();
});

describe('history core', () => {
  it('round-trips push/undo/redo', () => {
    pushHistory();
    live.v = 1;
    pushHistory();
    live.v = 2;

    expect(undo()).toBe(true);
    expect(live.v).toBe(1);
    expect(undo()).toBe(true);
    expect(live.v).toBe(0);
    expect(undo()).toBe(false);

    expect(redo()).toBe(true);
    expect(live.v).toBe(1);
    expect(redo()).toBe(true);
    expect(live.v).toBe(2);
    expect(redo()).toBe(false);
  });

  it('round-trips a pre-captured gesture snapshot', () => {
    live.v = 3;
    const snap = captureNow(); // pointer-down: pre-mutation state
    live.v = 9; // gesture mutates
    pushSnapshot(snap); // commit records the pre-state
    expect(undo()).toBe(true);
    expect(live.v).toBe(3);
  });

  it('caps the undo stack at depth 60, dropping the oldest', () => {
    for (let i = 0; i <= 60; i++) {
      pushHistory();
      live.v = i + 1;
    }
    let n = 0;
    while (undo()) n++;
    expect(n).toBe(60);
    expect(live.v).toBe(1); // value 0 was shifted off
  });

  it('clears redo on a fresh push', () => {
    pushHistory();
    live.v = 1;
    expect(undo()).toBe(true);
    expect(canRedo()).toBe(true);
    pushHistory();
    expect(canRedo()).toBe(false);
  });

  it('coalesces an edit session into one undo step', () => {
    beginEdit();
    live.v = 1;
    beginEdit();
    live.v = 2;
    expect(undo()).toBe(true);
    expect(live.v).toBe(0);
    expect(undo()).toBe(false);
  });

  it('starts a new step after endEdit', () => {
    beginEdit();
    live.v = 1;
    endEdit();
    beginEdit();
    live.v = 2;
    expect(undo()).toBe(true);
    expect(live.v).toBe(1);
    expect(undo()).toBe(true);
    expect(live.v).toBe(0);
  });

  it('abortEdit pops without a redo entry', () => {
    beginEdit();
    live.v = 5;
    expect(abortEdit()).toBe(true);
    expect(live.v).toBe(0);
    expect(canRedo()).toBe(false);
  });

  it('abortEdit returns false with no open session', () => {
    expect(abortEdit()).toBe(false);
  });

  it('undo/redo on empty stacks return false', () => {
    expect(undo()).toBe(false);
    expect(redo()).toBe(false);
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });
});