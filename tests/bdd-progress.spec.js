import { test, expect } from '@playwright/test';
import { open } from './_helpers.js';

// Progress = a per-reader completion meter. Set via Edit (scope + tags + show parts); fills in Study.

test.beforeEach(async ({ page }) => { await open(page); });

// helpers injected into the page
const SETUP = `
  const mkProg = (id, props) => ({ id, type:'progress', props: Object.assign({label:'',scope:'section',track:[],show:{mn:true,pct:true,bar:true}}, props||{}), verbs:{} });
  const mkFlip = (id, seen, tags) => ({ id, name:id, slots:[{id:id+'s',type:'text',props:{text:'q'},verbs:{}}], back:[{id:id+'b',type:'text',props:{text:'a'},verbs:{}}], container:{flip:true}, rules:{}, accent:'', variety:'1', place:{w:12}, content:{}, tag:tags||[], state: seen?{_seen:true}:{} });
  const box = fid => (document.querySelector('[data-fid="'+fid+'"] .pgbox')||{}).textContent ? document.querySelector('[data-fid="'+fid+'"] .pgbox').textContent.replace(/\\s/g,'') : '';
`;

test('counts finished cards in the section; flip-once marks a flashcard done', async ({ page }) => {
  const out = await page.evaluate(`(() => { const m=window.__mk; m.reset(); ${SETUP}
    const meter = m.card('pm','M',[mkProg('sp',{track:['drill']})],{w:12});
    m.setHouse([m.room('r','R',[meter, mkFlip('fa',true,['drill']), mkFlip('fb',false,['drill'])])],['drill'],true);
    const before = box('pm');
    document.querySelector('[data-fid="fb"] .fc').click();   // flip the unseen flashcard
    return { before, after: box('pm') };
  })()`);
  expect(out.before).toBe('1/2');
  expect(out.after).toBe('2/2');
});

test('plain cards (nothing to finish) are not counted', async ({ page }) => {
  const txt = await page.evaluate(`(() => { const m=window.__mk; m.reset(); ${SETUP}
    const meter = m.card('pm','M',[mkProg('sp')],{w:12});
    const note = m.card('cn','N',[m.slot('t','text',{text:'just a note'})],{w:12});
    m.setHouse([m.room('r','R',[meter, note, mkFlip('fa',false,[])])],[],true);
    return box('pm');
  })()`);
  expect(txt).toBe('0/1');
});

test('whole-notebook scope folds across rooms', async ({ page }) => {
  const txt = await page.evaluate(`(() => { const m=window.__mk; m.reset(); ${SETUP}
    const meter = m.card('pm','M',[mkProg('sp',{scope:'notebook'})],{w:12});
    m.setHouse([m.room('r1','R1',[meter, mkFlip('fa',true,[])]), m.room('r2','R2',[mkFlip('fb',false,[])])],[],true);
    return box('pm');
  })()`);
  expect(txt).toBe('1/2');
});

test('Show toggles control which parts render; at least one stays on', async ({ page }) => {
  const out = await page.evaluate(`(() => { const m=window.__mk; m.reset(); ${SETUP}
    const meter = m.card('pm','M',[mkProg('sp',{show:{mn:false,pct:false,bar:true}})],{w:12});
    m.setHouse([m.room('r','R',[meter])],[],true);
    const el=document.querySelector('[data-fid="pm"]');
    return { boxes: el.querySelectorAll('.pgbox').length, bars: el.querySelectorAll('.bar').length };
  })()`);
  expect(out.boxes).toBe(0);
  expect(out.bars).toBe(1);
});

test('Factory inspector for progress is provide-only; Edit has draggable Show + Counts + Which-cards', async ({ page }) => {
  const out = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'factory'; D.factory.study = false; window.render();
    document.querySelector('[data-act="addslot"][data-t="progress"]').click();
    document.querySelector('[data-bs="0"]').click();
    const facFields = document.querySelectorAll('#side [data-act="sprop"]').length;
    m.reset();
    const meter = m.card('pm', 'M', [{ id: 'sp', type: 'progress', props: { label: '', scope: 'section', track: [], show: { mn: true, pct: false, bar: true } }, verbs: {} }], { w: 12 });
    m.setHouse([m.room('r', 'R', [meter])], ['drill'], false);
    document.querySelector('[data-fid="pm"]').click();
    const side = document.querySelector('#side');
    const showBtn = side.querySelector('[data-act="pgshow"]');
    return { facFields, counts: !!side.querySelector('[data-act="pgscope"]'), show: !!showBtn, tags: !!side.querySelector('[data-act="pgtag"]'), showDraggable: showBtn && showBtn.getAttribute('draggable') };
  });
  expect(out.facFields).toBe(0);
  expect(out.counts).toBe(true);
  expect(out.show).toBe(true);
  expect(out.tags).toBe(true);
  expect(out.showDraggable).toBe('true');
});

test('a Rollup slot migrates to a Progress meter on import', async ({ page }) => {
  const t = await page.evaluate(() => {
    const m = window.__mk; m.reset();
    const h = { name: 'old', rooms: [{ id: 'r1', name: 'R', cards: [
      { id: 'f1', name: 'dash', slots: [{ id: 's1', type: 'rollup', props: { label: 'Mastery', metric: 'pinned', tag: '' }, verbs: {} }], place: { w: 12 }, content: {}, tag: [], state: {} },
    ] }] };
    window.importHouse(JSON.stringify(h));
    return window.__mk.D().house.rooms[0].cards[0].slots[0].type;
  });
  expect(t).toBe('progress');
});

test('a no-room preview shows a representative sample bar', async ({ page }) => {
  const txt = await page.evaluate(() => {
    const m = window.__mk; m.reset(); const D = m.D();
    D.place = 'factory'; D.factory.study = true;   // Preview renders the bench with no room context
    D.bench.slots = [{ id: 'sp', type: 'progress', props: { label: '', scope: 'section', track: [], show: { mn: true, pct: false, bar: true } }, verbs: {} }];
    window.render();
    const b = document.querySelector('.furn[data-fid^="fac:"] .pgbox');
    return b ? b.textContent.replace(/\s/g, '') : '';
  });
  expect(txt).toBe('3/5');   // honest placeholder so the bar reads as a progress bar
});
