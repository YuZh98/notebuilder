/** Function and constant names baked into evalExpr — never treated as variable reads. */
const KNOWN = new Set([
  'sin', 'cos', 'tan', 'exp', 'log', 'sqrt', 'abs', 'sign', 'round',
  'floor', 'ceil', 'min', 'max', 'pow', 'clamp', 'pi', 'e', 'true', 'false', 'mod',
]);

/** Extract free variable identifiers from an expression, minus known funcs/consts and `exclude`. */
export function extractReads(expr: string, exclude: ReadonlySet<string> = new Set()): string[] {
  const seen = new Set<string>();
  for (const m of String(expr ?? '').matchAll(/[a-zA-Z_]\w*/g)) {
    const id = m[0];
    if (KNOWN.has(id) || exclude.has(id)) continue;
    seen.add(id);
  }
  return [...seen];
}
