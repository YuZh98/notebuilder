import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// A divider is a chapter header: folding it hides the sections below it, up to the next divider.

test.beforeEach(async ({ page }) => { await open(page); });

function chapters() {
  // div A → [r1, r2] ; div B → [r3]
  return `const m=window.__mk; m.reset(); const D=m.D();
    const card=id=>({id,name:id,slots:[m.slot(id+'s','text',{text:id})],container:{},rules:{},accent:'',variety:'1',place:{w:6},content:{},tag:[],state:{}});
    const room=(id,kind,cards)=>({id,name:id,kind:kind||'mixed',services:{},state:{},cards:cards||[]});
    D.place='house'; D.studyOn=true;
    D.house.rooms=[ room('dA','divider'), room('r1','mixed',[card('c1')]), room('r2','mixed',[card('c2')]), room('dB','divider'), room('r3','mixed',[card('c3')]) ];
    D.house.active='r1'; window.render();`;
}

test('folding a chapter divider hides its sections; the next chapter stays', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${chapters()}
    const vis = () => ['r1','r2','r3'].filter(id=>document.querySelector('.room[data-room="'+id+'"]'));
    const before = vis();
    document.querySelector('.room.divider[data-room="dA"] [data-act="roomcollapse"]').click();
    const afterFold = vis();
    document.querySelector('.room.divider[data-room="dA"] [data-act="roomcollapse"]').click();
    const afterExpand = vis();
    return { before, afterFold, afterExpand };
  })()`);
  expect(out.before).toEqual(['r1', 'r2', 'r3']);
  expect(out.afterFold).toEqual(['r3']);       // dA's chapter (r1,r2) hidden; dB's chapter (r3) stays
  expect(out.afterExpand).toEqual(['r1', 'r2', 'r3']);
});

test('chapter fold works in Edit mode too', async ({ page }) => {
  const out = await page.evaluate(`(() => { ${chapters()} D.studyOn=false; window.render();
    document.querySelector('.room.divider[data-room="dA"] [data-act="roomcollapse"]').click();
    return ['r1','r2','r3'].filter(id=>document.querySelector('.room[data-room="'+id+'"]'));
  })()`);
  expect(out).toEqual(['r3']);
});

test('the add buttons read "＋ section" and "＋ chapter"', async ({ page }) => {
  const labels = await page.evaluate(() => {
    const m = window.__mk; m.reset(); m.setHouse([m.room('r', 'R', [])], [], false);
    return { room: document.querySelector('#top [data-act="addroom"]').textContent.trim(),
             div: document.querySelector('#top [data-act="adddivider"]').textContent.trim() };
  });
  expect(labels.room).toContain('section');
  expect(labels.div).toContain('chapter');
});
