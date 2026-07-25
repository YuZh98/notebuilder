import { describe, it, expect } from 'vitest';
import { handleAppKey, type KeyCtx, type KeyboardEventLike } from './keyboard';

function key(k: string, mods: Partial<KeyboardEventLike> = {}): KeyboardEventLike {
  return { key: k, metaKey: false, ctrlKey: false, shiftKey: false, ...mods };
}

function ctx(over: Partial<KeyCtx> = {}): KeyCtx {
  return {
    inField: false,
    singleLineField: false,
    place: 'house',
    mode: 'edit',
    filterActive: false,
    selCard: null,
    selSection: null,
    selProd: null,
    sectionIds: [],
    cardIdsOfSelectedSection: [],
    ...over,
  };
}

describe('handleAppKey — bare Enter blurs single-line ce fields (v1 120:6)', () => {
  it('emits blur-single-line when a single-line field is focused', () => {
    expect(handleAppKey(key('Enter'), ctx({ inField: true, singleLineField: true }))).toEqual({
      kind: 'blur-single-line',
      preventDefault: true,
    });
  });

  it('does not fire on a multi-line field', () => {
    expect(handleAppKey(key('Enter'), ctx({ inField: true, singleLineField: false }))).toBeNull();
  });

  it('does not fire when a modifier is held (that is Cmd+Enter)', () => {
    expect(handleAppKey(key('Enter', { metaKey: true }), ctx({ singleLineField: true }))!.kind).toBe(
      'toggle-mode',
    );
  });
});

describe('handleAppKey — Cmd/Ctrl+Enter toggles mode (v1 120:7)', () => {
  it('meta+Enter', () => {
    expect(handleAppKey(key('Enter', { metaKey: true }), ctx())).toEqual({
      kind: 'toggle-mode',
      preventDefault: true,
    });
  });
  it('ctrl+Enter', () => {
    expect(handleAppKey(key('Enter', { ctrlKey: true }), ctx())!.kind).toBe('toggle-mode');
  });
  it('fires even while typing in a field', () => {
    expect(handleAppKey(key('Enter', { metaKey: true }), ctx({ inField: true }))!.kind).toBe(
      'toggle-mode',
    );
  });
});

describe('handleAppKey — Cmd/Ctrl+S autosave notice (v1 120:10)', () => {
  it('meta+s', () => {
    expect(handleAppKey(key('s', { metaKey: true }), ctx())).toEqual({
      kind: 'toast-save',
      preventDefault: true,
    });
  });
  it('meta+S (uppercase)', () => {
    expect(handleAppKey(key('S', { metaKey: true }), ctx())!.kind).toBe('toast-save');
  });
  it('ctrl+s', () => {
    expect(handleAppKey(key('s', { ctrlKey: true }), ctx())!.kind).toBe('toast-save');
  });
  it('fires while typing (save is global)', () => {
    expect(handleAppKey(key('s', { metaKey: true }), ctx({ inField: true }))!.kind).toBe('toast-save');
  });
  it('bare s does nothing', () => {
    expect(handleAppKey(key('s'), ctx())).toBeNull();
  });
});

describe('handleAppKey — Cmd/Ctrl+Z undo/redo, guarded !inField (v1 120:11)', () => {
  it('meta+z → undo', () => {
    expect(handleAppKey(key('z', { metaKey: true }), ctx())).toEqual({
      kind: 'undo',
      preventDefault: true,
    });
  });
  it('meta+Shift+z → redo', () => {
    expect(handleAppKey(key('z', { metaKey: true, shiftKey: true }), ctx())).toEqual({
      kind: 'redo',
      preventDefault: true,
    });
  });
  it('ctrl+Z (uppercase) → undo', () => {
    expect(handleAppKey(key('Z', { ctrlKey: true }), ctx())!.kind).toBe('undo');
  });
  it('is suppressed in a field (native text undo wins)', () => {
    expect(handleAppKey(key('z', { metaKey: true }), ctx({ inField: true }))).toBeNull();
    expect(handleAppKey(key('z', { metaKey: true, shiftKey: true }), ctx({ inField: true }))).toBeNull();
  });
  it('has no y/Y binding (v1 has no redo-on-Y)', () => {
    expect(handleAppKey(key('y', { metaKey: true }), ctx())).toBeNull();
    expect(handleAppKey(key('y', { ctrlKey: true }), ctx())).toBeNull();
  });
});

