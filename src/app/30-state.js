/* ====================== DB ====================== */
const CLEAN_MODE=new URLSearchParams(location.search).has('clean'); // ?clean = the new-user seed; default = dev sandbox. Same code, separate storage.
const DBKEY=CLEAN_MODE?'lsa_clean_v1':'lsa_db_v13';
let LIVE={};   // per-card Study slider values {cardId:{key:val}}, session-ephemeral (never persisted)
let SHUF={};   // per-room shuffled view order (Study only; author order in DB never changes)

let DB, selKind='room', sel=null, selProd=null, benchSel=null, benchFace='front', view={fold:{}, prevStudy:false, editSlot:null, cells:[], nbMenu:false, themeMenu:false, topHide:(()=>{try{return localStorage.getItem('lsa_tophide')==='1'}catch(e){return false}})(), sideCollapsed:(()=>{try{return localStorage.getItem('lsa_sidecollapsed')==='1'}catch(e){return false}})()}, dragId=null;
let EXPORT_MODE=false; // true inside an exported standalone file: seed from window.__LSA_SEED__, never persist to localStorage

function viewToggle(act,isStudy,editLabel,studyLabel){ return `<button class="btn sm ${!isStudy?'on':''}" data-act="${act}" data-m="edit">${editLabel}</button><button class="btn sm ${isStudy?'on':''}" data-act="${act}" data-m="study">${studyLabel}</button>`; }
const curSlots=()=> (DB.bench.container.flip && benchFace==='back') ? (DB.bench.back||(DB.bench.back=[])) : DB.bench.slots;

function freshBench(){ return {id:uid('c'),name:'New product',container:{flip:false,look:'card'},slots:[],rules:{},accent:'',note:''}; }

