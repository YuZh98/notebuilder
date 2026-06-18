/* ====================== STAGE (main canvas) ====================== */
function renderStage(){
  const S=$('#stage');
  if(DB.place==='factory'){ S.innerHTML = factoryStage(); wireBench(); return; }

  S.innerHTML = houseStage();
  if(!DB.studyOn) wireDnD();
}

function benchToProd(b){ return {id:b.id,name:b.name,slots:b.slots,back:b.back,container:b.container,rules:b.rules,accent:b.accent}; }
function getFacFurn(bid){ const b=DB.factory.benches.find(x=>x.id===bid); if(!b)return null; view.facState=view.facState||{}; const st=view.facState[bid]||(view.facState[bid]={}); return Object.assign(toFurn(benchToProd(b)),{state:st,_fac:bid}); }
function factoryStage(){
  const F=DB.factory; const study=F.study;
  let h=`<div class="card-shell"><div class="row"><h2 style="margin:0">🏭 Factory</h2></div>
    <div class="grid fac-grid">`;
  F.benches.forEach(b=>{ const active=b.id===F.active; const acc=b.accent||'';
    if(study){ const ff=getFacFurn(b.id);
      h+=`<div class="furn${b.container.bare?' bare':''}" style="--w:6${acc?';--cardc:'+esc(acc):''}" data-fid="fac:${b.id}"><div class="body">${cardInner(ff,true,null)}</div><div class="sm muted" style="padding:2px 14px 10px">${esc(b.name)}</div></div>`; return; }
    h+=`<div class="benchcard faccard ${active?'on':''}" style="--w:6" data-act="selbench" data-id="${b.id}" data-bcard="${b.id}">
      <div class="row" style="margin-bottom:8px"><span class="grip" data-bcgrip="${b.id}">⋮⋮</span><span style="flex:1;font-weight:600;font-size:15px">${ceText('bench:name:'+b.id,b.name,esc(b.name||''),'data-act="bname"','product name · Base--Variety','','')}</span>
        <button class="btn sm" data-act="dupbench" data-id="${b.id}" title="Duplicate this container (great for making a variety — tweak the look/name, then seal as Base--Variety2)">⎘ Duplicate</button>
        <button class="btn sm" data-act="sealbench" data-id="${b.id}" title="Seal a copy into the Inventory">🔒 Seal</button>
        <button class="btn sm warn" data-act="delbench" data-id="${b.id}" title="Delete this container">✕</button></div>`;
    if(active){
      h+=ceText('bench:note:'+b.id,b.note,mdInline(b.note||''),'data-act="bnote"','note — shipped with the product (optional · $math$)','ce-sub','ce-sub');
      if(b.container.flip)h+=`<div class="palette" style="margin:4px 0"><button class="chip sm ${benchFace!=='back'?'on':''}" data-act="bface" data-f="front">Front</button><button class="chip sm ${benchFace==='back'?'on':''}" data-act="bface" data-f="back">Back</button></div>`;
      const bslot=(s,i)=>{ const def=SLOTS[s.type];
        return `<div class="benchslot ${benchSel===i?'sel':''}" style="--w:${s.w}" data-act="selslot" data-i="${i}" data-bs="${i}"><span class="grip" data-bgrip="${i}">⋮⋮</span><span class="rz" data-brz="${i}"></span><div class="bs-head sm muted"><span>${def.icon} ${def.label}</span>${s.fuse?'<span class="faceflag">⛓</span>':''}${Object.keys(s.verbs||{}).filter(k=>s.verbs[k]).map(k=>`<span class="faceflag">${SVERBS[k]?SVERBS[k].icon:''}</span>`).join('')}<span class="spacer"></span><span class="wbadge">w${s.w}</span></div><div class="bs-body${s.verbs&&s.verbs.glow?' glow':''}${s.verbs&&s.verbs.emphasis?' emphasis':''}${s.verbs&&s.verbs.reveal?' reveal-dim':''}" style="pointer-events:none" ${s.verbs&&s.verbs.reveal?`title="reveal-when ${esc(s.verbs.reveal.key||'?')} ${esc(s.verbs.reveal.op||'')} ${esc(String(s.verbs.reveal.val))} — hidden in Study until true"`:''}>${def.live(Object.assign({},s.props),{},b.rules)}</div></div>`; };
      const grid=(slots)=>{ let g=`<div class="grid bench-grid">`; if(!slots.length)g+=`<div class="empty" style="flex:1 0 100%">Empty — add a slot (click or drag a chip here).</div>`;
        for(let i=0;i<slots.length;i++){ const s=slots[i];
          if(s.fuse&&slots[i+1]){ let j=i; while(slots[j]&&slots[j].fuse&&slots[j+1])j++; const chain=slots.slice(i,j+1);
            const sumw=Math.min(12,chain.reduce((a,c)=>a+(c.w||6),0));
            g+=`<div class="benchfuse" style="flex:0 0 calc((${sumw}/12)*100% - 11px)">`+chain.map((c,k)=>`${k?'<div class="fusebar"></div>':''}<div class="ff" style="flex:${c.fuseW||1}">${bslot(c,i+k)}</div>`).join('')+`</div>`; i=j; }
          else g+=bslot(s,i); }
        return g+`</div>`; };
      const sidePrev=(slots)=>`<div class="prod pv">${cardInner({slots,container:{},rules:b.rules,accent:b.accent,content:{},state:{}},false,null)}</div>`;
      if(b.container.flip){
        h+=`<div class="flipwrap"><div class="flipside"><div class="sm muted">FRONT${benchFace!=='back'?' · editing':''}</div>${benchFace!=='back'?grid(b.slots):sidePrev(b.slots)}</div><div class="flipside"><div class="sm muted">BACK${benchFace==='back'?' · editing':''}</div>${benchFace==='back'?grid(b.back||[]):sidePrev(b.back||[])}</div></div>`;
      } else { h+=grid(b.slots); }
    } else { h+=`<div class="prod pv">${cardInner(toFurn(benchToProd(b)),false,null)}</div>`; }
    h+=`</div>`;
  });
  h+=`</div></div>`;
  return h;
}

