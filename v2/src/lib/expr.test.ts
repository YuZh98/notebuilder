import { describe, it, expect } from 'vitest';
import { evalExpr } from './expr';

describe('evalExpr', () => {
  it('does arithmetic with precedence', () => {
    expect(evalExpr('2+3*4', {})).toBe(14);
  });

  it('honors parentheses over precedence', () => {
    expect(evalExpr('(2+3)*4', {})).toBe(20);
  });

  it('supports % and right-associative ^', () => {
    expect(evalExpr('7%3', {})).toBe(1);
    expect(evalExpr('2^3^2', {})).toBe(512);
  });

  it('evaluates each math function', () => {
    expect(evalExpr('sin(0)', {})).toBe(0);
    expect(evalExpr('cos(0)', {})).toBe(1);
    expect(evalExpr('tan(0)', {})).toBe(0);
    expect(evalExpr('exp(0)', {})).toBe(1);
    expect(evalExpr('log(1)', {})).toBe(0);
    expect(evalExpr('sqrt(9)', {})).toBe(3);
    expect(evalExpr('abs(-4)', {})).toBe(4);
    expect(evalExpr('sign(-2)', {})).toBe(-1);
    expect(evalExpr('round(2.5)', {})).toBe(3);
    expect(evalExpr('floor(2.9)', {})).toBe(2);
    expect(evalExpr('ceil(2.1)', {})).toBe(3);
    expect(evalExpr('min(3,1,2)', {})).toBe(1);
    expect(evalExpr('max(3,1,2)', {})).toBe(3);
    expect(evalExpr('pow(2,5)', {})).toBe(32);
    expect(evalExpr('clamp(15,0,10)', {})).toBe(10);
  });

  it('looks variables up from scope', () => {
    expect(evalExpr('x*x', { x: 7 })).toBe(49);
    expect(evalExpr('a+b', { a: 2, b: 3 })).toBe(5);
  });

  it('reads a boolean from scope', () => {
    expect(evalExpr('flag', { flag: true })).toBe(true);
  });

  it('resolves the pi constant', () => {
    expect(evalExpr('pi', {})).toBe(Math.PI);
  });

  it('evaluates booleans and ternary', () => {
    expect(evalExpr('true', {})).toBe(true);
    expect(evalExpr('x>2 ? 10 : 20', { x: 5 })).toBe(10);
  });

  it('returns 0 for malformed input (pins v1 behavior)', () => {
    expect(evalExpr('1+', {})).toBe(0);
    expect(evalExpr('(1+2', {})).toBe(0);
    expect(evalExpr('@#$', {})).toBe(0);
    expect(evalExpr('', {})).toBe(0);
    expect(evalExpr('   ', {})).toBe(0);
  });

  it('returns 0 for an unknown identifier or function', () => {
    expect(evalExpr('foo', {})).toBe(0);
    expect(evalExpr('unknownfn(3)', {})).toBe(0);
  });

  it('SECURITY: prototype/host identifiers never escape to JS internals', () => {
    expect(evalExpr('constructor', {})).toBe(0);
    expect(evalExpr('__proto__', {})).toBe(0);
    expect(evalExpr('toString', {})).toBe(0);
    expect(evalExpr('hasOwnProperty', {})).toBe(0);
    expect(evalExpr('constructor(1)', {})).toBe(0);
  });

  it('SECURITY: only own scope keys resolve, not inherited ones', () => {
    const scope = Object.create({ inherited: 99 }) as Record<string, number>;
    scope.own = 5;
    expect(evalExpr('own', scope)).toBe(5);
    expect(evalExpr('inherited', scope)).toBe(0);
  });
});
