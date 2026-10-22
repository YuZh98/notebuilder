import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import ProblemStudy from './ProblemStudy.svelte';
import { instantiate, nextSeed, baseSeed, DEFAULT_SEED, type ProblemProps } from './problem';

// Review fix (PR #1, F8): with no stored seed, a problem starts from this browser's own seed
// (salt + problem), not the shared DEFAULT_SEED — and mounting still writes nothing. The salt's
// storage is practice-salt.test.ts's business; here each mount gets the salt a browser would.

const browser = vi.hoisted(() => ({ salt: null as string | null }));
vi.mock('../practice-salt', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../practice-salt')>()),
  practiceSalt: () => browser.salt,
}));

const props: ProblemProps = {
  prompt: 'What is {{a}} × {{b}}?',
  params: [
    { name: 'a', min: 2, max: 99, step: 1 },
    { name: 'b', min: 2, max: 99, step: 1 },
  ],
  answer: 'a*b',
  tol: 0,
  need: 3,
};

/** The component as a page in a browser with this salt would load it. */
function mountWithSalt(salt: string | null, state: Record<string, unknown> = {}) {
  browser.salt = salt;
  const onState = vi.fn();
  const utils = render(ProblemStudy, { props: { props, state, onState } });
  const prompt = () => utils.container.querySelector('.problem-prompt')?.textContent ?? '';
  return { ...utils, onState, prompt };
}

const promptFor = (seed: number) => {
  const inst = instantiate(props, {}, seed);
  return `What is ${inst.values.a} × ${inst.values.b}?`;
};

afterEach(cleanup);

describe('ProblemStudy — per-reader first numbers', () => {
  it('starts from the salted seed and writes nothing on mount', () => {
    const m = mountWithSalt('reader0001');
    const seed = baseSeed(props, 'reader0001');
    expect(seed).not.toBe(DEFAULT_SEED);
    expect(m.prompt()).toContain(promptFor(seed));
    expect(m.onState).not.toHaveBeenCalled();
  });

  it('two readers see different numbers; one reader sees the same ones after a reload', () => {
    const a = mountWithSalt('reader0001').prompt();
    cleanup();
    const b = mountWithSalt('reader0002').prompt();
    cleanup();
    const again = mountWithSalt('reader0001').prompt();
    expect(a).not.toBe(b);
    expect(again).toBe(a);
  });

  it('without a salt (storage unavailable) everyone starts at DEFAULT_SEED, as before', () => {
    const m = mountWithSalt(null);
    expect(m.prompt()).toContain(promptFor(DEFAULT_SEED));
    expect(m.onState).not.toHaveBeenCalled();
  });

  it('a stored seed wins over the salt (progress already chosen stays put)', () => {
    const m = mountWithSalt('reader0001', { seed: 42, correct: 0, attempts: 0 });
    expect(m.prompt()).toContain(promptFor(42));
  });

  it('checking records the salted seed it graded', async () => {
    const m = mountWithSalt('reader0001');
    const seed = baseSeed(props, 'reader0001');
    const inst = instantiate(props, {}, seed);
    if (!inst.ok) throw new Error('setup');
    await fireEvent.input(screen.getByLabelText('Your answer'), { target: { value: String(inst.answer) } });
    await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(m.onState).toHaveBeenCalledWith(expect.objectContaining({ seed, correct: 1, attempts: 1 }));
  });

  it('New numbers walks on deterministically from the salted seed', async () => {
    const m = mountWithSalt('reader0001');
    await fireEvent.click(screen.getByRole('button', { name: 'New numbers' }));
    const seed = baseSeed(props, 'reader0001');
    expect(m.onState).toHaveBeenCalledWith({ seed: nextSeed(props, {}, seed), correct: 0, attempts: 0 });
  });
});
