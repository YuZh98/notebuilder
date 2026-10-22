import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import ProblemStudy from './ProblemStudy.svelte';
import { drawValues, instantiate, instanceKey, nextSeed, DEFAULT_SEED, type ProblemProps } from './problem';

// These tests pin the numbers at DEFAULT_SEED: the start where no practice salt can be stored.
// Per-reader starting seeds are covered by ProblemStudy.salt.test.ts.
vi.mock('../practice-salt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../practice-salt')>()),
  practiceSalt: () => null,
}));

const base = (over: Partial<ProblemProps> = {}): ProblemProps => ({
  prompt: 'What is {{a}} × {{b}}?',
  params: [
    { name: 'a', min: 2, max: 9, step: 1 },
    { name: 'b', min: 2, max: 9, step: 1 },
  ],
  answer: 'a*b',
  tol: 0,
  need: 3,
  explain: 'Multiply **{{a}}** by {{b}}.',
  ...over,
});

/** Deep-freeze so any attempt to mutate props or state throws. */
function freeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(freeze);
    Object.freeze(o);
  }
  return o;
}

function setup(over: Partial<ProblemProps> = {}, state: Record<string, unknown> = {}, scope = {}) {
  const onState = vi.fn();
  const props = freeze(base(over));
  const utils = render(ProblemStudy, { props: { props, state: freeze(state), scope: freeze(scope), onState } });
  const input = () => screen.getByLabelText('Your answer') as HTMLInputElement;
  const type = async (v: string) => fireEvent.input(input(), { target: { value: v } });
  const check = () => fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  return { ...utils, props, onState, input, type, check };
}

const first = drawValues(base().params, DEFAULT_SEED);
const firstAnswer = first.a * first.b;
/** The fingerprint Show answer records for the first numbers. */
const firstKey = (() => {
  const inst = instantiate(base(), {}, DEFAULT_SEED);
  if (!inst.ok) throw new Error('setup');
  return instanceKey(inst);
})();

describe('ProblemStudy — rendering', () => {
  it('renders the prompt with the drawn values interpolated', () => {
    const { container } = setup();
    expect(container.querySelector('.problem-prompt')?.textContent).toContain(`What is ${first.a} × ${first.b}?`);
  });

  it('writes nothing on mount (the default seed is fixed)', () => {
    const { onState } = setup();
    expect(onState).not.toHaveBeenCalled();
  });

  it('merges drawn values over the card scope', () => {
    const { container } = setup({ prompt: '{{a}} boxes of {{k}}', answer: 'a*k' }, {}, { k: 12, a: 999 });
    expect(container.querySelector('.problem-prompt')?.textContent).toContain(`${first.a} boxes of 12`);
  });

  it('shows the streak against need', () => {
    const { container } = setup({}, { correct: 2, attempts: 4 });
    expect(container.querySelector('.problem-streak')?.textContent).toContain('2 / 3 correct');
  });

  it('marks the streak done once need is reached', () => {
    const { container } = setup({}, { correct: 3, attempts: 3 });
    const streak = container.querySelector('.problem-streak')!;
    expect(streak.textContent).toContain('3 / 3 correct');
    expect(streak.classList.contains('done')).toBe(true);
  });

  it('has accessible controls', () => {
    setup();
    expect(screen.getByLabelText('Your answer')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New numbers' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show answer' })).toBeTruthy();
  });
});