const UNTAG='∅';
function selCells(){ return view.cells||(view.cells=[]); }
function cellOn(rv,cv){ return selCells().includes(rv+'␟'+cv); }
function filterActive(){ return selCells().length>0; }
function clearCells(){ view.cells=[]; }
function toggleCells(keys){
  const a=selCells(), allOn=keys.length>0 && keys.every(k=>a.includes(k));
  keys.forEach(k=>{ const i=a.indexOf(k); if(allOn){ if(i>=0)a.splice(i,1); } else if(i<0)a.push(k); });
}
function mtxRooms(){ return DB.house.rooms.filter(r=>(r.kind||'mixed')!=='divider'); }

function mtxDims(){ return {
  room:{ label:'Rooms', reorder:'room', values:()=>mtxRooms().map(r=>r.id),
    labelOf:id=>{const r=DB.house.rooms.find(x=>x.id===id); return r?r.name:id;}, has:(c,rid,v)=>rid===v },
  product:{ label:'Products', reorder:null, values:()=>{ const out=[]; DB.house.rooms.forEach(rm=>(rm.cards||[]).forEach(c=>{const b=baseKey(c.name); if(!out.includes(b))out.push(b);})); return out; },
    labelOf:k=>{ for(const rm of DB.house.rooms)for(const c of (rm.cards||[])) if(baseKey(c.name)===k) return baseName(c.name); return k; }, has:(c,rid,v)=>baseKey(c.name)===v },
  tag:{ label:'Tags', reorder:'tag', values:()=>(DB.house.cats||[]).concat([UNTAG]),
    labelOf:t=>t===UNTAG?'untagged':t, has:(c,rid,v)=> v===UNTAG? !((c.tag||[]).length) : (c.tag||[]).includes(v) }
}; }
// effective axes — PURE: falls back to qualifying axes if the chosen ones are invalid, without mutating view.
// render and the mtx handlers share this so they always agree (no stale-axis drift).
function mtxEffectiveAxes(){ const D=mtxDims(); const ok=k=>D[k].values().length>=2; const qual=['room','product','tag'].filter(ok);
  let rk=view.mtxRow||'room', ck=view.mtxCol||'product';
  if((!ok(rk)||!ok(ck)||rk===ck) && qual.length>=2){ rk=qual[0]; ck=qual[1]; }
  return { rk, ck, D, ok, qual }; }

function pruneCells(){ if(!selCells().length)return; const D=mtxDims(); const all=new Set([...D.room.values(),...D.product.values(),...D.tag.values()]);
  const live=selCells().filter(k=>{const i=k.indexOf('␟'); return all.has(k.slice(0,i))&&all.has(k.slice(i+1));}); if(live.length!==selCells().length) view.cells=live; }
