/* ====================== RENDER ====================== */
function render(){
  document.body.dataset.theme = DB.theme||'';
  document.body.classList.toggle('side-collapsed', !!view.sideCollapsed);
  { let b=document.getElementById('sidebump'); if(!b){ b=document.createElement('button'); b.id='sidebump'; document.body.appendChild(b); } b.dataset.act='sidetoggle'; b.textContent=view.sideCollapsed?'›':'‹'; b.title=view.sideCollapsed?'show the panel':'hide the panel'; }
  renderTop(); renderSide(); renderStage(); renderModal();
  window.DB=DB;
}
// handed to an LLM so it can author a notebook JSON the app imports directly (the primary authoring path)
const AI_PROMPT=`Write a NoteBuilder notebook as JSON. Shape:
{ "name":"Title", "subtitle":"optional", "rooms":[ { "id":"r1", "name":"Room", "title":"## optional markdown heading", "cards":[ CARD ] } ] }
CARD = { "id":"f1", "name":"Card", "container":{"flip":false,"bare":false}, "rules":{}, "tag":[], "slots":[ SLOT ] }
SLOT = { "id":"s1", "type": one of text|list|choice|slider|compute|chart|progress|rollup, "props":{...}, "verbs":{} }
props by type:
- text: { "text":"markdown — ## heading, **bold**, $x^2$ math, | a | b | tables, {{key}} for a live value" }
- list: { "title":"", "items":"one\\nper\\nline", "style":"bullets|numbered|check" }
- choice: { "q":"question", "options":"a\\nb\\nc", "key":"pick", "explanation":"" } AND set the card's "rules":{"answer":<correct index>}
- slider: { "key":"x", "min":0, "max":10, "value":5, "step":1, "showSlider":true } — hide the bar (showSlider:false) + omit min/max for a free number box
- compute: { "expr":"x*x", "note":"label =", "out":"optional var other formulas read" }
- chart: { "fn":"x*x", "x0":0,"x1":10,"y0":0,"y1":100, "hover":true, "label":"caption" }
- progress: { "label":"", "key":"x", "max":100 }
IMPORTANT: variables are CARD-scoped. A compute/chart/progress only sees slider keys defined IN THE SAME CARD. To wire a slider to a formula and chart, put all three in one card. Return ONLY the JSON.`;
function renderModal(){ const m=$('#modal'); if(!m)return;
  if(view.newNb){ const nb=view.newNb; m.style.display='flex';
    m.innerHTML=`<div class="modal-box"><h3 style="margin:0 0 8px">＋ New notebook</h3>
    <div class="palette" style="margin:8px 0">${[{id:'',name:'📄 Plain (empty)'}].concat(DB.templates.map(t=>({id:t.id,name:'📦 '+t.name}))).map(o=>`<button class="chip ${(nb.tpl||'')===o.id?'on':''}" data-act="nbtpl" data-id="${esc(o.id)}">${esc(o.name)}</button>`).join('')}</div>
    <div class="kv"><label>Title</label><input data-act="nbtitle" value="${esc(nb.title||'')}" placeholder="notebook title"></div>
    <div class="kv"><label>Subtitle</label><input data-act="nbsub" value="${esc(nb.sub||'')}" placeholder="optional"></div>
    <div class="kv" style="align-items:flex-start;margin-top:6px"><label title="Paste a notebook JSON (e.g. authored by an LLM). If filled, this is used instead of the scaffold.">From JSON / AI</label><textarea rows="3" data-act="nbjson" placeholder="paste notebook JSON here — or Copy AI prompt, hand it to an LLM, paste its JSON back">${esc(nb.json||'')}</textarea></div>
    <div class="row" style="margin-top:4px"><button class="btn sm" data-act="nbprompt" title="Copy a schema prompt to your clipboard for an LLM">⎘ Copy AI prompt</button><span class="muted sm">paste valid JSON, then Create</span></div>
    <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn" data-act="nbcancel">Cancel</button><button class="btn primary" data-act="nbcreate">Create</button></div></div>`;
    return; }
  if(!view.sealId){ m.style.display='none'; m.innerHTML=''; return; }
  const b=DB.factory.benches.find(x=>x.id===view.sealId); if(!b){ view.sealId=null; m.style.display='none'; m.innerHTML=''; return; }
  const d=view.sealDraft; m.style.display='flex';
  m.innerHTML=`<div class="modal-box"><h3 style="margin:0 0 8px">🔒 Seal — confirm</h3>
    <div class="prev-wrap" style="margin:8px 0"><div class="furn" style="--w:12${b.accent?';--cardc:'+esc(b.accent):''}"><div class="body">${cardInner(toFurn(benchToProd(b)),false,null)}</div></div></div>
    <div class="kv"><label>Name</label><input data-act="sealname" value="${esc(d.name)}"></div>
    <div class="kv" style="align-items:flex-start"><label title="store & card icon — blank = first letter of the name">Icon <span class="muted sm">(${prodIcon({name:d.name,icon:d.icon})})</span></label><div>
      <div class="palette" style="margin:0 0 4px"><button class="chip xs ${!d.icon?'on':''}" data-act="sealicon" data-ic="" title="auto: first letter of the name">Aa</button>${PROD_ICONS.map(ic=>`<button class="chip xs ${d.icon===ic?'on':''}" data-act="sealicon" data-ic="${esc(ic)}">${ic}</button>`).join('')}</div>
      <input data-act="sealiconfree" value="${esc(d.icon||'')}" maxlength="2" placeholder="or type a letter / emoji" style="width:12em"></div></div>
    <div class="kv" style="align-items:flex-start"><label>Maker note</label><span style="flex:1">${ceText('seal:note',d.note,mdInline(d.note||''),'data-act="sealnote"','optional · markdown + $math$','','')}</span></div>
    <div class="muted sm" style="margin-top:6px">Store:</div>
    <div class="palette" style="margin:6px 0">${DB.stores.filter(s=>s.id!=='theme').map(s=>`<button class="chip ${d.store===s.id?'on':''}" data-act="sealship" data-s="${s.id}">${s.icon} ${esc(s.name)}</button>`).join('')}</div>
    <div class="muted sm" style="margin-top:6px">Varieties:</div>
    ${(d.varieties||[]).map((v,i)=>`<div class="row" style="gap:6px;margin:3px 0"><input data-act="varname" data-i="${i}" value="${esc(v.name||'')}" placeholder="variety name" style="width:9em">${VAR.filter(x=>x.accent).map(x=>`<button class="chip xs ${v.accent===x.accent?'on':''}" data-act="varaccent" data-i="${i}" data-c="${x.accent}" title="${esc(x.name)}" style="background:${x.accent}">&nbsp;</button>`).join('')}<button class="btn sm ghost" data-act="vardel" data-i="${i}">✕</button></div>`).join('')}
    <div style="margin:4px 0 2px"><button class="btn sm" data-act="varadd">＋ variety</button></div>
    ${view.sealConflict?`<div class="row" style="margin-top:10px"><span class="spacer"></span><button class="btn" data-act="sealcancel">Cancel</button><button class="btn" data-act="sealnew">Seal as new</button><button class="btn primary" data-act="sealreplace">Replace original</button></div></div>`
    :`<div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn" data-act="sealcancel">Cancel</button><button class="btn primary" data-act="sealconfirm">🔒 Confirm seal</button></div></div>`}`;
}

