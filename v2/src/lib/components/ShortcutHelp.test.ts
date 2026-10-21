import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import ShortcutHelp from './ShortcutHelp.svelte';
import App from '../../App.svelte';
import { mode } from '../stores/mode';
import { place } from '../stores/place';

afterEach(() => {
  mode.set('edit');
  place.set('house');
});

const rows = (c: HTMLElement | Document): [string, string][] => {
  const dts = [...c.querySelectorAll('.kb-list dt')];
  const dds = [...c.querySelectorAll('.kb-list dd')];
  return dts.map((dt, i): [string, string] => [
    dt.textContent?.trim() ?? '',
    dds[i]?.textContent?.trim() ?? '',
  ]);
};

const EXPECTED: [string, string][] = [
  ['j · ↓ · →', 'focus the next card'],
  ['k · ↑ · ←', 'focus the previous card'],
  ['space · f', 'flip the focused card'],
  ['1 – 9', 'pick that answer option'],
  ['Enter', 'submit the answer'],
  ['x', 'tick the next checklist item'],
  ['Esc', 'clear the focus'],
  ['⌘/Ctrl Enter', 'switch Edit ⇄ Study'],
  ['⌘/Ctrl + · − · 0', 'zoom in · out · reset'],
  ['?', 'open or close this list'],
];

const open = () => render(ShortcutHelp, { props: { onclose: vi.fn() } });

describe('ShortcutHelp — the rows it advertises', () => {
  it('renders every declared shortcut row, in order, keys paired with their description', () => {
    const { container } = open();
    expect(rows(container)).toEqual(EXPECTED);
  });

  it('every key label is a <kbd>, so no row renders as bare text', () => {
    const { container } = open();
    const kbds = [...container.querySelectorAll('.kb-list dt > kbd')].map((k) => k.textContent);
    expect(kbds).toEqual(EXPECTED.map(([keys]) => keys));
  });

  it('the cursor rows list the arrow keys beside j/k (the four-arrow fix)', () => {
    const { container } = open();
    const byKeys = new Map(rows(container));
    // Both directions must advertise all three aliases — dropping an arrow here is the regression.
    expect([...byKeys.keys()].filter((k) => k.startsWith('j'))).toEqual(['j · ↓ · →']);
    expect([...byKeys.keys()].filter((k) => k.startsWith('k'))).toEqual(['k · ↑ · ←']);
    expect(byKeys.get('j · ↓ · →')).toBe('focus the next card');
    expect(byKeys.get('k · ↑ · ←')).toBe('focus the previous card');
  });

  it('labels itself as a dialog and spells out both close affordances', () => {
    const { container } = open();
    const box = container.querySelector('.kb-box') as HTMLElement;
    expect(box.getAttribute('role')).toBe('dialog');
    expect(box.getAttribute('aria-label')).toBe('Keyboard shortcuts');
    expect(box.textContent).toContain('? or Esc to close');
    expect(box.querySelector('button')?.textContent?.trim()).toBe('Close');
  });
});

describe('ShortcutHelp — close interactions it implements itself', () => {
  it('the Close button fires onclose', async () => {
    const onclose = vi.fn();
    const { container } = render(ShortcutHelp, { props: { onclose } });
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Close')!;
    await fireEvent.click(btn);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('a click on the backdrop fires onclose', async () => {
    const onclose = vi.fn();
    const { container } = render(ShortcutHelp, { props: { onclose } });
    await fireEvent.click(container.querySelector('.kb-modal') as HTMLElement);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('a click inside the box — even one that bubbles to the backdrop — never closes it', async () => {
    const onclose = vi.fn();
    const { container } = render(ShortcutHelp, { props: { onclose } });
    await fireEvent.click(container.querySelector('.kb-box') as HTMLElement);
    await fireEvent.click(container.querySelector('.kb-list kbd') as HTMLElement);
    await fireEvent.click(container.querySelector('h3') as HTMLElement);
    expect(onclose).not.toHaveBeenCalled();
  });

  it('owns no key handling of its own: Esc and ? are the host’s wiring, not the component’s', async () => {
    const onclose = vi.fn();
    const { container } = render(ShortcutHelp, { props: { onclose } });
    await fireEvent.keyDown(container.querySelector('.kb-box') as HTMLElement, { key: 'Escape' });
    await fireEvent.keyDown(window, { key: 'Escape' });
    await fireEvent.keyDown(window, { key: '?' });
    // The copy promises "? or Esc to close" — the App/Reader key dispatcher delivers it (below).
    expect(onclose).not.toHaveBeenCalled();
  });
});

/** Shell regions that must leave the focus order while the overlay is up. */
const inertFlags = (c: HTMLElement) =>
  ['#top', '#main', '#sidebump'].map((s) => c.querySelector(s)?.hasAttribute('inert'));

async function openHelp(container: HTMLElement) {
  mode.set('study');
  await tick();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
  await tick();
  expect(container.querySelector('.kb-modal')).not.toBeNull();
}

describe('ShortcutHelp — modal to focus, mounted for real in App', () => {
  it('opening it inerts the shell behind it and leaves the overlay itself reachable', async () => {
    const { container } = render(App);
    await tick();
    expect(inertFlags(container)).toEqual([false, false, false]);

    await openHelp(container);
    expect(inertFlags(container)).toEqual([true, true, true]);
    expect(container.querySelector('.kb-modal')?.hasAttribute('inert')).toBe(false);
  });

  it('its own Close button closes it and hands the shell back', async () => {
    const { container } = render(App);
    await tick();
    await openHelp(container);

    const close = [...container.querySelectorAll('.kb-box button')].find(
      (b) => b.textContent?.trim() === 'Close',
    ) as HTMLElement;
    await fireEvent.click(close);
    await tick();

    expect(container.querySelector('.kb-modal')).toBeNull();
    expect(inertFlags(container)).toEqual([false, false, false]);
  });

  it('a backdrop click closes it and hands the shell back', async () => {
    const { container } = render(App);
    await tick();
    await openHelp(container);

    await fireEvent.click(container.querySelector('.kb-modal') as HTMLElement);
    await tick();

    expect(container.querySelector('.kb-modal')).toBeNull();
    expect(inertFlags(container)).toEqual([false, false, false]);
  });

  it('Esc closes it — the host key dispatcher makes the overlay’s own copy true', async () => {
    const { container } = render(App);
    await tick();
    await openHelp(container);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await tick();

    expect(container.querySelector('.kb-modal')).toBeNull();
    expect(inertFlags(container)).toEqual([false, false, false]);
  });

  it('? toggles it shut again, inert and all', async () => {
    const { container } = render(App);
    await tick();
    await openHelp(container);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
    await tick();

    expect(container.querySelector('.kb-modal')).toBeNull();
    expect(inertFlags(container)).toEqual([false, false, false]);
  });

  it('leaving the house tears the overlay down AND lifts the inert it installed', async () => {
    const { container } = render(App);
    await tick();
    await openHelp(container);
    expect(inertFlags(container)).toEqual([true, true, true]);

    place.set('factory');
    await tick();

    expect(container.querySelector('.kb-modal')).toBeNull();
    expect(inertFlags(container), 'a stuck inert would leave the Factory unusable').toEqual([
      false,
      false,
      false,
    ]);
  });
});
