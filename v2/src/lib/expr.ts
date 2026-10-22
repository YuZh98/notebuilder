type Scope = Record<string, number | boolean>;
type Value = number | boolean;

type Tok =
  | { t: 'n'; v: number }
  | { t: 'id'; v: string }
  | { t: 'o'; v: string }
  | { t: 'eof' };

type Node =
  | { k: 'v'; v: Value }
  | { k: 'id'; v: string }
  | { k: 'u'; o: string; e: Node }
  | { k: 'call'; f: string; a: Node[] }
  | { k: 't'; c: Node; a: Node; b: Node }
  | { k: 'b'; o: string; l: Node; r: Node };

const FN: Record<string, (...n: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, log: Math.log,
  sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign, round: Math.round,
  floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, pow: Math.pow,
  clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
};
const K: Record<string, Value> = { pi: Math.PI, e: Math.E, true: true, false: false };
const PR: Record<string, number> = {
  '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4,
  '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '//': 6, '^': 7,
};

/** The call and operator tables by name — the expression sim's generator pools mirror them. */
export const FN_ARITY: Record<string, number> = Object.fromEntries(
  Object.entries(FN).map(([name, fn]) => [name, fn.length]),
);
export const OP_NAMES: string[] = Object.keys(PR);

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function lex(s: string): Tok[] {
  const t: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      t.push({ t: 'n', v: +s.slice(i, j) }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      t.push({ t: 'id', v: s.slice(i, j) }); i = j; continue;
    }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '//'].includes(two)) { t.push({ t: 'o', v: two }); i += 2; continue; }
    if ('+-*/%^<>!?:(),'.includes(c)) { t.push({ t: 'o', v: c }); i++; continue; }
    i++;
  }
  t.push({ t: 'eof' });
  return t;
}

function parse(tk: Tok[]): Node {
  let p = 0;
  const pk = (): Tok => tk[p];
  const eat = (): Tok => tk[p++];

  function prim(): Node {
    const k = eat();
    if (k.t === 'n') return { k: 'v', v: k.v };
    if (k.t === 'id') {
      const nx = pk();
      if (nx.t === 'o' && nx.v === '(') {
        eat();
        const a: Node[] = [];
        const close = pk();
        if (!(close.t === 'o' && close.v === ')')) {
          a.push(ex(0));
          while (pk().t === 'o' && (pk() as { v: string }).v === ',') { eat(); a.push(ex(0)); }
        }
        eat();
        return { k: 'call', f: k.v, a };
      }
      return { k: 'id', v: k.v };
    }
    if (k.t === 'o' && k.v === '(') { const e = ex(0); eat(); return e; }
    if (k.t === 'o' && (k.v === '-' || k.v === '!')) return { k: 'u', o: k.v, e: prim() };
    return { k: 'v', v: 0 };
  }

  function ex(m: number): Node {
    let L = prim();
    for (;;) {
      const k = pk();
      if (k.t === 'o' && k.v === '?' && m === 0) {
        eat();
        const a = ex(0);
        eat();
        const b = ex(0);
        L = { k: 't', c: L, a, b };
        continue;
      }
      if (k.t === 'o' && PR[k.v] != null && PR[k.v] >= m) {
        eat();
        const R = ex(k.v === '^' ? PR[k.v] : PR[k.v] + 1);
        L = { k: 'b', o: k.v, l: L, r: R };
        continue;
      }
      break;
    }
    return L;
  }
  return ex(0);
}

function ev(z: Node, env: Scope): Value {
  switch (z.k) {
    case 'v': return z.v;
    case 'id': return own(env, z.v) ? env[z.v] : (own(K, z.v) ? K[z.v] : 0);
    case 'u': { const v = ev(z.e, env); return z.o === '-' ? -(v as number) : !v; }
    case 'call': {
      const f = own(FN, z.f) ? FN[z.f] : null;
      return f ? f(...z.a.map((x) => ev(x, env) as number)) : 0;
    }
    case 't': return ev(z.c, env) ? ev(z.a, env) : ev(z.b, env);
    case 'b': {
      const l = ev(z.l, env) as number, r = ev(z.r, env) as number;
      switch (z.o) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '//': return Math.floor(l / r);
        case '%': return l % r;
        case '^': return Math.pow(l, r);
        case '==': return l === r;
        case '!=': return l !== r;
        case '<': return l < r;
        case '<=': return l <= r;
        case '>': return l > r;
        case '>=': return l >= r;
        case '&&': return (l && r) as Value;
        case '||': return (l || r) as Value;
      }
      return 0;
    }
  }
}

const cache: Record<string, Node> = Object.create(null);

/** Pure no-eval arithmetic/boolean evaluator. Identifiers resolve from own scope keys, else a constant, else 0. */
export function evalExpr(expr: string, scope: Scope): number | boolean {
  try {
    const s = String(expr == null ? '' : expr).replace(/\bmod\b/gi, '%');
    if (!s.trim()) return 0;
    if (!(s in cache)) cache[s] = parse(lex(s));
    return ev(cache[s], scope || {});
  } catch {
    return 0;
  }
}

/** Every name evalExpr resolves without a scope: its functions, its constants, and the `mod` keyword. */
export const EXPR_BUILTINS: ReadonlySet<string> = new Set([...Object.keys(FN), ...Object.keys(K), 'mod']);