const WIDTHS=[['narrow','Narrow'],['medium','Medium'],['wide','Wide']];
const SVCSIZES=[['sm','Small'],['md','Medium'],['lg','Large']];
const REVOPS=['==','!=','>=','<=','>','<'];

function pickGroup(act,opts,cur,extra){ return `<div class="palette">`+opts.map(o=>{const v=Array.isArray(o)?o[0]:o, l=Array.isArray(o)?o[1]:o, dis=Array.isArray(o)&&o[2]; return `<button class="chip ${String(cur)===String(v)?'on':''}" data-act="${act}" data-v="${esc(v)}"${dis?' disabled':''}${extra?' '+extra:''}>${esc(l)}</button>`;}).join('')+`</div>`; }

function renderTop(){
  const P=$('#places'); const place=DB.place;

  document.body.classList.toggle('top-hidden', !!view.topHide);
  { let b=document.getElementById('topbump'); if(!b){ b=document.createElement('button'); b.id='topbump'; document.body.appendChild(b); } b.dataset.act='tophide'; b.textContent=view.topHide?'˅':'˄'; b.title=view.topHide?'show the top bar':'hide the top bar — focus on the note';
    const tp=document.getElementById('top'); b.style.top=(view.topHide?0:(tp?tp.offsetHeight:57)-1)+'px'; }
  const cur=DB.houses.find(hh=>hh.id===DB.activeHouse)||DB.houses[0];
  const ct=THEMES.find(t=>t.id===(DB.theme||''))||THEMES[0];
  const themeMenu = `<span class="themewrap"><button class="btn" data-act="thememenu" title="App theme — applies everywhere">🎨 ${esc(ct.chip)} ▾</button>${view.themeMenu?`<div class="nbmenu thememenu">${THEMES.map(t=>`<button class="nbitem ${(DB.theme||'')===t.id?'on':''}" data-act="settheme" data-id="${t.id}">${esc(t.name)}</button>`).join('')}</div>`:''}</span>`;
  // Reader mode: a shared file is locked to reading — name + theme + a single Remix escape hatch, no authoring chrome.
  if(DB.shared){ DB.studyOn=true; P.innerHTML = themeMenu + `<span class="brand-nb" title="a shared notebook">📓 ${esc(cur.name||'Untitled')}</span>`; $('#topright').innerHTML = `<button class="btn sm primary" data-act="remix" title="Edit your own copy in this file (changes stay in this file)">✎ Remix</button>`; return; }
  P.innerHTML = themeMenu
    + `<button class="btn ${place==='factory'?'on':''}" data-act="place" data-k="factory">🏭 Factory</button>`
    + `<span class="nbwrap"><button class="btn ${place==='house'?'on':''}" data-act="nbmenu" title="switch notebook">📓 ${esc(cur.name||'Untitled')} ▾</button>${view.nbMenu?`<div class="nbmenu">${DB.houses.map(hh=>`<button class="nbitem ${hh.id===DB.activeHouse?'on':''}" data-act="gohouse" data-id="${hh.id}">📓 ${esc(hh.name||'Untitled')}</button>`).join('')}</div>`:''}</span>`
    + `<button class="btn" data-act="newnb" title="New notebook">＋</button>`;
  const TR=$('#topright');

  // Mode + structural-add controls live here (always reachable), not in the scrollable stage. Add
  // buttons show only in the building mode of each place; never in Study/Preview.
  const modeBtns = place==='house'
   ? viewToggle('hmode',DB.studyOn,'Edit','Study') + (DB.studyOn?'':` <button class="btn sm" data-act="addroom">＋ section</button> <button class="btn sm" data-act="adddivider" title="a chapter heading folds the sections under it">＋ chapter</button>`)
   : viewToggle('facmode',DB.factory.study,'Build','Preview') + (DB.factory.study?'':` <button class="btn sm" data-act="addbench" title="Add a new product container">＋ container</button>`);
  const placeBtns = place==='house'
   ? `<button class="btn primary share-btn" data-act="camera" title="Save this notebook as one living HTML file — opens anywhere, fully interactive, no app needed">Share</button><span class="util-grp"><button class="btn sm ghost" data-act="export" title="Backup as JSON (data only)">⤓</button><button class="btn sm ghost" data-act="import" title="Import a notebook JSON">⤒</button><button class="btn sm ghost" data-act="pdf" title="Print / Save as PDF">🖨</button></span>`
   : '';
  TR.innerHTML = modeBtns + `<span style="width:10px;display:inline-block"></span>` + histBar() + `<span style="width:8px;display:inline-block"></span>` + placeBtns;
}

