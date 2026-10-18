import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import DraftsBar from './DraftsBar.svelte';
import SideBar from './SideBar.svelte';
import { mode } from '../stores/mode';

afterEach(() => {
  cleanup();
  mode.set('edit');
});

describe('DraftsBar', () => {
  it('renders nothing when there are no drafts', () => {
    const { container } = render(DraftsBar, { props: { count: 0, onnext: vi.fn(), onmarkall: vi.fn() } });
    expect(container.querySelector('.drafts-bar')).toBeNull();
  });

  it('counts the drafts left to review (singular and plural)', async () => {
    const { container, rerender } = render(DraftsBar, { props: { count: 5, onnext: vi.fn(), onmarkall: vi.fn() } });
    expect(container.querySelector('.drafts-bar')?.textContent).toMatch(/5 drafts to review/);
    await rerender({ count: 1, onnext: vi.fn(), onmarkall: vi.fn() });
    expect(container.querySelector('.drafts-bar')?.textContent).toMatch(/1 draft to review/);
  });

  it('Next and Mark all reviewed call their callbacks', async () => {
    const onnext = vi.fn();
    const onmarkall = vi.fn();
    render(DraftsBar, { props: { count: 2, onnext, onmarkall } });
    await fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onnext).toHaveBeenCalledTimes(1);
    await fireEvent.click(screen.getByRole('button', { name: /mark all reviewed/i }));
    expect(onmarkall).toHaveBeenCalledTimes(1);
  });
});

describe('SideBar — drafts bar in the notebook panel', () => {
  const base = {
    notebookName: 'NB',
    canPersist: false,
    cardTypes: [],
    selProd: null,
    onrename: vi.fn(),
    ondelete: vi.fn(),
    onpickprod: vi.fn(),
    onplaceprod: vi.fn(),
    onclosedetail: vi.fn(),
  };

  it('shows the bar in Edit mode when drafts remain and wires both callbacks', async () => {
    const ondraftnext = vi.fn();
    const ondraftsreviewed = vi.fn();
    const { container } = render(SideBar, { props: { ...base, drafts: 3, ondraftnext, ondraftsreviewed } });
    expect(container.querySelector('.drafts-bar')?.textContent).toMatch(/3 drafts to review/);
    await fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await fireEvent.click(screen.getByRole('button', { name: /mark all reviewed/i }));
    expect(ondraftnext).toHaveBeenCalledTimes(1);
    expect(ondraftsreviewed).toHaveBeenCalledTimes(1);
  });

  it('has no bar when the notebook has no drafts (the default, e.g. the shared Reader)', () => {
    const { container } = render(SideBar, { props: base });
    expect(container.querySelector('.drafts-bar')).toBeNull();
  });

  it('has no bar in Study mode', () => {
    mode.set('study');
    const { container } = render(SideBar, { props: { ...base, drafts: 3 } });
    expect(container.querySelector('.drafts-bar')).toBeNull();
  });
});
