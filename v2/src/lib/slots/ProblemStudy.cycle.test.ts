import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import ProblemStudy from './ProblemStudy.svelte';
import { instantiate, nextSeed, type ProblemProps } from './problem';

// Review follow-up (PR #1, F4): carrying only the last shown answer, and only to the very next
// draw, left the exploit open in any small parameter space: Show answer, New numbers, New
// numbers, and the revealed numbers come back. Typing the answer that was shown must not
// count then either: numbers whose answer was shown stay shown.

const small: ProblemProps = {
  prompt: 'What is {{a}} × 10?',
  params: [{ name: 'a', min: 1, max: 2, step: 1 }],
  answer: 'a*10',
  tol: 0,
  need: 1,
};

afterEach(cleanup);

/** A seed whose numbers are a = 1. */
function seedWithA1(): number {
  for (let s = 1; s < 200; s++) {
    const inst = instantiate(small, {}, s);
    if (inst.ok && inst.values.a === 1) return s;
  }
  throw new Error('setup');
}

function mount(state: Record<string, unknown>) {
  const onState = vi.fn();
  const utils = render(ProblemStudy, { props: { props: small, state, onState } });
  const written = () => onState.mock.calls.at(-1)?.[0] as Record<string, unknown>;
  const note = () => utils.container.querySelector('.problem-shown')?.textContent ?? null;
  return { ...utils, onState, written, note };
}

/** Click a button on a fresh mount of `state`, and return what it wrote. */
async function click(state: Record<string, unknown>, name: string): Promise<Record<string, unknown>> {
  const m = mount(state);
  await fireEvent.click(screen.getByRole('button', { name }));
  const out = m.written();
  cleanup();
  return out;
}

describe('ProblemStudy — revealed numbers stay revealed', () => {
  it('Show answer, New numbers twice, the same numbers again: typing the shown answer earns nothing', async () => {
    const s = seedWithA1();
    const revealed = await click({ seed: s, correct: 0, attempts: 0 }, 'Show answer');
    const other = await click(revealed, 'New numbers');
    expect(instantiate(small, {}, other.seed as number)).toMatchObject({ values: { a: 2 } });
    const back = await click(other, 'New numbers');
    expect(instantiate(small, {}, back.seed as number)).toMatchObject({ values: { a: 1 } });
    expect(back.seed).toBe(nextSeed(small, {}, other.seed as number));

    const m = mount(back);
    expect(m.note()).toMatch(/answer was shown/i);
    await fireEvent.input(screen.getByLabelText('Your answer'), { target: { value: '10' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(m.written()).toMatchObject({ correct: 0, attempts: 0, last: { input: '10', ok: true } });
  });

  it('the numbers that were not shown still count', async () => {
    const s = seedWithA1();
    const revealed = await click({ seed: s, correct: 0, attempts: 0 }, 'Show answer');
    const other = await click(revealed, 'New numbers');
    const m = mount(other);
    expect(m.note()).toBeNull();
    await fireEvent.input(screen.getByLabelText('Your answer'), { target: { value: '20' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(m.written()).toMatchObject({ correct: 1, attempts: 1 });
  });

  it('a slider moved while the answer was showing: both answers on screen stay shown', async () => {
    const viaSlider: ProblemProps = { prompt: 'Twice {{k}}?', params: [], answer: '2*k', tol: 0, need: 1 };
    const at = (k: number, state: Record<string, unknown>) => {
      const onState = vi.fn();
      const utils = render(ProblemStudy, { props: { props: viaSlider, scope: { k }, state, onState } });
      return { ...utils, onState };
    };
    let m = at(3, { seed: 1, correct: 0, attempts: 0 });
    await fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    const revealed = m.onState.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    cleanup();
    // The slider moves to k = 4 while the answer (now 8) is on screen; then Try again.
    m = at(4, revealed);
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    const reopened = m.onState.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    cleanup();
    for (const [k, typed] of [
      [3, '6'],
      [4, '8'],
    ] as const) {
      m = at(k, reopened);
      expect(m.container.querySelector('.problem-shown'), `k=${k}`).not.toBeNull();
      await fireEvent.input(screen.getByLabelText('Your answer'), { target: { value: typed } });
      await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
      expect(m.onState.mock.calls.at(-1)?.[0], `k=${k}`).toMatchObject({ correct: 0, attempts: 0 });
      cleanup();
    }
    // An answer never shown still counts.
    m = at(5, reopened);
    await fireEvent.input(screen.getByLabelText('Your answer'), { target: { value: '10' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(m.onState.mock.calls.at(-1)?.[0]).toMatchObject({ correct: 1, attempts: 1 });
  });

  it('once every version was shown, it says so', async () => {
    const s = seedWithA1();
    const r1 = await click({ seed: s, correct: 0, attempts: 0 }, 'Show answer');
    const n1 = await click(r1, 'New numbers');
    const r2 = await click(n1, 'Show answer');
    const n2 = await click(r2, 'New numbers');
    const m = mount(n2);
    expect(m.note()).toMatch(/every answer .* was shown/i);
  });
});