function histBar(){ return `<button class="btn sm" data-act="undo" title="Undo" ${DB._undo&&DB._undo.length?'':'disabled style="opacity:.4"'}>↶</button>`
  +`<button class="btn sm" data-act="redo" title="Redo" ${DB._redo&&DB._redo.length?'':'disabled style="opacity:.4"'}>↷</button>`
; }

function renderSide(){ const _fit=()=>setTimeout(fitPreview,0); _fit();
  const S=$('#side');
  if(DB.place==='factory'){ S.innerHTML=sideFactory(); return; }
  if(DB.studyOn){ S.innerHTML=`<div class="sect"><h3 title="Reading mode — interact with cards, filter by 🏷 tag, collapse rooms. Switch to ✏️ Edit to change things.">📖 Study</h3></div>`; return; }
  S.innerHTML=houseEditPanel();
}

function findCard(id){ for(const rm of DB.house.rooms){const c=rm.cards.find(x=>x.id===id); if(c)return {card:c,room:rm};} return null; }
function sectionOps(){
  const r=room(); if(!r||r.kind==='divider')return '';
  const folded=view.fold['secops'];
  let h=`<div class="store-lane"><h4 data-act="fold" data-s="secops" style="cursor:pointer" title="Operations for the current section — enabled ones appear in 📖 Study.">${folded?'▸':'▾'} ⚙ Section ops <span class="muted sm">${esc(r.name)}</span></h4>`;
  if(!folded) h+=`<div class="palette" style="margin:6px 0">`+Object.entries(SERVICES).map(([k,svc])=>{ const cap=(k!=='flipAll')||r.cards.some(c=>c.container&&c.container.flip); return `<button class="chip ${r.services[k]?'on':''}" draggable="${cap}" data-svcdrag="${k}" data-act="svc" data-k="${k}" data-id="${r.id}" title="click to toggle, or drag onto the room" ${cap?'':'disabled title="needs a flip card"'}>${svc.icon} ${svc.label}</button>`; }).join('')+`</div>`;
  return h+`</div>`;
}
function houseEditPanel(){
  let h=storeSection()+tagsSection()+sectionOps();

  if(selProd){ const p=DB.products.find(x=>x.id===selProd); if(p){ h+=productDetail(p); return h; } selProd=null; }

  if(sel){ const f=findCard(sel); if(f){ h+=sideFurnInspector(f.card,f.room); return h; } sel=null; }

  if(selKind==='house'){ h+=notebookPanel(); return h; }

  h+=roomContext(room()); return h;
}