function cardMatches(card,roomId){ if(!filterActive())return true; const {rk,ck,D}=mtxEffectiveAxes(); const R=D[rk],C=D[ck];
  return selCells().some(k=>{ const i=k.indexOf('␟'),rv=k.slice(0,i),cv=k.slice(i+1); return R.has(card,roomId,rv)&&C.has(card,roomId,cv); }); }
function mtxCount(R,C,rv,cv){ let n=0; DB.house.rooms.forEach(rm=>(rm.cards||[]).forEach(c=>{ if(R.has(c,rm.id,rv)&&C.has(c,rm.id,cv))n++; })); return n; }

function matrixPanel(){
  const {rk,ck,D,ok,qual}=mtxEffectiveAxes();
  if(qual.length<2) return '';
  const R=D[rk],C=D[ck]; const rows=R.values(), cols=C.values();
  const folded=view.fold.__matrix__, ed=!DB.studyOn;
  const axOpt=(ax,cur,other)=>['room','tag','product'].map(dk=>`<button class="chip xs ${cur===dk?'on':''}" data-act="mtxaxis" data-ax="${ax}" data-d="${dk}"${(dk===other||!ok(dk))?` disabled title="${dk===other?'already the other axis':'needs ≥2 entries'}"`:''}>${D[dk].label}</button>`).join('');
  let h=`<div class="mtx-wrap"><div class="mtx-head"><b>▦ Coverage</b>${folded?'':`<span class="muted sm">ROW <span class="axset">${axOpt('row',rk,ck)}</span> × COL <span class="axset">${axOpt('col',ck,rk)}</span></span>`}<span class="spacer"></span>${filterActive()?`<button class="btn sm" data-act="mtxclear">clear filter</button>`:''}<button class="btn sm ghost" data-act="mtxfold" title="${folded?'expand':'collapse'}">${folded?'▸':'▾'}</button></div>`;
  if(!folded){
    h+=`<div class="mtx" style="grid-template-columns:minmax(80px,auto) repeat(${cols.length},minmax(42px,1fr))">`;
    h+=`<button class="mtx-c mtx-corner ${filterActive()?'':'on'}" data-act="mtxall" title="select everything / clear">▦</button>`;
    cols.forEach(cv=>{ const on=rows.every(rv=>cellOn(rv,cv)); const utag=(ck==='tag'&&cv===UNTAG); const grip=(ed&&C.reorder&&!utag)?`<span class="mtxgrip" data-mtxcolgrip="${esc(cv)}" data-dim="${C.reorder}" title="drag to reorder">⠿</span>`:''; h+=`<button class="mtx-c mtx-colh ${on?'on':''} ${utag?'mtx-untag':''}" data-act="mtxcol" data-cv="${esc(cv)}" title="click: toggle the “${esc(C.labelOf(cv))}” column">${grip}${esc(C.labelOf(cv))}</button>`; });
    rows.forEach(rv=>{ const rowOn=cols.every(cv=>cellOn(rv,cv)); const utag=(rk==='tag'&&rv===UNTAG); const grip=(ed&&R.reorder&&!utag)?`<span class="mtxgrip" data-mtxrowgrip="${esc(rv)}" data-dim="${R.reorder}" title="drag to reorder">⠿</span>`:'';
      h+=`<button class="mtx-c mtx-rowh ${rowOn?'on':''}" data-act="mtxrow" data-rv="${esc(rv)}" title="click: toggle the “${esc(R.labelOf(rv))}” row">${grip}${esc(R.labelOf(rv))}</button>`;
      cols.forEach(cv=>{ const n=mtxCount(R,C,rv,cv), on=cellOn(rv,cv); h+=`<button class="mtx-c mtx-cell ${on?'on':''} ${n===0?'mtx-zero':''}" data-act="mtxcell" data-rv="${esc(rv)}" data-cv="${esc(cv)}" title="${esc(R.labelOf(rv))} · ${esc(C.labelOf(cv))} — ${n} card${n===1?'':'s'}">${n}</button>`; });
    });
    h+=`</div>`;
  }
  return h+`</div>`;
}

