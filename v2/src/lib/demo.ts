import type { Notebook } from './types';

/** First-run seed content: shows off text, reactivity, input, flip, and progress. */
export function demoNotebook(): Notebook {
  const now = new Date().toISOString();
  return {
    id: 'nb_demo',
    name: 'My First Notebook',
    createdAt: now,
    updatedAt: now,
    sections: [
      {
        id: 'sec_1',
        notebookId: 'nb_demo',
        name: 'Introduction',
        position: 0,
        cards: [
          {
            id: 'card_1',
            sectionId: 'sec_1',
            position: 0,
            slots: [
              { id: 'slot_1', type: 'text', props: { text: 'Hello **NoteBuilder** v2!\n\nThis is a `text` slot — press **⌘/Ctrl+Enter** to see it live in *Study* mode.' } },
            ],
          },
          {
            id: 'card_2',
            sectionId: 'sec_1',
            position: 1,
            slots: [
              { id: 'slot_s', type: 'slider', props: { key: 'a', value: 2, min: -5, max: 5, step: 0.5 } },
              { id: 'slot_c', type: 'compute', props: { expr: 'a * a', out: 'aSquared', note: 'a² =' } },
              { id: 'slot_t', type: 'text', props: { text: 'Slope **a = {{a}}** drives the line below; a² = {{aSquared}}.' }, verbs: { reveal: { key: 'a', op: '>=', val: 0 } } },
              { id: 'slot_g', type: 'chart', props: { fn: 'a * x', label: 'y = a·x', x0: -5, x1: 5 } },
            ],
          },
          {
            id: 'card_3',
            sectionId: 'sec_1',
            position: 2,
            slots: [
              { id: 'slot_q', type: 'text', props: { text: 'What is the derivative of x²?' } },
              { id: 'slot_ti', type: 'text-input', props: { placeholder: 'Type your answer...', key: 'answer' } },
            ],
          },
          {
            id: 'card_4',
            sectionId: 'sec_1',
            position: 3,
            verbs: { flip: true },
            slots: [
              { id: 'slot_ff', type: 'text', props: { text: '**Flashcard:** what is the capital of France?' } },
            ],
            back: [
              { id: 'slot_fb', type: 'text', props: { text: '**Paris.**' } },
            ],
          },
          {
            id: 'card_5',
            sectionId: 'sec_1',
            position: 4,
            slots: [
              { id: 'slot_pr', type: 'progress', props: { scope: 'section', label: 'Section progress', show: { mn: true, pct: true, bar: true } } },
            ],
          },
        ],
      },
      {
        id: 'sec_div',
        notebookId: 'nb_demo',
        name: 'Part II',
        position: 1,
        cards: [],
        kind: 'divider',
      },
      {
        id: 'sec_2',
        notebookId: 'nb_demo',
        name: 'Going Deeper',
        position: 2,
        title: 'Going Deeper',
        subtitle: 'Section chrome: a title, a subtitle, and an accented card.',
        cards: [
          {
            id: 'card_6',
            sectionId: 'sec_2',
            position: 0,
            accent: '#e4572e',
            slots: [
              { id: 'slot_ac', type: 'text', props: { text: 'This card carries an **accent color**, and the section above is a chapter *divider*.' } },
            ],
          },
          {
            id: 'card_7',
            sectionId: 'sec_2',
            position: 1,
            slots: [
              { id: 'slot_pr2', type: 'progress', props: { scope: 'chapter', label: 'Chapter progress', show: { mn: true, pct: true, bar: true } } },
            ],
          },
        ],
      },
    ],
  };
}
