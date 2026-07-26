import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import App from './App.svelte';
import { mode } from './lib/stores/mode';
import { place } from './lib/stores/place';

afterEach(() => {
  mode.set('edit');
  place.set('house');
});

describe('App — section-service chips with a card selected', () => {
  it('toggling a chip while a card is selected enables the service on that card’s section', async () => {
    const { container } = render(App);
    await tick();

    // No card owns the pin affordance until a section service turns it on.
    expect(container.querySelector('[data-act="pin"]')).toBeNull();

    // Select a card (clears selSection — the case that used to make the chip a silent no-op).
    const card = container.querySelector('.furn[data-card]') as HTMLElement;
    expect(card).not.toBeNull();
    await fireEvent.click(card);
    await tick();

    // The Section-ops "pin" chip now resolves the selected card's section as its target.
    const pinChip = container.querySelector('[data-svc="pin"]') as HTMLElement;
    expect(pinChip).not.toBeNull();
    await fireEvent.click(pinChip);
    await tick();

    // Service enabled on the card's section → the card renders its pin control.
    expect(container.querySelector('.furn[data-card] [data-act="pin"]')).not.toBeNull();
  });
});

describe('App — the study shortcut overlay', () => {
  it('opens on ? while studying the house', async () => {
    const { container } = render(App);
    mode.set('study');
    await tick();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
    await tick();
    expect(container.querySelector('.kb-modal')).not.toBeNull();
  });

  it('closes itself when the reader leaves the house — its keys are house-only', async () => {
    const { container } = render(App);
    mode.set('study');
    await tick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
    await tick();
    expect(container.querySelector('.kb-modal')).not.toBeNull();

    place.set('factory');
    await tick();
    expect(container.querySelector('.kb-modal')).toBeNull();
  });
});
