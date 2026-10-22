/**
 * Review fix (PR #1, F2): "-a^2 + b" is legal grammar but means (-a)^2 + b, so a student's
 * correct −a² + b is graded wrong on every draw. The author is warned (not refused: an author
 * may mean (-a)^2, and a validation error would hold back Share). `**` never parses, so it stays
 * an error, now one that says what to write instead.
 */
import { describe, it, expect } from 'vitest';
import { problemSlot, problemIssues, problemWarnings, type ProblemProps } from './problem';

const P = (answer: string, over: Partial<ProblemProps> = {}): ProblemProps => ({
  prompt: 'What is -{{a}}² + {{b}}?',
  params: [
    { name: 'a', min: 2, max: 9, step: 1 },
    { name: 'b', min: 1, max: 9, step: 1 },
  ],
  answer,
  tol: 0,
  need: 1,
  ...over,
});

describe('problemWarnings — a negated power in the answer', () => {
  it('warns, naming the operand and the fix', () => {
    const [w, ...rest] = problemWarnings(P('-a^2 + b'));
    expect(rest).toEqual([]);
    expect(w).toMatch(/^answer: /);
    expect(w).toContain('(-a)');
    expect(w).toContain('-(a^2)');
  });

  it('warns after an operator or a parenthesis too', () => {
    expect(problemWarnings(P('b - -a^2'))).toHaveLength(1);
    expect(problemWarnings(P('b * (-a^2)'))).toHaveLength(1);
    expect(problemWarnings(P('max(1, -a^2)'))).toHaveLength(1);
  });

  it('stays quiet for the written-out forms', () => {
    for (const answer of ['-(a^2) + b', '(-a)^2 + b', 'b - a^2', 'a^-2', '-a * 2', 'a*b']) {
      expect(problemWarnings(P(answer)), answer).toEqual([]);
    }
  });

  it('is a warning, not a validation error: Share and Export are not held back', () => {
    expect(problemSlot.validate!(P('-a^2 + b'))).toEqual([]);
    expect(problemIssues(P('-a^2 + b'), new Set())).toEqual([]);
  });

  it('says nothing about an answer that does not parse (the error covers it) or malformed props', () => {
    expect(problemWarnings(P('-a^'))).toEqual([]);
    for (const bad of [null, {}, { answer: 5 }, { answer: '' }]) {
      expect(problemWarnings(bad as unknown as ProblemProps)).toEqual([]);
    }
  });
});

describe('problemIssues — ** in the answer', () => {
  it('is an error that says to write powers with ^', () => {
    const errs = problemIssues(P('a**2 + b'));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/^answer: \*\* is not an operator/);
    expect(errs[0]).toContain('^');
  });

  it('other syntax errors keep the parser message', () => {
    expect(problemIssues(P('a*'))[0]).toMatch(/^answer: /);
    expect(problemIssues(P('a*'))[0]).not.toContain('**');
  });
});
