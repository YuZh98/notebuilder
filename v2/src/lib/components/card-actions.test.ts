import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import App from '../../App.svelte';
import CardView from './CardView.svelte';
import type { Card } from '../types';
import { mode } from '../stores/mode';
import { place } from '../stores/place';
import { factory, hydrateFactory } from '../bench.svelte';
import { clearHistory } from '../history.svelte';

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  hydrateFactory(null);
  mode.set('edit');
  place.set('house');
  clearHistory();
});

afterEach(() => {
  mode.set('edit');
  place.set('house');
  vi.restoreAllMocks();
});

const noop = () => {};
const added: string[] = [];
const deleted: string[] = [];

/** A Study-mode notebook card, the only surface where reader notes appear. */
const noteProps = {
  card: {
    id: 'c1',
    sectionId: 's1',
    position: 0,
    slots: [{ id: 'sl1', type: 'text', props: { text: 'body' } }],
  } as Card,
  surface: 'notebook' as const,
  forceMode: 'study' as const,
  selected: false,
  state: {},
  notes: [],
  notesOpen: false,
  onselect: noop,
  onstate: noop,
  onmove: noop,
  ondelete: noop,
  onverb: noop,
  ontags: noop,
  onsavetype: noop,
  onupdateslot: noop,
  ondeleteslot: noop,
  onaddslot: noop,
  progresscompletion: () => ({ done: 0, total: 0, pct: 0 }),
  ontogglenotes: noop,
  onaddnote: noop,
  ondeletenote: noop,
  ongrip: noop,
  onresize: noop,
  onfusew: noop,
};

describe('Edit in Factory (B3)', () => {
  it('forks the card into a new bench and switches to the Factory', async () => {
    const { container } = render(App);
    await tick();
    const benchesBefore = factory.benches.length;
    const btn = container.querySelector<HTMLButtonElement>(
      '.cardtools button[title="Edit in Factory"], .cardtools button[title="Send to Factory"]',
    );
    expect(btn, 'no Factory button on a placed card in Edit').not.toBeNull();
    await fireEvent.click(btn!);
    await tick();
    expect(get(place)).toBe('factory');
    expect(factory.benches.length).toBe(benchesBefore + 1);
  });

  it('leaves the placed card untouched', async () => {
    const { container } = render(App);
    await tick();
    const card = container.querySelector('[data-card]') as HTMLElement;
    const before = card.outerHTML;
    const btn = container.querySelector<HTMLButtonElement>(
      '.cardtools button[title="Edit in Factory"], .cardtools button[title="Send to Factory"]',
    )!;
    await fireEvent.click(btn);
    await tick();
    place.set('house');
    await tick();
    const after = (container.querySelector('[data-card]') as HTMLElement).outerHTML;
    expect(after).toBe(before);
  });
});

describe('Card notes are opt-in per section', () => {
  it('shows no notes affordance in Study until the section enables the service', async () => {
    const { container } = render(App);
    await tick();
    mode.set('study');
    await tick();
    expect(container.querySelector('.notes-toggle')).toBeNull();
  });

  it('adds a note once the service is on', async () => {
    const toggled: number[] = [];
    const { container } = render(CardView, {
      props: {
        ...noteProps,
        notes: [],
        notesEnabled: true,
        notesOpen: true,
        ontogglenotes: () => toggled.push(1),
        onaddnote: (body: string) => {
          added.push(body);
        },
      },
    });
    await tick();
    const toggle = container.querySelector<HTMLButtonElement>('.notes-toggle');
    expect(toggle, 'notes toggle missing with the service on').not.toBeNull();
    await fireEvent.click(toggle!);
    expect(toggled.length, 'toggle does not call back').toBe(1);

    const ta = container.querySelector<HTMLTextAreaElement>('.notes textarea')!;
    await fireEvent.input(ta, { target: { value: 'remember this' } });
    const add = [...container.querySelectorAll<HTMLButtonElement>('.notes .composer button')].find(
      (b) => b.textContent?.trim() === 'Add',
    )!;
    await fireEvent.click(add);
    expect(added).toEqual(['remember this']);
  });

  it('the delete control is reachable and calls back with the note id', async () => {
    const { container } = render(CardView, {
      props: {
        ...noteProps,
        notes: [
          { id: 'ann1', cardId: 'c1', kind: 'note' as const, body: 'hi', createdAt: '2026-07-22' },
        ],
        notesEnabled: true,
        notesOpen: true,
        ondeletenote: (id: string) => {
          deleted.push(id);
        },
      },
    });
    await tick();
    const del = container.querySelector<HTMLButtonElement>('.notes .note .del');
    expect(del, 'no delete control on a note').not.toBeNull();
    await fireEvent.click(del!);
    expect(deleted).toEqual(['ann1']);
  });
});
