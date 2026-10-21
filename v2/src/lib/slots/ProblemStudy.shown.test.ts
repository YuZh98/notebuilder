import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import ProblemStudy from './ProblemStudy.svelte';
import { instantiate, nextSeed, type ProblemProps } from './problem';

// Review fix (PR #1, F4): "Show answer", then "Try again" / "New numbers" on a problem whose
// numbers cannot change used to reopen it, and typing the answer just shown earned credit toward
// `need` and the results. Now a check on those numbers shows ✓ but counts nothing, and says why.

const fixed: ProblemProps = { prompt: '2+2?', params: [], answer: '2+2', tol: 0, need: 1 };
const pinned: ProblemProps = {
  prompt: '{{a}}²?',
  params: [{ name: 'a', min: 3, max: 3, step: 1 }],
  answer: 'a^2',
  tol: 0,
  need: 1,
};
const ranged: ProblemProps = {
  prompt: 'What is {{a}} × {{b}}?',
  params: [
    { name: 'a', min: 2, max: 9, step: 1 },
    { name: 'b', min: 2, max: 9, step: 1 },
  ],
  answer: 'a*b',
  tol: 0,
  need: 2,
};

afterEach(cleanup);

/** A seed whose successor (what New numbers moves to) has a different answer. */
function seedWithNewAnswer(props: ProblemProps): number {
  for (let s = 1; s < 200; s++) {
    const a = instantiate(props, {}, s);
    const b = instantiate(props, {}, nextSeed(props, {}, s));
    if (a.ok && b.ok && a.answer !== b.answer) return s;
  }
  throw new Error('no such seed');
}

function mount(props: ProblemProps, state: Record<string, unknown>) {
  const onState = vi.fn();
  const utils = render(ProblemStudy, { props: { props, state, onState } });
  const input = () => screen.getByLabelText('Your answer') as HTMLInputElement;
  const answer = async (v: string) => {
    await fireEvent.input(input(), { target: { value: v } });
    await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  };
  const note = () => utils.container.querySelector('.problem-shown')?.textContent ?? null;
  const streak = () => utils.container.querySelector('.problem-streak')?.textContent ?? '';
  const written = () => onState.mock.calls.at(-1)?.[0] as Record<string, unknown>;
  return { ...utils, onState, input, answer, note, streak, written };
}

/** Show answer → Try again / New numbers → type the shown answer, through real state hand-offs. */
async function revealThenRetype(props: ProblemProps, button: string, typed: string) {
  const a = mount(props, { seed: 1, correct: 0, attempts: 0 });
  await fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
  const revealed = a.written();
  cleanup();
  const b = mount(props, revealed);
  await fireEvent.click(screen.getByRole('button', { name: button }));
  const reopened = b.written();
  cleanup();
  const c = mount(props, reopened);
  const noteBefore = c.note();
  expect(c.input().disabled).toBe(false);
  await c.answer(typed);
  const checked = c.written();
  cleanup();
  const d = mount(props, checked);
  return { reopened, noteBefore, checked, after: d };
}

describe('ProblemStudy — no credit for an answer that was shown', () => {
  it('fixed numbers: Try again, typing the shown answer shows ✓ but earns nothing', async () => {
    const { reopened, noteBefore, checked, after } = await revealThenRetype(fixed, 'Try again', '4');
    expect(reopened).toEqual({ seed: 2, correct: 0, attempts: 0, shown: 4 });
    expect(noteBefore).toMatch(/fixed numbers.*answer was shown/i);
    expect(checked).toEqual({ seed: 2, correct: 0, attempts: 0, shown: 4, last: { input: '4', ok: true } });
    expect(after.container.querySelector('.problem-ok')?.textContent).toContain('✓');
    expect(after.streak()).toContain('0 / 1 correct');
    expect(after.note()).toMatch(/fixed numbers/i);
  });

  it('single-value ranges: New numbers brings the same numbers back, and still no credit', async () => {
    const { reopened, checked } = await revealThenRetype(pinned, 'New numbers', '9');
    expect(reopened).toMatchObject({ shown: 9 });
    expect(checked).toMatchObject({ correct: 0, attempts: 0, last: { input: '9', ok: true } });
  });

  it('a wrong try on shown numbers is practice too: no attempt is counted', async () => {
    const m = mount(fixed, { seed: 2, correct: 0, attempts: 0, shown: 4 });
    await m.answer('5');
    expect(m.written()).toEqual({ seed: 2, correct: 0, attempts: 0, shown: 4, last: { input: '5', ok: false } });
  });

  it('carries nothing when the new numbers have a different answer — those count as usual', async () => {
    const a = mount(ranged, { seed: seedWithNewAnswer(ranged), correct: 0, attempts: 0, revealed: true });
    await fireEvent.click(screen.getByRole('button', { name: 'New numbers' }));
    const next = a.written();
    expect(next).not.toHaveProperty('shown');
    cleanup();
    const b = mount(ranged, next);
    expect(b.note()).toBeNull();
    const inst = instantiate(ranged, {}, next.seed as number);
    if (!inst.ok) throw new Error('setup');
    await b.answer(String(inst.answer));
    expect(b.written()).toMatchObject({ correct: 1, attempts: 1 });
  });

  it('new numbers that happen to share the shown answer say to try new numbers, and do not count', async () => {
    const s = seedWithNewAnswer(ranged);
    const inst = instantiate(ranged, {}, s);
    if (!inst.ok) throw new Error('setup');
    const m = mount(ranged, { seed: s, correct: 1, attempts: 1, shown: inst.answer });
    expect(m.note()).toMatch(/answer was shown.*try new numbers/i);
    await m.answer(String(inst.answer));
    expect(m.written()).toMatchObject({ correct: 1, attempts: 1, last: { ok: true } });
  });

  it('the note is not shown while the answer itself is on screen', () => {
    const m = mount(fixed, { seed: 2, correct: 0, attempts: 0, shown: 4, revealed: true });
    expect(m.container.querySelector('.problem-answer')).not.toBeNull();
    expect(m.note()).toBeNull();
  });

  it('solving it yourself is not a reveal: Try again carries nothing', async () => {
    const m = mount(fixed, { seed: 1, correct: 1, attempts: 1, last: { input: '4', ok: true } });
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(m.written()).toEqual({ seed: 2, correct: 1, attempts: 1 });
  });
});