function seed(){
  const stores=[{id:'write',name:'Write',icon:''},{id:'practice',name:'Practice',icon:''},{id:'live',name:'Live',icon:''}];

  const P=[];
  const mapSlots=arr=>arr.map(s=>Object.assign({id:uid('s'),w:12,verbs:{}},s));
  const mkProd=(name,slots,opt={})=>{const p={id:uid('p'),name,container:Object.assign({flip:false,look:'card'},opt.container||{}),slots:mapSlots(slots),back:opt.back?mapSlots(opt.back):undefined,rules:opt.rules||{},accent:opt.accent||'',note:opt.note||'',icon:opt.icon||'',store:opt.store||(opt.shops&&opt.shops[0])||'core',varieties:opt.varieties||[]};P.push(p);return p;};

  mkProd('Flashcard',[{type:'text',props:{text:'**Q.** What is $E[X]$ for $X\\sim\\text{Bernoulli}(p)$?'}}],
    {container:{flip:true,look:'card'},back:[{type:'text',props:{text:'**A.** $p$'}}],accent:'#6ea8fe',store:'practice',
     varieties:[{name:'Blue',accent:'#6ea8fe'},{name:'Mint',accent:'#54d6a0'}]});
  mkProd('Quiz',[
    {type:'choice',props:{q:'Var of a fair coin flip (0/1)?',options:'0.25\n0.5\n1',key:'pick',explanation:'Var = p(1-p) = 0.25'}}],
    {rules:{answer:0},store:'practice'});
  mkProd('Note',[{type:'text',props:{text:'**Note.** Write anything — renders as bare script, no card frame. Math: P(A∩B)=P(A)P(B) when independent.'}}],{container:{bare:true},store:'write'});
  mkProd('Tracker',[{type:'list',props:{title:'Topics to master',items:'Bernoulli\nBinomial\nPoisson\nNormal',style:'check'}}],{store:'practice'});
  mkProd('Mastery Dashboard',[
    {type:'text',props:{text:'## 📊 Room mastery'}},
    {type:'progress',props:{label:'Cards finished',scope:'section',track:[],show:{mn:true,pct:true,bar:true}}}],{store:'practice'});
  mkProd('Slider Lab',[
    {type:'text',props:{text:'## Drag μ — watch it react'}},
    {type:'slider',props:{key:'mu',min:0,max:100,value:30}},
    {type:'text',props:{text:'Current μ = **{{mu}}** — this number is live.'}}],{accent:'#b388ff',store:'live',icon:'🎚'});

  mkProd('Gaussian Lab',[
    {type:'text',props:{text:'## Normal distribution  N(μ, σ²)'}},
    {type:'slider',props:{key:'mu',min:-3,max:3,value:0,step:0.1}},
    {type:'slider',props:{key:'sg',min:0.3,max:2.5,value:1,step:0.05}},
    {type:'chart',props:{fn:'exp(0 - (x-mu)*(x-mu)/(2*sg*sg)) / (sg*sqrt(2*pi))',x0:-4,x1:4,label:'density f(x)'}},
    {type:'compute',props:{expr:'round( 1/(sg*sqrt(2*pi)) *1000)/1000',note:'peak density ='}},
    {type:'compute',props:{expr:'round(sg*sg*1000)/1000',note:'variance σ² ='}}],{accent:'#6ea8fe',store:'live',icon:'∿'});
  mkProd('Option Payoff',[
    {type:'text',props:{text:'## Long call — payoff at expiry'}},
    {type:'slider',props:{key:'K',min:0,max:100,value:50,step:1}},
    {type:'chart',props:{fn:'max(0, x - K)',x0:0,x1:100,label:'payoff vs stock price S'}},
    {type:'compute',props:{expr:'K',note:'breakeven (ignoring premium) ='}}],{accent:'#f0a868',store:'live',icon:'📈'});
  mkProd('Compound Growth',[
    {type:'text',props:{text:'## $1000 at compound interest'}},
    {type:'slider',props:{key:'rate',value:5,step:0.5,min:'',max:'',showSlider:false,showName:true,showValue:true}},
    {type:'slider',props:{key:'years',value:10,step:1,min:'',max:'',showSlider:false,showName:true,showValue:true}},
    {type:'compute',props:{expr:'round(1000*pow(1+rate/100, years))',note:'future value of $1000 ='}},
    {type:'chart',props:{fn:'1000*pow(1 + rate/100, x)',x0:0,x1:40,label:'$1000 over the years'}}],{accent:'#54d6a0',store:'live',icon:'💰'});
  mkProd('Quiz Card',[{type:'text',props:{text:'**Q.** Var of a fair coin flip (0/1)?'}}],
    {container:{flip:true},back:[
      {type:'choice',props:{q:'Pick the variance:',options:'0.25\n0.5\n1',key:'pick',explanation:'Var = p(1−p) = **0.25**'}}],
     rules:{answer:0},store:'practice'});

  const fp=n=>P.find(p=>p.name===n);
  const place=(prod,w,content={})=>({id:uid('f'),name:baseName(prod.name),slots:clone(prod.slots),back:prod.back?clone(prod.back):undefined,container:clone(prod.container),rules:clone(prod.rules),accent:prod.accent||'',variety:varLabel(prod.name)||'1',place:{w:w||(prod.slots[0]?12:6)},content,tag:[],state:{}});

  if(CLEAN_MODE){
    // first-run lands in Study on ONE live, deletable example — the reactive "aha" before any building
    const sl=(t,p)=>({id:uid('s'),w:12,verbs:{},type:t,props:p});
    const example={id:uid('f'),name:'Try me',slots:[
      sl('text',{text:'## A live card\nDrag the slider — the number and chart react instantly. This whole card is one shareable file: hit **Share** and it opens anywhere, no app. Switch to **✏️ Edit** to change it, or delete it and build your own.'}),
      sl('slider',{key:'n',min:0,max:12,value:3,step:1,showName:true,showValue:true,showSlider:true}),
      sl('compute',{expr:'n*n',note:'n squared ='}),
      sl('chart',{fn:'n*x',x0:0,x1:10,y0:0,y1:120,xticks:5,yticks:4,hover:true,label:'y = n · x'}),
    ],container:{flip:false,look:'card',bare:false},rules:{},accent:'',variety:'1',place:{w:12},content:{},tag:[],state:{}};
    const start={id:uid('r'),name:'Start here',kind:'mixed',locked:false,services:{pin:true},categories:[],notes:[],title:'## Start here',subtitle:'Drag the slider below. Switch to ✏️ Edit to build · 📖 Study to read.',cards:[example]};
    const ch={ id:uid('h'), name:'My Notebook', subtitle:'', width:'medium', cats:[], rooms:[start], active:start.id };
    return { place:'house', studyOn:true, stores, products:P, factory:{benches:[freshBench()],active:null,study:false}, houses:[ch], activeHouse:ch.id, templates:[], _undo:[],_redo:[] };
  }

  const welcomeNote=fp('Note');
  const welcome={id:uid('r'),name:'Welcome',kind:'mixed',locked:false,services:{pin:true},categories:[],notes:[],
    title:'## 👋 Welcome',subtitle:'Your living notebook — ✏️ Edit to build, 📖 Study to read.',
    cards:[
      place(welcomeNote,12,{[welcomeNote.slots[0].id]:{text:'**Welcome.** This is your space — a living notebook you assemble from a small kit.\n\nIn **✏️ Edit**, open the **🛒 Store** and drag a product into a room, or click any text to write. Switch to **📖 Study** to read it as a clean note. Build your own products in the **🏭 Factory**.\n\nThe flashcard below is a real card — click it to flip. Delete it and make this space yours.'}}),
      place(fp('Flashcard'),6),
    ]};
  const dcard=(nm,slots,w)=>({id:uid('f'),name:nm,slots:slots.map(x=>Object.assign({id:uid('s'),w:12,verbs:{}},x)),container:{flip:false,look:'card',bare:true},rules:{},accent:'',variety:'1',place:{w:w||12},content:{},tag:[],state:{}});
  const demo={id:uid('r'),name:'Reactive demo',kind:'mixed',locked:false,services:{pin:true},categories:[],notes:[],
    title:'## 🔗 One card, live math',subtitle:'Sliders, formulas and charts in the same card wire together. Drag in **📖 Study**, and hover the chart.',
    cards:[
      dcard('revenue explorer',[
        {type:'text',props:{text:'**Sliders define variables** (`price`, `qty`) **for this card.** The formula and chart below read them. Drag a slider in 📖 Study — revenue updates live. Hover the chart for (x, f(x)). Set the variable name, range & formula in ✏️ Edit.'}},
        {type:'slider',props:{key:'price',min:0,max:200,value:50,step:5},w:6},
        {type:'slider',props:{key:'qty',min:0,max:20,value:3,step:1},w:6},
        {type:'compute',props:{expr:'price * qty',note:'revenue $ ='}},
        {type:'chart',props:{fn:'price * x',x0:0,x1:20,y0:0,y1:4000,xticks:4,yticks:4,hover:true,label:'revenue vs quantity (slope = price)'}},
      ],12),
    ]};
  const h1={ id:uid('h'), name:'My Space', subtitle:'Your living notebook — ✏️ Edit to build · 📖 Study to read.', width:'medium', cats:[], rooms:[welcome, demo], active:welcome.id };

  const tplRoom={id:uid('r'),name:'Vocabulary',kind:'mixed',locked:false,services:{pin:true,shuffle:true,flipAll:true,reset:true},categories:[],notes:[],cards:[
    place(fp('Flashcard'),6), Object.assign(place(fp('Flashcard'),6),{accent:'#54d6a0',variety:'Mint'}) ]};
  const tpl={ id:'tpl-lang', name:'Language Starter', width:'medium', cats:[], rooms:[tplRoom], active:tplRoom.id };
  return {
    place:'house', studyOn:true,
    stores, products:P,
    factory:{ benches:[freshBench()], active:null, study:false },
    houses:[h1], activeHouse:h1.id,
    templates:[tpl],
    _undo:[], _redo:[]
  };
}
/* App themes are a fixed built-in set: the registry is code, only the CHOICE (DB.theme) is data. */
const THEMES=[ {id:'',chip:'Dark',name:'Dark (default)'},{id:'plain',chip:'B&W',name:'Black & White (plain)'},
  {id:'mono',chip:'Graphite',name:'Graphite (minimal)'},{id:'study',chip:'Tomoé',name:'Tomoé (stationery)'},
  {id:'sketch',chip:'Sketch',name:'Sketch (paper)'},{id:'aurora',chip:'Aurora',name:'Aurora (fantasy)'},
  {id:'cyber',chip:'Cyber',name:'Cyberpunk (Arc-Flash)'} ];
