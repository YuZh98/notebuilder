/**
 * Review fix: the AI kit contradicted its own problem catalog example ("only text slots and a
 * choice's q and explanation render {{name}}", while problem.prompt / explain use {{w}}) and
 * never taught the problem slot's own rules — so models added sliders for params, named a param
 * e or min, wrote round(x, 2), left out tol, need and explain. The prompt and the published
 * schema's descriptions now say what the app actually does.
 */
import { describe, it, expect } from 'vitest';
import { buildAiPrompt } from './ai-prompt';
import { EXPR_BUILTINS } from './expr';
import { SLOT_CATALOG } from './slot-catalog';
import { NOTEBOOK_SCHEMA, slotPropsSchema } from './schema/schema';
import { problemIssues, type ProblemProps } from './slots/problem';

const prompt = buildAiPrompt({ topic: 'Percentages' });

/** The prompt line that starts with `start` (each guidance rule is one bullet line). */
function line(start: string): string {
  const found = prompt.split('\n').find((l) => l.startsWith(start));
  expect(found, `prompt line starting with ${JSON.stringify(start)}`).toBeDefined();
  return found!;
}

describe('the markdown / {{name}} rule names the problem fields', () => {
  it('lists problem.prompt and problem.explain next to text and choice', () => {
    const rule = line('- Only text slots');
    expect(rule).toMatch(/a problem's prompt and explain render markdown, \$math\$ and \{\{name\}\}/);
    expect(rule).toMatch(/choice's q and explanation/);
  });

  it('agrees with the problem catalog example, which prints params with {{name}}', () => {
    const ex = SLOT_CATALOG.problem.example as { prompt: string; explain: string };
    expect(ex.prompt).toMatch(/\{\{\w+\}\}/);
    expect(ex.explain).toMatch(/\{\{\w+\}\}/);
  });

  it('counts a problem answer among the readers of card variables', () => {
    expect(line('- Slots of the SAME card read')).toMatch(/a problem's answer/);
    expect(line('- Expression grammar')).toMatch(/a problem's answer/);
  });
});

describe('problem slot guidance', () => {
  const rule = (): string => line('- Practice problems');

  it('says params are local to the slot and must not also get sliders', () => {
    expect(rule()).toMatch(/params are local to the slot/i);
    expect(rule()).toMatch(/do NOT add sliders for them/);
  });

  it('forbids built-in names as param names', () => {
    for (const name of ['e', 'pi', 'min', 'max', 'sin']) expect(rule()).toMatch(new RegExp(`\\b${name}\\b`));
    expect(rule()).toMatch(/built-in/);
  });

  it('teaches one-argument round, tol for decimals, need 2–3 for drills and an explain', () => {
    expect(rule()).toMatch(/round\(\) takes ONE argument/);
    expect(rule()).toContain('round(x * 100) / 100');
    expect(rule()).toMatch(/\btol\b/);
    expect(rule()).toMatch(/need 2–3/);
    expect(rule()).toMatch(/always give explain/i);
  });

  it('the rules it states are the ones the app enforces', () => {
    const base: ProblemProps = { prompt: 'p', params: [{ name: 'a', min: 1, max: 9, step: 1 }], answer: 'a', tol: 0, need: 1 };
    expect(problemIssues(base)).toEqual([]);
    expect(problemIssues({ ...base, answer: 'round(a / 3, 2)' }).join(' ')).toMatch(/round/);
    for (const name of ['e', 'pi', 'min', 'max', 'sin']) {
      expect(problemIssues({ ...base, params: [{ name, min: 1, max: 9, step: 1 }], answer: '1' }).join(' '), name).toMatch(/reserved/);
    }
  });

  it('the checklist asks for an explain and no slider standing in for a param', () => {
    const check = line('- Every problem');
    expect(check).toMatch(/explain/);
    expect(check).toMatch(/slider/);
  });

  it('the name rule lists every built-in the app reserves (mod included)', () => {
    const names = line('- Names');
    for (const b of EXPR_BUILTINS) expect(names, b).toMatch(new RegExp(`\\b${b}\\b`));
    expect(names).toMatch(/problem param/);
  });
});

describe('the published schema describes who reads card variables accurately', () => {
  it('the top-level description no longer limits readers to text/compute/chart, and names problem', () => {
    const d = NOTEBOOK_SCHEMA.description ?? '';
    expect(d).not.toMatch(/only text\/compute\/chart/);
    expect(d).toMatch(/problem/);
  });

  it('problemProps says answer, prompt and explain may read card variables while params stay local', () => {
    const p = slotPropsSchema('problem')!;
    expect(p.description).toMatch(/never become card variables/);
    expect(p.description).toMatch(/card variables|variables of this card/);
    expect(p.properties?.prompt.description).toMatch(/card variable/);
    expect(p.properties?.answer.description).toMatch(/card variables/);
  });
});
