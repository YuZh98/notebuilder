import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProblemStudy from './ProblemStudy.svelte';
import type { ProblemProps } from './problem';

// The answer box accepts "-3", "3/4" and "2.5e-3". A decimal/numeric virtual keypad cannot type
// all of them: iOS's decimal pad has no minus key or "/", and in comma locales it offers "," but
// no "." (which parseNumericInput rejects). The shared Reader is a mobile-viewport page, so the
// field must keep the full text keyboard.
const props: ProblemProps = {
  prompt: 'What is {{a}} - {{b}}?',
  params: [
    { name: 'a', min: 1, max: 5, step: 1 },
    { name: 'b', min: 6, max: 9, step: 1 },
  ],
  answer: 'a-b',
  tol: 0,
  need: 1,
};

describe('ProblemStudy — virtual keyboard', () => {
  it('does not restrict the answer field to a numeric keypad (negatives, fractions, dots must be typeable)', () => {
    render(ProblemStudy, { props: { props, state: {}, onState: vi.fn() } });
    const input = screen.getByLabelText('Your answer') as HTMLInputElement;
    const mode = input.getAttribute('inputmode');
    expect(mode === null || mode === 'text', `inputmode=${mode}`).toBe(true);
    expect(input.type).toBe('text');
  });
});
