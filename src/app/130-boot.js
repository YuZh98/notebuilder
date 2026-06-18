/* ====================== boot ====================== */
if(window.__LSA_SEED__){ EXPORT_MODE=true; DB=window.__LSA_SEED__; rebuildRefs(); }   // exported standalone file: boot the living house, never touch localStorage
else { load(); const w=localStorage.getItem('lsa_sidew'); if(w)document.documentElement.style.setProperty('--sidew',w+'px'); }
render();

$('#stage').addEventListener('dragover',e=>{ const t=e.dataTransfer.types||[]; if(t.includes('theme')||t.includes('col')||t.includes('verb')||t.includes('tagapply')||t.includes('behav'))e.preventDefault(); });
$('#stage').addEventListener('drop',e=>{ const types=e.dataTransfer.types||[];
  if(types.includes('behav')){ e.preventDefault(); const behav=e.dataTransfer.getData('behav'), sid=e.dataTransfer.getData('behavsid'); const fe=e.target.closest('.furn'); const hit=fe&&findCard(fe.dataset.fid); if(hit && (hit.card.slots||[]).concat(hit.card.back||[]).some(x=>x.id===sid)){ pushHistory(); hit.card.content[sid]=hit.card.content[sid]||{}; hit.card.content[sid][behav]=true; save(); render(); toast(behav==='submit'?'Require a check — on':'Shuffle in study — on'); } else toast('drop onto the quiz card'); return; }
  if(types.includes('pgshow')){ e.preventDefault(); const k=e.dataTransfer.getData('pgshow'), sid=e.dataTransfer.getData('pgsid'); const fe=e.target.closest('.furn'); const hit=fe&&findCard(fe.dataset.fid); if(hit && (hit.card.slots||[]).concat(hit.card.back||[]).some(x=>x.id===sid)){ pushHistory(); const c=hit.card.content[sid]=hit.card.content[sid]||{}; const slot=(hit.card.slots||[]).concat(hit.card.back||[]).find(x=>x.id===sid); const nx=pgShow(c.show!=null?c.show:(slot&&slot.props.show)); nx[k]=true; c.show=nx; save(); render(); toast('Show '+(k==='mn'?'M/N':k==='pct'?'%':'bar')+' — on'); } else toast('drop onto the progress card'); return; }
  if(types.includes('tagapply')){ e.preventDefault(); const tg=e.dataTransfer.getData('tagapply'); const fe=e.target.closest('.furn'); if(fe){ const hit=findCard(fe.dataset.fid); if(hit){ pushHistory(); hit.card.tag=hit.card.tag||[]; if(!hit.card.tag.includes(tg))hit.card.tag.push(tg); save(); render(); toast('tagged “'+tg+'”'); } } else toast('drop a tag onto a card'); return; }
  if(types.includes('verb')){ e.preventDefault(); const verb=e.dataTransfer.getData('verb'); const fc=e.target.closest('.faccard'); if(!fc){ toast('drop a container verb onto a container'); return; } const b=DB.factory.benches.find(x=>x.id===fc.dataset.bcard); if(b){ pushHistory(); if(verb==='flip'){ b.container.flip=true; if(!b.back||!b.back.length)b.back=clone(b.slots).map(s=>Object.assign(s,{id:uid('s')})); benchFace='front'; toast('flip applied — back face created'); } else if(verb==='bare'){ b.container.bare=true; toast('frameless applied'); } DB.factory.active=b.id; DB.bench=b; save(); render(); } return; }
  if(types.includes('col')){ const fc=e.target.closest('.faccard'); if(fc){ e.preventDefault(); const b=DB.factory.benches.find(x=>x.id===fc.dataset.bcard); if(b){b.accent=e.dataTransfer.getData('col'); save(); render(); toast('look applied');} } return; }
  });

(function(){ const rz=$('#resizer'); if(!rz)return; rz.addEventListener('pointerdown',ev=>{ let moved=false; startEdgeResize(ev, (dx,dy,mv)=>{ if(Math.abs(dx)>4)moved=true; if(moved&&!view.sideCollapsed){ const w=Math.max(220,Math.min(560,mv.clientX)); document.documentElement.style.setProperty('--sidew',w+'px'); } }, mv=>{ if(moved&&!view.sideCollapsed){ const w=Math.max(220,Math.min(560,mv.clientX)); localStorage.setItem('lsa_sidew',w); } else { view.sideCollapsed=!view.sideCollapsed; render(); } }); }); })();

(function(){ const db=$('#dustbin'); if(!db)return;
  db.addEventListener('dragover',e=>{ e.preventDefault(); db.classList.add('hot'); });
  db.addEventListener('dragleave',()=>db.classList.remove('hot'));
  db.addEventListener('drop',e=>{ e.preventDefault(); db.classList.remove('hot'); hideDust(); const dt=e.dataTransfer;
    const prod=dt.getData('prod')||dt.getData('invprod'); if(prod){ toast('drag cancelled — delete a product in the Inventory (🗑), not the house bin'); return; }
    const sv=dt.getData('svc'); if(sv){ const r=room(); if(r){ delete r.services[sv]; save(); render(); toast('removed “'+(SERVICES[sv]?SERVICES[sv].label:sv)+'” from '+r.name);} return; }
    toast('that can’t be deleted'); });
})();

document.addEventListener('focusin',e=>{ const bar=$('#mdbar'); if(!bar)return; const ta=e.target.closest('textarea.ce'); if(ta){ autoGrow(ta); view.mdTarget=ta; bar.innerHTML=mdbarHTML(); bar.classList.add('show'); const r=ta.getBoundingClientRect(); bar.style.left=Math.max(6,Math.min(window.innerWidth-260,r.left))+'px'; bar.style.top=Math.max(60,r.top-40)+'px'; } });
document.addEventListener('focusout',e=>{ if(e.target.matches&&e.target.matches('input,textarea,select'))editSession=false; if(e.target.closest('.ce')) setTimeout(()=>{ const a=document.activeElement; if(!a||!a.closest('.ce,#mdbar')){ $('#mdbar').classList.remove('show'); view.mdTarget=null; editSession=false; if(view.editSlot||view.editKey){ view.editSlot=null; view.editKey=null; render(); } } },150); });
document.addEventListener('input',e=>{ if(e.target.matches&&e.target.matches('textarea.ce'))autoGrow(e.target); }); // height fallback where field-sizing isn't supported
$('#mdbar').addEventListener('mousedown',e=>{ if(e.target.closest('button,summary'))e.preventDefault(); });
$('#mdbar').addEventListener('click',e=>{ const b=e.target.closest('.mdbtn,.symbtn,.colbtn'); if(b&&view.mdTarget)doMd(b,view.mdTarget); });
window.LS={DB:()=>DB, reset:()=>{localStorage.removeItem(DBKEY);load();render();}};
