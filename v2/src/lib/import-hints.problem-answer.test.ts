/**
 * Review fix (PR #1, F2): a problem's answer is a formula like a compute expr or a chart fn, and
 * it has the same precedence trap: expr.ts binds a leading minus tighter than ^, so an answer
 * "-a^2 + b" expects (-a)² + b and grades a student's correct −a² + b as wrong on every draw.
 * It is legal grammar (an author may mean (-a)^2), so the From AI check warns instead of refusing.
 */
import { describe, it, expect } from 'vitest';
import { checkNotebookText, lintExprPitfalls } from './import-hints';
import { exprPitfalls } from './expr-pitfalls';
import { evalExpr } from './expr';

function doc(slots: unknown[]): Record<string, unknown> {
  return { version: 2, notebook: { name: 'N', sections: [{ name: 'S', cards: [{ slots }] }] } };
}

const problem = (answer: string) => ({
  type: 'problem',
  props: {
    prompt: 'What is -{{a}}² + {{b}}?',
    params: [
      { name: 'a', min: 2, max: 9, step: 1 },
      { name: 'b', min: 1, max: 9, step: 1 },
    ],
    answer,
    tol: 0,
    need: 1,
  },
});

describe('exprPitfalls — the shared detector', () => {
  it('flags a negated power and names the operand', () => {
    const [p] = exprPitfalls('-a^2 + b');
    expect(p).toMatchObject({ kind: 'negated-power', name: 'a', subject: '-a^' });
    expect(p.message).toMatch(/"-a\^" raises \(-a\) to the power, not a/);
    expect(p.hint).toContain('-(x^2)');
  });

  it('flags ** as a power operator', () => {
    expect(exprPitfalls('(1 + r)**t').map((p) => p.kind)).toEqual(['power-op']);
  });

  it('leaves correct formulas alone', () => {
    for (const ok of ['a - x^2', '-(x^2)', 'x^-2', '(a)-x^2', '2 - 3^2', '-x * 2', 'max(-1, x)^2', '(-a)^2']) {
      expect(exprPitfalls(ok), ok).toEqual([]);
    }
  });
});

describe('lintExprPitfalls — a problem answer is checked like compute.expr and chart.fn', () => {
  it('the trap is real: "-a^2 + b" expects (-a)^2 + b', () => {
    expect(evalExpr('-a^2 + b', { a: 3, b: 1 })).toBe(10);
  });

  it('flags a negated power in a problem answer', () => {
    const issues = lintExprPitfalls(doc([problem('-a^2 + b')]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'expr-pitfall',
      path: 'notebook.sections[0].cards[0].slots[0].props.answer',
      subject: '-a^',
    });
    expect(issues[0].hint).toContain('-(x^2)');
  });

  it('leaves a parenthesized answer alone', () => {
    expect(lintExprPitfalls(doc([problem('-(a^2) + b')]))).toEqual([]);
    expect(lintExprPitfalls(doc([problem('(-a)^2 + b')]))).toEqual([]);
  });

  it('is a warning: the notebook still imports', () => {
    const r = checkNotebookText(JSON.stringify(doc([problem('-a^2 + b')])));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.code)).toContain('expr-pitfall');
  });

  it('** in a problem answer is refused, and the error says to write powers with ^', () => {
    const r = checkNotebookText(JSON.stringify(doc([problem('a**2 + b')])));
    expect(r.ok).toBe(false);
    const err = r.errors.find((e) => e.code === 'slot-props')!;
    expect(err.message).toMatch(/\*\* is not an operator/);
    expect(err.message).toMatch(/\^/);
    // the error already says it: no second, contradicting "silently wrong" warning
    expect(r.warnings.filter((w) => w.subject === '**')).toEqual([]);
  });
});