function prodIcon(p){ if(p&&p.icon)return p.icon; const b=baseName(p&&p.name||''); return b?b.charAt(0).toUpperCase():'📦'; }
const PROD_ICONS=['📊','📈','🎲','🪙','📐','🧮','🔑','📌','🃏','❓','✅','📝','🔗','📚','🔬','🎯','💡','🧠','⚡','∑','∫','∂','√','π','σ','μ','λ','∞','◆','●','▲','★','♦','✦'];
function storeSection(){
  let h=`<div class="sect"><h3 title="Drag a product into a room, or click it for detail">🛒 Store</h3>`;
  DB.stores.forEach(st=>{ const folded=view.fold[st.id]; const groups=groupStore(st.id);
    h+=`<div class="store-lane"><h4 data-act="fold" data-s="${st.id}" style="cursor:pointer" title="collapse / expand">${folded?'▸':'▾'} ${st.icon} ${esc(st.name)} <span class="muted sm">${groups.length}</span></h4>`;
    if(!folded){ if(!groups.length)h+=`<div class="muted sm">—</div>`;
      else h+=`<div class="palette">`+groups.map(g=>{ const def=g.items[0]; const multi=g.items.length>1; return `<button class="chip prodchip ${g.items.some(it=>it.id===selProd)?'on':''}" data-prod="${def.id}" data-act="selprod" data-id="${def.id}" title="${esc(g.base)} — drag into a room, click for detail">${prodIcon(def)} ${esc(g.base)}${multi?` <span class="tag">×${g.items.length}</span>`:''}</button>`;}).join('')+`</div>`;
    }
    h+=`</div>`;
  });
  return h+`</div>`;
}

function applyDraft(p){ const d=view.pdraft||{}; const c=clone(p); (c.slots||[]).forEach(s=>{ if(d[s.id])s.props=Object.assign({},s.props,d[s.id]); }); return c; }
function productDetail(p){
  const items=DB.products.filter(x=>baseKey(x.name)===baseKey(p.name));
  let h=`<div class="sect"><h3>${esc(baseName(p.name))} <button class="btn sm ghost" data-act="closedetail" style="float:right">close</button></h3>`;
  if(p.note) h+=`<div class="note-deco" style="border-style:solid;border-color:var(--accent)"><b>from the maker</b> — ${md(p.note)}</div>`;
  if(items.length>1){ h+=`<div class="muted sm">Variety:</div><div class="palette" style="margin:6px 0">`+items.map((it,i)=>`<button class="chip ${it.id===p.id?'on':''}" data-prod="${it.id}" data-act="selprod" data-id="${it.id}">${esc(varLabel(it.name)||String(i+1))}</button>`).join('')+`</div>`; }

  let cf='';
  (p.slots||[]).forEach(s=>{ const def=SLOTS[s.type]; if(!def||!def.fields.length)return;
    def.fields.forEach(([key,lab,kind])=>{ if(['key','min','max','value','step','target','metric','expr','fn','x0','x1','y0','y1','xticks','yticks','out','note','showName','showValue','showSlider','hover'].includes(key))return;
      const val=(view.pdraft[s.id]&&view.pdraft[s.id][key]!=null)?view.pdraft[s.id][key]:s.props[key];
      cf+=`<div class="kv" style="align-items:flex-start"><label title="${esc(lab)}">${esc(lab)}</label>`+(kind==='area'?`<textarea rows="2" data-act="pdraft" data-s="${s.id}" data-key="${key}">${esc(val)}</textarea>`:`<input data-act="pdraft" data-s="${s.id}" data-key="${key}" value="${esc(val)}">`)+`</div>`; }); });
  if(cf) h+=`<div class="muted sm" style="margin-top:6px">Your content:</div>`+cf;

  if(!view.prevFurn||view.prevFurn._pid!==p.id) view.prevFurn=Object.assign(toFurn(applyDraft(p)),{_pid:p.id,state:{}});
  else view.prevFurn=Object.assign(toFurn(applyDraft(p)),{_pid:p.id,state:view.prevFurn.state});
  h+=`<div class="row" style="margin-top:10px"><b class="sm">Live preview</b><span class="spacer"></span>${viewToggle('prevmode',view.prevStudy,'edit','study')}</div>`;
  const pv=(p.varieties&&p.varieties.length)?(p.varieties.find(v=>v.name===((view.prodVariety&&view.prodVariety.pid===p.id)?view.prodVariety.v:null))||p.varieties[0]):null;
  const pacc=(pv&&pv.accent)||p.accent;
  h+=`<div class="prev-wrap"><div class="prev-stage"><div class="furn prev-card${p.container&&p.container.bare?' bare':''}" data-prod="${p.id}" data-fid="__prev" style="--w:12${pacc?';--cardc:'+esc(pacc):''}"><div class="body">${cardInner(view.prevFurn,view.prevStudy,null)}</div></div></div></div>`;
  if(p.varieties&&p.varieties.length){ const cur=(view.prodVariety&&view.prodVariety.pid===p.id)?view.prodVariety.v:p.varieties[0].name;
    h+=`<div class="kv" style="margin-top:6px"><label>Variety</label><span class="palette" style="display:inline-flex;gap:4px">${p.varieties.map(v=>`<button class="chip ${cur===v.name?'on':''}" data-act="pickvariety" data-v="${esc(v.name)}" style="${v.accent?'box-shadow:inset 3px 0 0 '+esc(v.accent):''}">${esc(v.name)}</button>`).join('')}</span></div>`; }
  h+=`<div style="margin-top:8px"><button class="btn primary" data-act="placeprod" data-id="${p.id}">＋ Place in ${esc(room().name)}</button> <span class="muted sm">or drag the preview into a room</span></div>`;
  return h+`</div>`;
}

