import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

const SETUP = `
  const m = window.__mk; m.reset(); const D = m.D();
  const S = (id, txt, o = {}) => Object.assign({ id, type: 'text', props: { text: txt }, verbs: {}, w: 6 }, o);
  const c = m.card('cf', 'F', [S('s1', 'L', { fuse: true }), S('s2', 'R')], { w: 12 });
  m.setHouse([m.room('r', 'R', [c])], [], true);
`;

test('#6 the seam spans the full card height when the chain is the card content', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    const card = document.querySelector('[data-fid="cf"]').getBoundingClientRect();
    const gut = document.querySelector('[data-fid="cf"] .fusegut').getBoundingClientRect();
    return { cardH: card.height, gutH: gut.height, topGap: gut.top - card.top, bottomGap: card.bottom - gut.bottom };
  })()`);
  expect(out.topGap).toBeLessThanOrEqual(2);          // touches the top edge
  expect(out.bottomGap).toBeLessThanOrEqual(2);       // touches the bottom edge
});

test('#6 the seam is inert in Study: no resize cursor, no hover affordance', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    const gut = document.querySelector('[data-fid="cf"] .fusegut');
    const studyCursor = getComputedStyle(gut).cursor;
    D.studyOn = false; window.render();
    const editCursor = getComputedStyle(document.querySelector('[data-fid="cf"] .fusegut')).cursor;
    return { studyCursor, editCursor };
  })()`);
  expect(['default','auto']).toContain(out.studyCursor);
  expect(out.editCursor).toBe('ew-resize');
});
