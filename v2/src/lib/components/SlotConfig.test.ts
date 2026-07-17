import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SlotConfig from './SlotConfig.svelte';
import type { Slot } from '../types';

function slot(over: Partial<Slot> = {}): Slot {
  return { id: 's1', type: 'text', props: {}, ...over };
}

function props(over: Record<string, unknown> = {}) {
  return {
    slot: slot(),
    revKeys: [] as string[],
    hasNext: false,
    nextFuseW: 1,
    onpatch: vi.fn(),
    ondelete: vi.fn(),
    ...over,
  };
}

describe('SlotConfig', () => {
  it('shows the reveal editor only when the slot has a reveal verb', async () => {
    const { container, rerender } = render(SlotConfig, { props: props() });
    expect(container.textContent).not.toContain('Reveal when');

    await rerender(props({ slot: slot({ verbs: { reveal: { key: 'pick', op: '==', val: 0 } } }) }));
    expect(container.textContent).toContain('Reveal when');
  });

  it('renders reveal key chips from revKeys and the six op chips', () => {
    const { container } = render(SlotConfig, {
      props: props({
        slot: slot({ verbs: { reveal: { key: 'pick', op: '==', val: 0 } } }),
        revKeys: ['pick', 'score'],
      }),
    });
    const chips = [...container.querySelectorAll('.chip.xs')].map((c) => c.textContent?.trim());
    expect(chips).toContain('pick');
    expect(chips).toContain('score');
    for (const op of ['==', '!=', '>=', '<=', '>', '<']) expect(chips).toContain(op);
  });

  it('emits an op patch when an op chip is clicked', async () => {
    const p = props({ slot: slot({ verbs: { reveal: { key: 'pick', op: '==', val: 0 } } }) });
    const { container } = render(SlotConfig, { props: p });
    const ne = [...container.querySelectorAll('.chip.xs')].find((c) => c.textContent?.trim() === '!=');
    await fireEvent.click(ne as Element);
    expect(p.onpatch).toHaveBeenCalledWith({ verbs: { reveal: { key: 'pick', op: '!=', val: 0 } } });
  });

  it('coerces a numeric reveal value but keeps non-numeric text', async () => {
    const p = props({ slot: slot({ verbs: { reveal: { key: 'pick', op: '==', val: 0 } } }) });
    const { container } = render(SlotConfig, { props: p });
    const input = container.querySelector('input[placeholder="val"]') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '3' } });
    expect(p.onpatch).toHaveBeenCalledWith({ verbs: { reveal: { key: 'pick', op: '==', val: 3 } } });
  });

  it('hides the fuse toggle on the last slot of a face', () => {
    const { container } = render(SlotConfig, { props: props({ hasNext: false }) });
    expect(container.textContent).not.toContain('fuse with next');
  });

  it('shows the fuse toggle when a next slot exists and toggles it', async () => {
    const p = props({ hasNext: true });
    const { container } = render(SlotConfig, { props: p });
    const fuse = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('fuse with next'),
    );
    await fireEvent.click(fuse as Element);
    expect(p.onpatch).toHaveBeenCalledWith({ fuse: true });
  });

  it('emits sum-preserving fuse widths from the split slider', async () => {
    const p = props({ hasNext: true, slot: slot({ fuse: true, fuseW: 1 }) });
    const { container } = render(SlotConfig, { props: p });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    await fireEvent.input(range, { target: { value: '30' } });
    expect(p.onpatch).toHaveBeenCalledWith({ fuseW: 0.6 });
  });

  it('maps the split slider against the real pair total, not a hardcoded 2', async () => {
    const p = props({ hasNext: true, slot: slot({ fuse: true, fuseW: 1.5 }), nextFuseW: 1.0 });
    const { container } = render(SlotConfig, { props: p });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    // total = 2.5, ratio 0.3 -> leftW = round(2.5 * 0.3) = 0.75
    await fireEvent.input(range, { target: { value: '30' } });
    expect(p.onpatch).toHaveBeenCalledWith({ fuseW: 0.75 });
  });

  it('seeds the slider from the current ratio within the real total', () => {
    const { container } = render(SlotConfig, {
      props: props({ hasNext: true, slot: slot({ fuse: true, fuseW: 1.5 }), nextFuseW: 1.0 }),
    });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    // 1.5 / 2.5 = 60%
    expect(range.value).toBe('60');
  });

  it('fires ondelete from the delete button', async () => {
    const p = props();
    const { container } = render(SlotConfig, { props: p });
    const del = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('delete slot'),
    );
    await fireEvent.click(del as Element);
    expect(p.ondelete).toHaveBeenCalled();
  });
});
