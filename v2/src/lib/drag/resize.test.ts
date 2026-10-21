import { describe, it, expect, vi } from 'vitest';
import { startEdgeResize } from './resize';
import { pev } from '../test-utils';

function begin(x = 100, y = 50) {
  const onDelta = vi.fn();
  const onCommit = vi.fn();
  startEdgeResize(pev('pointerdown', x, y), onDelta, onCommit);
  return { onDelta, onCommit };
}

describe('startEdgeResize', () => {
  it('reports move deltas relative to the start point', () => {
    const { onDelta } = begin(100, 50);
    const mv = pev('pointermove', 130, 70);
    document.dispatchEvent(mv);
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta).toHaveBeenCalledWith(30, 20, mv);
    document.dispatchEvent(pev('pointermove', 90, 45));
    expect(onDelta).toHaveBeenLastCalledWith(-10, -5, expect.anything());
    document.dispatchEvent(pev('pointerup', 90, 45));
  });

  it('prevents default on cancelable moves and on the start event', () => {
    const start = pev('pointerdown', 0, 0);
    startEdgeResize(start, vi.fn());
    expect(start.defaultPrevented).toBe(true);
    const mv = pev('pointermove', 5, 5);
    document.dispatchEvent(mv);
    expect(mv.defaultPrevented).toBe(true);
    document.dispatchEvent(pev('pointerup', 5, 5));
  });

  it('commits with the pointerup event and removes all listeners', () => {
    const { onDelta, onCommit } = begin();
    const up = pev('pointerup', 140, 60);
    document.dispatchEvent(up);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(up);
    document.dispatchEvent(pev('pointermove', 200, 200));
    document.dispatchEvent(pev('pointerup', 200, 200));
    document.dispatchEvent(pev('pointercancel', 200, 200));
    expect(onDelta).not.toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('commits null on pointercancel and removes all listeners', () => {
    const { onDelta, onCommit } = begin();
    document.dispatchEvent(pev('pointermove', 120, 50));
    expect(onDelta).toHaveBeenCalledTimes(1);
    document.dispatchEvent(pev('pointercancel', 0, 0));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(null);
    document.dispatchEvent(pev('pointermove', 300, 300));
    document.dispatchEvent(pev('pointerup', 300, 300));
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('works without an onCommit callback', () => {
    const onDelta = vi.fn();
    startEdgeResize(pev('pointerdown', 0, 0), onDelta);
    document.dispatchEvent(pev('pointermove', 10, 0));
    expect(onDelta).toHaveBeenCalledWith(10, 0, expect.anything());
    expect(() => document.dispatchEvent(pev('pointerup', 10, 0))).not.toThrow();
    document.dispatchEvent(pev('pointermove', 20, 0));
    expect(onDelta).toHaveBeenCalledTimes(1);
  });
});
