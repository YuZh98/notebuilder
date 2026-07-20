import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TopBar from './TopBar.svelte';
import { mode } from '../stores/mode';
import { toastState } from '../toast.svelte';
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
    onplace: vi.fn(),
    onenterstudy: vi.fn(),
    onfacmode: vi.fn(),
    onaddbench: vi.fn(),
    ...over,
  };
}

afterEach(() => mode.set('edit'));

describe('TopBar share cluster', () => {
  it('renders an enabled Share button plus the JSON/print utility group in the house', () => {
    const { container } = render(TopBar, { props: baseProps() });
    const share = container.querySelector<HTMLButtonElement>('.share-btn');
    expect(share).not.toBeNull();
    expect(share!.disabled).toBe(false);
    expect(share!.textContent).toContain('Share');
    expect(container.querySelectorAll('.util-grp .ghost')).toHaveLength(3);
  });

  it('fires onshare when Share is clicked', async () => {
    const onshare = vi.fn();
    const { container } = render(TopBar, { props: baseProps({ onshare }) });
    await fireEvent.click(container.querySelector('.share-btn')!);
    expect(onshare).toHaveBeenCalledOnce();
  });

  it('shows the share cluster in Study mode too', () => {
    mode.set('study');
    const { container } = render(TopBar, { props: baseProps() });
    expect(container.querySelector('.share-btn')).not.toBeNull();
  });

  it('hides the share cluster in the Factory', () => {
    const { container } = render(TopBar, { props: baseProps({ place: 'factory' }) });
    expect(container.querySelector('.share-btn')).toBeNull();
  });
});

describe('TopBar print action', () => {
  afterEach(() => vi.useRealTimers());

  function clickPrint(container: HTMLElement) {
    const print = [...container.querySelectorAll<HTMLButtonElement>('.util-grp .ghost')].find(
      (b) => b.textContent?.includes('🖨'),
    )!;
    return fireEvent.click(print);
  }

  it('from Edit: enters study, toasts, then calls window.print after 150ms', async () => {
    vi.useFakeTimers();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const onenterstudy = vi.fn();
    const { container } = render(TopBar, { props: baseProps({ onenterstudy }) });
    await clickPrint(container);
    expect(onenterstudy).toHaveBeenCalledOnce();
    expect(toastState.message).toBe('print dialog → Save as PDF');
    expect(printSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(printSpy).toHaveBeenCalledOnce();
  });

  it('from Study: prints directly without re-entering study', async () => {
    vi.useFakeTimers();
    mode.set('study');
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const onenterstudy = vi.fn();
    const { container } = render(TopBar, { props: baseProps({ onenterstudy }) });
    await clickPrint(container);
    expect(onenterstudy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(printSpy).toHaveBeenCalledOnce();
  });
});