describe('ProblemStudy — checking', () => {
  it('a right answer records a correct attempt on the current seed', async () => {
    const { onState, type, check } = setup();
    await type(String(firstAnswer));
    await check();
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledWith({
      seed: DEFAULT_SEED,
      correct: 1,
      attempts: 1,
      last: { input: String(firstAnswer), ok: true },
    });
  });

  it('a wrong answer records an attempt without credit', async () => {
    const { onState, type, check } = setup({}, { seed: DEFAULT_SEED, correct: 1, attempts: 1 });
    await type(String(firstAnswer + 1));
    await check();
    expect(onState).toHaveBeenCalledWith({
      seed: DEFAULT_SEED,
      correct: 1,
      attempts: 2,
      last: { input: String(firstAnswer + 1), ok: false },
    });
  });

  it('Enter in the answer field checks', async () => {
    const { onState, type, input } = setup();
    await type(String(firstAnswer));
    await fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ correct: 1, attempts: 1 }));
  });

  it('accepts fractions, decimals and scientific notation within tolerance', async () => {
    const props = { params: [], prompt: 'Half?', answer: '1/2', need: 1 };
    for (const typed of ['1/2', '0.5', '5e-1', '.5']) {
      const { onState, type, check, unmount } = setup(props);
      await type(typed);
      await check();
      expect(onState, typed).toHaveBeenCalledWith(expect.objectContaining({ correct: 1 }));
      unmount();
    }
  });

  it('honours an absolute tolerance', async () => {
    const { onState, type, check } = setup({ params: [], prompt: 'π?', answer: 'pi', tol: 0.01 });
    await type('3.14');
    await check();
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ correct: 1 }));
  });

  it('rejects malformed input without counting an attempt', async () => {
    const { onState, type, check, container } = setup();
    for (const bad of ['abc', '2+3', '1,000', '']) {
      await type(bad);
      await check();
    }
    expect(onState).not.toHaveBeenCalled();
    expect(container.querySelector('.problem-input-error')?.textContent).toMatch(/number/i);
  });

  it('never evaluates the typed text as an expression', async () => {
    const { onState, type, check } = setup();
    await type(`${first.a}*${first.b}`);
    await check();
    expect(onState).not.toHaveBeenCalled();
  });
});