function ceText(key, raw, previewHTML, taAttrs, ph, taCls, previewCls){
  if(view.editKey===key) return `<textarea class="ce ${taCls||''}" ${taAttrs} data-autofocus="1" rows="1" placeholder="${esc(ph||'')}">${esc(raw==null?'':raw)}</textarea>`;
  const body=(raw!=null&&String(raw).trim())?previewHTML:`<span class="muted sm">${esc(ph||'')}</span>`;
  return `<div class="ceview ${previewCls||''}" data-act="edithere" data-key="${esc(key)}">${body}</div>`;
}
function houseStage(){
  pruneCells();   // selections must never reference values that no longer exist (deleted tags/rooms/last card of a base)
  const studying=DB.studyOn; const hw=DB.house.width||'medium';
  const hsub=(DB.house.subtitle||'').trim();
  const htitles = studying
    ? `<div class="hh-titles"><div class="house-title">🏠 ${mdInline(DB.house.name||'')}</div>${hsub?`<div class="house-sub">${mdBlock(hsub)}</div>`:''}</div>`
    : `<div class="hh-titles">${ceText('house:title',DB.house.name,'🏠 '+mdInline(DB.house.name||''),'data-act="ht"','house name','ce-htitle','house-title')}${ceText('house:sub',DB.house.subtitle,mdBlock(hsub),'data-act="hs"','optional subtitle · markdown + $math$','ce-hsub','house-sub')}</div>`;
  let h=`<div class="card-shell hw-${hw}">
    <div class="row house-head ${selKind==='house'&&!studying?'sel':''}" data-act="selhouse">${htitles}</div>`;

  h+=matrixPanel();
  let chapFold=false;   // set true while inside a collapsed chapter (a folded divider hides its sections until the next divider)
  DB.house.rooms.forEach(r=>{
    const kind=r.kind||'mixed';
    if(kind!=='divider' && chapFold) return;
    if(filterActive() && kind!=='divider' && !(r.cards||[]).some(c=>cardMatches(c,r.id))) return;
    const selR=(!studying&&selKind==='room'&&!sel&&r.id===DB.house.active)?' sel':'';
    const rwClass='';
    const title=(r.title||'').trim(), sub=(r.subtitle||'').trim();

    if(studying && kind!=='divider'){ const vis=r.cards.filter(c=> r._showArch?c.state._arch:!c.state._arch); if(!vis.length && !title && !sub && !(r.cards||[]).length) return; }
    let head='';

    const chev = studying?`<span class="rcollapse" data-act="roomcollapse" data-id="${r.id}" title="${r._collapsed?'expand':'collapse'}">${r._collapsed?'▸':'▾'}</span>`:'';
    if(studying){ head+=`<div class="room-title">${chev}${title?mdBlock(title):'<span class="muted sm">'+esc(r.name)+'</span>'}</div>`; if(sub && !r._collapsed)head+=`<div class="room-sub">${mdBlock(sub)}</div>`; }
    else if(r.locked){
      head+=`<div class="room-title">${title?mdBlock(title):'<span class="muted sm">'+esc(r.name)+'</span>'}</div>`; if(sub)head+=`<div class="room-sub">${mdBlock(sub)}</div>`;
      head+=`<div class="room-meta muted sm">🔒 locked</div>`; }
    else {
      head+=ceText('room:'+r.id+':title',r.title,mdBlock(r.title||''),'data-act="rt"','room title (optional · ## = heading · $math$)','ce-title','room-title');
      head+=ceText('room:'+r.id+':sub',r.subtitle,mdBlock(r.subtitle||''),'data-act="rs"','subtitle (optional)','ce-sub','room-sub'); }
    const rgrip = !studying?`<span class="rgrip" data-roomgrip="${r.id}" title="drag to reorder room">⠿</span>`:'';
    if(kind==='divider'){ chapFold=!!r._collapsed;
      const n=chapterAfter(r).length;
      const dchev=`<span class="rcollapse" data-act="roomcollapse" data-id="${r.id}" title="${r._collapsed?'expand chapter':'collapse chapter'}">${r._collapsed?'▸':'▾'}</span>`;
      const body=head||(studying?'<span class="muted sm">'+esc(r.name)+'</span>':'<span class="muted sm">chapter heading</span>');
      const count=r._collapsed&&n?` <span class="muted sm">${n} section${n>1?'s':''}</span>`:'';
      h+=`<div class="room divider ${studying?'study':'edit'}${selR}" data-room="${r.id}" data-act="selroom" data-id="${r.id}">${rgrip}<div class="row" style="align-items:flex-start;gap:6px">${dchev}<span style="flex:1">${body}</span>${count}</div></div>`; return; }
    const rww=(typeof r.width==='number'&&r.width>0)?` style="width:${r.width}px;max-width:100%"`:'';
    h+=`<div class="room ${studying?'study':'edit'}${selR}${rwClass}" data-room="${r.id}" data-act="selroom" data-id="${r.id}"${rww}>${rgrip}${!studying?`<button class="room-lock ${r.locked?'on':''}" data-act="lock" data-id="${r.id}" title="${r.locked?'locked — click to unlock':'unlocked — click to lock'}">${r.locked?'🔒':'🔓'}</button>`:''}`;
    if(head)h+=`<div class="room-bar">${head}</div>`;
    if(studying && r._collapsed){ h+=`</div>`; return; }

    { const sz=r.svcSize||'sm'; const svw=r.svcW||{}; const wst=k=>svw[k]?`width:${svw[k]}px;`:'';
      const rzh=k=>!studying?`<span class="svcrz" data-svcrz="${k}" data-room="${r.id}"></span>`:'';
      let runs=Object.entries(SERVICES).filter(([k,s])=>r.services[k] && (s.scope==='study'||s.scope==='both') && !['pin','search','archive'].includes(k)).filter(([k])=> k!=='flipAll' || r.cards.some(c=>c.container&&c.container.flip));
      let items=[];
      if(r.services.search) items.push({key:'search',html: studying?`<span class="svc-item" style="${wst('search')}"><input data-act="searchin" data-room="${r.id}" value="${esc(r._q||'')}" placeholder="🔎 search…" style="width:100%"></span>`:`<span class="btn ${sz} svc-item" draggable="true" data-svcbtn="search" data-room="${r.id}" style="${wst('search')}">🔎 Search bar${rzh('search')}</span>`});
      if(r.services.archive){ const an=(r.cards||[]).filter(c=>c.state&&c.state._arch).length; items.push({key:'archive',html: studying?`<button class="btn ${sz} ${r._showArch?'on':''}" data-act="archtoggle" data-room="${r.id}" style="${wst('archive')}">🗄 ${an?`(${an}) `:''}${r._showArch?'Archived':'Archive'}</button>`:`<span class="btn ${sz} svc-item" draggable="true" data-svcbtn="archive" data-room="${r.id}" style="${wst('archive')}">🗄 Archive${rzh('archive')}</span>`}); }
      runs.forEach(([k,svc])=>items.push({key:k,html:`<span class="btn ${sz} svc-item" draggable="${!studying}" data-svcbtn="${k}" data-room="${r.id}" ${studying?`data-act="svcrun" data-k="${k}"`:''} style="${wst(k)}">${svc.icon} ${svc.label}${rzh(k)}</span>`}));
      if(r.svcOrder)items.sort((a,b)=>((r.svcOrder.indexOf(a.key)+1)||99)-((r.svcOrder.indexOf(b.key)+1)||99));
      if(items.length) h+=`<div class="svcbar" data-room="${r.id}" ${!studying?'title="drag to reorder · drag the right edge to widen"':''}>${items.map(i=>i.html).join('')}</div>`;
    }

    const q=(r._q||'').toLowerCase();
    const cards=r.cards.filter(c=> !studying ? true : (r._showArch ? c.state._arch : !c.state._arch)).filter(c=> !q || JSON.stringify(c.slots).toLowerCase().includes(q) || JSON.stringify(c.content||{}).toLowerCase().includes(q) || c.name.toLowerCase().includes(q)).filter(c=> cardMatches(c,r.id));
    if(studying&&SHUF[r.id]){ const ord=SHUF[r.id]; cards.sort((a,b)=>ord.indexOf(a.id)-ord.indexOf(b.id)); }
    h+=`<div class="rgwrap"><div class="grid room-grid" data-room="${r.id}" style="flex:1 1 auto">`;
    if(!cards.length && !studying) h+=`<div class="empty" style="flex:1 0 100%">${r.locked?'locked':'Empty — drag a product here from the Store, or click a product → Place.'}</div>`;
    cards.forEach(f=>{ const arch=(studying&&r.services.archive); const showingArch=studying&&!!r._showArch; const acc=f.accent||''; const w=f.place.w; const mh='';
      h+=`<div class="furn ${sel===f.id&&!studying?'sel':''}${f.container&&f.container.bare?' bare':''}" style="--w:${w}${acc?';--cardc:'+esc(acc):''}${mh}" data-fid="${f.id}" ${!studying&&!r.locked?'data-selectable="1"':''}>
        ${!studying&&!r.locked&&!showingArch?'<span class="grip" data-grip="'+f.id+'">⋮⋮</span>':''}
        ${!studying&&!r.locked?'<span class="rz" data-rz="'+f.id+'"></span>':''}
        ${(r.services.pin)?`<button class="arch btn sm ghost" data-act="pin" data-fid="${f.id}" title="pin this card — adds the pinned tag (filter it in Coverage)">${(f.tag||[]).includes('pinned')?'📌':'📍'}</button>`:''}
        ${arch?`<button class="arch btn sm ghost" data-act="${r._showArch?'unarchive':'archive'}" data-fid="${f.id}" style="right:36px" title="${r._showArch?'restore':'archive'}">${r._showArch?'♻':'🗄'}</button>`:''}
        <div class="body">${(f.tag||[]).includes('pinned')?'<div class="sm" style="position:absolute;top:6px;right:9px">📌</div>':''}${cardInner(f,studying||showingArch,r,!studying&&!r.locked&&!showingArch)}</div>
      </div>`;
    });
    h+=`</div></div>${!studying?`<span class="rz room-edge" data-roomrz="${r.id}" title="drag the edge to resize this room"></span>`:''}</div>`;
  });
  h+=`</div>`; return h;
}

