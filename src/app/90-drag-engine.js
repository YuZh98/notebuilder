/* ====================== ONE unified drag engine (place · reorder · move · ship · fork · delete) ====================== */
/* The SAME gesture for EVERY reorderable/placeable unit: house cards, store/inventory products, factory
   containers, factory slots, and rooms. A floating follower tracks the cursor, a live dashed placeholder
   shows the landing slot, and neighbours FLIP-glide into place. Decorators (theme/colour/service/slot-type)
   keep their own native drag on purpose — a deliberately different gesture (you attach them, you don't place them). */
let _dragging=false;

const DRAG_ITEM={card:'.furn',product:'.furn',bench:'.faccard',slot:'.benchslot',room:'.room',tag:'[data-tagreorder]',qopt:'[data-qrow]'};
const DRAG_GRIDS={card:['.room-grid'],product:['.room-grid','.fac-grid','.bench-grid'],bench:['.fac-grid'],slot:['.bench-grid'],room:['.card-shell'],tag:['.tagbar'],qopt:['.ce-choice']};
function flipGrid(grid, itemSel, mutate){
  const live=()=>[...grid.children].filter(e=>e.matches&&e.matches(itemSel)&&!e.classList.contains('drag-ph'));
  const before=new Map(live().map(e=>[e,e.getBoundingClientRect()]));
  mutate();
  live().forEach(e=>{ const b=before.get(e); if(!b)return; const a=e.getBoundingClientRect(); const dx=b.left-a.left, dy=b.top-a.top; if(!dx&&!dy)return;
    e.style.transition='none'; e.style.transform='translate('+dx+'px,'+dy+'px)';
    requestAnimationFrame(()=>{ e.style.transition='transform .15s ease'; e.style.transform=''; });
    setTimeout(()=>{ e.style.transition=''; e.style.transform=''; },200); });
}
function startCardDrag(src, ev){
  if(_dragging) return; if(ev.button!=null&&ev.button!==0) return;
  const itemSel=DRAG_ITEM[src.type], grids=DRAG_GRIDS[src.type]||[];
  let srcCard=null, srcRoom=null;
  if(src.type==='card'){ const hit=findCard(src.id); if(!hit)return; srcCard=hit.card; srcRoom=hit.room; if(srcRoom.locked)return; }
  const nameOf=()=> src.type==='card'?srcCard.name:((DB.products.find(p=>p.id===src.id)||{}).name||'');
  const origEl=()=> src.srcEl || (src.type==='card'?document.querySelector('.furn[data-fid="'+src.id+'"]'):null);
  const startX=ev.clientX, startY=ev.clientY; let started=false, fly=null, ph=null, target=null, oeRef=null;
  const begin=()=>{ _dragging=true; started=true; document.documentElement.style.userSelect='none';
    const refEl=origEl(); oeRef=refEl;
    fly=(refEl||document.createElement('div')).cloneNode(true); fly.classList.add('drag-fly'); fly.removeAttribute('data-fid');
    if(refEl) fly.style.width=refEl.getBoundingClientRect().width+'px';
    document.body.appendChild(fly);
    ph=document.createElement('div'); ph.className=(src.type==='tag'?'chip xs':src.type==='qopt'?'ce-opt':(DRAG_ITEM[src.type]||'.furn').slice(1))+' drag-ph';
    ph.style.setProperty('--w', src.type==='card'?(srcCard.place.w||6):8);
    if(refEl && src.type!=='product'){ refEl.parentElement.insertBefore(ph,refEl); refEl.style.display='none'; }
    showDust();
  };
  const clearHi=()=>document.querySelectorAll('.room-grid.drop-on,.store-lane.drop-on,.fac-grid.drop-on,.bench-grid.drop-on,.card-shell.drop-on,.ce-choice.drop-on').forEach(x=>x.classList.remove('drop-on'));
  const items=grid=>[...grid.children].filter(c=>c.matches&&c.matches(itemSel)&&c!==ph&&c!==oeRef);
  const onMove=mv=>{
    if(!started){ if(Math.hypot(mv.clientX-startX,mv.clientY-startY)<5) return; begin(); }
    if(mv.cancelable)mv.preventDefault();
    if(fly){ fly.style.left=(mv.clientX-18)+'px'; fly.style.top=(mv.clientY-14)+'px'; }
    const db=$('#dustbin'); if(db)db.classList.toggle('hot',overDust(mv));
    if(fly)fly.style.display='none'; const below=document.elementFromPoint(mv.clientX,mv.clientY); if(fly)fly.style.display='';
    clearHi();

    if(src.type==='bench' && below){ const bl=below.closest('[data-lane]'); if(bl){ bl.classList.add('drop-on'); target={kind:'sealLane',laneId:bl.dataset.lane||null}; if(ph&&ph.parentElement)ph.parentElement.removeChild(ph); return; } }
    const lane = src.type==='product' && below && below.closest('[data-lane]');
    if(lane){ const pal=lane.querySelector('.palette')||lane;
      const it=[...pal.querySelectorAll('[data-invprod]')].filter(c=>c!==ph&&c!==oeRef); let idx=it.length; const over=below.closest('[data-invprod]');
      if(over&&over!==ph&&over!==oeRef){ const oi=it.indexOf(over); if(oi>=0){ const rc=over.getBoundingClientRect(); idx=oi+(mv.clientX>rc.left+rc.width/2?1:0); } }
      if(ph.className.indexOf('chip')<0) ph.className='chip prodchip drag-ph';
      const refNode=it[idx]||null;
      if(ph.parentElement!==pal || ph.nextSibling!==refNode){ flipGrid(pal,'[data-invprod]',()=>pal.insertBefore(ph,refNode)); }
      lane.classList.add('drop-on'); target={kind:'lane',laneId:lane.dataset.lane||null,idx}; return; }

    let grid=null; for(const g of grids){ const hit=below&&below.closest(g); if(hit){ grid=hit; break; } }
    if(grid){
      const isRoomGrid=grid.classList.contains('room-grid');
      const rm=isRoomGrid?DB.house.rooms.find(x=>x.id===grid.dataset.room):null;
      const ok = !isRoomGrid ? true
        : (rm && rm.kind!=='divider' && !rm.locked);
      if(ok){ if(src.type==='product' && ph.className.indexOf('furn')<0){ ph.className='furn drag-ph'; ph.style.setProperty('--w',8); }
        const it=items(grid); let idx=it.length; const over=below.closest(itemSel);
        if(over&&over!==ph&&over!==oeRef){ const oi=it.indexOf(over); if(oi>=0){ const rc=over.getBoundingClientRect(); const horiz=!(grid.classList.contains('card-shell')||grid.classList.contains('ce-choice')); idx=oi+((horiz?mv.clientX>rc.left+rc.width/2:mv.clientY>rc.top+rc.height/2)?1:0); } }
        const refNode=it[idx]||null;
        if(ph.parentElement!==grid || ph.nextSibling!==refNode){ flipGrid(grid,itemSel,()=>grid.insertBefore(ph,refNode)); }
        grid.classList.add('drop-on'); target={kind:'grid',grid,gridType:grid.classList.contains('room-grid')?'room':grid.classList.contains('fac-grid')?'fac':grid.classList.contains('bench-grid')?'bench':'shell',room:rm,idx}; return; } }
    if(ph&&ph.parentElement)ph.parentElement.removeChild(ph); target=null;
  };
  const forkProduct=()=>{ const p=DB.products.find(x=>x.id===src.id); if(!p)return; pushHistory(); const nb={id:uid('c'),name:p.name+'--copy',container:clone(p.container),slots:clone(p.slots).map(s=>Object.assign(s,{id:uid('s')})),back:p.back?clone(p.back).map(s=>Object.assign(s,{id:uid('s')})):undefined,rules:clone(p.rules),accent:p.accent||'',note:''}; DB.factory.benches.push(nb); DB.factory.active=nb.id; DB.bench=nb; benchSel=null; save(); render(); toast('forked “'+baseName(p.name)+'” — edit the copy'); };
  const onUp=uv=>{
    document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp);
    if(!started) return;
    if(fly)fly.remove(); const onDust=overDust(uv); hideDust(); clearHi();
    if(ph&&ph.parentElement)ph.parentElement.removeChild(ph);
    if(oeRef)oeRef.style.display='';
    _dragging=false; document.documentElement.style.userSelect='';
    const sw=ce=>{ce.stopPropagation();ce.preventDefault();document.removeEventListener('click',sw,true);}; document.addEventListener('click',sw,true); setTimeout(()=>document.removeEventListener('click',sw,true),350);
    const t=target;
    if(onDust){
      if(src.type==='card'){ pushHistory(); srcRoom.cards=srcRoom.cards.filter(c=>c.id!==src.id); if(sel===src.id)sel=null; save(); render(); toast('card deleted (Undo to restore)'); }
      else if(src.type==='slot'){ pushHistory(); const arr=curSlots(); arr.splice(src.idx,1); healFuse(arr); benchSel=null; save(); render(); toast('slot deleted (Undo to restore)'); }
      else if(src.type==='bench'){ delBench(src.id); }
      else if(src.type==='room'){ if(DB.house.rooms.length<=1){toast('keep at least one room');return render();} if(confirm('Delete room “'+(DB.house.rooms.find(r=>r.id===src.id)||{}).name+'”? (Undoable)')){ pushHistory(); DB.house.rooms=DB.house.rooms.filter(r=>r.id!==src.id); DB.house.active=DB.house.rooms[0].id; save(); render(); toast('room deleted'); } else render(); }
      else toast('drag cancelled'); return; }
    if(!t){ render(); return; }
    if(t.kind==='sealLane' && src.type==='bench'){ openSeal(src.id); if(view.sealId && view.sealDraft) view.sealDraft.store=t.laneId||null; render(); return; }
    if(t.kind==='lane' && src.type==='product'){ const p=DB.products.find(x=>x.id===src.id); if(!p){render();return;} pushHistory();
      const laneId=t.laneId||null; const rest=DB.products.filter(x=>x.id!==p.id); const laneProds=rest.filter(x=>(x.store||null)===laneId);
      p.store=laneId; const refProd=laneProds[t.idx]; const at=refProd?rest.indexOf(refProd):rest.length; rest.splice(at,0,p); DB.products=rest;
      save(); render(); toast(laneId?('moved to '+((DB.stores.find(st=>st.id===laneId)||{}).name||laneId)):'moved to workshop (not shipping)'); return; }
    if(t.kind==='grid'){
      if(src.type==='product'){ if(t.gridType==='room'){ DB.house.active=t.room.id; placeProduct(src.id, t.idx); } else { forkProduct(); } return; }
      if(src.type==='card'){ const card=srcRoom.cards.find(c=>c.id===src.id); if(!card){ render(); return; } const toRoom=t.room; DB.house.active=toRoom.id;
        pushHistory(); srcRoom.cards=srcRoom.cards.filter(c=>c.id!==src.id);
        let idx=Math.min(t.idx, toRoom.cards.length); if(idx<0)idx=toRoom.cards.length;
        toRoom.cards.splice(idx,0,card); save(); render(); return; }
      if(src.type==='bench'){ const arr=DB.factory.benches; const from=arr.findIndex(b=>b.id===src.id); if(from<0){render();return;} pushHistory(); const [x]=arr.splice(from,1); let idx=Math.min(t.idx,arr.length); arr.splice(idx,0,x); save(); render(); return; }
      if(src.type==='slot'){ const arr=curSlots(); const from=src.idx; if(from<0||from>=arr.length){render();return;} pushHistory(); const [x]=arr.splice(from,1); let idx=Math.min(t.idx,arr.length); x.fuse=false; arr.splice(idx,0,x); healFuse(arr); benchSel=idx; save(); render(); return; }
      if(src.type==='room'){ const arr=DB.house.rooms; const from=arr.findIndex(r=>r.id===src.id); if(from<0){render();return;} pushHistory(); const [x]=arr.splice(from,1); let idx=Math.min(t.idx,arr.length); arr.splice(idx,0,x); save(); render(); return; }
      if(src.type==='tag'){ const arr=DB.house.cats||[]; const from=arr.indexOf(src.id); if(from<0){render();return;} pushHistory(); const [x]=arr.splice(from,1); let idx=Math.min(t.idx,arr.length); arr.splice(idx,0,x); save(); render(); return; }
      if(src.type==='qopt'){ const fe=t.grid.closest('.furn'); const hit=fe&&findCard(fe.dataset.fid); if(!hit){render();return;} const f=hit.card; const slot=(f.slots||[]).concat(f.back||[]).find(x=>x.id===src.sid); const lk=src.key||'options'; const cur=(f.content[src.sid]&&f.content[src.sid][lk]!=null)?f.content[src.sid][lk]:(slot&&slot.props[lk]); const lines=String(cur||'').split('\n'); const from=src.from; if(from<0||from>=lines.length){render();return;} pushHistory(); const [x]=lines.splice(from,1); let idx=Math.min(t.idx,lines.length); lines.splice(idx,0,x);
        const remap=a=>{ if(a===from)return idx; const a2=a>from?a-1:a; return a2>=idx?a2+1:a2; };
        if(lk==='options'&&f.rules&&(Array.isArray(f.rules.answers)||f.rules.answer!=null)){ const cs=Array.isArray(f.rules.answers)?f.rules.answers:[f.rules.answer]; f.rules.answers=cs.map(remap).sort((p,q)=>p-q); delete f.rules.answer; }
        if(lk==='items'&&f.state&&f.state._done&&f.state._done[src.sid]){ const od=f.state._done[src.sid], nd={}; Object.keys(od).forEach(k=>{ if(od[k])nd[remap(+k)]=true; }); f.state._done[src.sid]=nd; }
        f.content[src.sid]=f.content[src.sid]||{}; f.content[src.sid][src.key||'options']=lines.join('\n'); save(); render(); return; }
    }
    render();
  };
  document.addEventListener('pointermove',onMove,{passive:false}); document.addEventListener('pointerup',onUp);
}
/* Matrix header reorder — a DELIBERATELY different mechanic from the 1D engine above: a 2D table's row/column
   reorder can't slot a placeholder into a CSS grid without garbling it, so this uses a Notion-style drop-line
   (the gesture users know from spreadsheets) on the same ⠿ grip affordance. Rows reorder DB.house.rooms,
   columns reorder DB.house.cats; plain click on the header still filters (5px threshold). */

