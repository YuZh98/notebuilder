/* ====================== bench drag-reorder + edge-resize + fork-drop ====================== */
function wireBench(){

  const grid=$('.faccard.on .bench-grid'); if(!grid)return;
  const arr=()=>curSlots();
  grid.querySelectorAll('[data-brz]').forEach(h=>h.addEventListener('pointerdown',ev=>{
    const i=+h.dataset.brz; const s=arr()[i]; const cell=h.closest('.benchslot'); const colW=grid.getBoundingClientRect().width/12, startW=s.w; cell.classList.add('dragging');
    { const snap=snapState(); startEdgeResize(ev, dx=>{ let w=Math.max(2,Math.min(12,startW+dx/colW)); s.w=Math.round(w*20)/20; cell.style.setProperty('--w',s.w); const wb=cell.querySelector('.wbadge'); if(wb)wb.textContent='w'+(Math.round(s.w*10)/10); }, ()=>{ cell.classList.remove('dragging'); pushSnap(snap); save(); }); }
  }));
  // slot-type from the palette is a native ATTACH gesture (deliberately different from reordering) → add a slot
  grid.addEventListener('dragover',ev=>{ const t=ev.dataTransfer.types||[]; if(t.includes('slot')||t.includes('svverb'))ev.preventDefault(); });
  grid.addEventListener('drop',ev=>{ const types=ev.dataTransfer.types||[];
    if(types.includes('svverb')){ ev.preventDefault(); const cell=ev.target.closest('.benchslot'); const k=ev.dataTransfer.getData('svverb'); if(!cell){ toast('drop a slot verb onto a slot'); return; } const i=+cell.dataset.bs; const s=curSlots()[i]; if(!s){ toast('no slot here'); return; } pushHistory(); s.verbs=s.verbs||{}; s.verbs[k]= k==='reveal'?(s.verbs[k]||{key:'pick',op:'==',val:0}):true; benchSel=i; save(); render(); toast(SVERBS[k].label+' applied'); return; }
    if(!types.includes('slot'))return; ev.preventDefault(); const t=ev.dataTransfer.getData('slot'); pushHistory(); const a=curSlots(); a.push({id:uid('s'),type:t,w:12,props:SLOTS[t].make(),verbs:{}}); benchSel=a.length-1; save(); render(); });
}

document.addEventListener('dragstart',e=>{ const c=e.target.closest('[data-prod]'); if(c)e.dataTransfer.setData('prod',c.dataset.prod); const iv=e.target.closest('[data-invprod]'); if(iv)e.dataTransfer.setData('invprod',iv.dataset.invprod); const sv=e.target.closest('[data-svcdrag]'); if(sv)e.dataTransfer.setData('svc',sv.dataset.svcdrag); const cd=e.target.closest('[data-coldrag]'); if(cd)e.dataTransfer.setData('col',cd.dataset.coldrag); const sb=e.target.closest('[data-svcbtn]'); if(sb&&sb.getAttribute('draggable')==='true')e.dataTransfer.setData('svcbtn',sb.dataset.svcbtn); const sl=e.target.closest('[data-slotdrag]'); if(sl)e.dataTransfer.setData('slot',sl.dataset.slotdrag); const vb=e.target.closest('[data-verbdrag]'); if(vb)e.dataTransfer.setData('verb',vb.dataset.verbdrag); const vv=e.target.closest('[data-svverbdrag]'); if(vv)e.dataTransfer.setData('svverb',vv.dataset.svverbdrag); const tg=e.target.closest('[data-tagdrag]'); if(tg)e.dataTransfer.setData('tagapply',tg.dataset.tagdrag); const bh=e.target.closest('[data-behavdrag]'); if(bh){e.dataTransfer.setData('behav',bh.dataset.behavdrag); e.dataTransfer.setData('behavsid',bh.dataset.s);} const ps=e.target.closest('[data-pgshowdrag]'); if(ps){e.dataTransfer.setData('pgshow',ps.dataset.pgshowdrag); e.dataTransfer.setData('pgsid',ps.dataset.s);} showDust(); });
document.addEventListener('dragend',hideDust);
document.addEventListener('drop',hideDust);