function toFurn(prod){ return {id:'pv',name:prod.name,slots:prod.slots,back:prod.back,container:prod.container,rules:prod.rules,accent:prod.accent,content:{},state:{},place:{w:8}}; }

function definedVars(card){ const ks=[]; if(!card)return ks; (card.slots||[]).concat(card.back||[]).forEach(s=>{ if(s&&s.type==='slider'){ const pr=Object.assign({},s.props,(card.content&&card.content[s.id])||{}); if(pr.key&&!ks.includes(pr.key))ks.push(pr.key); } }); return ks; }
/* Variables are CARD-scoped: a control (slider/number), compute `out`, or choice key wires only readers
   in the SAME card (front+back). Same key in different cards = two independent variables. Scope = control
   defaults overlaid by per-card LIVE (Study drags) and f.state, then in-card compute chains settle. */
/* Progress = per-reader completion. `cardDone` returns null (nothing to finish), or whether every
   completable interaction on the card is complete: a flip card seen, a choice answered, a checklist
   fully ticked. `chapterRooms` = the run of rooms between divider rooms. `pgCount` folds over scope. */
const pgShow=sh=>({mn:!sh||sh.mn!==false, pct:!!(sh&&sh.pct), bar:!sh||sh.bar!==false});
function cardDone(card){ let total=0,done=0; const st=card.state||{};
  if(card.container&&card.container.flip){ total++; if(st._seen)done++; }
  (card.slots||[]).concat(card.back||[]).forEach(s=>{ if(!s)return; const pr=Object.assign({},s.props,(card.content&&card.content[s.id])||{});
    if(s.type==='choice'){ total++; if((st._qdone&&st._qdone[s.id])||(pr.key&&st[pr.key]!=null))done++; }
    else if(s.type==='list'&&pr.style==='check'){ const items=(pr.items||'').split('\n').filter(x=>x.trim()); if(items.length){ total++; const t=(st._done&&st._done[s.id])||{}; if(items.every((_,j)=>t[j]))done++; } }
  });
  return total===0?null:(done===total); }