function tagsSection(){
  const cats=DB.house.cats||[]; const folded=view.fold['__tags__'];
  const selCard = sel && findCard(sel); const cardTags = selCard? (selCard.card.tag||[]) : null;
  let h=`<div class="store-lane"><h4 data-act="fold" data-s="__tags__" style="cursor:pointer" title="House tags — click a tag to tag the selected card; rename/delete updates every card.">${folded?'▸':'▾'} 🏷 Tags <span class="muted sm">${cats.length}</span></h4>`;
  if(!folded){
    h+= cats.length? `<div class="palette" style="margin:6px 0">`+cats.map(c=>`<span class="chip prodchip tagchip ${cardTags&&cardTags.includes(c)?'on':''}" draggable="true" data-tagdrag="${esc(c)}" ${cardTags?`data-act="ftag" data-c="${esc(c)}"`:''} title="${cardTags?'click to tag the selected card · ':''}drag onto a card · type to rename">🏷<input class="taginput" data-act="tagrename" data-old="${esc(c)}" value="${esc(c)}"><button class="tagx" data-act="tagdel" data-c="${esc(c)}" title="delete this tag everywhere">✕</button></span>`).join('')+`</div>` : `<div class="muted sm" style="margin:6px 0">none yet</div>`;
    h+=`<div class="row" style="margin-top:6px"><input id="newcat" placeholder="new tag…"><button class="btn sm" data-act="addcat" title="Create a tag">＋</button></div>`;
  }
  return h+`</div>`;
}

function notebookPanel(){
  let h=`<div class="sect"><h3>📓 Notebook</h3>`;
  h+=`<div class="kv" style="align-items:flex-start"><label>Width</label>${pickGroup('housewidth',WIDTHS,DB.house.width||'medium')}</div>`;
  h+=`<div style="margin-top:10px"><button class="btn sm warn" data-act="delnb">🗑 Delete notebook</button></div>`;
  return h+`</div>`;
}

function roomContext(r){
  let h=`<div class="sect"><h3>${r.kind==='divider'?'― Chapter':'▦ Section'}</h3>`;
  h+=`<div style="margin-top:12px"><button class="btn sm warn" data-act="delroom">🗑 Delete room</button></div>`;
  return h+`</div>`;
}

