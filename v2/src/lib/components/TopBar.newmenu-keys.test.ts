/**
 * Review fix: keys the ＋ menu handles (arrows, Home/End, Escape) must not also reach App's
 * window-level shortcuts, which move the section/card selection and deselect behind the menu.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import TopBar from './TopBar.svelte';
import type { Place } from '../stores/place';

const props = {
  notebooks: [{ id: 'nb1', name: 'NB' }],
  currentId: 'nb1',
  themeId: '' as never,
  canSwitch: false,
  place: 'house' as Place,
  factoryPreview: false,
  onswitch: vi.fn(),
  oncreate: vi.fn(),
  onsettheme: vi.fn(),
  onaddsection: vi.fn(),
  onaddchapter: vi.fn(),
  onshare: vi.fn(),
  onexport: vi.fn(),
  onimport: vi.fn(),
  onfromai: vi.fn(),
  onplacehouse: vi.fn(),
  onplacefactory: vi.fn(),
  onenterstudy: vi.fn(),
  onfacmode: vi.fn(),
  onaddbench: vi.fn(),
  canUndo: false,
  canRedo: false,
  onundo: vi.fn(),
  onredo: vi.fn(),
};

let appKeys: string[] = [];
const appHandler = (e: KeyboardEvent) => appKeys.push(e.key);

afterEach(() => {
  window.removeEventListener('keydown', appHandler);
  appKeys = [];
});

describe('TopBar ＋ menu keeps its keys to itself', () => {
  it('arrows, Home/End and Escape in the menu never reach a window-level handler', async () => {
    const { container } = render(TopBar, { props });
    window.addEventListener('keydown', appHandler); // App's global shortcuts listen here
    const plus = container.querySelector<HTMLButtonElement>('button[data-act="newmenu"]')!;
    plus.focus();
    await fireEvent.keyDown(plus, { key: 'ArrowDown' });
    await tick();
    const menu = container.querySelector<HTMLElement>('.newmenu')!;
    for (const key of ['ArrowDown', 'ArrowUp', 'End', 'Home']) await fireEvent.keyDown(menu, { key });
    await fireEvent.keyDown(menu, { key: 'Escape' });
    expect(container.querySelector('.newmenu')).toBeNull();
    expect(document.activeElement).toBe(plus);
    expect(appKeys).toEqual([]);
  });

  it('other keys still reach the app (e.g. Ctrl+Z, Tab)', async () => {
    const { container } = render(TopBar, { props });
    window.addEventListener('keydown', appHandler);
    const plus = container.querySelector<HTMLButtonElement>('button[data-act="newmenu"]')!;
    await fireEvent.keyDown(plus, { key: 'ArrowDown' });
    await tick();
    const menu = container.querySelector<HTMLElement>('.newmenu')!;
    await fireEvent.keyDown(menu, { key: 'z', ctrlKey: true });
    await fireEvent.keyDown(menu, { key: 'Tab' });
    expect(appKeys).toEqual(['z', 'Tab']);
  });
});