describe('handleAppKey — Escape in a field aborts or blurs (v1 120:12-14)', () => {
  it('emits abort-or-blur', () => {
    expect(handleAppKey(key('Escape'), ctx({ inField: true }))).toEqual({
      kind: 'abort-or-blur',
      preventDefault: true,
    });
  });
  it('non-Escape keys in a field are swallowed (no arrow-nav etc.)', () => {
    expect(handleAppKey(key('ArrowDown'), ctx({ inField: true, selSection: 's1', sectionIds: ['s1', 's2'] }))).toBeNull();
    expect(handleAppKey(key('a'), ctx({ inField: true }))).toBeNull();
  });
});

describe('handleAppKey — Escape outside a field: filter clear then deselect (v1 120:15)', () => {
  it('clears the matrix filter first when active', () => {
    expect(
      handleAppKey(key('Escape'), ctx({ filterActive: true, selCard: 'c1' })),
    ).toEqual({ kind: 'clear-filter', preventDefault: false });
  });
  it('deselects when a card is selected and no filter', () => {
    expect(handleAppKey(key('Escape'), ctx({ selCard: 'c1' }))).toEqual({
      kind: 'deselect',
      preventDefault: false,
    });
  });
  it('deselects on a selected section', () => {
    expect(handleAppKey(key('Escape'), ctx({ selSection: 's1' }))!.kind).toBe('deselect');
  });
  it('deselects on an open product detail', () => {
    expect(handleAppKey(key('Escape'), ctx({ selProd: 'p1' }))!.kind).toBe('deselect');
  });
  it('filter clear takes precedence over deselect (mutually exclusive)', () => {
    const a = handleAppKey(key('Escape'), ctx({ filterActive: true, selProd: 'p1', selSection: 's1' }));
    expect(a?.kind).toBe('clear-filter');
  });
  it('does nothing when nothing is active', () => {
    expect(handleAppKey(key('Escape'), ctx())).toBeNull();
  });
});

describe('handleAppKey — ArrowUp/Down section nav in the house (v1 120:16)', () => {
  const base = { place: 'house' as const, selSection: 's2', sectionIds: ['s1', 's2', 's3'] };

  it('Down moves to the next non-divider section', () => {
    expect(handleAppKey(key('ArrowDown'), ctx(base))).toEqual({
      kind: 'select-section',
      id: 's3',
      preventDefault: true,
    });
  });
  it('Up moves to the previous section', () => {
    expect(handleAppKey(key('ArrowUp'), ctx(base))!.kind).toBe('select-section');
    expect((handleAppKey(key('ArrowUp'), ctx(base)) as { id: string }).id).toBe('s1');
  });
  it('clamps at the last section (stays put)', () => {
    expect((handleAppKey(key('ArrowDown'), ctx({ ...base, selSection: 's3' })) as { id: string }).id).toBe('s3');
  });
  it('clamps at the first section', () => {
    expect((handleAppKey(key('ArrowUp'), ctx({ ...base, selSection: 's1' })) as { id: string }).id).toBe('s1');
  });
  it('is inert when a card is selected instead of a section', () => {
    expect(handleAppKey(key('ArrowDown'), ctx({ ...base, selCard: 'c1' }))).toBeNull();
  });
  it('is inert with no section selected', () => {
    expect(handleAppKey(key('ArrowDown'), ctx({ ...base, selSection: null }))).toBeNull();
  });
  it('is inert in the factory', () => {
    expect(handleAppKey(key('ArrowDown'), ctx({ ...base, place: 'factory' }))).toBeNull();
  });
  it('is inert when the selected section is not in the non-divider list', () => {
    expect(handleAppKey(key('ArrowDown'), ctx({ ...base, selSection: 'divider' }))).toBeNull();
  });
});

