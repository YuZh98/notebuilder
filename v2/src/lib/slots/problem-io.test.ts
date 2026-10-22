import { describe, it, expect } from 'vitest';
import { exportNotebook, importNotebook, validateNotebook } from '../json-io';
import type { Notebook, Slot } from '../types';

// The problem slot rides the existing interchange format: props export verbatim, validate()
// gates import, and reader state (seed/correct/attempts) never leaves the device.
function notebook(slots: Slot[]): Notebook {
  return {
    id: 'nb_1',
    name: 'Practice',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: [
      {
        id: 'sec_1',
        notebookId: 'nb_1',
        name: 'Drills',
        position: 0,
        cards: [{ id: 'card_1', sectionId: 'sec_1', position: 0, slots }],
      },
    ],
  };
}

const good = {
  prompt: 'What is {{a}} × {{b}}?',
  params: [
    { name: 'a', min: 2, max: 9, step: 1 },
    { name: 'b', min: 2, max: 9, step: 1 },
  ],
  answer: 'a*b',
  tol: 0,
  need: 2,
  explain: 'Times table.',
};

describe('problem slot interchange', () => {
  it('round-trips through export/import with props intact', () => {
    const json = exportNotebook(notebook([{ id: 'p1', type: 'problem', props: good }]));
    expect(validateNotebook(json).errors).toEqual([]);
    const back = importNotebook(JSON.parse(JSON.stringify(json)));
    const slot = back.sections[0].cards[0].slots[0];
    expect(slot.type).toBe('problem');
    expect(slot.props).toEqual(good);
  });

  it('import refuses a problem whose answer has a typo', () => {
    const json = exportNotebook(notebook([{ id: 'p1', type: 'problem', props: { ...good, answer: 'a*' } }]));
    expect(() => importNotebook(json)).toThrow(/problem.*answer/);
  });

  it('a card-variable read with no writer on the card is only a warning', () => {
    const json = exportNotebook(notebook([{ id: 'p1', type: 'problem', props: { ...good, answer: 'a*k' } }]));
    const { errors, warnings } = validateNotebook(json);
    expect(errors).toEqual([]);
    expect(warnings.join()).toMatch(/k/);
  });

  it('a read satisfied by a slider on the same card raises nothing', () => {
    const json = exportNotebook(
      notebook([
        { id: 's1', type: 'slider', props: { key: 'k', value: 3 } },
        { id: 'p1', type: 'problem', props: { ...good, answer: 'a*k' } },
      ]),
    );
    expect(validateNotebook(json)).toEqual({ errors: [], warnings: [] });
  });
});
