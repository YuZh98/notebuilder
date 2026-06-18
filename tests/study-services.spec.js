import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

test.beforeEach(async ({ page }) => { await open(page); });

const SETUP = `
  const m = window.__mk; m.reset(); const D = m.D();
  const S = (id,type,props)=>({id,type,props,verbs:{}});
  const mk = (id,name,slots,o={}) => m.card(id,name,slots,o);
  const c1 = mk('c1','Alpha',[S('s1','text',{text:'wolf'})],{w:4});
  const c2 = mk('c2','Beta',[S('s2','text',{text:'bear'})],{w:4});
  c2.content = { s2: { text: 'hidden-in-content' } };               // text lives in the content override
  const c3 = mk('c3','Gamma',[S('s3','text',{text:'crow'})],{container:{flip:true},back:[S('b3','text',{text:'BACK'})],w:4});
  const c4 = mk('c4','Quiz',[S('s4','choice',{q:'Q',options:'A\\nB\\nC',key:'pick'})],{w:4});
  const c5 = mk('c5','Todo',[S('s5','list',{title:'T',items:'one\\ntwo',style:'check'})],{w:4});
  const c6 = mk('c6','Plot',[S('s6','chart',{fn:'x',x0:0,x1:10,y0:0,y1:10,label:'L'})],{w:12});
  const r = m.room('r','R',[c1,c2,c3,c4,c5,c6]);
  r.services = { pin:true, shuffle:true, reset:true, search:true, archive:true };
  m.setHouse([r],[],true);
`;

test('#3 search keeps its text and focus while typing, and matches content overrides', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    const si = document.querySelector('[data-act="searchin"]');
    si.focus(); si.value = 'hidden-in'; si.dispatchEvent(new Event('input',{bubbles:true}));
    const si2 = document.querySelector('[data-act="searchin"]');
    return { valueKept: si2.value, focused: document.activeElement === si2,
             visible: [...document.querySelectorAll('#stage .furn[data-fid]')].map(e=>e.dataset.fid) };
  })()`);
  expect(out.valueKept).toBe('hidden-in');
  expect(out.focused).toBe(true);
  expect(out.visible).toEqual(['c2']);          // content override is searchable
});

test('#5 a plain single choice can be re-picked (no permanent lock)', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    const opts = [...document.querySelectorAll('[data-fid="c4"] [data-i="pick"]')];
    opts[0].click();
    const first = m.D().house.rooms[0].cards[3].state.pick;
    document.querySelectorAll('[data-fid="c4"] [data-i="pick"]')[2].click();
    return { first, second: m.D().house.rooms[0].cards[3].state.pick };
  })()`);
  expect(out.first).toBe(0);
  expect(out.second).toBe(2);
});

test('#9 chart scales with the card instead of letterboxing in a fixed 150px strip', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    const svg = document.querySelector('[data-fid="c6"] svg.chart-svg');
    const sr = svg.getBoundingClientRect();
    return { w: sr.width, h: sr.height, ratio: sr.width / sr.height };
  })()`);
  expect(out.ratio).toBeGreaterThan(1.9);       // ~320/150 aspect preserved
  expect(out.ratio).toBeLessThan(2.4);
  expect(out.h).toBeGreaterThan(160);           // actually grew with the card (was hard 150)
});

test('#4 reset clears flips/answers/checks but keeps pins and archives, and is undoable', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    document.querySelector('[data-fid="c3"] [data-act="flip"]').click();
    document.querySelectorAll('[data-fid="c4"] [data-i="pick"]')[1].click();
    document.querySelector('[data-fid="c5"] .taskit input').click();
    document.querySelector('[data-act="pin"][data-fid="c1"]').click();
    document.querySelector('[data-act="archive"][data-fid="c2"]').click();
    const undoBefore = D._undo.length;
    document.querySelector('[data-act="svcrun"][data-k="reset"]').click();
    const c = id => r.cards.find(x=>x.id===id);
    return { flip: !!c('c3').state._flip, pick: c('c4').state.pick, done: c('c5').state._done,
             pin: (c('c1').tag||[]).includes('pinned'), arch: !!c('c2').state._arch, undoGrew: D._undo.length > undoBefore };
  })()`);
  expect(out.flip).toBe(false);
  expect(out.pick).toBeUndefined();
  expect(out.done).toBeUndefined();
  expect(out.pin).toBe(true);                   // durable marks survive
  expect(out.arch).toBe(true);
  expect(out.undoGrew).toBe(true);              // and the wipe is undoable
});

test('#2 shuffle is a per-session view: author order never mutates or persists', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    const author = r.cards.map(c=>c.id).join(',');
    let viewChanged = false;
    for (let i = 0; i < 8 && !viewChanged; i++) {
      document.querySelector('[data-act="svcrun"][data-k="shuffle"]').click();
      const dom = [...document.querySelectorAll('#stage .furn[data-fid]')].map(e=>e.dataset.fid).join(',');
      viewChanged = dom !== author;
    }
    const dbOrder = r.cards.map(c=>c.id).join(',');
    const stored = localStorage.getItem('lsa_db_v13');   // null = shuffle saved NOTHING (the strongest pass)
    const lsOrder = stored ? JSON.parse(stored).houses[0].rooms[0].cards.map(c=>c.id).join(',') : author;
    D.studyOn = false; window.render();
    const editOrder = [...document.querySelectorAll('#stage .furn[data-fid]')].map(e=>e.dataset.fid).join(',');
    return { author, viewChanged, dbOrder, lsOrder, editOrder };
  })()`);
  expect(out.viewChanged).toBe(true);           // the view really shuffles
  expect(out.dbOrder).toBe(out.author);         // DB untouched
  expect(out.lsOrder).toBe(out.author);         // nothing persisted
  expect(out.editOrder).toBe(out.author);       // Edit always shows author order
});

test('#1 export ships a clean file: reader progress stripped, pins/archives kept', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${SETUP}
    document.querySelector('[data-fid="c3"] [data-act="flip"]').click();
    document.querySelectorAll('[data-fid="c4"] [data-i="pick"]')[1].click();
    document.querySelector('[data-fid="c5"] .taskit input').click();
    document.querySelector('[data-act="pin"][data-fid="c1"]').click();
    document.querySelector('[data-act="archive"][data-fid="c2"]').click();
    const si = document.querySelector('[data-act="searchin"]'); si.value='wolf'; si.dispatchEvent(new Event('input',{bubbles:true}));
    const html = buildExport();
    const seed = JSON.parse(html.match(/__LSA_SEED__=(\\{.*?\\})<\\/script>/s)[1]);
    const sr = seed.houses[0].rooms[0]; const c = id => sr.cards.find(x=>x.id===id);
    return { flip: !!c('c3').state._flip, pick: c('c4').state.pick, done: c('c5').state._done,
             pin: (c('c1').tag||[]).includes('pinned'), arch: !!c('c2').state._arch, q: sr._q };
  })()`);
  expect(out.flip).toBe(false);                 // recipient sees fronts
  expect(out.pick).toBeUndefined();             // quiz unanswered
  expect(out.done).toBeUndefined();             // checklist unchecked
  expect(out.pin).toBe(true);                   // author's marks intact
  expect(out.arch).toBe(true);
  expect(out.q).toBeUndefined();                // no leftover search term
});
