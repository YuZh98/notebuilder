/**
 * Review fix: expr.ts binds a leading minus tighter than ^ (-x^2 is (-x)^2) and has no **
 * operator. LLMs write both by habit (exp(-x^2/2) for a bell curve), and the math comes out
 * silently wrong — so the prompt and FORMAT.md say so, and the From AI check warns.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error -- node builtin, untyped in the browser-only tsconfig (test runs in vitest/node)
import { readFileSync } from 'node:fs';
import { buildAiPrompt, AI_EXAMPLE } from './ai-prompt';
import { evalExpr } from './expr';
import { checkNotebookText, lintExprPitfalls } from './import-hints';

function doc(slots: unknown[], back?: unknown[]): Record<string, unknown> {
  return {
    version: 2,
    notebook: { name: 'N', sections: [{ name: 'S', cards: [{ slots, ...(back && { back, verbs: { flip: true } }) }] }] },
  };
}

describe('the expression pitfalls the docs describe are real', () => {
  it('a leading minus binds tighter than ^, and ** is no operator', () => {
    expect(evalExpr('-x^2', { x: 3 })).toBe(9);
    expect(evalExpr('-(x^2)', { x: 3 })).toBe(-9);
    expect(evalExpr('exp(-x^2)', { x: 2 })).toBeCloseTo(Math.exp(4));
    expect(evalExpr('2**3', {})).not.toBe(8);
  });
});

describe('the prompt and FORMAT.md warn about them', () => {
  const prompt = buildAiPrompt({ topic: 'Normal distribution' });

  it('the prompt says to parenthesize a negated power and never to use **', () => {
    expect(prompt).toContain('-(x^2)');
    expect(prompt).toMatch(/-x\^2 means \(-x\)\^2/);
    expect(prompt).toMatch(/never \*\*/);
  });

  it('FORMAT.md says the same', () => {
    const md = readFileSync('../docs/FORMAT.md', 'utf8') as string;
    expect(md).toContain('-(x^2)');
    expect(md).toMatch(/not `\*\*`/);
  });
});

describe('lintExprPitfalls (From AI check warnings)', () => {
  it('flags a negated power in a chart fn and a compute expr, on either face', () => {
    const issues = lintExprPitfalls(
      doc(
        [
          { type: 'chart', props: { fn: 'exp(-x^2 / 2)', x0: -3, x1: 3 } },
          { type: 'compute', props: { expr: '-a^2 + 1', out: 'b' } },
        ],
        [{ type: 'compute', props: { expr: 'c * -2^k', out: 'd' } }],
      ),
    );
    expect(issues.map((i) => i.path)).toEqual([
      'notebook.sections[0].cards[0].slots[0].props.fn',
      'notebook.sections[0].cards[0].slots[1].props.expr',
      'notebook.sections[0].cards[0].back[0].props.expr',
    ]);
    for (const i of issues) {
      expect(i.code).toBe('expr-pitfall');
      expect(i.hint).toContain('-(x^2)');
    }
    expect(issues[0].message).toMatch(/"-x\^" raises \(-x\) to the power/);
  });

  it('flags ** as a power operator', () => {
    const [issue] = lintExprPitfalls(doc([{ type: 'compute', props: { expr: 'P * (1 + r)**t', out: 'A' } }]));
    expect(issue).toMatchObject({ code: 'expr-pitfall', subject: '**' });
    expect(issue.hint).toMatch(/\^/);
  });

  it('leaves correct formulas alone', () => {
    const fine = ['a - x^2', '-(x^2)', 'x^-2', '(a)-x^2', '2 - 3^2', '-x * 2', 'max(-1, x)^2', 'r_1 - b^2'];
    const issues = lintExprPitfalls(doc(fine.map((fn) => ({ type: 'chart', props: { fn } }))));
    expect(issues).toEqual([]);
    expect(lintExprPitfalls(AI_EXAMPLE)).toEqual([]);
  });

  it('ignores non-formula props and junk documents', () => {
    expect(lintExprPitfalls(doc([{ type: 'text', props: { text: 'In math, $-x^2$ is negative.' } }]))).toEqual([]);
    for (const junk of [null, 1, 'x', [], {}, { notebook: { sections: 'no' } }, doc([null, { type: 'chart', props: null }])]) {
      expect(lintExprPitfalls(junk)).toEqual([]);
    }
  });

  it('runs as a warning in checkNotebookText — the notebook still imports', () => {
    const r = checkNotebookText(JSON.stringify(doc([{ type: 'chart', props: { fn: '-x^2 + 4', x0: -3, x1: 3 } }])));
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code)).toContain('expr-pitfall');
  });
});
