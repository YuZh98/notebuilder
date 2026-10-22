/**
 * Browser QA: the dev server logged a 404 for /favicon.ico on every load, noise that hides real
 * console errors. The app page declares an empty inline icon, so the browser never asks.
 */
import { describe, it, expect } from 'vitest';
// @ts-expect-error -- node builtin, untyped in the browser-only tsconfig (test runs in vitest/node)
import { readFileSync } from 'node:fs';

describe('index.html', () => {
  it('declares an inline (data:) icon, so no /favicon.ico request is made', () => {
    const html = readFileSync('index.html', 'utf8') as string;
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toMatch(/<link rel="icon" href="data:,"\s*\/?>/);
  });
});