function chapterRooms(room){ const rs=(DB.house&&DB.house.rooms)||[]; const i=rs.indexOf(room); if(i<0)return [room];
  let lo=i,hi=i; while(lo>0&&rs[lo-1].kind!=='divider')lo--; while(hi<rs.length-1&&rs[hi+1].kind!=='divider')hi++;
  return rs.slice(lo,hi+1).filter(r=>r.kind!=='divider'); }
function chapterAfter(div){ const rs=(DB.house&&DB.house.rooms)||[]; const out=[]; for(let j=rs.indexOf(div)+1;j<rs.length&&rs[j].kind!=='divider';j++)out.push(rs[j]); return out; }
function pgCount(p,room){ const scope=p.scope||'section'; const track=p.track||[];
  const rooms=scope==='notebook'?((DB.house&&DB.house.rooms)||[]):scope==='chapter'?chapterRooms(room):[room];
  let done=0,total=0;
  rooms.forEach(r=>(r.cards||[]).forEach(c=>{ if(c.state&&c.state._arch)return; if(track.length&&!((c.tag||[]).some(t=>track.includes(t))))return; const d=cardDone(c); if(d===null)return; total++; if(d)done++; }));
  return {done,total}; }
function cardScope(f){ const sc={}; const all=(f.slots||[]).concat(f.back||[]); const live=(!f._fac&&!f._prev&&LIVE[f.id])||{};
  all.forEach(s=>{ if(s&&s.type==='slider'){ const pr=Object.assign({},s.props,(f.content&&f.content[s.id])||{}); const k=pr.key||'v'; sc[k]=ctlClamp(pr, live[k]!=null?live[k]:Number(pr.value!=null?pr.value:0)); } });
  Object.assign(sc, f.state||{});
  const comps=all.filter(s=>s&&s.type==='compute');
  for(let pass=0;pass<=comps.length;pass++){ let ch=false; comps.forEach(s=>{ const pr=Object.assign({},s.props,(f.content&&f.content[s.id])||{}); if(!pr.out)return; const v=EXPR.ev(pr.expr,sc); if(typeof v==='number'&&isFinite(v)&&sc[pr.out]!==v){sc[pr.out]=v;ch=true;} }); if(!ch)break; }
  return sc; }