function sideFurnInspector(f,r){
  let h=`<div class="sect"><h3 title="Edit this placed card's content, width, variety, and tags. The product internals are sealed.">Card — ${esc(f.name)} <button class="btn sm ghost" data-act="deselect" style="float:right">close</button></h3>`;
  { const p=DB.products.find(x=>baseKey(x.name)===baseKey(f.name)); if(p&&p.varieties&&p.varieties.length){ h+=`<div class="kv"><label>Variety</label><span class="palette" style="display:inline-flex;gap:4px;flex-wrap:wrap">${p.varieties.map(v=>`<button class="chip ${f.variety===v.name?'on':''}" data-act="setvariety" data-v="${esc(v.name)}" style="${v.accent?'box-shadow:inset 3px 0 0 '+esc(v.accent):''}">${esc(v.name)}</button>`).join('')}</span></div>`; } }
  const vars=DB.products.filter(p=>baseKey(p.name)===baseKey(f.name));
  if(vars.length>1){ h+=`<div class="kv"><label>Variety</label></div><div class="palette" style="margin:0 0 8px">`+vars.map((p,i)=>`<button class="chip ${f.variety===(varLabel(p.name)||String(i+1))?'on':''}" data-act="fvar" data-id="${p.id}">${esc(varLabel(p.name)||String(i+1))}</button>`).join('')+`</div>`; }
  const contentFields=(slots)=>{ let g=''; (slots||[]).forEach(s=>{ const def=SLOTS[s.type]; if(!def)return;
    const cv=k=>{ const c=f.content[s.id]; const v=c&&c[k]!=null?c[k]:s.props[k]; return v!=null?v:''; };
    const numF=(k,w)=>`<input type="number" data-act="fc" data-s="${s.id}" data-key="${k}" value="${esc(cv(k))}" style="width:${w||5}em">`;
    const txtF=(k,ph)=>`<input data-act="fc" data-s="${s.id}" data-key="${k}" value="${esc(cv(k))}" placeholder="${esc(ph||'')}">`;
    const rangeRow=(lab,a,b)=>`<div class="kv"><label>${lab}</label><span class="row" style="gap:4px">${numF(a)}<span class="muted">–</span>${numF(b)}</span></div>`;
    const showGrp=items=>{ const eff=k=>{const c=f.content[s.id]; const vv=c&&c[k]!=null?c[k]:s.props[k]; return vv!==false;}; const ons=items.filter(it=>eff(it[0])); const chip=([k,lb])=>{const on=eff(k),last=on&&ons.length===1&&items.length>1; return `<button class="chip ${on?'on':''}" data-act="fcbool" data-s="${s.id}" data-key="${k}"${last?' disabled title="keep at least one visible"':''}>${lb}</button>`;}; return `<div class="kv"><label>Show</label><span class="palette" style="display:inline-flex;gap:4px">${items.map(chip).join('')}</span></div>`; };
    const varBtns=field=>{ const vs=definedVars(f); return vs.length?`<div class="palette" style="margin:2px 0;gap:4px">${vs.map(v=>`<button class="chip sm" data-act="varins" data-s="${s.id}" data-key="${field}" data-v="${esc(v)}" title="insert into the formula">${esc(v)}</button>`).join('')}</div>`:''; };
    if(s.type==='slider'){ g+=`<div class="kv"><label>Variable</label>${txtF('key','name, e.g. x')}</div>`+rangeRow('Range','min','max')+`<div class="muted sm" style="margin:-2px 0 4px">empty range = free entry</div><div class="kv"><label>Step</label>${numF('step')}</div><div class="kv"><label>Default</label>${numF('value')}</div>`+showGrp([['showName','name'],['showValue','value'],['showSlider','slider']]); return; }
    if(s.type==='compute'){ g+=`<div class="bm-lbl">Formula <span class="muted sm">· note: edit on the card</span></div>${varBtns('expr')}<div class="kv"><label>f =</label>${txtF('expr','e.g. price * qty')}</div>`; return; }
    if(s.type==='chart'){ g+=`<div class="bm-lbl">Chart</div>${varBtns('fn')}<div class="kv"><label>f(x)</label>${txtF('fn','e.g. x*x + z')}</div>`+rangeRow('x range','x0','x1')+rangeRow('y range','y0','y1')+`<div class="kv"><label>Ticks</label><span class="row" style="gap:4px">${numF('xticks',3.5)}<span class="muted">x</span>${numF('yticks',3.5)}<span class="muted">y</span></span></div>`+showGrp([['hover','hover line']]); return; }
    if(s.type==='list'){ const eff=(f.content[s.id]&&f.content[s.id].style)||s.props.style||'bullets'; g+=`<div class="kv"><label>Style</label><span class="palette" style="display:inline-flex;gap:4px">${['bullets','numbered','check'].map(v=>`<button class="chip ${eff===v?'on':''}" data-act="liststyle" data-s="${s.id}" data-v="${v}">${v}</button>`).join('')}</span></div>`; return; }
    if(s.type==='choice'){ const onb=k=>{ const c=f.content[s.id]; const v=c&&c[k]!=null?c[k]:s.props[k]; return v===true; }; const beh=(k,lab)=>`<button class="chip ${onb(k)?'on':''}" draggable="true" data-act="qbehav" data-behav="${k}" data-behavdrag="${k}" data-s="${s.id}" title="click to toggle, or drag onto the card">${lab}</button>`; g+=`<div class="kv" style="align-items:flex-start"><label>Behavior</label><span class="palette" style="display:inline-flex;gap:4px;flex-wrap:wrap">${beh('submit','Require a check')}${beh('shuffle','Shuffle in study')}</span></div>`; return; }
    if(s.type==='progress'){ const cv2=k=>{ const c=f.content[s.id]; return c&&c[k]!=null?c[k]:s.props[k]; };
      const scope=cv2('scope')||'section', track=cv2('track')||[], sh=pgShow(cv2('show'));
      const scopeBtn=(v,lab)=>`<button class="chip ${scope===v?'on':''}" data-act="pgscope" data-s="${s.id}" data-v="${v}">${lab}</button>`;
      const showBtn=(k,lab)=>`<button class="chip ${sh[k]?'on':''}" draggable="true" data-act="pgshow" data-pgshowdrag="${k}" data-s="${s.id}" data-k="${k}" title="click to toggle, or drag onto the card">${lab}</button>`;
      const tags=(DB.house&&DB.house.cats)||[];
      g+=`<div class="kv"><label>Counts</label><span class="palette" style="display:inline-flex;gap:4px;flex-wrap:wrap">${scopeBtn('section','section')}${scopeBtn('chapter','chapter')}${scopeBtn('notebook','whole notebook')}</span></div>`;
      g+=`<div class="kv"><label>Show</label><span class="palette" style="display:inline-flex;gap:4px">${showBtn('mn','M/N')}${showBtn('pct','%')}${showBtn('bar','bar')}</span></div>`;
      g+=`<div class="kv" style="align-items:flex-start"><label>Which cards</label><span class="palette" style="display:inline-flex;gap:4px;flex-wrap:wrap">${tags.length?tags.map(t=>`<button class="chip ${track.includes(t)?'on':''}" data-act="pgtag" data-s="${s.id}" data-v="${esc(t)}">${esc(t)}</button>`).join(''):'<span class="muted sm">all cards (tag cards to track a subset)</span>'}</span></div>`;
      return; }
    if(!def.fields.length)return;
    def.fields.forEach(([key,lab,kind])=>{ if(['target','metric'].includes(key))return;
      const val=(f.content[s.id]&&f.content[s.id][key]!=null)?f.content[s.id][key]:s.props[key];
      if(kind==='bool'){ const on=val===true||val==='true'; g+=`<div class="kv"><label title="${esc(lab)}">${esc(lab)}</label><button class="chip ${on?'on':''}" data-act="fcflag" data-s="${s.id}" data-key="${key}">${on?'on':'off'}</button></div>`; return; }
      g+=`<div class="kv" style="align-items:flex-start"><label title="${esc(lab)}">${esc(lab)}</label>`+(kind==='area'?`<textarea rows="2" data-act="fc" data-s="${s.id}" data-key="${key}">${esc(val)}</textarea>`:`<input ${kind==='num'?'type="number"':''} data-act="fc" data-s="${s.id}" data-key="${key}" value="${esc(val)}">`)+`</div>`; });
  }); return g; };
  if(f.container&&f.container.flip){ const fcF=contentFields(f.slots), fcB=contentFields(f.back);
    if(fcF)h+=`<div class="bm-lbl" style="margin-top:8px">Front content</div>`+fcF;
    if(fcB)h+=`<div class="bm-lbl" style="margin-top:8px">Back content</div>`+fcB; }
  else h+=contentFields(f.slots);
  h+=`<div style="margin-top:10px"><button class="btn sm" data-act="dupfurn" title="copy this card — content, variety and width — right below">⧉ Duplicate</button> <button class="btn sm warn" data-act="delfurn">🗑 Remove from house</button></div></div>`;
  return h;
}

