import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

const SETUP = `
  const m = window.__mk; m.reset(); const D = m.D();
  const mk = (id, n) => m.card(id, n, [m.slot('s' + id, 'text', { text: n })], { w: 4 });
  const r = m.room('r', 'R', [mk('c1', 'One'), mk('c2', 'Two')]);
  r.services = { archive: true };
  m.setHouse([r], [], true);
  document.querySelector('[data-act="archive"][data-fid="c1"]').click();
`;

test('archive is a Study-only concern: count on the button, Edit shows everything', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    const res = {};
    res.label = document.querySelector('[data-act="archtoggle"]').textContent.trim();
    res.studyVisible = [...document.querySelectorAll('#stage .furn[data-fid]')].map(e => e.dataset.fid);
    D.studyOn = false; window.render();
    res.editVisible = [...document.querySelectorAll('#stage .furn[data-fid]')].map(e => e.dataset.fid);
    res.editArchUI = document.querySelectorAll('#stage [data-act="archtoggle"], #stage [data-act="unarchive"]').length;
    return res;
  })()`);
  expect(out.label).toContain('(1)');                       // count surfaces in Study
  expect(out.studyVisible).toEqual(['c2']);                 // archived card hidden from the reader
  expect(out.editVisible.sort()).toEqual(['c1', 'c2']);     // Edit unaffected by Study archiving
  expect(out.editArchUI).toBe(0);                           // no archive chrome in Edit
});

test('a Study room holding only archived cards still renders with its toggle', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    document.querySelector('[data-act="archive"][data-fid="c2"]').click();
    D.house.rooms[0].title = ''; D.house.rooms[0].subtitle = ''; window.render();
    const room = document.querySelector('.room[data-room="r"]');
    const tog = room && room.querySelector('[data-act="archtoggle"]');
    if (!tog) return { room: !!room, tog: false };
    tog.click();
    return { room: !!room, tog: true, label: tog.textContent.trim(), cardsBack: !!document.querySelector('[data-fid="c1"]') };
  })()`);
  expect(out.room).toBe(true);
  expect(out.tog).toBe(true);
  expect(out.cardsBack).toBe(true);
});