function cardInner(f,live,room,edit){
  const flip=f.container&&f.container.flip; const flipped=f.state&&f.state._flip;
  const slots=f.slots||[]; const scope=cardScope(f);
  const renderSlot=(s)=>{ const def=SLOTS[s.type]; if(!def)return'';
    const props=Object.assign({},s.props,(f.content&&f.content[s.id])||{});
    if(edit){
      if(s.type==='compute'){ const editing=view.editSlot&&view.editSlot.fid===f.id&&view.editSlot.sid===s.id; let cval=EXPR.ev(props.expr,scope); if(typeof cval==='number')cval=isFinite(cval)?Math.round(cval*1e4)/1e4:'—'; else if(typeof cval==='boolean')cval=cval?'true':'false'; const noteEl=editing?`<textarea class="ce" data-act="ce" data-s="${s.id}" data-key="note" data-autofocus="1" placeholder="note (optional · math $x$)">${esc(props.note||'')}</textarea>`:`<span class="ceview" data-act="editslot" data-fid="${f.id}" data-s="${s.id}">${props.note?md(props.note):'<span class="muted sm">+ note</span>'}</span>`; return `<div class="slot compute">${noteEl} <b class="cval">${esc(String(cval))}</b></div>`; }
      if(s.type==='chart'){ const editing=view.editSlot&&view.editSlot.fid===f.id&&view.editSlot.sid===s.id; const cap=editing?`<textarea class="ce" data-act="ce" data-s="${s.id}" data-key="label" data-autofocus="1" placeholder="caption (optional · math $x$)">${esc(props.label||'')}</textarea>`:`<div class="ceview sm muted" data-act="editslot" data-fid="${f.id}" data-s="${s.id}">${props.label?md(props.label):'+ caption'}</div>`; return `<div class="slot chart">${cap}${plotSVG(props,scope)}</div>`; }
      if(s.type==='progress'){ const editing=view.editSlot&&view.editSlot.fid===f.id&&view.editSlot.sid===s.id; const labEl=editing?`<textarea class="ce" data-act="ce" data-s="${s.id}" data-key="label" data-autofocus="1" placeholder="progress label (optional)">${esc(props.label||'')}</textarea>`:`<span class="ceview" data-act="editslot" data-fid="${f.id}" data-s="${s.id}">${props.label?md(props.label):'<span class="muted sm">+ label</span>'}</span>`; const body=SLOTS.progress.live(Object.assign({},props,{label:''}),scope,f.rules||{},room,f,s); return `<div class="slot">${labEl}${body}</div>`; }
      if(s.type==='list'){ const items=(props.items||'').split('\n'); const style=props.style||'bullets';
        const mark=i=> style==='check'?'<input type="checkbox" disabled>' : style==='numbered'?`<span class="muted sm" style="min-width:1.4em;text-align:right">${i+1}.</span>` : '<span class="muted sm">•</span>';
        return `<div class="ce-choice">`
          +ceText('lt:'+f.id+':'+s.id,props.title,mdInline(props.title||''),'data-act="ce" data-s="'+s.id+'" data-key="title"','title (optional)','','')
          +items.map((it,i)=>`<div class="ce-opt" data-qrow="${i}" data-qslot="${s.id}" data-qkey="items"><span class="ce-opt-grip" data-qgrip="${i}" title="drag to reorder">⋮⋮</span>${mark(i)}`
            +ceText('litem:'+f.id+':'+s.id+':'+i,it,mdInline(it||''),'data-act="copt" data-s="'+s.id+'" data-i="'+i+'" data-key="items"','item '+(i+1),'','')
            +`<span class="ce-opt-sp"></span><button class="btn sm ghost ce-opt-del" data-act="coptdel" data-s="${s.id}" data-i="${i}" data-key="items" title="remove item">✕</button></div>`).join('')
          +`<div class="row" style="margin-top:4px"><button class="btn sm" data-act="coptadd" data-s="${s.id}" data-key="items" title="add another item">＋ item</button></div></div>`; }
      if(s.type==='text'){ const key='text';
        const editing = view.editSlot && view.editSlot.fid===f.id && view.editSlot.sid===s.id;
        if(editing) return `<textarea class="ce" data-act="ce" data-s="${s.id}" data-key="${key}" data-autofocus="1" placeholder="write… (toolbar: bold, math $x$, color)">${esc(props[key]||'')}</textarea>`;
        const formatted = def.live(props,scope,f.rules||{},room,f,s) || '<span class="muted sm">empty — click to write</span>';
        return `<div class="ceview" data-act="editslot" data-fid="${f.id}" data-s="${s.id}">${formatted}</div>`; }
      if(s.type==='choice'){ const opts=(props.options||'').split('\n'); const correct=correctSet(f.rules); return `<div class="ce-choice">`+ceText('cq:'+f.id+':'+s.id,props.q,mdInline(props.q||''),'data-act="ce" data-s="'+s.id+'" data-key="q"','question','','')+opts.map((o,i)=>`<div class="ce-opt" data-qrow="${i}" data-qslot="${s.id}"><span class="ce-opt-grip" data-qgrip="${i}" title="drag to reorder">⋮⋮</span><button class="ansmark ${correct.indexOf(i)>=0?'on':''}" data-act="markans" data-s="${s.id}" data-i="${i}" title="mark correct">✓</button>`+ceText('copt:'+f.id+':'+s.id+':'+i,o,mdInline(o||''),'data-act="copt" data-s="'+s.id+'" data-i="'+i+'"','option '+(i+1),'','')+`<span class="ce-opt-sp"></span><button class="btn sm ghost ce-opt-del" data-act="coptdel" data-s="${s.id}" data-i="${i}" title="remove option">✕</button></div>`).join('')+`<div class="row" style="margin-top:4px"><button class="btn sm" data-act="coptadd" data-s="${s.id}" title="add another option">＋ option</button></div>`+ceText('cexp:'+f.id+':'+s.id,props.explanation,mdInline(props.explanation||''),'data-act="ce" data-s="'+s.id+'" data-key="explanation"','explanation — shown after answering','','')+(props.submit?`<div class="row" style="margin-top:6px"><button class="btn sm primary" data-editcheck disabled>Check</button></div>`:'')+`</div>`; }
    }

    return slotLiveHTML(f,s,scope,room,live);
  };

  const renderSlots=(arr)=>{ let out=''; for(let i=0;i<arr.length;i++){ const s=arr[i];
    if(s.fuse&&arr[i+1]){ let j=i; while(arr[j]&&arr[j].fuse&&arr[j+1])j++; const chain=arr.slice(i,j+1);
      const sumw=Math.min(12,chain.reduce((a,c)=>a+(c.w||12),0));
      const vis=chain.map(c=>({c,html:renderSlot(c)})).filter(x=>x.html);   // a reveal-hidden cell leaves the row entirely — no orphan seams
      if(vis.length) out+=`<div class="cardslot" style="--sw:${sumw}"><div class="fusewrap">`+vis.map((x,k)=>`${k?`<div class="fusegut" data-fusegut="${vis[k-1].c.id}"></div>`:''}<div class="fusecell" data-sid="${x.c.id}" style="flex:${x.c.fuseW||1}">${x.html}</div>`).join('')+`</div></div>`;
      i=j; }
    else out+=`<div class="cardslot" data-sid="${s.id}" style="--sw:${s.w||12}">${renderSlot(s)}</div>`; }
    return `<div class="cardrow">${out}</div>`; };
  if(flip){
    const frontH=renderSlots(f.slots||[])||'<span class="muted sm">front empty</span>';
    const backH=renderSlots(f.back||[])||'<span class="muted sm">back empty</span>';
    if(!live){ return `<div class="fc-edit"><div class="fc-side"><div class="faceflag">FRONT</div>${frontH}</div><div class="fc-side back"><div class="faceflag">BACK</div>${backH}</div></div>`; }
    return `<div class="fc ${flipped?'flipped':''}" data-act="flip"><div class="fc-stack"><div class="fc-face">${frontH}</div><div class="fc-face back">${backH}</div></div><div class="sm muted" style="margin-top:6px">↻ click to flip</div></div>`;
  }
  return renderSlots(slots) || '<span class="muted sm">empty product</span>';
}
