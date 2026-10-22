import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import TopBar from './TopBar.svelte';
import { mode } from '../stores/mode';
import type { Place } from '../stores/place';

function baseProps(over: Record<string, unknown> = {}) {
  return {
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
    onplacehouse: vi.fn(),
    onplacefactory: vi.fn(),
    onenterstudy: vi.fn(),
    onfacmode: vi.fn(),
    onaddbench: vi.fn(),
    canUndo: false,
    canRedo: false,
    onundo: vi.fn(),
    onredo: vi.fn(),
    ...over,
  };
}

afterEach(() => mode.set('edit'));

const plus = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('button[data-act="newmenu"]')!;
const menu = (c: HTMLElement) => c.querySelector<HTMLElement>('.newmenu');
const item = (c: HTMLElement, k: string) => c.querySelector<HTMLButtonElement>(`[data-new="${k}"]`)!;

describe('TopBar ＋ new-notebook menu', () => {
  it('＋ opens a menu instead of creating straight away', async () => {
    const oncreate = vi.fn();
    const { container } = render(TopBar, { props: baseProps({ oncreate }) });
    expect(plus(container).getAttribute('aria-haspopup')).toBe('menu');
    expect(plus(container).getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(plus(container));
    expect(oncreate).not.toHaveBeenCalled();
    expect(menu(container)!.getAttribute('role')).toBe('menu');
    expect(plus(container).getAttribute('aria-expanded')).toBe('true');
    const labels = [...menu(container)!.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Blank notebook', 'Import file…']);
  });

  it('offers From AI… when the host provides onfromai', async () => {
    const onfromai = vi.fn();
    const { container } = render(TopBar, { props: baseProps({ onfromai }) });
    await fireEvent.click(plus(container));
    const labels = [...menu(container)!.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Blank notebook', 'From AI…', 'Import file…']);
    await fireEvent.click(item(container, 'ai'));
    expect(onfromai).toHaveBeenCalledOnce();
    expect(menu(container)).toBeNull();
  });

  it('Blank notebook calls oncreate and Import file… calls onimport, closing the menu', async () => {
    const oncreate = vi.fn();
    const onimport = vi.fn();
    const { container } = render(TopBar, { props: baseProps({ oncreate, onimport }) });
    await fireEvent.click(plus(container));
    await fireEvent.click(item(container, 'blank'));
    expect(oncreate).toHaveBeenCalledOnce();
    expect(menu(container)).toBeNull();
    await fireEvent.click(plus(container));
    await fireEvent.click(item(container, 'import'));
    expect(onimport).toHaveBeenCalledOnce();
    expect(menu(container)).toBeNull();
  });

  it('closes on a second ＋ click, on Escape and on an outside click', async () => {
    const { container } = render(TopBar, { props: baseProps() });
    await fireEvent.click(plus(container));
    await fireEvent.click(plus(container));
    expect(menu(container)).toBeNull();
    await fireEvent.click(plus(container));
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(menu(container)).toBeNull();
    await fireEvent.click(plus(container));
    await fireEvent.click(container.querySelector('.brand')!);
    expect(menu(container)).toBeNull();
  });

  it('is keyboard operable: arrows open and move, Escape returns focus to ＋', async () => {
    const { container } = render(TopBar, { props: baseProps({ onfromai: vi.fn() }) });
    plus(container).focus();
    await fireEvent.keyDown(plus(container), { key: 'ArrowDown' });
    await tick();
    expect(document.activeElement).toBe(item(container, 'blank'));
    await fireEvent.keyDown(menu(container)!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(item(container, 'ai'));
    await fireEvent.keyDown(menu(container)!, { key: 'End' });
    expect(document.activeElement).toBe(item(container, 'import'));
    await fireEvent.keyDown(menu(container)!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(item(container, 'blank')); // wraps
    await fireEvent.keyDown(menu(container)!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(item(container, 'import'));
    await fireEvent.keyDown(menu(container)!, { key: 'Escape' });
    expect(menu(container)).toBeNull();
    expect(document.activeElement).toBe(plus(container));
  });

  it('a keyboard activation of ＋ (click with detail 0) focuses the first item', async () => {
    const { container } = render(TopBar, { props: baseProps() });
    await fireEvent.click(plus(container), { detail: 0 });
    await tick();
    expect(document.activeElement).toBe(item(container, 'blank'));
  });

  it('ArrowUp on ＋ opens onto the last item; Tab closes', async () => {
    const { container } = render(TopBar, { props: baseProps() });
    await fireEvent.keyDown(plus(container), { key: 'ArrowUp' });
    await tick();
    expect(document.activeElement).toBe(item(container, 'import'));
    await fireEvent.keyDown(menu(container)!, { key: 'Tab' });
    expect(menu(container)).toBeNull();
  });

  it('sits outside the utility group and shares one open menu with the theme picker', async () => {
    const { container } = render(TopBar, { props: baseProps() });
    expect(plus(container).closest('.util-grp')).toBeNull();
    expect(container.querySelectorAll('.util-grp .ghost')).toHaveLength(3);
    await fireEvent.click(plus(container));
    const theme = [...container.querySelectorAll<HTMLButtonElement>('.themewrap .btn')][0];
    await fireEvent.click(theme);
    expect(menu(container)).toBeNull();
    expect(container.querySelector('.thememenu')).not.toBeNull();
  });
});