function startHeaderDrag(dim, axis, id, ev){
  if(ev.button!=null&&ev.button!==0) return;
  const sx=ev.clientX, sy=ev.clientY; let started=false, fly=null, drop=null;
  const headerSel = axis==='row'?'.mtx-rowh':'.mtx-colh', horiz = axis==='col';
  const clearInd=()=>document.querySelectorAll('.mtx-c.dropbefore,.mtx-c.dropafter').forEach(x=>x.classList.remove('dropbefore','dropafter'));
  const begin=()=>{ started=true; _dragging=true; document.documentElement.style.userSelect='none';
    const src=ev.target.closest('.mtx-c'); if(src){ fly=src.cloneNode(true); fly.classList.add('drag-fly'); fly.style.width=src.getBoundingClientRect().width+'px'; document.body.appendChild(fly); } };
  const onMove=mv=>{
    if(!started){ if(Math.hypot(mv.clientX-sx,mv.clientY-sy)<5) return; begin(); }
    if(mv.cancelable)mv.preventDefault();
    if(fly){ fly.style.left=(mv.clientX-18)+'px'; fly.style.top=(mv.clientY-12)+'px'; fly.style.display='none'; }
    const below=document.elementFromPoint(mv.clientX,mv.clientY); if(fly)fly.style.display='';
    clearInd(); drop=null;
    const hdr = below && below.closest(headerSel);
    if(!hdr) return;
    const tid = axis==='row'?hdr.dataset.rv:hdr.dataset.cv;
    if(tid===id || tid===UNTAG) return;
    const rc=hdr.getBoundingClientRect(); const after = horiz ? mv.clientX>rc.left+rc.width/2 : mv.clientY>rc.top+rc.height/2;
    hdr.classList.add(after?'dropafter':'dropbefore'); drop={targetId:tid, after};
  };
  const onUp=()=>{
    document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp);
    if(fly)fly.remove(); clearInd(); _dragging=false; document.documentElement.style.userSelect='';
    if(!started) return;
    const sw=ce=>{ce.stopPropagation();ce.preventDefault();document.removeEventListener('click',sw,true);}; document.addEventListener('click',sw,true); setTimeout(()=>document.removeEventListener('click',sw,true),350);
    if(!drop) return render();
    const arr = dim==='room'?DB.house.rooms:(DB.house.cats||[]); const idOf = dim==='room'?(x=>x.id):(x=>x);
    const from = arr.findIndex(x=>idOf(x)===id); if(from<0) return render();
    pushHistory(); const [x]=arr.splice(from,1);
    const ti = arr.findIndex(v=>idOf(v)===drop.targetId); if(ti<0){ arr.splice(from,0,x); return render(); }
    arr.splice(drop.after?ti+1:ti, 0, x); save(); render();
  };
  document.addEventListener('pointermove',onMove,{passive:false}); document.addEventListener('pointerup',onUp);
}

