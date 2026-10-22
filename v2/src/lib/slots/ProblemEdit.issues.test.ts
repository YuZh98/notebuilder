import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ProblemEdit from './ProblemEdit.svelte';
import { problemSlot, type ProblemProps } from './problem';

// Share and Export are held back while a slot fails validation; the author fixes it in this
// editor, which must show the same problem, inline and specific, next to the fields.
const base: ProblemProps = {
  prompt: 'What is {{a}} + 1?',
  params: [{ name: 'a', min: 1, max: 5, step: 1 }],
  answer: 'a + 1',
  tol: 0,
  need: 1,
};

const issuesOf = (props: ProblemProps): string[] => {
  const { container } = render(ProblemEdit, { props: { props, onUpdate: vi.fn() } });
  return [...container.querySelectorAll('.problem-issues li')].map((li) => li.textContent ?? '');
};

describe('ProblemEdit — the problems that hold back a share are listed inline', () => {
  it.each([
    ['a parameter named "e"', { params: [{ name: 'e', min: 1, max: 5, step: 1 }], prompt: 'x', answer: 'e + 1' }, 'parameter "e": "e" is reserved — pick another name'],
    ['a parameter named "min"', { params: [{ name: 'min', min: 1, max: 5, step: 1 }], prompt: 'x', answer: '2' }, 'parameter "min": "min" is reserved — pick another name'],
    ['step 0', { params: [{ name: 'a', min: 1, max: 5, step: 0 }] }, 'parameter "a": step must be greater than 0'],
    ['an unfinished answer', { answer: 'a*' }, 'answer: '],
  ])('%s', (_, over, expected) => {
    const props = { ...base, ...over } as ProblemProps;
    const shown = issuesOf(props);
    expect(shown.some((s) => s.includes(expected))).toBe(true);
    // Every problem validate() reports (what blocks a share) is among those shown.
    for (const p of problemSlot.validate!(props)) expect(shown).toContain(p);
  });

  it('shows nothing for a valid problem', () => {
    expect(issuesOf(base)).toEqual([]);
  });
});
