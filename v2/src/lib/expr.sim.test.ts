// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { evalExpr, FN_ARITY, OP_NAMES } from './expr';
import { makeRng, SEEDS, type Rng } from './sim-rng';

/** Generated expressions per property, per seed. */
const CASES = 150;

type Scope = Record<string, number | boolean>;
type Value = number | boolean;

/**
 * A mirror of expr.ts's AST. The simulation builds a tree, prints it fully
 * parenthesised, and checks that parsing the printed string and evaluating it
 * agrees with evaluating the tree directly.
 */
type Node =
  | { k: 'lit'; v: number }
  | { k: 'id'; v: string }
  | { k: 'un'; o: '-' | '!'; e: Node }
  | { k: 'call'; f: string; a: Node[] }
  | { k: 'tern'; c: Node; a: Node; b: Node }
  | { k: 'bin'; o: string; l: Node; r: Node };

/** Baked-in constants, verbatim from expr.ts. */
const K: Record<string, Value> = { pi: Math.PI, e: Math.E, true: true, false: false };

const FN1 = ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'sign', 'round', 'floor', 'ceil'];
const FN2 = ['min', 'max', 'pow'];
const FN3 = ['clamp'];
const BIN = ['+', '-', '*', '/', '%', '//', '^', '==', '!=', '<', '<=', '>', '>='];
const LOGIC = ['&&', '||'];
const LITERALS = [0, 1, 2, 3, 10, 0.5, 1.5, 2.25];
/** In-scope, baked-in constant, and unbound identifiers — all three resolution paths. */
const IDS = ['aa', 'bb', 'cc', 'pi', 'e', 'true', 'false', 'zz', 'qq'];

const own = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Reference evaluator — mirrors expr.ts's `ev` exactly, including its non-coercing logic ops. */
function evalNode(z: Node, env: Scope): Value {
  switch (z.k) {
    case 'lit':
      return z.v;
    case 'id':
      return own(env, z.v) ? env[z.v] : own(K, z.v) ? K[z.v] : 0;
    case 'un': {
      const v = evalNode(z.e, env);
      return z.o === '-' ? -(v as number) : !v;
    }
    case 'call': {
      const args = z.a.map((x) => evalNode(x, env) as number);
      switch (z.f) {
        case 'sin': return Math.sin(args[0]);
        case 'cos': return Math.cos(args[0]);
        case 'tan': return Math.tan(args[0]);
        case 'exp': return Math.exp(args[0]);
        case 'log': return Math.log(args[0]);
        case 'sqrt': return Math.sqrt(args[0]);
        case 'abs': return Math.abs(args[0]);
        case 'sign': return Math.sign(args[0]);
        case 'round': return Math.round(args[0]);
        case 'floor': return Math.floor(args[0]);
        case 'ceil': return Math.ceil(args[0]);
        case 'min': return Math.min(args[0], args[1]);
        case 'max': return Math.max(args[0], args[1]);
        case 'pow': return Math.pow(args[0], args[1]);
        case 'clamp': return Math.max(args[1], Math.min(args[2], args[0]));
        default: return 0;
      }
    }
    case 'tern':
      return evalNode(z.c, env) ? evalNode(z.a, env) : evalNode(z.b, env);
    case 'bin': {
      const l = evalNode(z.l, env) as number;
      const r = evalNode(z.r, env) as number;
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
        default: return 0;
      }
    }
  }
}

/** Print fully parenthesised, so the printed form has exactly one parse. */
function print(z: Node): string {
  switch (z.k) {
    case 'lit': return String(z.v);
    case 'id': return z.v;
    case 'un': return `${z.o}(${print(z.e)})`;
    case 'call': return `${z.f}(${z.a.map(print).join(', ')})`;
    case 'tern': return `(${print(z.c)} ? ${print(z.a)} : ${print(z.b)})`;
    case 'bin': return `(${print(z.l)} ${z.o} ${print(z.r)})`;
  }
}

/** The precedence table, verbatim from expr.ts. */
const PR: Record<string, number> = {
  '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4,
  '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '//': 6, '^': 7,
};

/**
 * Rebuild the tree expr.ts's parser would produce for a flat `atom op atom ...`
 * chain — a mirror of its precedence climb, including `^` binding right.
 */
function climb(atoms: Node[], ops: string[]): Node {
  let a = 0;
  let o = 0;
  const ex = (m: number): Node => {
    let L = atoms[a++];
    for (;;) {
      const op = ops[o];
      if (op === undefined || PR[op] < m) break;
      o++;
      const R = ex(op === '^' ? PR[op] : PR[op] + 1);
      L = { k: 'bin', o: op, l: L, r: R };
    }
    return L;
  };
  return ex(0);
}