document.addEventListener('pointerdown',e=>{ if(_dragging)return;
  const mrg=e.target.closest('[data-mtxrowgrip]'); if(mrg){ startHeaderDrag(mrg.dataset.dim,'row', mrg.dataset.mtxrowgrip, e); return; }
  const mcg=e.target.closest('[data-mtxcolgrip]'); if(mcg){ startHeaderDrag(mcg.dataset.dim,'col', mcg.dataset.mtxcolgrip, e); return; }
  const cg=e.target.closest('[data-grip]'); if(cg){ const fe=cg.closest('.furn'); if(fe){ e.preventDefault(); e.stopPropagation(); startCardDrag({type:'card',id:fe.dataset.fid},e); } return; }
  const rrz=e.target.closest('[data-roomrz]'); if(rrz){ e.preventDefault(); e.stopPropagation(); const rm=DB.house.rooms.find(x=>x.id===rrz.dataset.roomrz); const roomEl=rrz.closest('.room'); if(rm&&roomEl){ const startW=roomEl.getBoundingClientRect().width, maxW=roomEl.parentElement.getBoundingClientRect().width; const snap=snapState(); startEdgeResize(e,(dx)=>{ const w=Math.max(240,Math.min(maxW,startW+dx)); roomEl.style.width=Math.round(w)+'px'; rm.width=Math.round(w); },()=>{ pushSnap(snap); save(); }); } return; }
  const rg=e.target.closest('[data-roomgrip]'); if(rg){ e.preventDefault(); e.stopPropagation(); startCardDrag({type:'room',id:rg.dataset.roomgrip,srcEl:rg.closest('.room')},e); return; }
  const bg=e.target.closest('[data-bcgrip]'); if(bg){ e.preventDefault(); e.stopPropagation(); startCardDrag({type:'bench',id:bg.dataset.bcgrip,srcEl:bg.closest('.faccard')},e); return; }
  const sg=e.target.closest('[data-bgrip]'); if(sg){ e.preventDefault(); e.stopPropagation(); startCardDrag({type:'slot',idx:+sg.dataset.bgrip,srcEl:sg.closest('.benchslot')},e); return; }
  const og=e.target.closest('[data-qgrip]'); if(og){ const row=og.closest('[data-qrow]'); if(row){ e.preventDefault(); e.stopPropagation(); startCardDrag({type:'qopt',sid:row.dataset.qslot,key:row.dataset.qkey||'options',from:+og.dataset.qgrip,srcEl:row},e); } return; }
  const trg=e.target.closest('[data-tagreorder]'); if(trg){ startCardDrag({type:'tag',id:trg.dataset.tagreorder,srcEl:trg},e); return; }
  const pe=e.target.closest('[data-prod],[data-invprod]'); if(pe){ const ib=e.target.closest('button'); if(ib&&ib!==pe&&pe.contains(ib))return; const id=pe.dataset.prod||pe.dataset.invprod; if(id) startCardDrag({type:'product',id,srcEl:pe},e); }
});

function startEdgeResize(ev, onDelta, onCommit){ ev.preventDefault(); ev.stopPropagation(); const sx=ev.clientX, sy=ev.clientY;
  const move=mv=>{ if(mv.cancelable)mv.preventDefault(); onDelta(mv.clientX-sx, mv.clientY-sy, mv); };
  const up=mv=>{ document.removeEventListener('pointermove',move); document.removeEventListener('pointerup',up); onCommit&&onCommit(mv); };
  document.addEventListener('pointermove',move,{passive:false}); document.addEventListener('pointerup',up); }