describe('handleAppKey — ArrowLeft/Right card nav within a section (v1 120:17)', () => {
  const base = { selCard: 'c2', cardIdsOfSelectedSection: ['c1', 'c2', 'c3'] };

  it('Right moves to the next card', () => {
    expect(handleAppKey(key('ArrowRight'), ctx(base))).toEqual({
      kind: 'select-card',
      id: 'c3',
      preventDefault: true,
    });
  });
  it('Left moves to the previous card', () => {
    expect((handleAppKey(key('ArrowLeft'), ctx(base)) as { id: string }).id).toBe('c1');
  });
  it('clamps at the ends', () => {
    expect((handleAppKey(key('ArrowRight'), ctx({ ...base, selCard: 'c3' })) as { id: string }).id).toBe('c3');
    expect((handleAppKey(key('ArrowLeft'), ctx({ ...base, selCard: 'c1' })) as { id: string }).id).toBe('c1');
  });
  it('works in either place (not house-gated)', () => {
    expect(handleAppKey(key('ArrowRight'), ctx({ ...base, place: 'factory' }))!.kind).toBe('select-card');
  });
  it('is inert with no card selected', () => {
    expect(handleAppKey(key('ArrowRight'), ctx({ cardIdsOfSelectedSection: ['c1'] }))).toBeNull();
  });
  it('is inert when the selected card is not in its list', () => {
    expect(handleAppKey(key('ArrowRight'), ctx({ selCard: 'ghost', cardIdsOfSelectedSection: ['c1'] }))).toBeNull();
  });
});

describe('handleAppKey — unhandled keys return null', () => {
  it('bare letter', () => {
    expect(handleAppKey(key('a'), ctx())).toBeNull();
  });
  it('bare arrow with no selection', () => {
    expect(handleAppKey(key('ArrowUp'), ctx())).toBeNull();
    expect(handleAppKey(key('ArrowLeft'), ctx())).toBeNull();
  });
  it('modifier combos that are not bound', () => {
    expect(handleAppKey(key('a', { metaKey: true }), ctx())).toBeNull();
  });
});

describe('handleAppKey — zoom', () => {
  it('mod +/= zooms in, mod -/_ zooms out, mod 0 resets', () => {
    expect(handleAppKey(key('=', { metaKey: true }), ctx())).toEqual({ kind: 'zoom', delta: 1, preventDefault: true });
    expect(handleAppKey(key('+', { ctrlKey: true }), ctx())).toEqual({ kind: 'zoom', delta: 1, preventDefault: true });
    expect(handleAppKey(key('-', { metaKey: true }), ctx())).toEqual({ kind: 'zoom', delta: -1, preventDefault: true });
    expect(handleAppKey(key('_', { metaKey: true }), ctx())).toEqual({ kind: 'zoom', delta: -1, preventDefault: true });
    expect(handleAppKey(key('0', { metaKey: true }), ctx())).toEqual({ kind: 'zoom', delta: 0, preventDefault: true });
  });
  it('works inside a field so zoom is never swallowed', () => {
    expect(handleAppKey(key('=', { metaKey: true }), ctx({ inField: true }))).toEqual({ kind: 'zoom', delta: 1, preventDefault: true });
  });
  it('bare +/-/0 without a modifier are unbound', () => {
    expect(handleAppKey(key('='), ctx())).toBeNull();
    expect(handleAppKey(key('-'), ctx())).toBeNull();
    expect(handleAppKey(key('0'), ctx())).toBeNull();
  });
});