function genNode(r: Rng, depth: number): Node {
  if (depth <= 0) {
    return r.bool(0.5) ? { k: 'lit', v: r.pick(LITERALS) } : { k: 'id', v: r.pick(IDS) };
  }
  switch (r.int(8)) {
    case 0:
      return { k: 'un', o: r.bool() ? '-' : '!', e: genNode(r, depth - 1) };
    case 1:
      return { k: 'call', f: r.pick(FN1), a: [genNode(r, depth - 1)] };
    case 2:
      return { k: 'call', f: r.pick(FN2), a: [genNode(r, depth - 1), genNode(r, depth - 1)] };
    case 3:
      return {
        k: 'call',
        f: FN3[0],
        a: [genNode(r, depth - 1), genNode(r, depth - 1), genNode(r, depth - 1)],
      };
    case 4:
      return {
        k: 'tern',
        c: genNode(r, depth - 1),
        a: genNode(r, depth - 1),
        b: genNode(r, depth - 1),
      };
    case 5:
      return { k: 'bin', o: r.pick(LOGIC), l: genNode(r, depth - 1), r: genNode(r, depth - 1) };
    default:
      return { k: 'bin', o: r.pick(BIN), l: genNode(r, depth - 1), r: genNode(r, depth - 1) };
  }
}

function genScope(r: Rng): Scope {
  const scope: Scope = {};
  for (const key of ['aa', 'bb', 'cc']) {
    if (r.bool(0.8)) scope[key] = r.bool(0.25) ? r.bool() : r.between(-10, 10);
  }
  return scope;
}

/** NaN-tolerant identity: two runs of the same computation must agree exactly. */
const same = (a: Value, b: Value): boolean =>
  typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)
    ? true
    : Object.is(a, b);

const GARBAGE = '+-*/%^<>!?:(),.= &|abz_09\t\n"\\';

describe.each(SEEDS)('evalExpr simulation (seed %i)', (seed) => {
  it('agrees with direct AST evaluation on every generated expression', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const node = genNode(r, r.between(1, 4));
      const scope = genScope(r);
      const src = print(node);
      const expected = evalNode(node, scope);
      const actual = evalExpr(src, scope);
      expect(same(actual, expected), `seed ${seed} case ${c}: ${src} -> ${actual} != ${expected}`).toBe(true);
    }
  });

  it('honours the precedence table on unparenthesised chains', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const n = r.between(2, 6);
      const atoms: Node[] = Array.from({ length: n }, () =>
        r.bool(0.5) ? { k: 'lit', v: r.pick(LITERALS) } : { k: 'id', v: r.pick(IDS) },
      );
      const ops = Array.from({ length: n - 1 }, () => r.pick([...BIN, ...LOGIC]));
      const src = atoms.map(print).reduce((s, a, i) => (i === 0 ? a : `${s} ${ops[i - 1]} ${a}`), '');
      const scope = genScope(r);
      const expected = evalNode(climb(atoms, ops), scope);
      const actual = evalExpr(src, scope);
      expect(same(actual, expected), `seed ${seed} case ${c}: ${src} -> ${actual} != ${expected}`).toBe(true);
    }
  });

  it('is a pure function of expression and scope', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const src = print(genNode(r, r.between(1, 4)));
      const scope = genScope(r);
      const before = { ...scope };
      const first = evalExpr(src, scope);
      expect(same(evalExpr(src, scope), first), `seed ${seed} case ${c}: ${src}`).toBe(true);
      expect(same(evalExpr(src, { ...scope }), first), `seed ${seed} case ${c}: ${src}`).toBe(true);
      expect(scope, `seed ${seed} case ${c}: scope mutated`).toEqual(before);
    }
  });

  it('never throws, whatever the input string', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const len = r.between(0, 40);
      const src = Array.from({ length: len }, () => GARBAGE[r.int(GARBAGE.length)]).join('');
      const out = evalExpr(src, genScope(r));
      expect(['number', 'boolean'], `seed ${seed} case ${c}: ${JSON.stringify(src)}`).toContain(typeof out);
    }
  });

  it('treats `mod` as the remainder operator', () => {
    const r = makeRng(seed);
    for (let c = 0; c < CASES; c++) {
      const a = r.between(-20, 20);
      const b = r.between(1, 9);
      expect(evalExpr(`${a} mod ${b}`, {}), `seed ${seed} case ${c}`).toBe(a % b);
    }
  });
});
// The pools hand-mirror expr.ts's tables: without this, a builtin added there would go
// ungenerated and every property above would still pass.
it('the generator pools cover expr.ts’s call and operator tables', () => {
  const byArity = (n: number): string[] =>
    Object.keys(FN_ARITY).filter((f) => FN_ARITY[f] === n).sort();
  expect([...FN1, ...FN2, ...FN3].sort()).toEqual(Object.keys(FN_ARITY).sort());
  expect([...FN1].sort()).toEqual(byArity(1));
  expect([...FN2].sort()).toEqual(byArity(2));
  expect([...FN3].sort()).toEqual(byArity(3));
  expect([...BIN, ...LOGIC].sort()).toEqual([...OP_NAMES].sort());
});
