import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CodeEdit from './CodeEdit.svelte';
import type { CodeProps } from './code';

function setup(over: Partial<CodeProps> = {}) {
  const props: CodeProps = { code: 'x = 1', lang: 'py', ...over };
  const onUpdate = vi.fn();
  const { container } = render(CodeEdit, { props: { props, onUpdate } });
  return {
    container,
    props,
    onUpdate,
    lang: container.querySelector('input.lang') as HTMLInputElement,
    code: container.querySelector('textarea') as HTMLTextAreaElement,
  };
}

describe('CodeEdit', () => {
  it('renders the current lang and code', () => {
    const { lang, code } = setup();
    expect(lang.value).toBe('py');
    expect(code.value).toBe('x = 1');
  });

  it('editing the code fires onUpdate with the new code and the lang kept', async () => {
    const { code, onUpdate, props } = setup();
    code.value = 'x = 2';
    await fireEvent.input(code);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toStrictEqual({ code: 'x = 2', lang: 'py' });
    expect(props.code).toBe('x = 1');
  });

  it('editing the lang fires onUpdate with the new lang and the code kept', async () => {
    const { lang, onUpdate, props } = setup();
    lang.value = 'js';
    await fireEvent.input(lang);
    expect(onUpdate.mock.calls[0][0]).toStrictEqual({ code: 'x = 1', lang: 'js' });
    expect(props.lang).toBe('py');
  });

  it('shows an empty lang box when the slot has no lang', () => {
    const { lang, code } = setup({ lang: undefined, code: '' });
    expect(lang.value).toBe('');
    expect(code.value).toBe('');
  });
});
