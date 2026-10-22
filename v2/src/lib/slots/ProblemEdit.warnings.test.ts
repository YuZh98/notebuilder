import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ProblemEdit from './ProblemEdit.svelte';
import { problemWarnings, type ProblemProps } from './problem';

// Review fix (PR #1, F2): the editor warns, inline, when the answer negates a power (-a^2 is
// (-a)^2). A warning, not an issue: issues are what hold back Share and Export.
const base: ProblemProps = {
  prompt: 'What is -{{a}}² + {{b}}?',
  params: [
    { name: 'a', min: 2, max: 9, step: 1 },
    { name: 'b', min: 1, max: 9, step: 1 },
  ],
  answer: '-a^2 + b',
  tol: 0,
  need: 1,
};

const view = (props: ProblemProps) => render(ProblemEdit, { props: { props, onUpdate: vi.fn() } }).container;

describe('ProblemEdit — precedence warning', () => {
  it('shows the warning next to the fields, apart from the issues list', () => {
    const c = view(base);
    const items = [...c.querySelectorAll('.problem-warnings li')].map((li) => li.textContent);
    expect(items).toEqual(problemWarnings(base));
    expect(items[0]).toContain('-(a^2)');
    expect(c.querySelector('.problem-issues')).toBeNull();
    // the sample draw still renders: the formula is valid, only probably not what was meant
    expect(c.querySelector('.problem-preview')).not.toBeNull();
  });

  it('shows nothing once the power is parenthesized', () => {
    const c = view({ ...base, answer: '-(a^2) + b' });
    expect(c.querySelector('.problem-warnings')).toBeNull();
  });
});
