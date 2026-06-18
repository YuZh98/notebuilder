// Shared test setup. `open(page)` loads the app with fixture builders available as window.__mk.
// Tests build a deterministic house in-page, render, and assert on DB + DOM — the same approach we verify by hand.
const FIXTURES = `window.__mk = {
  D: () => window.LS.DB(),
  reset: () => window.LS.reset(),
  slot: (id, type, props = {}, verbs = {}) => ({ id, type, props, verbs }),
  card: (id, name, slots = [], o = {}) => ({ id, name, slots, back: o.back, container: o.container || {}, rules: o.rules || {}, accent: '', variety: '1', place: { w: o.w || 8 }, content: {}, tag: o.tag || [], state: {}, icon: o.icon }),
  room: (id, name, cards = [], kind = 'mixed') => ({ id, name, kind, cards, services: o_services(), state: {} }),
  setHouse: (rooms, cats = [], study = false) => { const D = window.LS.DB(); D.place = 'house'; D.studyOn = study; D.house.cats = cats; D.house.rooms = rooms; D.house.active = rooms[0].id; window.render(); return D; },
  shown: () => [...document.querySelectorAll('#stage .furn[data-fid]')].map(f => f.dataset.fid).filter(id => id !== '__prev'),
};
function o_services(){ return {}; }`;

export async function open(page) {
  await page.addInitScript(FIXTURES);
  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.LS && !!window.render);
}
