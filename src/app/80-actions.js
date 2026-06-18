/* ====================== actions ====================== */
function runService(k,r){
  if(k==='shuffle'){ const ids=r.cards.map(c=>c.id); for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];} SHUF[r.id]=ids; render(); toast('shuffled (view only — your order is kept)'); }
  if(k==='flipAll'){ r.cards.forEach(c=>{if(c.container&&c.container.flip){c.state._seen=true; c.state._flip=!c.state._flip;}}); save(); render(); toast('flipped all'); }
  if(k==='reset'){ delete SHUF[r.id]; commit(()=>{ r.cards.forEach(keepDocState); }); toast('reset — flips & answers cleared (pins and archive kept)'); }
}
function placeProduct(id,atIndex){
  const p=DB.products.find(x=>x.id===id); const r=room();
  if((r.kind||'mixed')==='divider'){ toast('a chapter heading holds no cards'); return; }
  if(r.locked){ toast('room is locked — unlock with a butler first'); return; }
  commit(()=>{
    const content={}, d=view.pdraft||{}; Object.keys(d).forEach(sid=>content[sid]=Object.assign({},d[sid]));
    const pick=(view.prodVariety&&view.prodVariety.pid===p.id)?view.prodVariety.v:null;
    const pv=(p.varieties&&p.varieties.length)?(p.varieties.find(v=>v.name===pick)||p.varieties[0]):null;
    const card={id:uid('f'),name:baseName(p.name),slots:clone(p.slots),back:p.back?clone(p.back):undefined,container:clone(p.container),rules:clone(p.rules),accent:(pv?pv.accent:p.accent)||'',variety:pv?pv.name:(varLabel(p.name)||'1'),place:{w:Math.max(4,Math.min(12,p.slots[0]?8:6))},content,tag:[],state:{}};
    if(atIndex!=null && atIndex>=0 && atIndex<=r.cards.length) r.cards.splice(atIndex,0,card); else r.cards.push(card);
  });
  toast('placed “'+baseName(p.name)+'”');
}
function addBench(){ pushHistory(); const b=freshBench(); DB.factory.benches.push(b); DB.factory.active=b.id; DB.bench=b; benchSel=null; save(); render(); }
function delBench(id){ if(DB.factory.benches.length<=1){toast('keep at least one container');return;} if(!confirm('Delete this container? (sealed products stay in Inventory. Undoable.)'))return; pushHistory(); DB.factory.benches=DB.factory.benches.filter(b=>b.id!==id); if(DB.factory.active===id)DB.factory.active=DB.factory.benches[0].id; DB.bench=DB.factory.benches.find(b=>b.id===DB.factory.active); benchSel=null; save(); render(); }
function openSeal(id){ const b=DB.factory.benches.find(x=>x.id===id); if(!b)return; if(!b.slots.length){toast('add a slot first');return;} const ex=b._src?DB.products.find(p=>p.id===b._src.id):null; view.sealId=id; view.sealConflict=false; view.sealDraft={name:b.name,note:b.note||'',store:ex?(ex.store||null):null,icon:ex?(ex.icon||''):(b.icon||''),varieties:clone(b.varieties||(ex&&ex.varieties)||[])}; render(); }
function freeName(n){ if(!DB.products.some(p=>p.name===n))return n; for(let i=2;;i++){ const c=n+'--'+i; if(!DB.products.some(p=>p.name===c))return c; } }
function sealConfirm(mode){ const id=view.sealId; const b=DB.factory.benches.find(x=>x.id===id); const d=view.sealDraft; if(!b)return;
  const ex=b._src?DB.products.find(p=>p.id===b._src.id):null;
  if(!mode && ex && d.name===ex.name){ view.sealConflict=true; render(); return; }   // same name as the copied product → ask
  pushHistory(); view.sealConflict=false;
  const bk=b.container.flip&&b.back?clone(b.back):undefined;
  if(mode==='replace' && ex){ b.name=d.name; b.note=d.note; b.icon=d.icon||''; Object.assign(ex,{name:d.name,container:clone(b.container),slots:clone(b.slots),back:bk,rules:clone(b.rules),accent:b.accent||'',note:d.note||'',icon:d.icon||'',store:d.store||null,varieties:clone(d.varieties||[])}); view.sealId=null; save(); render(); toast('replaced “'+d.name+'”'); return; }
  const nm=(mode==='new')?freeName(d.name):d.name;
  b.name=nm; b.note=d.note; b.icon=d.icon||''; b._src=null; view.sealId=null;
  DB.products.push({id:uid('p'),name:nm,container:clone(b.container),slots:clone(b.slots),back:bk,rules:clone(b.rules),accent:b.accent||'',note:d.note||'',icon:d.icon||'',store:d.store||null,varieties:clone(d.varieties||[])});
  save(); render(); toast('sealed “'+nm+'”'+(d.store?(' → '+((DB.stores.find(s=>s.id===d.store)||{}).name||d.store)):' (workshop)')); }
