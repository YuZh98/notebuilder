/* ====================== drag + resize (house furniture) ====================== */
function wireDnD(){
  const grid=$('#stage');
  const roomFromEl=el=>{ const re=el.closest('.room'); return re?DB.house.rooms.find(x=>x.id===re.dataset.room):null; };

  grid.querySelectorAll('[data-rz]').forEach(h=>h.addEventListener('pointerdown',ev=>{
    const fid=h.dataset.rz; const rm=roomFromEl(h); if(!rm||rm.locked)return;
    const f=rm.cards.find(c=>c.id===fid); const fe=h.closest('.furn'); const colW=fe.parentElement.getBoundingClientRect().width/12; const startW=f.place.w; fe.classList.add('dragging');
    { const snap=snapState(); startEdgeResize(ev, dx=>{ let w=Math.max(3,Math.min(12,startW+dx/colW)); f.place.w=Math.round(w*20)/20; fe.style.setProperty('--w',f.place.w); }, ()=>{ fe.classList.remove('dragging'); pushSnap(snap); save(); }); }
  }));

  grid.querySelectorAll('.room').forEach(re=>{
    re.addEventListener('dragover',ev=>{ if((ev.dataTransfer.types||[]).includes('svc'))ev.preventDefault(); });
    re.addEventListener('drop',ev=>{ const k=ev.dataTransfer.getData('svc'); if(!k)return; ev.preventDefault(); const rr=DB.house.rooms.find(x=>x.id===re.dataset.room); if(rr&&(rr.kind||'mixed')!=='divider'){ pushHistory(); rr.services[k]=true; save(); render(); toast('added “'+(SERVICES[k]?SERVICES[k].label:k)+'” to '+rr.name); } });
  });

  grid.querySelectorAll('.svcbar [data-svcrz]').forEach(hnd=>hnd.addEventListener('pointerdown',ev=>{
    const k=hnd.dataset.svcrz; const rr=DB.house.rooms.find(x=>x.id===hnd.dataset.room); const item=hnd.closest('.svc-item'); const startW=item.getBoundingClientRect().width;
    startEdgeResize(ev, dx=>{ let w=Math.max(70,Math.min(440,startW+dx)); rr.svcW=rr.svcW||{}; rr.svcW[k]=Math.round(w); item.style.width=w+'px'; }, ()=>save());
  }));

  grid.querySelectorAll('[data-fusegut]').forEach(g=>g.addEventListener('pointerdown',ev=>{
    const fe=g.closest('.furn'); if(!fe)return; const hit=findCard(fe.dataset.fid); if(!hit)return; const all=(hit.card.slots||[]).concat(hit.card.back||[]); const li=all.findIndex(x=>x.id===g.dataset.fusegut); if(li<0||!all[li+1])return; const L=all[li],R=all[li+1];
    const lc=g.previousElementSibling, rc=g.nextElementSibling; const T=(L.fuseW||1)+(R.fuseW||1); const lb=lc.getBoundingClientRect(), rb=rc.getBoundingClientRect();
    { const snap=snapState(); startEdgeResize(ev, (dx,dy,mv)=>{ let r=(mv.clientX-lb.left)/(rb.right-lb.left); r=Math.max(.15,Math.min(.85,r)); L.fuseW=Math.round(T*r*100)/100; R.fuseW=Math.round(T*(1-r)*100)/100; lc.style.flex=L.fuseW; rc.style.flex=R.fuseW; }, ()=>{ pushSnap(snap); save(); }); }
  }));

  grid.querySelectorAll('.svcbar [data-svcbtn]').forEach(b=>{
    b.addEventListener('dragover',ev=>{ if((ev.dataTransfer.types||[]).includes('svcbtn'))ev.preventDefault(); });
    b.addEventListener('drop',ev=>{ const from=ev.dataTransfer.getData('svcbtn'); if(!from)return; ev.preventDefault(); const to=b.dataset.svcbtn; const rr=DB.house.rooms.find(x=>x.id===b.closest('.svcbar').dataset.room); if(!rr||from===to)return; const all=Object.keys(SERVICES); const order=(rr.svcOrder&&rr.svcOrder.length?rr.svcOrder:all).slice(); const arr=order.filter(k=>k!==from); const ti=arr.indexOf(to); arr.splice(ti<0?arr.length:ti,0,from); rr.svcOrder=arr; save(); render(); });
  });
}
