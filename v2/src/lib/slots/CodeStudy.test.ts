import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import CodeStudy from './CodeStudy.svelte';
import type { CodeProps } from './code';

const PY = 'def area(r):  # circle\n    return 3.14 * r * r or "none"';

function setup(over: Partial<CodeProps> = {}) {
  const props: CodeProps = { code: PY, lang: 'python', ...over };
  const { container } = render(CodeStudy, { props: { props } });
  const textOf = (cls: string) => [...container.querySelectorAll(`.${cls}`)].map((s) => s.textContent);
  return { container, textOf, code: container.querySelector('pre.code-study code') as HTMLElement };
}

describe('CodeStudy — highlighting', () => {
  it('marks keywords, the def name, comments, numbers and strings in a python snippet', () => {
    const { textOf } = setup();
    expect(textOf('kw')).toEqual(['def', 'return', 'or']);
    expect(textOf('fn')).toEqual(['area']);
    expect(textOf('com')).toEqual(['# circle']);
    expect(textOf('num')).toEqual(['3.14']);
    expect(textOf('str')).toEqual(['"none"']);
  });

  it('reassembles the source verbatim across the token spans', () => {
    const { code } = setup();
    expect(code.textContent).toBe(PY);
  });

  it('leaves an unknown lang as one unstyled run', () => {
    const { container, code } = setup({ lang: 'brainfuck' });
    expect(container.querySelector('span')).toBeNull();
    expect(code.textContent).toBe(PY);
  });

  it('renders nothing for empty code', () => {
    const { code } = setup({ code: '' });
    expect(code.textContent).toBe('');
  });

  it('renders markup in the source as text, never as elements', () => {
    const { container, code } = setup({ code: '<b>x</b>', lang: 'python' });
    expect(container.querySelector('b')).toBeNull();
    expect(code.textContent).toBe('<b>x</b>');
  });
});
