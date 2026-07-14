import { describe, it, expect } from 'vitest';
import { reorderItems, remapAnswers, remapChecked } from './qopt-remap';

// `to` is the post-removal insertion index throughout — the engine's t.idx counts
// grid rows minus the dragged one (v1 90-drag-engine.js:103).

describe('reorderItems', () => {
  it('moves an item forward', () => {
    expect(reorderItems(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item backward', () => {
    expect(reorderItems(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('from === to is the identity', () => {
    expect(reorderItems(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('clamps an index past the end to append (v1 :103 Math.min)', () => {
    expect(reorderItems(['a', 'b', 'c'], 0, 9)).toEqual(['b', 'c', 'a']);
  });

  it('an out-of-range from leaves the array unchanged', () => {
    expect(reorderItems(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
    expect(reorderItems(['a', 'b'], 2, 0)).toEqual(['a', 'b']);
  });

  it('is pure — the input array is not mutated', () => {
    const input = ['a', 'b', 'c'];
    reorderItems(input, 0, 2);
    expect(input).toEqual(['a', 'b', 'c']);
  });
});

describe('remapAnswers', () => {
  it('answers follow their options when another row moves past them', () => {
    // options [A,B,C,D] answers {B,D}; move A to index 2 → [B,C,A,D]
    expect(remapAnswers([1, 3], 0, 2)).toEqual([0, 3]);
  });

  it('the moved row IS an answer', () => {
    // options [A,B,C] answer {A}; move A to the end → [B,C,A]
    expect(remapAnswers([0], 0, 2)).toEqual([2]);
  });

  it('result is sorted ascending (v1 :105 .sort)', () => {
    // move C to the front: [C,A,B]; answers {A,C} = [0,2] → {C@0, A@1}
    expect(remapAnswers([2, 0], 2, 0)).toEqual([0, 1]);
  });

  it('multi-answer set including the moved row', () => {
    // options [A,B,C,D] answers {A,C}; move A to 3 → [B,C,D,A]; A→3, C→1
    expect(remapAnswers([0, 2], 0, 3)).toEqual([1, 3]);
  });

  it('is pure — the input is not mutated', () => {
    const input = [2, 0];
    remapAnswers(input, 2, 0);
    expect(input).toEqual([2, 0]);
  });
});

describe('remapChecked', () => {
  it('done ticks follow their items', () => {
    // items [x,y,z] with x,z checked; move x to the end → [y,z,x]
    expect(remapChecked([true, false, true], 0, 2)).toEqual([false, true, true]);
  });

  it('a checked moved row carries its tick', () => {
    expect(remapChecked([false, false, true], 2, 0)).toEqual([true, false, false]);
  });

  it('holes are preserved as unchecked (v1 :106 copies only trues)', () => {
    // checked shorter than the item list: moving an unchecked tail row keeps only trues
    expect(remapChecked([true], 4, 0)).toEqual([false, true]);
  });

  it('unchecked-only input stays all unchecked', () => {
    expect(remapChecked([false, false], 0, 1)).toEqual([false, false]);
  });

  it('is pure — the input is not mutated', () => {
    const input = [true, false];
    remapChecked(input, 0, 1);
    expect(input).toEqual([true, false]);
  });
});
