import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SideBar from './SideBar.svelte';
import { mode } from '../stores/mode';
import { SERVICE_ORDER } from '../services';
import { dustState } from '../drag/dust.svelte';
import type { Section } from '../types';

function sec(over: Partial<Section> = {}): Section {
  return { id: 's1', notebookId: 'nb1', name: 'Intro', position: 0, cards: [], ...over };
}

function baseProps(over: Record<string, unknown> = {}) {
  return {
    notebookName: 'NB',
    canPersist: false,
    cardTypes: [],
    selProd: null,
    section: null as Section | null,
    onrename: vi.fn(),
    ondelete: vi.fn(),
    onpickprod: vi.fn(),
    onplaceprod: vi.fn(),
    onclosedetail: vi.fn(),
    onsvctoggle: vi.fn(),
    ...over,
  };
}

afterEach(() => {
  mode.set('edit');
  dustState.show = false;
  dustState.hot = false;
});

describe('SideBar — Section ops panel', () => {
  it('renders one chip per service in registry order (Edit only)', () => {
    const { container } = render(SideBar, { props: baseProps() });
    const chips = [...container.querySelectorAll('[data-svc]')].map((c) => c.getAttribute('data-svc'));
    expect(chips).toEqual([...SERVICE_ORDER]);
  });

  it('is absent in Study mode', () => {
    mode.set('study');
    const { container } = render(SideBar, { props: baseProps() });
    expect(container.querySelector('[data-svc]')).toBeNull();
  });

  it('marks chips .on for the selected section services', () => {
    const { container } = render(SideBar, {
      props: baseProps({ section: sec({ services: { search: true } }) }),
    });
    expect(container.querySelector('[data-svc="search"]')).toHaveClass('on');
    expect(container.querySelector('[data-svc="shuffle"]')).not.toHaveClass('on');
  });

  it('clicking a chip fires onsvctoggle with its key', async () => {
    const props = baseProps({ section: sec() });
    const { container } = render(SideBar, { props });
    await fireEvent.click(container.querySelector('[data-svc="pin"]') as Element);
    expect(props.onsvctoggle).toHaveBeenCalledWith('pin');
  });

  it('disables flipAll when the selected section has no flip-capable card', () => {
    const noFlip = render(SideBar, { props: baseProps({ section: sec({ cards: [{ id: 'c', sectionId: 's1', position: 0, slots: [] }] }) }) });
    expect(noFlip.container.querySelector('[data-svc="flipAll"]')).toBeDisabled();
    noFlip.unmount();

    const withFlip = render(SideBar, {
      props: baseProps({
        section: sec({ cards: [{ id: 'c', sectionId: 's1', position: 0, slots: [], verbs: { flip: true } }] }),
      }),
    });
    expect(withFlip.container.querySelector('[data-svc="flipAll"]')).not.toBeDisabled();
  });

  it('dragstart sets the text/nb-svc payload and reveals the dustbin', () => {
    const { container } = render(SideBar, { props: baseProps({ section: sec() }) });
    const chip = container.querySelector('[data-svc="pin"]') as HTMLElement;
    let payload = '';
    const dataTransfer = { setData: (_k: string, v: string) => (payload = v), types: [] as string[] };
    fireEvent.dragStart(chip, { dataTransfer });
    expect(payload).toBe('pin');
    expect(dustState.show).toBe(true);
  });
});
