import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import SealModal from './SealModal.svelte';
import type { Bench } from '../bench.svelte';
import type { CardType } from '../card-types';
import type { SealOutcome } from '../seal';

function bench(over: Partial<Bench> = {}): Bench {
  return {
    id: 'bench_1',
    name: 'Widget',
    slots: [{ id: 'slot_1', type: 'text', props: { text: 'hi' } }],
    ...over,
  };
}

const src: CardType = {
  id: 'ct_src',
  name: 'Widget',
  slots: [{ type: 'text', props: { text: 'old' } }],
  icon: '📊',
  store: 'write',
};

function mount(over: {
  bench?: Bench;
  existing?: CardType | null;
  taken?: string[];
} = {}) {
  const onconfirm = vi.fn<(o: SealOutcome) => void>();
  const oncancel = vi.fn();
  const { container } = render(SealModal, {
    props: {
      bench: over.bench ?? bench(),
      existing: over.existing ?? null,
      taken: over.taken ?? [],
      onconfirm,
      oncancel,
    },
  });
  return { container, onconfirm, oncancel };
}

const byText = (root: ParentNode, text: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

describe('SealModal', () => {
  it('renders a .modal-box with a CardView preview', () => {
    const { container } = mount();
    expect(container.querySelector('.modal-box')).toBeInTheDocument();
    expect(container.querySelector('.prev-wrap .furn')).toBeInTheDocument();
  });

  it('confirming a fresh product fires onconfirm with a new outcome', async () => {
    const { container, onconfirm } = mount();
    await fireEvent.click(byText(container, 'Confirm seal'));
    expect(onconfirm).toHaveBeenCalledTimes(1);
    const out = onconfirm.mock.calls[0][0];
    expect(out.kind).toBe('new');
    expect(out.type.name).toBe('Widget');
  });

  it('a name colliding with a taken name shows an inline error, no confirm', async () => {
    const { container, onconfirm } = mount({ taken: ['Widget'] });
    await fireEvent.click(byText(container, 'Confirm seal'));
    expect(onconfirm).not.toHaveBeenCalled();
    expect(container.querySelector('[data-seal="error"]')?.textContent).toContain('already in use');
  });

  it('editing the name clears a prior error', async () => {
    const { container } = mount({ taken: ['Widget'] });
    await fireEvent.click(byText(container, 'Confirm seal'));
    expect(container.querySelector('[data-seal="error"]')).toBeInTheDocument();
    const name = container.querySelector('[data-seal="name"]') as HTMLInputElement;
    await fireEvent.input(name, { target: { value: 'Widget 2' } });
    expect(container.querySelector('[data-seal="error"]')).toBeNull();
  });

  it('a forked bench whose name matches its source shows the conflict footer', async () => {
    const { container, onconfirm } = mount({
      bench: bench({ src: { id: 'ct_src', name: 'Widget' } }),
      existing: src,
      taken: [],
    });
    await fireEvent.click(byText(container, 'Confirm seal'));
    expect(onconfirm).not.toHaveBeenCalled();
    expect(byText(container, 'Seal as new')).toBeInTheDocument();
    expect(byText(container, 'Replace original')).toBeInTheDocument();
  });

  it('Replace original fires a replace outcome carrying the source id', async () => {
    const { container, onconfirm } = mount({
      bench: bench({ src: { id: 'ct_src', name: 'Widget' } }),
      existing: src,
    });
    await fireEvent.click(byText(container, 'Confirm seal'));
    await fireEvent.click(byText(container, 'Replace original'));
    const out = onconfirm.mock.calls[0][0];
    expect(out.kind).toBe('replace');
    expect(out.type.id).toBe('ct_src');
  });

  it('Seal as new with the unchanged source name errors and does not confirm', async () => {
    const { container, onconfirm } = mount({
      bench: bench({ src: { id: 'ct_src', name: 'Widget' } }),
      existing: src,
    });
    await fireEvent.click(byText(container, 'Confirm seal'));
    await fireEvent.click(byText(container, 'Seal as new'));
    expect(onconfirm).not.toHaveBeenCalled();
    expect(container.querySelector('[data-seal="error"]')).toBeInTheDocument();
  });

  it('picking a store chip sets the store; clicking it again clears to Workshop (null)', async () => {
    const { container, onconfirm } = mount();
    const practice = container.querySelector('[data-store="practice"]') as HTMLButtonElement;
    await fireEvent.click(practice);
    expect(practice).toHaveClass('on');
    await fireEvent.click(practice);
    expect(practice).not.toHaveClass('on');
    await fireEvent.click(byText(container, 'Confirm seal'));
    expect(onconfirm.mock.calls[0][0].type.store).toBeNull();
  });

  it('adds and deletes variety rows', async () => {
    const { container } = mount();
    expect(container.querySelectorAll('.seal-var')).toHaveLength(0);
    await fireEvent.click(byText(container, 'variety'));
    await tick();
    expect(container.querySelectorAll('.seal-var')).toHaveLength(1);
    const del = container.querySelector('.seal-var .ghost') as HTMLButtonElement;
    await fireEvent.click(del);
    await tick();
    expect(container.querySelectorAll('.seal-var')).toHaveLength(0);
  });

  it('a variety row carries its name and accent through to the sealed type', async () => {
    const { container, onconfirm } = mount();
    await fireEvent.click(byText(container, 'variety'));
    await tick();
    const swatch = container.querySelector('.seal-var .chip.xs') as HTMLButtonElement;
    await fireEvent.click(swatch);
    await fireEvent.click(byText(container, 'Confirm seal'));
    const vs = onconfirm.mock.calls[0][0].type.varieties;
    expect(vs).toHaveLength(1);
    expect(vs![0].accent).toBeTruthy();
  });

  it('Cancel fires oncancel', async () => {
    const { container, oncancel } = mount();
    await fireEvent.click(byText(container, 'Cancel'));
    expect(oncancel).toHaveBeenCalled();
  });

  // Carried fix (d): the preview is read-only (forceMode="study" + editable:false), so an
  // empty text slot renders as static markdown, never a live inline editor.
  it('an empty text slot in the preview never opens a live editor', () => {
    const { container } = mount({
      bench: bench({ slots: [{ id: 's_empty', type: 'text', props: { text: '' } }] }),
    });
    const prev = container.querySelector('.prev-wrap') as HTMLElement;
    expect(prev.querySelector('.text-study')).toBeInTheDocument();
    expect(
      prev.querySelectorAll('[contenteditable="true"], textarea, input, .ce'),
    ).toHaveLength(0);
  });
});