function sideFactory(){
  const b=DB.bench;
  let h='';
  { const fd=view.fold['fac:slots']; h+=`<div class="store-lane"><h4 data-act="fold" data-s="fac:slots" style="cursor:pointer" title="Click or drag a slot into the container.">${fd?'▸':'▾'} ➕ Slots</h4>`+(fd?'':`<div class="palette">`+
     SLOT_ORDER.map(t=>`<button class="chip" draggable="true" data-slotdrag="${t}" data-act="addslot" data-t="${t}" title="Add a ${esc(SLOTS[t].label)} slot">${SLOTS[t].icon} ${SLOTS[t].label}</button>`).join('')+`</div>`)+`</div>`; }

  { const fd=view.fold['fac:modes']; h+=`<div class="store-lane"><h4 data-act="fold" data-s="fac:modes" style="cursor:pointer" title="The card's shape — applies to the whole container.">${fd?'▸':'▾'} ▣ Card mode</h4>`+(fd?'':`<div class="palette">`+
     `<button class="chip ${b.container.flip?'on':''}" draggable="true" data-verbdrag="flip" data-act="flipverb" title="${esc(CVERBS.flip.label)} — two-sided card">${CVERBS.flip.icon} Flip</button>`+
     `<button class="chip ${b.container.bare?'on':''}" draggable="true" data-verbdrag="bare" data-act="bareverb" title="${esc(CVERBS.bare.label)} — no frame, fuses into the page">${CVERBS.bare.icon} Frameless</button>`+`</div>`)+`</div>`; }
  { const fd=view.fold['fac:verbs']; h+=`<div class="store-lane"><h4 data-act="fold" data-s="fac:verbs" style="cursor:pointer" title="Per-slot effects — click to apply to the selected slot, or drag onto any slot.">${fd?'▸':'▾'} ✦ Slot effects</h4>`+(fd?'':`<div class="palette">`+
     Object.entries(SVERBS).map(([k,vb])=>`<button class="chip ${benchSel!=null&&curSlots()[benchSel]&&curSlots()[benchSel].verbs&&curSlots()[benchSel].verbs[k]?'on':''}" draggable="true" data-svverbdrag="${k}" data-act="sverb" data-k="${k}" title="slot · ${esc(vb.label)} — click to apply to the selected slot, or drag onto a slot">${vb.icon} ${vb.label}</button>`).join('')+`</div>`)+`</div>`; }
  { const fd=view.fold['fac:look']; h+=`<div class="store-lane"><h4 data-act="fold" data-s="fac:look" style="cursor:pointer" title="One look per product — drag a swatch onto the card. For variants, name them Base--Blue / Base--Red.">${fd?'▸':'▾'} 🎨 Colors</h4>`+(fd?'':`<div class="palette">`+
     VAR.map(v=>`<span class="swatch ${(b.accent||'')===v.accent?'on':''}" draggable="true" data-coldrag="${v.accent}" data-act="bvar" data-v="${v.accent}" style="background:${v.accent||'var(--accent)'}" title="${v.name}"></span>`).join('')+
     `<input type="color" data-act="bvarcustom" value="${b.accent||'#6ea8fe'}" title="custom colour" style="width:26px;height:26px;padding:0;border-radius:6px"></div>`)+`</div>`; }
  if(benchSel!=null && curSlots()[benchSel]) h+=sideSlotConfig(curSlots()[benchSel],benchSel);

  if(benchSel==null){
  h+=`<div class="sect"><h3 title="Drag a product to reorder · between lanes to move its store · onto the bench to fork a copy. Click to edit it.">📦 Inventory</h3>`;
  const storeGroups=[{id:'',name:'🛠 Workshop'}].concat(DB.stores.map(s=>({id:s.id,name:s.icon+' '+s.name})));
  storeGroups.forEach(L=>{ const items=DB.products.filter(p=> L.id? (p.store||null)===L.id : !p.store ); const folded=view.fold['inv:'+L.id];
    h+=`<div class="store-lane" data-lane="${L.id}"><h4 data-act="invfold" data-s="${L.id}" style="cursor:pointer" title="collapse / expand">${folded?'▸':'▾'} ${esc(L.name)} <span class="muted sm">${items.length}</span></h4>`;
    if(!folded){ if(!items.length)h+=`<div class="muted sm">—</div>`;
      else h+=`<div class="palette">`+items.map(p=>`<span class="prodchip-wrap"><button class="chip prodchip" data-prod="${p.id}" data-invprod="${p.id}" data-act="loadprod" data-id="${p.id}" title="${esc(p.name)} — click to copy into a new container · drag to reorder/move">${prodIcon(p)} ${esc(p.name)}</button><button class="chipx" data-act="delprod" data-p="${p.id}" title="delete product">✕</button></span>`).join('')+`</div>`; }
    h+=`</div>`;
  });
  h+=`</div>`; }
  return h;
}
function sideSlotConfig(s,i){
  const def=SLOTS[s.type];
  let h=`<div class="sect"><h3>Slot: ${def.label}</h3>`;
  if(!['slider','compute','chart','choice','list','progress'].includes(s.type)) def.fields.forEach(([key,lab,kind,help])=>{ const v=s.props[key]!=null?s.props[key]:'';
    h+=`<div class="kv" style="align-items:flex-start"><label title="${esc(help||lab)}">${esc(lab)}</label>`+
      (kind==='area'?`<textarea rows="2" data-act="sprop" data-key="${key}" placeholder="${esc(help||'')}">${esc(v)}</textarea>`
       :`<input ${kind==='num'?'type="number"':''} data-act="sprop" data-key="${key}" value="${esc(v)}" placeholder="${esc(help||'')}">`)+`</div>`;
  });

  if(s.verbs&&s.verbs.reveal){ const c=s.verbs.reveal; const revKeys=[...new Set(curSlots().filter(x=>x.props&&x.props.key).map(x=>x.props.key))];
    h+=`<div class="benchcard" style="background:var(--panel2)"><div class="sm muted">Reveal when:</div><div class="row" style="align-items:center">
      <span class="palette" style="display:inline-flex;gap:3px">${revKeys.length?revKeys.map(k=>`<button class="chip sm ${c.key===k?'on':''}" data-act="revkey" data-k="${esc(k)}">${esc(k)}</button>`).join(''):`<span class="muted sm">add a slider/number/choice first</span>`}</span>
      <span class="palette" style="display:inline-flex;gap:3px">${REVOPS.map(o=>`<button class="chip sm ${c.op===o?'on':''}" data-act="revop" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</span>
      <input style="width:64px" data-act="rev" data-f="val" value="${esc(c.val!=null?c.val:'')}" placeholder="val"></div>
      <div class="sm muted">e.g. <code>pick == 0</code> (show after correct choice)</div></div>`;
  }

  if(curSlots()[i+1]){ const fused=!!s.fuse, nx=curSlots()[i+1];
    h+=`<div class="kv"><label>Fuse</label><button class="chip ${fused?'on':''}" data-act="fusetoggle" data-i="${i}" title="put this slot on the same row as the next one">⛓ ${fused?'fused with next':'fuse with next'}</button></div>`;
    if(fused){ const T=(s.fuseW||1)+(nx.fuseW||1); h+=`<div class="kv"><label>Split</label><input type="range" min="15" max="85" value="${Math.round((s.fuseW||1)/T*100)}" data-act="fuseratio" data-i="${i}"></div>`; }
  }
  h+=`<div style="margin-top:8px"><button class="btn sm warn" data-act="delslot" data-i="${i}">🗑 delete slot</button></div></div>`;
  return h;
}
