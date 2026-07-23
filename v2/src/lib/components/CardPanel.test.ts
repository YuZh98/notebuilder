import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import CardPanel from './CardPanel.svelte';
import type { Card } from '../types';

function panelCard(over: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    sectionId: 's1',
    typeId: 'ct_x',
    position: 0,
    slots: [
      { id: 'sl1', type: 'slider', props: { key: 'a', value: 50, min: 0, max: 100, step: 1 } },
      { id: 'sl2', type: 'text-input', props: { placeholder: 'Type here', key: 'ans' } },
    ],
    ...over,
  };
}

function baseProps(card: Card) {
  return {
    card,
    state: {},
    live: {},
    alltags: [],
    onupdateslot: vi.fn(),
    onstate: vi.fn(),
    onduplicate: vi.fn(),
    onremove: vi.fn(),
    oneditinfactory: vi.fn(),
    onclose: vi.fn(),
  };
}

describe('CardPanel — content fields', () => {
  it('renders one registry Edit component per slot', () => {
    const { container } = render(CardPanel, { props: baseProps(panelCard()) });
    expect(container.querySelectorAll('.panel-slot')).toHaveLength(2);
    expect(container.querySelector('.slider-edit')).not.toBeNull();
    expect(container.querySelector('.text-input-edit')).not.toBeNull();
  });

  it('a field edit resolves to onupdateslot; the card object is not mutated locally', async () => {
    const props = baseProps(panelCard());
    const { container } = render(CardPanel, { props });
    const input = container.querySelector('.text-input-edit input') as HTMLInputElement;
    input.value = 'Say it';
    await fireEvent.input(input);
    await tick();
    expect(props.onupdateslot).toHaveBeenCalledWith(
      'sl2',
      expect.objectContaining({ placeholder: 'Say it' }),
    );
    expect((props.card.slots[1].props as { placeholder: string }).placeholder).toBe('Type here');
  });

  it('fields sit inside a data-history="edit" region (one undo entry per edit session)', () => {
    const { container } = render(CardPanel, { props: baseProps(panelCard()) });
    const input = container.querySelector('.text-input-edit input') as HTMLInputElement;
    expect(input.closest('[data-history="edit"]')).not.toBeNull();
  });

  it('renders front and back fields for a flip card', () => {
    const card = panelCard({
      verbs: { flip: true },
      back: [{ id: 'bk1', type: 'text-input', props: { placeholder: 'Back side' } }],
    });
    const { container } = render(CardPanel, { props: baseProps(card) });
    expect(container.querySelectorAll('.panel-slot')).toHaveLength(3);
    expect(container.textContent).toContain('Front content');
    expect(container.textContent).toContain('Back content');
  });
});

describe('CardPanel — actions', () => {
  it('Duplicate, Remove, Factory and close fire their callbacks', async () => {
    const props = baseProps(panelCard());
    const { container } = render(CardPanel, { props });
    const btn = (sel: string) => container.querySelector(sel) as HTMLButtonElement;
    await fireEvent.click(btn('button[title="Duplicate card"]'));
    expect(props.onduplicate).toHaveBeenCalledTimes(1);
    await fireEvent.click(btn('button[title="Edit in Factory"]'));
    expect(props.oneditinfactory).toHaveBeenCalledTimes(1);
    await fireEvent.click(btn('button[title="Remove card"]'));
    expect(props.onremove).toHaveBeenCalledTimes(1);
    await fireEvent.click(btn('button[title="Deselect card"]'));
    expect(props.onclose).toHaveBeenCalledTimes(1);
  });

  it('a typeless card offers "Send to Factory" instead', () => {
    const { container } = render(CardPanel, {
      props: baseProps(panelCard({ typeId: undefined })),
    });
    expect(container.querySelector('button[title="Send to Factory"]')).not.toBeNull();
    expect(container.querySelector('button[title="Edit in Factory"]')).toBeNull();
  });

  it('omits the Factory action when no handler is given (Reader)', () => {
    const props = { ...baseProps(panelCard()), oneditinfactory: undefined };
    const { container } = render(CardPanel, { props });
    expect(container.querySelector('button[title="Edit in Factory"]')).toBeNull();
    expect(container.querySelector('button[title="Send to Factory"]')).toBeNull();
  });
});

describe('CardPanel — no structural operations', () => {
  it('offers no slot add/remove, no flip/bare, no seal', () => {
    const { container } = render(CardPanel, { props: baseProps(panelCard()) });
    expect(container.querySelector('.slot-adder')).toBeNull();
    expect(container.querySelector('.slot-del')).toBeNull();
    expect(container.textContent).not.toContain('+ slot');
    expect(container.textContent?.toLowerCase()).not.toContain('seal');
    for (const label of container.querySelectorAll('label')) {
      expect(label.textContent?.trim()).not.toMatch(/^(flip|bare)$/);
    }
  });
});
