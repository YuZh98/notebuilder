/* ====================== keyboard shortcuts ====================== */

document.addEventListener('keydown',e=>{
  const mod=e.metaKey||e.ctrlKey;
  const inField=e.target&&e.target.matches&&e.target.matches('input,textarea,[contenteditable="true"]');
  if(!mod && e.key==='Enter' && e.target.matches&&e.target.matches('textarea.ce') && ['ht','bname'].includes(e.target.dataset.act)){ e.preventDefault(); e.target.blur(); return; }
  if(mod && e.key==='Enter'){ e.preventDefault(); if(inField)e.target.blur();
    if(DB.place==='factory'){ DB.factory.study=!DB.factory.study; save(); render(); return; }  // Factory: Build ⇄ Preview
    const goStudy=!DB.studyOn; if(goStudy)resetPresentation(); DB.studyOn=goStudy; view.editSlot=null; if(DB.studyOn){sel=null;selProd=null;} save(); render(); return; }
  if(mod && (e.key==='s'||e.key==='S')){ e.preventDefault(); save(); toast('everything autosaves — you\u2019re always saved'); return; }
  if(mod && (e.key==='z'||e.key==='Z') && !inField){ e.preventDefault(); if(e.shiftKey)redo(); else undo(); return; }
  if(inField){ if(e.key==='Escape'){ e.preventDefault();
    if(editSession){ editSession=false; const snap=DB._undo.pop(); if(snap){ Object.assign(DB,JSON.parse(snap)); rebuildRefs(); save(); } view.editKey=null; view.editSlot=null; render(); }   // abort the edit session: restore the beginEdit snapshot, leave no history residue
    else e.target.blur(); } return; }
  if(e.key==='Escape'){ if(filterActive()){clearCells();render();} else if(sel||selProd||selKind!=='room'){ sel=null;selProd=null;selKind='room'; render(); } return; }
  if((e.key==='ArrowUp'||e.key==='ArrowDown') && DB.place==='house' && selKind==='room'){ e.preventDefault(); const rs=DB.house.rooms; let i=rs.findIndex(r=>r.id===DB.house.active); if(i<0)i=0; i=e.key==='ArrowUp'?Math.max(0,i-1):Math.min(rs.length-1,i+1); DB.house.active=rs[i].id; sel=null;selProd=null; render(); return; }
  if((e.key==='ArrowLeft'||e.key==='ArrowRight') && selKind==='card' && sel){ const f=findCard(sel); if(f){ e.preventDefault(); const cs=f.room.cards; let i=cs.findIndex(c=>c.id===sel); i=e.key==='ArrowLeft'?Math.max(0,i-1):Math.min(cs.length-1,i+1); sel=cs[i].id; render(); } return; }
});