// recipients get a pristine copy: no flips/answers/checks/search; tags + archives are the author's durable marks and ride along
function cleanHouseExport(){ const h=clone(DB.house); h.schemaVersion=SCHEMA_VERSION; h.rooms.forEach(r=>{ delete r._q; delete r._showArch; delete r._collapsed; (r.cards||[]).forEach(keepDocState); }); return h; }
function doExport(){ const blob=new Blob([JSON.stringify(cleanHouseExport(),null,2)],{type:'application/json'}); dl(blob,(DB.house.name||'house')+'.json'); toast('exported house JSON'); }
function importHouse(text){ let h; try{ h=JSON.parse(text); }catch(e){ toast('bad JSON'); return false; }
  if(!h||!h.rooms){ toast('bad JSON — not a notebook file'); return false; }
  if((h.schemaVersion||0)>SCHEMA_VERSION){ toast('this file is from a NEWER version of the app — update the app, then import'); return false; }
  h.id=uid('h'); if(!h.width)h.width='medium'; migrateHouse(h); h.active=(h.rooms[0]&&h.rooms[0].id); pushHistory(); DB.houses.push(h); DB.activeHouse=h.id; DB.house=h; selKind='house'; save(); render();
  { const n=crossCardReads(h);
    if(n){ toast('imported “'+(h.name||'notebook')+'” — ⚠ '+n+' formula'+(n>1?'s':'')+' reference variables outside their card — variables are card-scoped; fuse those slots into one card'); return true; } }
  toast('imported “'+(h.name||'notebook')+'”'); return true; }
/* JSON import is the only path v1 (house-scoped) files enter — living .html exports bundle their own app
   version. Count readers whose variable isn't defined in their OWN card, so the importer can warn once. */
const EXPR_RESERVED=new Set(['sin','cos','tan','exp','log','sqrt','abs','sign','round','floor','ceil','min','max','pow','clamp','pi','e','true','false','mod','x']);
function crossCardReads(h){ let n=0; const ids=str=>{ const out=[]; String(str||'').replace(/[a-zA-Z_][a-zA-Z0-9_]*/g,m=>{ if(!EXPR_RESERVED.has(m))out.push(m); return m; }); return out; };
  (h.rooms||[]).forEach(r=>(r.cards||[]).forEach(c=>{ const all=(c.slots||[]).concat(c.back||[]); const def=new Set();
    all.forEach(s=>{ if(!s)return; const pr=Object.assign({},s.props,(c.content&&c.content[s.id])||{}); if((s.type==='slider'||s.type==='choice')&&pr.key)def.add(pr.key); if(s.type==='compute'&&pr.out)def.add(pr.out); });
    all.forEach(s=>{ if(!s)return; const pr=Object.assign({},s.props,(c.content&&c.content[s.id])||{}); const reads=[];
      if(s.type==='compute')reads.push(...ids(pr.expr));
      if(s.type==='chart')reads.push(...ids(pr.fn));
      if(s.type==='progress'&&pr.key)reads.push(pr.key);
      if(typeof pr.text==='string')(pr.text.match(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g)||[]).forEach(t=>reads.push(t.replace(/[{}\s]/g,'')));
      if(s.verbs&&s.verbs.reveal&&s.verbs.reveal.key)reads.push(s.verbs.reveal.key);
      reads.forEach(k=>{ if(!def.has(k))n++; }); });
  })); return n; }
window.importHouse=importHouse;
function doImport(){ const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json'; inp.onchange=()=>{const fr=new FileReader(); fr.onload=()=>importHouse(fr.result); fr.readAsText(inp.files[0]);}; inp.click(); }
// a LIVING standalone file: embeds the CSS + this house + the whole app, booted into Study.
// Opens offline, fully interactive (sliders/charts/compute/flip/choice), forkable. KaTeX bundles in when the notebook has math.
function buildExport(){
  const css=document.querySelector('style').textContent;
  const hasMath=JSON.stringify(DB.house).includes('$');
  let appScript=([...document.scripts].find(s=>!s.src && s.id==='app')||document.getElementById('app')).textContent;
  if(!hasMath) appScript=appScript.replace(/\/\*KATEX_BUNDLE_START\*\/[\s\S]*?\/\*KATEX_BUNDLE_END\*\//,"const KATEX_CSS='',KATEX_JS='';");
  appScript=appScript.replace(/<\/script>/gi,'<\\/script>');
  const cleanHouse=cleanHouseExport();
  // SLIM share: placed cards are self-contained, so the recipient needs neither the catalog nor templates.
  // `shared:true` boots the file into the locked Reader (renderTop). Remix restocks blocks via rebuildRefs.
  const seed={ place:'house', studyOn:true, shared:true, theme:DB.theme||'', stores:clone(DB.stores), products:[], houses:[cleanHouse], activeHouse:DB.house.id, templates:[] };
  const seedJSON=JSON.stringify(seed).replace(/</g,'\\u003c');   // can't break out of the <script> or open a comment
  const body=`<div id="top"><div class="brand">Note<b>Builder</b></div><div class="places row" id="places"></div><div class="spacer"></div><div class="row" id="topright"></div></div><div id="main"><aside id="side"></aside><div id="resizer"></div><section id="stage"></section></div><div id="modal"></div><div id="dustbin" title="drop here to delete">🗑<span class="sm">drop to delete</span></div><div id="mdbar"></div>`;
  // eslint-disable-next-line no-useless-escape -- the escaped closing-script sequence must stay escaped: this file is bundled inside a script element, and an unescaped closing-script tag would terminate it early.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(DB.house.name)}</title><style>${css}</style></head><body data-theme="${esc(DB.theme||'')}">${body}<script>window.__LSA_SEED__=${seedJSON}<\/script><script id="app">${appScript}<\/script></body></html>`;
}
function doSnapshot(){ dl(new Blob([buildExport()],{type:'text/html'}),(DB.house.name||'notebook')+'.html'); toast('Shared — one file, opens anywhere, fully interactive'); }
function dl(blob,name){ const u=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=u; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(u),500); }
