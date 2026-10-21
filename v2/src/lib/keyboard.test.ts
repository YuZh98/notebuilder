import { describe, it, expect, vi } from 'vitest';
import {
  handleAppKey,
  isFieldTarget,
  isInteractiveTarget,
  type KeyCtx,
  type KeyboardEventLike,
} from './keyboard';
import { NO_SURFACES, type StudySurfaces } from './study-keys';

function key(k: string, mods: Partial<KeyboardEventLike> = {}): KeyboardEventLike {
  return { key: k, metaKey: false, ctrlKey: false, shiftKey: false, ...mods };
}

/** A context override; `surfaces` sets what the focused card can answer. */
type CtxOver = Partial<Omit<KeyCtx, 'focusedSurfaces'>> & { surfaces?: Partial<StudySurfaces> };

function ctx(over: CtxOver = {}): KeyCtx {
  const { surfaces, ...rest } = over;
  const focused: StudySurfaces = { ...NO_SURFACES, ...surfaces };
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
    studyFocus: null,
    focusedSurfaces: () => focused,
    targetInteractive: false,
    helpOpen: false,
    ...rest,
  };
}

/** Study context with a cursor on a card that can answer every study key. */
function studying(over: CtxOver = {}): KeyCtx {
  return ctx({
    mode: 'study',
    studyFocus: 'c1',
    ...over,
    surfaces: { choiceOptions: 3, canSubmit: true, canTick: true, ...over.surfaces },
  });
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

describe('handleAppKey — study cursor movement (v0.3.0 keyboard-first Study)', () => {
  it('j / ArrowRight / ArrowDown step forward, k / ArrowLeft / ArrowUp step back', () => {
    for (const k of ['j', 'ArrowRight', 'ArrowDown']) {
      expect(handleAppKey(key(k), studying()), k).toEqual({
        kind: 'study-focus-step',
        delta: 1,
        preventDefault: true,
      });
    }
    for (const k of ['k', 'ArrowLeft', 'ArrowUp']) {
      expect(handleAppKey(key(k), studying()), k).toEqual({
        kind: 'study-focus-step',
        delta: -1,
        preventDefault: true,
      });
    }
  });

  it('ArrowUp/Down walk the cursor even with a section selected — the Edit nav stays out of Study', () => {
    const withSection = studying({ selSection: 's1', sectionIds: ['s1', 's2'] });
    expect(handleAppKey(key('ArrowDown'), withSection)!.kind).toBe('study-focus-step');
    expect(handleAppKey(key('ArrowUp'), withSection)!.kind).toBe('study-focus-step');
  });

  it('steps with no cursor yet — the first j starts the session', () => {
    expect(handleAppKey(key('j'), ctx({ mode: 'study' }))).toEqual({
      kind: 'study-focus-step',
      delta: 1,
      preventDefault: true,
    });
  });

  it('Escape clears the cursor before its Edit-mode meanings', () => {
    expect(handleAppKey(key('Escape'), studying({ filterActive: true, selProd: 'p1' }))).toEqual({
      kind: 'study-focus-clear',
      preventDefault: false,
    });
  });

  it('Escape with no cursor falls through to the filter/selection meanings', () => {
    expect(handleAppKey(key('Escape'), ctx({ mode: 'study', filterActive: true }))!.kind).toBe(
      'clear-filter',
    );
  });
});

describe('handleAppKey — study card keys', () => {
  it('f flips a flip-capable card', () => {
    expect(handleAppKey(key('f'), studying({ surfaces: { flip: true } }))).toEqual({
      kind: 'study-flip',
      preventDefault: true,
    });
  });

  it('Space flips a flip-capable card', () => {
    expect(handleAppKey(key(' '), studying({ surfaces: { flip: true } }))).toEqual({
      kind: 'study-flip',
      preventDefault: true,
    });
  });

  it('Space falls through to native scroll when the card cannot flip', () => {
    expect(handleAppKey(key(' '), studying())).toBeNull();
    expect(handleAppKey(key('f'), studying())).toBeNull();
  });

  it('1-9 carry the digit; 0 is unbound', () => {
    expect(handleAppKey(key('1'), studying())).toEqual({
      kind: 'study-choice',
      digit: 1,
      preventDefault: true,
    });
    expect(handleAppKey(key('9'), studying({ surfaces: { choiceOptions: 9 } }))!).toEqual({
      kind: 'study-choice',
      digit: 9,
      preventDefault: true,
    });
    expect(handleAppKey(key('0'), studying())).toBeNull();
  });

  it('Enter submits and x ticks', () => {
    expect(handleAppKey(key('Enter'), studying())).toEqual({
      kind: 'study-submit',
      preventDefault: true,
    });
    expect(handleAppKey(key('x'), studying())).toEqual({
      kind: 'study-tick',
      preventDefault: true,
    });
  });

  it('card keys are inert with no cursor', () => {
    const none = ctx({ mode: 'study', surfaces: { flip: true } });
    for (const k of [' ', 'f', 'x', '1', 'Enter']) {
      expect(handleAppKey(key(k), none), k).toBeNull();
    }
  });

  it('Cmd/Ctrl+Enter still toggles mode rather than submitting', () => {
    expect(handleAppKey(key('Enter', { metaKey: true }), studying())!.kind).toBe('toggle-mode');
  });

  it('modifier combos never reach the study bindings', () => {
    expect(handleAppKey(key('j', { metaKey: true }), studying())).toBeNull();
    expect(handleAppKey(key('x', { ctrlKey: true }), studying())).toBeNull();
  });
});

describe('handleAppKey — shortcut overlay', () => {
  it('? toggles it open and closed', () => {
    expect(handleAppKey(key('?', { shiftKey: true }), ctx({ mode: 'study' }))).toEqual({
      kind: 'study-help',
      preventDefault: true,
    });
    expect(handleAppKey(key('?'), studying({ helpOpen: true }))!.kind).toBe('study-help');
  });

  it('Escape closes the overlay before it touches the cursor', () => {
    expect(handleAppKey(key('Escape'), studying({ helpOpen: true }))).toEqual({
      kind: 'study-help',
      preventDefault: true,
    });
  });

  it('is modal: with it open every other key is inert', () => {
    const open = studying({ helpOpen: true, surfaces: { flip: true } });
    for (const k of ['j', 'k', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', ' ', 'f', 'x', '1', '9', 'Enter']) {
      expect(handleAppKey(key(k), open), k).toBeNull();
    }
  });

  it('is modal even over the selection keys the house otherwise answers', () => {
    const open = studying({
      helpOpen: true,
      selCard: 'c1',
      cardIdsOfSelectedSection: ['c1', 'c2'],
      selSection: null,
      filterActive: true,
    });
    expect(handleAppKey(key('ArrowRight'), open)).toBeNull();
  });

  it('leaves the modifier shortcuts alone — they are not study keys', () => {
    const open = studying({ helpOpen: true });
    expect(handleAppKey(key('Enter', { metaKey: true }), open)!.kind).toBe('toggle-mode');
    expect(handleAppKey(key('z', { metaKey: true }), open)!.kind).toBe('undo');
  });
});

describe('handleAppKey — study bindings are Edit-mode and field inert', () => {
  it('every study key is unbound in Edit mode', () => {
    const edit = ctx({ studyFocus: 'c1', surfaces: { flip: true }, helpOpen: true });
    for (const k of ['j', 'k', ' ', 'f', 'x', '1', '?', 'Enter']) {
      expect(handleAppKey(key(k), edit), k).toBeNull();
    }
  });

  it('Edit-mode ArrowLeft/Right still move the card selection, not the cursor', () => {
    expect(
      handleAppKey(key('ArrowRight'), ctx({ selCard: 'c1', cardIdsOfSelectedSection: ['c1', 'c2'] })),
    ).toEqual({ kind: 'select-card', id: 'c2', preventDefault: true });
  });

  it('Edit-mode ArrowUp/Down still move the section selection, not the cursor', () => {
    expect(
      handleAppKey(key('ArrowDown'), ctx({ selSection: 's1', sectionIds: ['s1', 's2'] })),
    ).toEqual({ kind: 'select-section', id: 's2', preventDefault: true });
  });

  it('the factory has no study cursor (its stage shows benches, not the notebook)', () => {
    const fac = studying({ place: 'factory', surfaces: { flip: true } });
    for (const k of ['j', 'k', ' ', 'x', '1', '?']) {
      expect(handleAppKey(key(k), fac), k).toBeNull();
    }
  });

  it('study keys are swallowed inside a text field', () => {
    const field = studying({ inField: true, surfaces: { flip: true } });
    for (const k of ['j', 'k', ' ', 'x', '1', '?']) {
      expect(handleAppKey(key(k), field), k).toBeNull();
    }
    expect(handleAppKey(key('Escape'), field)!.kind).toBe('abort-or-blur');
  });
});

describe('handleAppKey — a key with no surface on the focused card is not ours', () => {
  it('a digit past the last option falls through', () => {
    const three = studying({ surfaces: { choiceOptions: 3 } });
    expect(handleAppKey(key('3'), three)!.kind).toBe('study-choice');
    expect(handleAppKey(key('4'), three)).toBeNull();
  });

  it('digits are inert on a card with no open choice slot (none, or all submitted)', () => {
    expect(handleAppKey(key('1'), studying({ surfaces: { choiceOptions: 0 } }))).toBeNull();
  });

  it('Enter is inert until a choice slot carries a selection', () => {
    expect(handleAppKey(key('Enter'), studying({ surfaces: { canSubmit: false } }))).toBeNull();
  });

  it('x is inert with no tickable checklist', () => {
    expect(handleAppKey(key('x'), studying({ surfaces: { canTick: false } }))).toBeNull();
  });
});

describe('handleAppKey — the focused card is inspected only for its own keys', () => {
  // focusedSurfaces builds the card's variable scope: typing, chords, cursor moves and the overlay
  // must never pay for it, only a card key that reaches a focused card.
  const ALL: StudySurfaces = { flip: true, choiceOptions: 9, canSubmit: true, canTick: true };
  const probe = (over: CtxOver = {}) => {
    const spy = vi.fn(() => ALL);
    return { spy, c: { ...studying(over), focusedSurfaces: spy } };
  };
  const CARD_KEYS = [' ', 'f', 'x', '1', '9', 'Enter'];

  it('typing in a field never asks, card keys included', () => {
    const { spy, c } = probe({ inField: true });
    for (const k of ['a', 'Z', 'Backspace', 'Escape', 'j', ...CARD_KEYS]) handleAppKey(key(k), c);
    expect(spy).not.toHaveBeenCalled();
  });

  it('nor do chords, cursor moves, ?, Escape or keys no card answers', () => {
    const { spy, c } = probe();
    for (const k of ['Enter', 's', 'z', '=', '1']) handleAppKey(key(k, { metaKey: true }), c);
    for (const k of ['j', 'k', 'ArrowUp', 'ArrowDown', '?', 'Escape', 'a', '0', 'Tab']) handleAppKey(key(k), c);
    expect(spy).not.toHaveBeenCalled();
  });

  it('nor does any key in Edit mode, in the factory, under the overlay or without a cursor', () => {
    for (const over of [{ mode: 'edit' as const }, { place: 'factory' as const }, { helpOpen: true }, { studyFocus: null }]) {
      const { spy, c } = probe(over);
      for (const k of CARD_KEYS) handleAppKey(key(k), c);
      expect(spy, JSON.stringify(over)).not.toHaveBeenCalled();
    }
  });

  it('a card key on a focused card asks exactly once', () => {
    for (const k of CARD_KEYS) {
      const { spy, c } = probe();
      expect(handleAppKey(key(k), c), k).not.toBeNull();
      expect(spy, k).toHaveBeenCalledOnce();
    }
  });
});

describe('handleAppKey — a tab-focused control keeps Space and Enter', () => {
  const onButton = studying({ surfaces: { flip: true }, targetInteractive: true });

  it('Space and Enter go to the control, not the cursor', () => {
    expect(handleAppKey(key(' '), onButton)).toBeNull();
    expect(handleAppKey(key('Enter'), onButton)).toBeNull();
  });

  it('keys the control does not act on still reach the cursor', () => {
    // A clicked button keeps DOM focus in Chromium; digits/x/f must not die with it.
    expect(handleAppKey(key('1'), onButton)!.kind).toBe('study-choice');
    expect(handleAppKey(key('x'), onButton)!.kind).toBe('study-tick');
    expect(handleAppKey(key('f'), onButton)!.kind).toBe('study-flip');
    expect(handleAppKey(key('j'), onButton)!.kind).toBe('study-focus-step');
    expect(handleAppKey(key('?'), onButton)!.kind).toBe('study-help');
  });
});

describe('isInteractiveTarget', () => {
  function el(tag: string, role?: string): Element {
    const node = document.createElement(tag);
    if (role) node.setAttribute('role', role);
    return node;
  }

  it('is true for controls the browser activates itself', () => {
    for (const tag of ['button', 'a', 'summary', 'select']) {
      expect(isInteractiveTarget(el(tag)), tag).toBe(true);
    }
    for (const role of ['button', 'link', 'checkbox', 'menuitem', 'tab', 'option']) {
      expect(isInteractiveTarget(el('div', role)), role).toBe(true);
    }
  });

  it('is false for plain content and for nothing at all', () => {
    for (const tag of ['div', 'span', 'p', 'li']) {
      expect(isInteractiveTarget(el(tag)), tag).toBe(false);
    }
    expect(isInteractiveTarget(el('div', 'presentation'))).toBe(false);
    expect(isInteractiveTarget(null)).toBe(false);
    expect(isInteractiveTarget(undefined)).toBe(false);
  });
});

describe('isInteractiveTarget — non-element targets', () => {
  it('a window-targeted key event is not interactive', () => {
    expect(isInteractiveTarget(window)).toBe(false);
    expect(isInteractiveTarget(document)).toBe(false);
  });
});

describe('isFieldTarget', () => {
  function el(tag: string, over: (n: HTMLElement) => void = () => {}): Element {
    const node = document.createElement(tag);
    over(node);
    return node;
  }

  it('counts input, textarea and select — a select owns its own arrows and Enter', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(isFieldTarget(el(tag)), tag).toBe(true);
    }
  });

  it('counts contenteditable', () => {
    // jsdom never computes isContentEditable, so the contract is asserted on a stand-in element.
    const ce = { tagName: 'DIV', isContentEditable: true } as unknown as HTMLElement;
    expect(isFieldTarget(ce)).toBe(true);
  });

  it('is false for plain content, buttons, and non-element targets', () => {
    expect(isFieldTarget(el('div'))).toBe(false);
    expect(isFieldTarget(el('button'))).toBe(false);
    expect(isFieldTarget(window)).toBe(false);
    expect(isFieldTarget(null)).toBe(false);
  });
});
