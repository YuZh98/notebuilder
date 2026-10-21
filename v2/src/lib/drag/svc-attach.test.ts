import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DRAG_KINDS } from './kinds';
import { makeNotebookDropCallbacks, type NotebookDropDeps } from './notebook-drop';
import { startPointerDrag, _setElementFromPoint } from './engine';
import { dustState } from './dust.svelte';
import type { Notebook } from '../types';
import { pev } from '../test-utils';

function nbOf(): Notebook {
  return {
    id: 'nb',
    name: 'NB',
    createdAt: '',
    updatedAt: '',
    sections: [
      {
        id: 's1',
        notebookId: 'nb',
        name: 'S1',
        position: 0,
        cards: [{ id: 'a', sectionId: 's1', position: 0, slots: [] }],
      },
    ],
  };
}

/** .card-shell > .room[data-section] > .room-grid > .furn — the drop surface for the chip. */
function buildDom(): { room: HTMLElement; furn: HTMLElement; chip: HTMLElement } {
  const shell = document.createElement('div');
  shell.className = 'card-shell';
  const room = document.createElement('div');
  room.className = 'room';
  room.dataset.section = 's1';
  const grid = document.createElement('div');
  grid.className = 'grid room-grid';
  grid.dataset.section = 's1';
  const furn = document.createElement('div');
  furn.className = 'furn';
  furn.dataset.card = 'a';
  grid.appendChild(furn);
  room.appendChild(grid);
  shell.appendChild(room);
  document.body.appendChild(shell);
  const chip = document.createElement('button');
  chip.className = 'chip';
  document.body.appendChild(chip);
  return { room, furn, chip };
}

function depsOf(over: Partial<NotebookDropDeps> = {}): NotebookDropDeps {
  return {
    notebook: nbOf,
    selectedCard: () => null,
    selectedSection: () => null,
    clearSelection: vi.fn(),
    confirmDelete: vi.fn(() => Promise.resolve(true)),
    ...over,
  };
}

beforeEach(() => _setElementFromPoint(() => null));
afterEach(() => {
  document.dispatchEvent(new MouseEvent('pointercancel'));
  document.dispatchEvent(new MouseEvent('pointerup'));
  _setElementFromPoint(null);
  dustState.show = false;
  dustState.hot = false;
  document.body.innerHTML = '';
});

describe('svcattach drag kind', () => {
  it('targets sections as lanes, keeps the chip in place, and can hit the dustbin', () => {
    expect(DRAG_KINDS.svcattach).toMatchObject({
      gridSels: [],
      ghostSource: false,
      deletable: true,
      laneSel: '.room[data-section]',
    });
  });
});

describe('svcattach drops', () => {
  it('a chip dropped anywhere inside a room attaches the service (a card counts)', () => {
    const { room, furn, chip } = buildDom();
    const attachService = vi.fn();
    const cb = makeNotebookDropCallbacks(depsOf({ attachService }));
    _setElementFromPoint(() => furn);
    startPointerDrag({ kind: 'svcattach', id: 'pin', srcEl: chip }, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 60, 20));
    expect(room.classList.contains('drop-on')).toBe(true);
    document.dispatchEvent(pev('pointerup', 60, 20));
    expect(attachService).toHaveBeenCalledWith('s1', 'pin');
  });

  it('a chip dropped on the dustbin detaches the service', () => {
    const detachService = vi.fn();
    const cb = makeNotebookDropCallbacks(depsOf({ detachService }));
    cb.onDrop({ kind: 'svcattach', id: 'archive', srcEl: document.body }, { kind: 'dust' });
    expect(detachService).toHaveBeenCalledWith('archive');
  });

  it('a chip dropped on empty space does nothing', () => {
    buildDom();
    const attachService = vi.fn();
    const detachService = vi.fn();
    const cb = makeNotebookDropCallbacks(depsOf({ attachService, detachService }));
    const chip = document.querySelector('.chip') as HTMLElement;
    _setElementFromPoint(() => null);
    startPointerDrag({ kind: 'svcattach', id: 'pin', srcEl: chip }, pev('pointerdown', 0, 0), cb);
    document.dispatchEvent(pev('pointermove', 60, 20));
    document.dispatchEvent(pev('pointerup', 60, 20));
    expect(attachService).not.toHaveBeenCalled();
    expect(detachService).not.toHaveBeenCalled();
  });
});

// The desktop bug: WKWebView blocks custom dataTransfer MIME types, so ANY native-drag
// service path is broken on the shipping build. The sweep keeps it from coming back.
describe('no native service-drag path survives', () => {
  const files = import.meta.glob(['/src/**/*.svelte', '/src/**/*.ts', '!/src/**/*.test.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;

  it('the sweep found the component and module sources (extraction proof)', () => {
    const names = Object.keys(files);
    expect(names.filter((f) => f.endsWith('.svelte')).length).toBeGreaterThan(20);
    expect(names.filter((f) => f.endsWith('.ts')).length).toBeGreaterThan(20);
    expect(names.filter((f) => f.endsWith('.test.ts'))).toEqual([]);
  });

  it('no source mentions the text/nb-svc MIME type', () => {
    for (const [file, src] of Object.entries(files)) {
      expect(src, `${file} still carries the native service-drag path`).not.toContain('text/nb-svc');
    }
  });
});
