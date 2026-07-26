import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { revealCard } from './card-reveal';

function card(id: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'furn';
  el.dataset.card = id;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('revealCard', () => {
  it('scrolls the card to the middle of the stage and flashes the ring', async () => {
    const el = card('c1');
    await revealCard('c1', 500);

    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(el.classList.contains('kflash')).toBe(true);

    vi.advanceTimersByTime(500);
    expect(el.classList.contains('kflash')).toBe(false);
  });

  it('leaves every other card alone', async () => {
    const other = card('c1');
    const target = card('c2');
    await revealCard('c2', 500);

    expect(other.classList.contains('kflash')).toBe(false);
    expect(target.classList.contains('kflash')).toBe(true);
  });

  it('is a no-op for a card that is not on the page', async () => {
    await expect(revealCard('ghost', 500)).resolves.toBeUndefined();
  });
});
