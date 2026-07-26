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

  it('tokenizes an unterminated single/double-quoted string as one str token to end of line', () => {
    const code = 'x = "unterminated\ny = 1';
    const toks = highlightCode(code, 'python');
    expect(toks.find((t) => t.cls === 'str')?.text).toBe('"unterminated');
    expect(joined(code, 'python')).toBe(code);

    const single = "x = 'oops\ny = 1";
    expect(highlightCode(single, 'js').find((t) => t.cls === 'str')?.text).toBe("'oops");
    expect(joined(single, 'js')).toBe(single);
  });

  it('tokenizes an unterminated backtick template literal as one str token to end of file', () => {
    const code = 'const x = `line one\nline two';
    const toks = highlightCode(code, 'js');
    expect(toks.find((t) => t.cls === 'str')?.text).toBe('`line one\nline two');
    expect(joined(code, 'js')).toBe(code);
  });

  it('keeps unterminated-string tokenization roughly linear (comparative, not absolute)', () => {
    const n = 20_000;
    // Bare repeated quotes pair up as valid empty-string ("") tokens and never hit the slow
    // path. The pathological shape is a quote whose every potential closer is itself escaped,
    // so the string can never close: STRING keeps failing and rescanning to EOF at every
    // quote position, which is exactly the O(n) failures x O(n) rescan the fix removes.
    const pathological = '"' + '\\"'.repeat(n / 2);
    const benign = 'x = 1\n'.repeat(Math.ceil(pathological.length / 6));

    const time = (fn: () => void) => {
      const t0 = performance.now();
      fn();
      return performance.now() - t0;
    };

    // Warm up the JIT so first-call overhead doesn't dominate either measurement.
    highlightCode(benign, 'python');
    highlightCode(pathological, 'python');

    const benignMs = time(() => highlightCode(benign, 'python'));
    const pathologicalMs = time(() => highlightCode(pathological, 'python'));

    expect(pathologicalMs).toBeLessThan(Math.max(benignMs * 20, 5));
  });
});
