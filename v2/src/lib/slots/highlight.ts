// Dependency-free tokenizer for the code slot. Produces spans, never markup:
// the Study component renders token text through Svelte's normal escaping.

export type CodeToken = { text: string; cls: '' | 'kw' | 'str' | 'com' | 'num' | 'fn' };

const PY_KW = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield', 'print',
]);

const JS_KW = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'do',
  'else', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import',
  'in', 'instanceof', 'let', 'new', 'null', 'of', 'return', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'yield', 'await', 'async',
]);

const LEX: Record<string, { kw: Set<string>; comment: RegExp }> = {
  python: { kw: PY_KW, comment: /#[^\n]*/y },
  py: { kw: PY_KW, comment: /#[^\n]*/y },
  javascript: { kw: JS_KW, comment: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
  js: { kw: JS_KW, comment: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
  typescript: { kw: JS_KW, comment: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
  ts: { kw: JS_KW, comment: /\/\/[^\n]*|\/\*[\s\S]*?\*\//y },
};

const STRING = /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/y;
const NUMBER = /\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?j?\b/y;
const WORD = /[A-Za-z_][A-Za-z0-9_]*/y;

/** Tokenize source for a known lang; unknown langs come back as one plain token. */
export function highlightCode(code: string, lang?: string): CodeToken[] {
  const lex = LEX[(lang ?? '').toLowerCase()];
  if (!lex) return code ? [{ text: code, cls: '' }] : [];

  const out: CodeToken[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ text: plain, cls: '' });
    plain = '';
  };

  let i = 0;
  let prevWord = '';
  while (i < code.length) {
    lex.comment.lastIndex = i;
    const com = lex.comment.exec(code);
    if (com) {
      flush();
      out.push({ text: com[0], cls: 'com' });
      i += com[0].length;
      continue;
    }
    STRING.lastIndex = i;
    const str = STRING.exec(code);
    if (str) {
      flush();
      out.push({ text: str[0], cls: 'str' });
      i += str[0].length;
      continue;
    }
    NUMBER.lastIndex = i;
    const num = NUMBER.exec(code);
    if (num) {
      flush();
      out.push({ text: num[0], cls: 'num' });
      i += num[0].length;
      continue;
    }
    WORD.lastIndex = i;
    const word = WORD.exec(code);
    if (word) {
      flush();
      const w = word[0];
      const cls = lex.kw.has(w)
        ? 'kw'
        : prevWord === 'def' || prevWord === 'class' || prevWord === 'function' || code[i + w.length] === '('
          ? 'fn'
          : '';
      out.push({ text: w, cls });
      prevWord = w;
      i += w.length;
      continue;
    }
    if (!/\s/.test(code[i])) prevWord = '';
    plain += code[i];
    i += 1;
  }
  flush();
  return out;
}
