/**
 * docs/FORMAT.md is the human reference for the interchange format; the review found it had no
 * problem slot at all. Pin the parts that drift when a slot type or a field rule is added.
 * (schema-sync.test.ts already validates every ```json example in it.)
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error -- node builtin, untyped in the browser-only tsconfig (test runs in vitest/node)
import { readFileSync } from 'node:fs';
import { allSlots } from '../slots/registry';
import { EXPR_BUILTINS } from '../expr';

const md = readFileSync('../docs/FORMAT.md', 'utf8') as string;

/** The markdown section under `## <title>` (up to the next `## `). */
function section(title: string): string {
  const start = md.indexOf(`\n## ${title}`);
  expect(start, `FORMAT.md section "## ${title}"`).toBeGreaterThanOrEqual(0);
  const next = md.indexOf('\n## ', start + 1);
  return md.slice(start, next < 0 ? md.length : next);
}

describe('docs/FORMAT.md', () => {
  it('has a slot catalog row for every registered slot type', () => {
    const catalog = section('Slot catalog');
    for (const { type } of allSlots()) expect(catalog, type).toContain(`| \`${type}\` |`);
  });

  it('lists the problem fields that render markdown and the problem answer as a reader', () => {
    expect(md).toMatch(/render only in `text\.text`, `choice\.q`, `choice\.explanation`, `problem\.prompt`\s+and `problem\.explain`/);
    const vars = section('Variables and expressions');
    expect(vars).toMatch(/\*\*Readers:\*\*[^\n]*`problem\.answer`/);
    expect(vars).toMatch(/Problem params are slot-local/);
  });

  it('documents the problem slot: every prop, the param-name rules, round and an example', () => {
    const p = section('Practice problems (the `problem` slot)');
    for (const prop of ['prompt', 'params', 'answer', 'tol', 'need', 'explain']) expect(p, prop).toContain(`| \`${prop}\``);
    for (const b of EXPR_BUILTINS) {
      if (!['cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'sign', 'round', 'floor', 'ceil', 'min', 'max', 'pow'].includes(b)) {
        expect(p, b).toContain(`\`${b}\``); // the rest are covered by "`sin` … `clamp`"
      }
    }
    expect(p).toMatch(/unique within its slot/);
    expect(p).toMatch(/`round` takes one argument/);
    expect(p).toContain('"type": "problem"');
    expect(p).toContain('examples/practice-lesson.json');
  });

  it('names the Step-by-step effect for verbs.sequential and keeps draft out of the format', () => {
    expect(md).toMatch(/\| `sequential` \|[^\n]*\*\*Step-by-step\*\*/);
    const never = section('What a file never contains');
    expect(never).toMatch(/\*\*draft\*\* mark is local/);
    expect(never).toMatch(/not\s+part of this format/);
  });

  it('links every v2 example notebook', () => {
    for (const f of ['compound-interest.json', 'regression-drill.json', 'practice-lesson.json']) {
      expect(md).toContain(`](examples/${f})`);
    }
  });
});
