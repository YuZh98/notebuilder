import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import ProblemEdit from './ProblemEdit.svelte';
import { drawValues, DEFAULT_SEED, type ProblemProps } from './problem';

const base = (over: Partial<ProblemProps> = {}): ProblemProps => ({
  prompt: 'What is {{a}} × {{b}}?',
  params: [
    { name: 'a', min: 2, max: 9, step: 1 },
    { name: 'b', min: 2, max: 9, step: 1 },
  ],
  answer: 'a*b',
  tol: 0,
  need: 1,
  ...over,
});

function freeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(freeze);
    Object.freeze(o);
  }
  return o;
}

function setup(over: Partial<ProblemProps> = {}, scope: Record<string, number> = {}) {
  const onUpdate = vi.fn();
  // Frozen: the component must emit fresh props, never write into these.
  const props = freeze(base(over));
  const utils = render(ProblemEdit, { props: { props, onUpdate, scope } });
  const last = (): ProblemProps => onUpdate.mock.calls.at(-1)![0];
  return { ...utils, props, onUpdate, last };
}

const typeInto = (el: Element, value: string) => fireEvent.input(el, { target: { value } });

describe('ProblemEdit — fields', () => {
  it('renders every authoring field with an accessible label', () => {
    setup({ explain: 'why' });
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toBe('What is {{a}} × {{b}}?');
    expect((screen.getByLabelText('Answer formula') as HTMLInputElement).value).toBe('a*b');
    expect((screen.getByLabelText('Tolerance ±') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Correct answers needed') as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText('Explanation') as HTMLTextAreaElement).value).toBe('why');
  });

  it('emits fresh props when the prompt changes', async () => {
    const { last, props } = setup();
    await typeInto(screen.getByLabelText('Prompt'), 'Compute {{a}}·{{b}}');
    expect(last()).toEqual({ ...base(), prompt: 'Compute {{a}}·{{b}}' });
    expect(last()).not.toBe(props);
    expect(props.prompt).toBe('What is {{a}} × {{b}}?');
  });

  it('emits the answer, tolerance, need and explanation', async () => {
    const { last } = setup();
    await typeInto(screen.getByLabelText('Answer formula'), 'a+b');
    expect(last().answer).toBe('a+b');
    await typeInto(screen.getByLabelText('Tolerance ±'), '0.5');
    expect(last().tol).toBe(0.5);
    await typeInto(screen.getByLabelText('Correct answers needed'), '3');
    expect(last().need).toBe(3);
    await typeInto(screen.getByLabelText('Explanation'), 'because');
    expect(last().explain).toBe('because');
  });

  it('ignores a number field while it is empty or half-typed', async () => {
    const { onUpdate } = setup();
    await typeInto(screen.getByLabelText('Tolerance ±'), '');
    await typeInto(screen.getByLabelText('Parameter 1 min'), '');
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('ProblemEdit — params table', () => {
  it('renders a row per param', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.problem-param')).toHaveLength(2);
    expect((screen.getByLabelText('Parameter 2 name') as HTMLInputElement).value).toBe('b');
    expect((screen.getByLabelText('Parameter 1 max') as HTMLInputElement).value).toBe('9');
  });

  it('edits a param name and range without touching the others', async () => {
    const { last } = setup();
    await typeInto(screen.getByLabelText('Parameter 1 name'), 'x');
    expect(last().params).toEqual([{ name: 'x', min: 2, max: 9, step: 1 }, base().params[1]]);
    await typeInto(screen.getByLabelText('Parameter 2 min'), '-3');
    expect(last().params[1]).toEqual({ name: 'b', min: -3, max: 9, step: 1 });
    await typeInto(screen.getByLabelText('Parameter 2 max'), '30');
    expect(last().params[1].max).toBe(30);
    await typeInto(screen.getByLabelText('Parameter 2 step'), '0.5');
    expect(last().params[1].step).toBe(0.5);
  });

  it('adds a param with the next free name (skipping the constant e)', async () => {
    const { last } = setup({
      params: ['a', 'b', 'c', 'd'].map((name) => ({ name, min: 1, max: 2, step: 1 })),
    });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add parameter' }));
    const ps = last().params;
    expect(ps).toHaveLength(5);
    expect(ps[4]).toEqual({ name: 'f', min: 1, max: 10, step: 1 });
  });

  it('removes a param', async () => {
    const { last } = setup();
    await fireEvent.click(screen.getByRole('button', { name: 'Remove parameter a' }));
    expect(last().params).toEqual([base().params[1]]);
  });

  it('copes with params missing entirely', async () => {
    const { last } = setup({ params: undefined as unknown as ProblemProps['params'] });
    await fireEvent.click(screen.getByRole('button', { name: '+ Add parameter' }));
    expect(last().params).toEqual([{ name: 'a', min: 1, max: 10, step: 1 }]);
  });
});

describe('ProblemEdit — feedback for the author', () => {
  it('previews a sample draw and its answer', () => {
    const v = drawValues(base().params, DEFAULT_SEED);
    const { container } = setup();
    expect(container.querySelector('.problem-preview')?.textContent).toContain(
      `a = ${v.a}, b = ${v.b}, answer = ${v.a * v.b}`,
    );
  });

  it('lists validation issues, e.g. a typo in the answer', () => {
    const { container } = setup({ answer: 'a*' });
    expect(container.querySelector('.problem-issues')?.textContent).toMatch(/answer/);
    expect(container.querySelector('.problem-preview')).toBeNull();
  });

  it('flags an answer variable that no slot on the card provides', () => {
    const { container } = setup({ answer: 'a*bb' }, { k: 2 });
    expect(container.querySelector('.problem-issues')?.textContent).toContain('unknown variable "bb"');
  });

  it('accepts an answer that reads a variable the card provides', () => {
    const { container } = setup({ answer: 'a*k' }, { k: 2 });
    expect(container.querySelector('.problem-issues')).toBeNull();
    expect(container.querySelector('.problem-preview')?.textContent).toContain('answer =');
  });

  it('survives duplicate issue messages', () => {
    const dup = { name: 'a', min: 1, max: 2, step: 1 };
    const { container } = setup({ params: [dup, dup, dup], answer: 'a' });
    expect(container.querySelectorAll('.problem-issues li').length).toBeGreaterThanOrEqual(2);
  });
});