describe('ProblemStudy — feedback and reveal', () => {
  it('after a wrong answer shows ✗ and does not reveal the answer or explanation', () => {
    const { container } = setup({}, { correct: 0, attempts: 1, last: { input: '5', ok: false } });
    expect(container.querySelector('.problem-bad')?.textContent).toContain('✗');
    expect(container.querySelector('.problem-answer')).toBeNull();
    expect(container.querySelector('.problem-explain')).toBeNull();
    expect((screen.getByLabelText('Your answer') as HTMLInputElement).disabled).toBe(false);
  });

  it('after a correct answer shows ✓, the value and the explanation, and locks these numbers', () => {
    const { container, input } = setup({}, { correct: 1, attempts: 1, last: { input: String(firstAnswer), ok: true } });
    expect(container.querySelector('.problem-ok')?.textContent).toContain('✓');
    expect(container.querySelector('.problem-answer')?.textContent).toContain(String(firstAnswer));
    const explain = container.querySelector('.problem-explain')!;
    expect(explain.textContent).toContain(`Multiply ${first.a} by ${first.b}.`);
    expect(explain.querySelector('b')?.textContent).toBe(String(first.a));
    expect(input().disabled).toBe(true);
    expect(input().value).toBe(String(firstAnswer));
    expect((screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();
  });

  it('a locked problem cannot be re-checked for extra credit', async () => {
    const { onState, input } = setup({}, { correct: 1, attempts: 1, last: { input: String(firstAnswer), ok: true } });
    await fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onState).not.toHaveBeenCalled();
  });

  it('"Show answer" records the give-up without credit', async () => {
    const { onState } = setup({}, { seed: DEFAULT_SEED, correct: 0, attempts: 2 });
    await fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(onState).toHaveBeenCalledWith({
      seed: DEFAULT_SEED,
      correct: 0,
      attempts: 2,
      revealed: true,
      seen: [firstKey],
    });
  });

  it('once revealed, shows the value and explanation and locks the numbers', () => {
    const { container, input } = setup({}, { correct: 0, attempts: 0, revealed: true });
    expect(container.querySelector('.problem-answer')?.textContent).toContain(String(firstAnswer));
    expect(container.querySelector('.problem-explain')).not.toBeNull();
    expect(input().disabled).toBe(true);
  });

  it('formats a revealed answer without float noise', () => {
    const { container } = setup({ params: [], prompt: 'Sum?', answer: '0.1 + 0.2' }, { revealed: true });
    expect(container.querySelector('.problem-answer b')?.textContent).toBe('0.3');
  });
});

describe('ProblemStudy — new numbers', () => {
  it('advances the seed, keeps the counters and clears per-numbers state', async () => {
    const state = { seed: DEFAULT_SEED, correct: 1, attempts: 2, last: { input: '9', ok: true }, revealed: true };
    const { onState } = setup({}, state);
    await fireEvent.click(screen.getByRole('button', { name: 'New numbers' }));
    const want = nextSeed(base(), {}, DEFAULT_SEED);
    // The numbers whose answer was on screen are remembered: they earn nothing if they come back.
    expect(onState).toHaveBeenCalledWith({ seed: want, correct: 1, attempts: 2, seen: [firstKey] });
  });

  it('without a reveal, New numbers remembers nothing', async () => {
    const state = { seed: DEFAULT_SEED, correct: 1, attempts: 1, last: { input: String(firstAnswer), ok: true } };
    const { onState } = setup({}, state);
    await fireEvent.click(screen.getByRole('button', { name: 'New numbers' }));
    expect(onState).toHaveBeenCalledWith({ seed: nextSeed(base(), {}, DEFAULT_SEED), correct: 1, attempts: 1 });
  });

  it('the new seed deterministically shows different numbers', async () => {
    const { onState, container } = setup();
    await fireEvent.click(screen.getByRole('button', { name: 'New numbers' }));
    const next = onState.mock.calls[0][0] as { seed: number };
    const again = render(ProblemStudy, { props: { props: base(), state: next, onState: vi.fn() } });
    const v = drawValues(base().params, instantiate(base(), {}, next.seed).seed);
    expect(v).not.toEqual(first);
    expect(again.container.querySelector('.problem-prompt')?.textContent).toContain(`What is ${v.a} × ${v.b}?`);
    expect(container.querySelector('.problem-prompt')?.textContent).toContain(`What is ${first.a} × ${first.b}?`);
  });

  it('clears the typed answer', async () => {
    const { type, input } = setup();
    await type('12');
    await fireEvent.click(screen.getByRole('button', { name: 'New numbers' }));
    expect(input().value).toBe('');
  });

  it('a problem without params offers "Try again" only after it is answered', () => {
    const fixed = { params: [], prompt: '2+2?', answer: '4' };
    const a = setup(fixed);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New numbers' })).toBeNull();
    a.unmount();
    setup(fixed, { correct: 1, attempts: 1, last: { input: '4', ok: true } });
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('ProblemStudy — card variable changes', () => {
  const over = { prompt: '{{a}} × {{k}}', answer: 'a*k', explain: 'why' };
  const solved = { correct: 1, attempts: 1, last: { input: String(first.a * 12), ok: true } };

  it('a correct check locks while the answer it matched still holds', () => {
    const { input, container } = setup(over, solved, { k: 12 });
    expect(input().disabled).toBe(true);
    expect(container.querySelector('.problem-ok')).not.toBeNull();
  });

  it('a slider moving the expected answer reopens the problem instead of showing a stale ✓', async () => {
    const { input, container, onState, type, check } = setup(over, solved, { k: 5 });
    expect(input().disabled).toBe(false);
    expect(container.querySelector('.problem-ok')).toBeNull();
    expect(container.querySelector('.problem-answer')).toBeNull();
    expect(container.querySelector('.problem-explain')).toBeNull();
    await type(String(first.a * 5));
    await check();
    expect(onState).toHaveBeenCalledWith(expect.objectContaining({ correct: 2, attempts: 2 }));
  });
});

describe('ProblemStudy — authoring errors', () => {
  it('a broken answer formula is reported instead of grading against 0', () => {
    const { container } = setup({ answer: 'a*' });
    expect(container.querySelector('.problem-error')?.textContent).toMatch(/answer formula/i);
    expect(screen.queryByLabelText('Your answer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show answer' })).toBeNull();
  });

  it('an answer that reads a variable missing from the card is reported', () => {
    const { container } = setup({ answer: 'a*k' });
    expect(container.querySelector('.problem-error')?.textContent).toContain('"k"');
  });

  it('an answer that is never finite is reported', () => {
    const { container } = setup({ answer: '1/0' });
    expect(container.querySelector('.problem-error')?.textContent).toMatch(/finite/);
  });

  it('escapes the prompt and explanation (no raw HTML)', () => {
    const { container } = setup(
      { prompt: '<img src=x onerror=alert(1)> {{a}}', explain: '<script>x</script>' },
      { revealed: true },
    );
    expect(container.querySelector('.problem-prompt img')).toBeNull();
    expect(container.querySelector('.problem-explain script')).toBeNull();
    expect(container.querySelector('.problem-prompt')?.textContent).toContain('<img');
  });
});
