import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
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