window.THEMES=THEMES;
const SCHEMA_VERSION=4;   // written on every export; bump on breaking data-shape changes (2: card-scoped vars; 3: number folded into slider; 4: progress is a completion meter, rollup folded in)
const DEAD_SLOTS=['divider','link','board'];
// SECURITY: room/card/slot ids and variable keys are interpolated into data-* attributes at render
// time (50-render / 60-stage). Untrusted notebooks (imported JSON, a shared .html seed) must not carry
// ids that break out of an attribute into markup. Normalize on every load/import/seed path — idempotent
// for the safe uid-shaped ids legit data always has, so it never churns real notebooks.
const ATTR_ID=/^[A-Za-z0-9_-]+$/;
const ATTR_UNSAFE=/["'<>`]/;   // chars that could break out of a double/single-quoted attribute
const safeId=(x,p)=>ATTR_ID.test(String(x))?String(x):uid(p);
const safeVarKey=(x)=>{ const s=String(x==null?'':x); return ATTR_ID.test(s)?s:s.replace(/[^A-Za-z0-9_]/g,''); };
const safeAccent=(x)=>ATTR_UNSAFE.test(String(x))?'':x;   // accents are hex colors (#rrggbb) or palette keys — keep them, drop only attribute-breakers
function sanitizeCardIds(c){ c.id=safeId(c.id,'f');
  if(c.accent!=null) c.accent=safeAccent(c.accent);
  const map={};
  [c.slots,c.back].forEach(arr=>(arr||[]).forEach(s=>{ if(!s)return;
    const nid=safeId(s.id,'s'); if(nid!==s.id){ map[s.id]=nid; s.id=nid; }
    if(s.props){ if(s.props.key!=null)s.props.key=safeVarKey(s.props.key); if(s.props.out!=null)s.props.out=safeVarKey(s.props.out); }
    if(s.verbs&&s.verbs.reveal&&s.verbs.reveal.key!=null)s.verbs.reveal.key=safeVarKey(s.verbs.reveal.key); }));
  if(Object.keys(map).length){   // a slot id changed → carry content/progress keyed by the old slot id
    if(c.content){ const nc={}; for(const k in c.content)nc[map[k]||k]=c.content[k]; c.content=nc; }
    if(c.state&&c.state._done){ const nd={}; for(const k in c.state._done)nd[map[k]||k]=c.state._done[k]; c.state._done=nd; } }
  (c.varieties||[]).forEach(v=>{ if(v&&v.accent!=null)v.accent=safeAccent(v.accent); }); }
function migrateSlot(s){ if(!s)return; if(s.type==='check'){ s.type='list'; s.props=Object.assign({style:'check'},s.props); } else if(s.type==='list'&&!s.props.style){ s.props.style='bullets'; }
  // number folded into slider (schemaVersion 3): bar off, empty range (free entry); old `showValue` meant "show the NAME label"
  else if(s.type==='number'){ const p=s.props||{}; s.type='slider'; s.props={key:p.key,value:p.value,step:p.step,min:'',max:'',showSlider:false,showName:p.showValue!==false,showValue:true}; }
  // heading dropped: a card has no section heading — fold into text, keeping the heading look as markdown
  else if(s.type==='heading'){ const txt=(s.props&&s.props.text)||''; s.type='text'; s.props=Object.assign({},s.props,{text:/^\s*#/.test(txt)?txt:'## '+txt}); }
  // progress redesign (schemaVersion 4): rollup → a completion meter; old key-reading progress → a live text readout
  else if(s.type==='rollup'){ const p=s.props||{}; s.type='progress'; s.props={label:p.label||'Progress',scope:'section',track:(p.metric==='tagged'&&p.tag)?[p.tag]:[],show:{mn:true,pct:true,bar:true}}; }
  else if(s.type==='progress'&&s.props&&s.props.key!=null&&s.props.scope==null){ const p=s.props; s.type='text'; s.props={text:(p.label?md(p.label).replace(/<[^>]+>/g,'')+': ':'')+'**{{'+p.key+'}}**'}; } }
function migrateCard(c){ if(c.slots)c.slots=c.slots.filter(s=>!s||!DEAD_SLOTS.includes(s.type)); if(c.back)c.back=c.back.filter(s=>!s||!DEAD_SLOTS.includes(s.type)); (c.slots||[]).forEach(migrateSlot);(c.back||[]).forEach(migrateSlot);
  [c.slots,c.back].forEach(arr=>{ if(!arr)return; arr.forEach((s,i)=>{ if(s&&s.fuse&&s.fuseRatio!=null){ const ra=s.fuseRatio; s.fuseW=Math.round(ra*100)/100; if(arr[i+1]&&arr[i+1].fuseW==null)arr[i+1].fuseW=Math.round((1-ra)*100)/100; delete s.fuseRatio; } }); });
  sanitizeCardIds(c); }
function migrateHouse(h){ delete h.style; delete h.schemaVersion; h.cats=h.cats||[]; h.rooms=h.rooms||[];
  h.id=safeId(h.id,'h');
  const rmap={};
  h.rooms.forEach(r=>{ r.services=r.services||{}; r.cards=r.cards||[]; r.state=r.state||{}; const nid=safeId(r.id,'r'); if(nid!==r.id){ rmap[r.id]=nid; r.id=nid; } });   // hand-authored files may omit structural fields; ids normalized for attribute safety
  if(h.active!=null) h.active=rmap[h.active]||h.active;
  (h.rooms||[]).forEach(r=>(r.cards||[]).forEach(c=>{ c.state=c.state||{}; c.content=c.content||{}; c.tag=c.tag||[]; c.container=c.container||{}; c.rules=c.rules||{}; c.place=c.place||{w:8}; migrateCard(c);
    if(c.state) PRES_KEYS.forEach(k=>delete c.state[k]);
    if(c.state&&c.state._done&&Object.keys(c.state._done).some(k=>/^\d+$/.test(k))){ const tgt=(c.slots||[]).concat(c.back||[]).find(s=>s&&s.type==='list'&&s.props&&s.props.style==='check'); c.state._done=tgt?{[tgt.id]:c.state._done}:{}; }
    if(c.state&&c.state._pin){ c.tag=c.tag||[]; if(!c.tag.includes('pinned'))c.tag.push('pinned'); h.cats=h.cats||[]; if(!h.cats.includes('pinned'))h.cats.push('pinned'); delete c.state._pin; } })); }
function rebuildRefs(){ DB.house=DB.houses.find(h=>h.id===DB.activeHouse)||DB.houses[0]; DB.activeHouse=DB.house.id;
  delete DB.themes;   // themes live in code
  (DB.products||[]).forEach(p=>{ if(p.store===undefined) p.store=(p.shop!==undefined?p.shop:((p.shops&&p.shops[0])||null)); delete p.shop; delete p.shops; }); // one store per product (migrates legacy shop / shops[])
  if((DB.stores||[]).some(s=>s.id==='core'||s.id==='fun')){ DB.stores=[{id:'write',name:'Write',icon:''},{id:'practice',name:'Practice',icon:''},{id:'live',name:'Live',icon:''}]; const SMAP={core:'practice',fun:'live'}; (DB.products||[]).forEach(p=>{ if(SMAP[p.store])p.store=SMAP[p.store]; }); } // Core/Fun lanes retired
  // SECURITY: store ids also reach data-* attributes (storeSection / inventory lane) and ride in a shared .html seed — normalize them too, remapping product→store refs. (see sanitizeCardIds)
  { const smap={}; (DB.stores||[]).forEach(s=>{ if(!s)return; const nid=safeId(s.id,'st'); if(nid!==s.id){ smap[s.id]=nid; s.id=nid; } }); if(Object.keys(smap).length)(DB.products||[]).forEach(p=>{ if(smap[p.store])p.store=smap[p.store]; }); }
  (DB.houses||[]).forEach(migrateHouse);
  (DB.templates||[]).forEach(migrateHouse);   // templates are house-shaped; normalize their ids/keys too — instantiation (nbcreate) clones their cards into a live notebook
  { (DB.products||[]).forEach(migrateCard); ((DB.factory&&DB.factory.benches)||[]).forEach(migrateCard);
    DB.products=(DB.products||[]).filter(p=>(p.slots||[]).length); } // checklist merged into list (style:'check'); divider/link/board slots retired
  // Raw single-slot primitives (Slider/Number/Formula/Chart) were store products built for cross-card
  // wiring; under card scope a lone Formula/Chart can't wire to anything. They live as Factory slots, not
  // store products. Remove the auto-injected ones (generic shape only — a renamed/edited custom is kept).
  { const GEN=new Set(['slider','number','formula','chart']); DB.products=(DB.products||[]).filter(p=>!(GEN.has(baseKey(p.name)) && (p.slots||[]).length===1 && !(p.note||'').trim())); }
  if(DB.stores)DB.stores=DB.stores.filter(s=>s.id!=='theme');
  if(!DB.factory)DB.factory={benches:[freshBench()],active:null,study:false};
  if(!DB.factory.benches.length)DB.factory.benches.push(freshBench());
  if(!DB.factory.active||!DB.factory.benches.some(b=>b.id===DB.factory.active))DB.factory.active=DB.factory.benches[0].id;
  DB.bench=DB.factory.benches.find(b=>b.id===DB.factory.active);
  if(DB.theme===undefined)DB.theme='';
  if(!DB._undo)DB._undo=[]; if(!DB._redo)DB._redo=[]; delete DB._saved; } // history is session-volatile (not persisted) — re-init after load/export-seed
function load(){ try{DB=JSON.parse(localStorage.getItem(DBKEY))||seed();}catch(e){DB=seed();} rebuildRefs(); }
let saveFailWarned=false;
function save(){ if(EXPORT_MODE)return; try{localStorage.setItem(DBKEY,JSON.stringify(stripVol(DB))); saveFailWarned=false;}catch(e){ if(!saveFailWarned){ toast('⚠ Storage full — changes are NOT saved and will be lost on reload. Export (⤓) your notebook now.'); saveFailWarned=true; } } }
function stripVol(d){const c=clone(d); delete c.house; delete c.bench; delete c._undo; delete c._redo;
  (c.houses||[]).forEach(h=>(h.rooms||[]).forEach(r=>(r.cards||[]).forEach(cd=>{ if(cd.state) PRES_KEYS.forEach(k=>delete cd.state[k]); })));   // presentation is structurally unable to persist
  return c;} // never persist undo history (was bloating saves 60× → silent quota loss)

const snapState=()=>JSON.stringify({houses:DB.houses,products:DB.products,stores:DB.stores,activeHouse:DB.activeHouse,factory:DB.factory,theme:DB.theme});
function pushHistory(){ DB._undo.push(snapState()); if(DB._undo.length>60)DB._undo.shift(); DB._redo.length=0; }
let editSession=false; function beginEdit(){ if(!editSession){ pushHistory(); editSession=true; } }  // one undo step per in-place edit session (first keystroke snapshots; blur ends it)
// the undoable lifecycle in one place: snapshot → mutate → persist → repaint. NOT for no-history toggles or focus-preserving live edits (those keep their own save()/refreshFurn).
function commit(mutate){ editSession=false; pushHistory(); mutate(); save(); render(); }
function pushSnap(snap){ DB._undo.push(snap); if(DB._undo.length>60)DB._undo.shift(); DB._redo.length=0; }   // gesture undo: snapshot taken at pointer-down, pushed once on release
function healFuse(arr){ if(arr&&arr.length&&arr[arr.length-1]&&arr[arr.length-1].fuse) arr[arr.length-1].fuse=false; }   // a chain's tail can never dangle
function undo(){ editSession=false; if(!DB._undo.length)return toast('nothing to undo'); DB._redo.push(snapState()); Object.assign(DB,JSON.parse(DB._undo.pop())); rebuildRefs(); save(); render(); toast('undo'); }
function redo(){ editSession=false; if(!DB._redo.length)return toast('nothing to redo'); DB._undo.push(snapState()); Object.assign(DB,JSON.parse(DB._redo.pop())); rebuildRefs(); save(); render(); toast('redo'); }

const room=()=>DB.house.rooms.find(r=>r.id===DB.house.active)||DB.house.rooms[0];

/* Study state has three layers — document (props/content/rules/tags/_arch: persists, exports),
   progress (answers _qsel/_qdone/picks, ticks _done: persists locally, never exports, cleared only by Reset),
   presentation (PRES_KEYS + LIVE/SHUF: session-only — stripped at save, cleared on every Study entry). */
const PRES_KEYS=['_flip','_qord'];                       // presentation: session-only, stripped at save
const DOC_STATE_KEYS=['_arch'];                          // document-layer state: persists AND exports
const keepDocState=c=>{ const k={}; DOC_STATE_KEYS.forEach(x=>{ if(c.state&&c.state[x]!==undefined)k[x]=c.state[x]; }); c.state=k; };   // everything else in state = progress (answers/ticks/dynamic pick keys)
function resetPresentation(){ LIVE={}; SHUF={}; DB.houses.forEach(h=>(h.rooms||[]).forEach(r=>(r.cards||[]).forEach(c=>{ if(c.state) PRES_KEYS.forEach(k=>delete c.state[k]); }))); }
