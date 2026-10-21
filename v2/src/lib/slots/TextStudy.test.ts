import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import TextStudy from './TextStudy.svelte';
import type { TextProps } from './text';
import type { Scope } from '../variable-graph';

function setup(over: Partial<TextProps> = {}, scope: Scope = {}) {
  const props: TextProps = { text: '', ...over };
  const { container } = render(TextStudy, { props: { props, scope } });
  return { container, host: container.querySelector('.text-study') as HTMLElement };
}

describe('TextStudy — markdown rendering', () => {
  it('renders a leading # as a heading', () => {
    const { host } = setup({ text: '# Title' });
    expect(host.querySelector('h2')?.textContent).toBe('Title');
  });

  it('renders inline marks and list blocks', () => {
    const { host } = setup({ text: '- **one**\n- two' });
    expect(host.querySelectorAll('ul li')).toHaveLength(2);
    expect(host.querySelector('li b')?.textContent).toBe('one');
  });

  it('renders $…$ through KaTeX', () => {
    const { host } = setup({ text: 'mass $E = mc^2$' });
    expect(host.querySelector('.katex')).not.toBeNull();
  });

  it('escapes raw HTML instead of injecting it', () => {
    const { host } = setup({ text: '<b>not bold</b>' });
    expect(host.querySelector('b')).toBeNull();
    expect(host.textContent).toContain('<b>not bold</b>');
  });
});

describe('TextStudy — scope interpolation', () => {
  it('substitutes {{key}} from the card scope', () => {
    const { host } = setup({ text: 'n = {{n}}' }, { n: 42 });
    expect(host.textContent).toContain('n = 42');
  });

  it('renders ? for a key the scope does not define', () => {
    const { host } = setup({ text: 'n = {{missing}}' }, { n: 42 });
    expect(host.textContent).toContain('n = ?');
  });
});
