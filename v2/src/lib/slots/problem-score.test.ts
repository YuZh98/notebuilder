import { describe, it, expect } from 'vitest';
import { problemSlot, type ProblemProps } from './problem';

const P = (over: Partial<ProblemProps> = {}): ProblemProps => ({
  prompt: 'What is {{a}} × {{b}}?',
  params: [
    { name: 'a', min: 2, max: 9, step: 1 },
    { name: 'b', min: 2, max: 9, step: 1 },
  ],
  answer: 'a*b',
  tol: 0,
  need: 1,
  ...over,
});
const score = (props: ProblemProps, state: Record<string, unknown> | undefined) => problemSlot.score!(props, state);

// The results tally adds every slot's score() into one per-question count, next to choice's 0/1.
// A problem is one question too: its raw tries go to `practice`, never into answered/correct.
describe('problemSlot.score — one question, tries reported apart', () => {
  it('is one unanswered question before any try', () => {
    const none = { correct: 0, answered: 0, practice: { correct: 0, attempts: 0 } };
    expect(score(P(), undefined)).toEqual(none);
    expect(score(P(), {})).toEqual(none);
  });

  it('is answered once tried, and correct once done (need met)', () => {
    expect(score(P(), { correct: 0, attempts: 3 })).toEqual({
      correct: 0,
      answered: 1,
      practice: { correct: 0, attempts: 3 },
    });
    expect(score(P(), { correct: 2, attempts: 5 })).toEqual({
      correct: 1,
      answered: 1,
      practice: { correct: 2, attempts: 5 },
    });
  });

  it('is not yet correct while fewer than `need` answers are right', () => {
    expect(score(P({ need: 3 }), { correct: 2, attempts: 4 })).toMatchObject({ correct: 0, answered: 1 });
    expect(score(P({ need: 3 }), { correct: 3, attempts: 4 })).toMatchObject({ correct: 1, answered: 1 });
  });

  it('never reports a correct question as unanswered, even from malformed counters', () => {
    expect(score(P(), { correct: 1, attempts: 0 })).toMatchObject({ correct: 1, answered: 1 });
    expect(score(P(), { correct: '5', attempts: -1 })).toMatchObject({ correct: 0, answered: 0 });
  });
});
