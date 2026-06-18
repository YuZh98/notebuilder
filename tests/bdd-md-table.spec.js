import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// Markdown tables render in any text/heading-style content (mdBlock). Static tables, no new slot.

test.beforeEach(async ({ page }) => { await open(page); });

test('a GFM table in a text slot renders as a real table with header + rows', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const tbl = ['| Name | Value |', '| --- | --- |', '| alpha | 1 |', '| beta | 2 |'].join('\n');
    const c = m.card('ct', 'T', [m.slot('s1', 'text', { text: tbl })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const el = document.querySelector('[data-fid="ct"]');
    return {
      tables: el.querySelectorAll('table').length,
      headers: [...el.querySelectorAll('thead th')].map(t => t.textContent.trim()),
      rows: el.querySelectorAll('tbody tr').length,
      firstCell: (el.querySelector('tbody td') || {}).textContent,
    };
  });
  expect(out.tables).toBe(1);
  expect(out.headers).toEqual(['Name', 'Value']);
  expect(out.rows).toBe(2);
  expect(out.firstCell).toBe('alpha');
});

test('table separator alignment maps to text-align; inline marks still render in cells', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const tbl = ['| L | C | R |', '| :--- | :---: | ---: |', '| a | **b** | c |'].join('\n');
    const c = m.card('ct', 'T', [m.slot('s1', 'text', { text: tbl })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    const ths = [...document.querySelectorAll('[data-fid="ct"] thead th')];
    return {
      aligns: ths.map(t => t.style.textAlign),
      bold: !!document.querySelector('[data-fid="ct"] tbody td b, [data-fid="ct"] tbody td strong'),
    };
  });
  expect(out.aligns).toEqual(['left', 'center', 'right']);
  expect(out.bold).toBe(true);
});

test('a lone pipe line is not a table (needs a separator row)', async ({ page }) => {
  const tables = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const c = m.card('ct', 'T', [m.slot('s1', 'text', { text: '| not | a table' })], { w: 12 });
    m.setHouse([m.room('r', 'R', [c])], [], true);
    return document.querySelectorAll('[data-fid="ct"] table').length;
  });
  expect(tables).toBe(0);
});
