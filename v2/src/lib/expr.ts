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
