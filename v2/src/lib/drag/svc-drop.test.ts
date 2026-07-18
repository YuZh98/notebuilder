import { describe, it, expect, vi } from 'vitest';
import { makeSvcDropCallbacks, type SvcDropDeps } from './svc-drop';

function depsOf(over: Partial<SvcDropDeps> = {}): SvcDropDeps {
  return {
    barItems: () => ['search', 'archive', 'shuffle', 'reset'],
    onreorder: vi.fn(),
    onremove: vi.fn(),
    ...over,
  };
}

const el = () => document.createElement('span');

describe('makeSvcDropCallbacks', () => {
  it('a grid drop reorders from the chip index to the drop slot', () => {
    const deps = depsOf();
    const cb = makeSvcDropCallbacks(deps);
    const grid = document.createElement('div');
    cb.onDrop({ kind: 'svc', id: 'shuffle', srcEl: el() }, { kind: 'grid', grid, idx: 0 });
    expect(deps.onreorder).toHaveBeenCalledWith(2, 0);
    expect(deps.onremove).not.toHaveBeenCalled();
  });

  it('a dust drop disables the service', () => {
    const deps = depsOf();
    const cb = makeSvcDropCallbacks(deps);
    cb.onDrop({ kind: 'svc', id: 'archive', srcEl: el() }, { kind: 'dust' });
    expect(deps.onremove).toHaveBeenCalledWith('archive');
    expect(deps.onreorder).not.toHaveBeenCalled();
  });

  it('ignores a grid drop whose chip is no longer in the bar', () => {
    const deps = depsOf();
    const cb = makeSvcDropCallbacks(deps);
    const grid = document.createElement('div');
    cb.onDrop({ kind: 'svc', id: 'ghost', srcEl: el() }, { kind: 'grid', grid, idx: 1 });
    expect(deps.onreorder).not.toHaveBeenCalled();
  });

  it('allows dragging and dropping any chip', () => {
    const cb = makeSvcDropCallbacks(depsOf());
    const src = { kind: 'svc' as const, id: 'reset', srcEl: el() };
    const grid = document.createElement('div');
    expect(cb.canDrag(src)).toBe(true);
    expect(cb.canDrop(src, grid)).toBe(true);
  });
});
