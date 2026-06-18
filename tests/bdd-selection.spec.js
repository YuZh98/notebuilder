import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

const SETUP = `
  const m = window.__mk; m.reset(); const D = m.D();
  const mk = (id, n) => m.card(id, n, [m.slot('s' + id, 'text', { text: n })], { w: 4 });
  const rA = m.room('ra', 'A', [mk('c1', 'One')]); rA.title = 'Room A';
  const rB = m.room('rb', 'B', [mk('c2', 'Two')]); rB.title = 'Room B';
  m.setHouse([rA, rB], [], false);
  const sideText = () => document.querySelector('#side').textContent;
`;

test("#4 clicking another room's title moves room selection there", async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    document.querySelector('.room[data-room="ra"]').click();                       // select room A
    const before = D.house.active;
    document.querySelector('.room[data-room="rb"] .ceview.room-title').click();    // click B's TITLE
    return { before, after: D.house.active, editorOpened: !!document.querySelector('.room[data-room="rb"] textarea.ce') };
  })()`);
  expect(out.before).toBe('ra');
  expect(out.after).toBe('rb');                       // selection followed the click
  expect(out.editorOpened).toBe(true);                // and the title still edits
});

test('#4 clicking the notebook title selects the notebook', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    document.querySelector('.room[data-room="ra"]').click();                       // room selected
    const roomPanel = /Delete room/.test(sideText());
    document.querySelector('.ceview.house-title').click();                         // click the notebook title
    return { roomPanel, housePanel: /Notebook/i.test(sideText()), headSel: !!document.querySelector('.house-head.sel') };
  })()`);
  expect(out.roomPanel).toBe(true);
  expect(out.housePanel).toBe(true);
  expect(out.headSel).toBe(true);                     // top area shows as selected
});

test('#3 clicking blank stage space selects the notebook', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    document.querySelector('.room[data-room="ra"]').click();
    const before = /Delete room/.test(sideText());
    document.querySelector('#stage').click();                                      // blank area
    return { before, housePanel: /Notebook/i.test(sideText()) };
  })()`);
  expect(out.before).toBe(true);
  expect(out.housePanel).toBe(true);
});
