/**
 * Review fix: an AI that typed "quizz" or "quizzes" for a slot type got no did-you-mean — only
 * exact alias spellings ("quiz") were known, and fuzzy matching ran against the real type names
 * alone. Misspelled and plural aliases now resolve too.
 */
import { describe, it, expect } from 'vitest';
import { hintFor } from './import-hints';
import type { Issue } from './json-io';

const hint = (subject: string): string =>
  hintFor({ code: 'slot-type-unknown', path: 'notebook.sections[0].cards[0].slots[0].type', message: '', subject } satisfies Issue)!;

describe('slot type did-you-mean for misspelled and plural aliases', () => {
  it.each([
    ['quizz', 'choice'],
    ['quizzes', 'choice'],
    ['Quizzes', 'choice'],
    ['QUIZ', 'choice'],
    ['sliders', 'slider'],
    ['checklists', 'list'],
    ['graphs', 'chart'],
    ['plots', 'chart'],
    ['tables', 'table'],
    ['images', 'image'],
    ['choices', 'choice'],
    ['formulas', 'compute'],
    ['textboxes', 'text-input'],
    ['multiple_choice', 'choice'],
    ['Multiple Choice', 'choice'],
    ['progres', 'progress'],
  ])('%s → %s', (bad, want) => {
    expect(hint(bad)).toContain(`Did you mean "${want}"?`);
  });

  it('exact aliases and near-miss type names still win as before', () => {
    expect(hint('quiz')).toContain('Did you mean "choice"?');
    expect(hint('slidr')).toContain('Did you mean "slider"?');
    expect(hint('text_input')).toContain('Did you mean "text-input"?');
    expect(hint('bullets')).toContain('Did you mean "list"?');
    expect(hint('progress-bars')).toContain('Did you mean "progress"?');
  });

  it('still lists the valid types, and stays quiet on nonsense', () => {
    expect(hint('quizzes')).toContain('Slot types are: text, ');
    for (const junk of ['zzzzzz', 'xq', 'banana', 'audio', 'boxes', 'constructor', '__proto__', 'toStrings']) {
      expect(hint(junk), junk).not.toMatch(/Did you mean/);
    }
  });

  it('a short word two edits from a different alias gets no guess (photo is not plot)', () => {
    // Review fix: "photo" suggested chart (two edits from the "plot" alias) and "label" text
    // (two from "latex"): different words, not typos, and a wrong guess ends up in the fix
    // request the AI acts on. Words up to 6 letters match an alias within one edit only.
    for (const w of ['photo', 'photos', 'label', 'labels']) expect(hint(w), w).not.toMatch(/Did you mean/);
  });

  it('a longer misspelled alias still lands within two edits', () => {
    expect(hint('questoin')).toContain('Did you mean "choice"?');
    expect(hint('calcualtion')).toContain('Did you mean "compute"?');
    expect(hint('chekclist')).toContain('Did you mean "list"?');
    expect(hint('formla')).toContain('Did you mean "compute"?');
  });

  it('flashcards keep their own explanation', () => {
    expect(hint('flashcards')).toMatch(/"flip": true/);
  });
});
