import { describe, it, expect } from 'vitest';
import { highlightCode } from './highlight';

const joined = (code: string, lang?: string) =>
  highlightCode(code, lang).map((t) => t.text).join('');

describe('highlightCode', () => {
  it('round-trips the source text exactly for every lang', () => {
    const py = 'import numpy as np\n\ndef f(x):  # comment\n    return "a\\"b" + 1.5e3\n';
    expect(joined(py, 'python')).toBe(py);
    expect(joined(py, 'js')).toBe(py);
    expect(joined(py)).toBe(py);
    expect(joined('', 'python')).toBe('');
  });

  it('classifies python keywords, strings, comments, numbers, and callables', () => {
    const toks = highlightCode('def mc(n=100_000):\n    # seed\n    return np.exp("x") * 0.5', 'python');
    const by = (cls: string) => toks.filter((t) => t.cls === cls).map((t) => t.text);
    expect(by('kw')).toEqual(['def', 'return']);
    expect(by('fn')).toContain('mc');
    expect(by('fn')).toContain('exp');
    expect(by('num')).toEqual(['100_000', '0.5']);
    expect(by('com')).toEqual(['# seed']);
    expect(by('str')).toEqual(['"x"']);
  });

  it('does not treat # as a comment in js, or // as one in python', () => {
    expect(highlightCode('a // b # c', 'python').filter((t) => t.cls === 'com').map((t) => t.text)).toEqual(['# c']);
    expect(highlightCode('a // b', 'js').filter((t) => t.cls === 'com').map((t) => t.text)).toEqual(['// b']);
  });

  it('keeps string contents opaque (no keywords inside strings)', () => {
    const toks = highlightCode("s = 'def return'", 'python');
    expect(toks.filter((t) => t.cls === 'kw')).toEqual([]);
  });

  it('returns a single plain token for unknown langs', () => {
    expect(highlightCode('def x(): pass', 'r')).toEqual([{ text: 'def x(): pass', cls: '' }]);
  });
});
