import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

test('B8: a reveal-hidden fused cell collapses with one seam; the row reflows live; all-hidden renders nothing', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const S = (id, txt, o = {}) => Object.assign({ id, type: 'text', props: { text: txt }, verbs: {}, w: 4 }, o);
    const chain = m.card('cf', 'F', [
      S('s1', 'LEFT', { fuse: true }),
      S('s2', 'MID', { fuse: true, verbs: { reveal: { key: 'v', op: '>=', val: 5 } } }),
      S('s3', 'RIGHT', {}),
      { id: 'sv', type: 'slider', props: { key: 'v', min: 0, max: 10, value: 2, step: 1, showName: true, showValue: true, showSlider: true }, verbs: {}, w: 12 },
    ], { w: 12 });
    m.setHouse([m.room('r', 'R', [chain])], [], true);
    const probe = () => { const fw = document.querySelector('[data-fid="cf"] .fusewrap');
      return { cells: fw ? fw.querySelectorAll('.fusecell').length : 0, guts: fw ? fw.querySelectorAll('.fusegut').length : 0 }; };
    const hidden = probe();                                       // v=2 → MID hidden
    const sl = document.querySelector('[data-fid="cf"] input[type=range]');
    sl.value = 7; sl.dispatchEvent(new Event('input', { bubbles: true }));
    const shown = probe();                                        // v=7 → MID back
    return { hidden, shown };
  });
  expect(out.hidden.cells).toBe(2);             // hidden cell gone from layout
  expect(out.hidden.guts).toBe(1);              // exactly one seam between the two visible cells
  expect(out.shown.cells).toBe(3);              // reflows live when the condition flips
  expect(out.shown.guts).toBe(2);
});

test('B8: a chain whose every cell is hidden renders nothing', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    const S = (id, txt) => ({ id, type: 'text', props: { text: txt }, verbs: { reveal: { key: 'v', op: '>=', val: 5 } }, w: 6, fuse: true });
    const chain = m.card('cf', 'F', [S('s1', 'A'), Object.assign(S('s2', 'B'), { fuse: false })], { w: 12 });
    m.setHouse([m.room('r', 'R', [chain])], [], true);            // no v anywhere → 0 >= 5 false
    const fw = document.querySelector('[data-fid="cf"] .fusewrap');
    return { cells: fw ? fw.querySelectorAll('.fusecell').length : 0, guts: fw ? fw.querySelectorAll('.fusegut').length : 0 };
  });
  expect(out.cells).toBe(0);
  expect(out.guts).toBe(0);
});