/** Argument counts for the fixed-arity functions; `min`/`max` take one or more. */
const ARITY: Record<string, number> = {
  sin: 1, cos: 1, tan: 1, exp: 1, log: 1, sqrt: 1, abs: 1, sign: 1, round: 1, floor: 1, ceil: 1,
  pow: 2, clamp: 3,
};

/** What a successful parseExpr reports about an expression. */
export type ParsedExpr = {
  /** Free variable names in first-seen order (constants excluded; a function name used as a value is included). */
  identifiers: string[];
  /** Names of the functions the expression calls, in first-seen order. */
  functions: string[];
};

type STok = { t: 'n' | 'id' | 'o' | 'eof'; v: string };

const HINT: Record<string, string> = {
  '=': ' — use == to compare',
  '&': ' — use && for "and"',
  '|': ' — use || for "or"',
  '×': ' — use * to multiply',
  '·': ' — use * to multiply',
  '÷': ' — use / to divide',
  '−': ' — use - to subtract',
};

// Same token boundaries as `lex`, but nothing is skipped and every number must be well-formed,
// so an accepted string tokenizes exactly as evalExpr sees it.
function strictLex(s: string): STok[] {
  const t: STok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const num = s.slice(i, j);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(num)) throw new Error(`Malformed number "${num}"`);
      if (/^[eE][+-]?\d/.test(s.slice(j, j + 3))) {
        throw new Error(`Scientific notation isn't supported ("${num}${s[j]}…") — write ${num}*10^…`);
      }
      if (j < s.length && /[a-zA-Z_]/.test(s[j])) {
        throw new Error(`Missing operator between ${num} and "${s[j]}…" — write ${num}*${s[j]}…`);
      }
      t.push({ t: 'n', v: num }); i = j; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      t.push({ t: 'id', v: s.slice(i, j) }); i = j; continue;
    }
    const two = s.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||', '//'].includes(two)) { t.push({ t: 'o', v: two }); i += 2; continue; }
    if ('+-*/%^<>!?:(),'.includes(c)) { t.push({ t: 'o', v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}"${own(HINT, c) ? HINT[c] : ''}`);
  }
  t.push({ t: 'eof', v: '' });
  return t;
}

const shown = (k: STok): string => (k.t === 'eof' ? 'end of expression' : `"${k.v}"`);

/**
 * Strict twin of evalExpr's parser: same tokens, grammar and precedence, but it throws a
 * descriptive Error wherever evalExpr would silently yield 0 or a misparse (syntax errors,
 * unknown functions, wrong arity). Validation only — it evaluates nothing, and evalExpr is
 * unchanged.
 */
export function parseExpr(expr: string): ParsedExpr {
  const s = String(expr == null ? '' : expr).replace(/\bmod\b/gi, '%');
  if (!s.trim()) throw new Error('Expression is empty');
  const tk = strictLex(s);
  const ids: string[] = [];
  const fns: string[] = [];
  let p = 0;
  const pk = (): STok => tk[Math.min(p, tk.length - 1)];
  const eat = (): STok => tk[Math.min(p++, tk.length - 1)];
  const isOp = (k: STok, v: string): boolean => k.t === 'o' && k.v === v;
  const expect = (v: string, ctx: string): void => {
    const k = eat();
    if (!isOp(k, v)) throw new Error(`Expected "${v}" ${ctx}, got ${shown(k)}`);
  };

  function call(f: string): void {
    let n = 0;
    if (!isOp(pk(), ')')) {
      ex(0);
      n++;
      while (isOp(pk(), ',')) { eat(); ex(0); n++; }
    }
    expect(')', `to close ${f}(`);
    if (!own(FN, f)) throw new Error(`Unknown function "${f}"`);
    const want = own(ARITY, f) ? ARITY[f] : null;
    if (want != null && n !== want) {
      throw new Error(`${f} expects ${want} argument${want === 1 ? '' : 's'}, got ${n}`);
    }
    if (want == null && n < 1) throw new Error(`${f} expects at least 1 argument, got 0`);
    if (!fns.includes(f)) fns.push(f);
  }

  function prim(): void {
    const k = eat();
    if (k.t === 'n') return;
    if (k.t === 'id') {
      if (isOp(pk(), '(')) { eat(); call(k.v); return; }
      if (!own(K, k.v) && !ids.includes(k.v)) ids.push(k.v);
      return;
    }
    if (isOp(k, '(')) { ex(0); expect(')', 'to close "("'); return; }
    if (isOp(k, '-') || isOp(k, '!')) { prim(); return; }
    if (k.t === 'eof') throw new Error('Unexpected end of expression');
    throw new Error(`Unexpected ${shown(k)}`);
  }

  function ex(m: number): void {
    prim();
    for (;;) {
      const k = pk();
      if (isOp(k, '?') && m === 0) {
        eat();
        ex(0);
        expect(':', 'in "condition ? a : b"');
        ex(0);
        continue;
      }
      if (k.t === 'o' && own(PR, k.v) && PR[k.v] >= m) {
        eat();
        ex(k.v === '^' ? PR[k.v] : PR[k.v] + 1);
        continue;
      }
      break;
    }
  }

  ex(0);
  if (pk().t !== 'eof') throw new Error(`Unexpected ${shown(pk())}`);
  return { identifiers: ids, functions: fns };
}
