/* ====================== EVENTS ====================== */
document.addEventListener('click',e=>{
  { const ts=getSelection&&getSelection(); if(ts && !ts.isCollapsed && e.target.closest('#stage') && !e.target.closest('button,input,textarea,select')) return; }   // finishing a text selection is not an action — copy in peace
  if(view.nbMenu && !e.target.closest('.nbwrap')){ view.nbMenu=false; renderTop(); }
  if(view.themeMenu && !e.target.closest('.themewrap')){ view.themeMenu=false; renderTop(); }
  const card=e.target.closest('[data-selectable]');
  const a=e.target.closest('[data-act]');

  if(card && card.dataset.fid){
    if(sel!==card.dataset.fid){ sel=card.dataset.fid; selKind='card'; selProd=null;
      document.querySelectorAll('#stage .furn.sel').forEach(x=>x.classList.remove('sel')); card.classList.add('sel'); renderSide(); }

    if(!a || !card.contains(a)) return;
  }
  if(!a){ if(!card && !DB.studyOn && DB.place==='house' && e.target.closest('#stage') && !e.target.closest('.room,.furn,.mtx-wrap,.fusegut,textarea,input')){ selKind='house'; sel=null; selProd=null; renderSide(); document.querySelectorAll('#stage .furn.sel,#stage .room.sel').forEach(x=>x.classList.remove('sel')); const hh=document.querySelector('.house-head'); if(hh)hh.classList.add('sel'); } return; }
  const act=a.dataset.act, d=a.dataset;
  const r=room();
  switch(act){
    case'fcbool':{const f=findCard(sel); if(f){commit(()=>{ f.card.content[d.s]=f.card.content[d.s]||{}; const base=(f.card.slots||[]).concat(f.card.back||[]).find(x=>x.id===d.s); const cur=f.card.content[d.s][d.key]; const def=base?base.props[d.key]:undefined; const now=(cur!=null?cur:def)!==false; f.card.content[d.s][d.key]=!now; }); }} break;
    case'fcflag':{const f=findCard(sel); if(f){commit(()=>{ f.card.content[d.s]=f.card.content[d.s]||{}; const cur=f.card.content[d.s][d.key]; f.card.content[d.s][d.key]=!(cur===true||cur==='true'); }); }} break;
    case'varins':{ const inp=document.querySelector(`#side [data-act="fc"][data-s="${d.s}"][data-key="${d.key}"]`); if(inp){ const foc=document.activeElement===inp; const a0=foc?inp.selectionStart:inp.value.length, a1=foc?inp.selectionEnd:inp.value.length; inp.value=inp.value.slice(0,a0)+d.v+inp.value.slice(a1); const np=a0+d.v.length; inp.focus(); inp.setSelectionRange(np,np); const f=findCard(sel); if(f){f.card.content[d.s]=f.card.content[d.s]||{}; f.card.content[d.s][d.key]=inp.value; refreshFurn(f.card);} } } break;

    case'place': DB.place=d.k; sel=null; selProd=null; benchSel=null; save(); render(); break;
    case'study': case'hmode':{ const goStudy=(act==='hmode')?(d.m==='study'):!DB.studyOn; if(goStudy && !DB.studyOn) resetPresentation(); DB.studyOn=goStudy; view.editSlot=null; if(DB.studyOn){sel=null;selProd=null;} save(); render(); } break;
    case'nbmenu': view.nbMenu=!view.nbMenu; view.themeMenu=false; renderTop(); break;
    case'thememenu': view.themeMenu=!view.themeMenu; view.nbMenu=false; renderTop(); break;
    case'remix': DB.shared=false; toast('Editing unlocked — changes stay in this file (a reload reopens the original)'); render(); break;
    case'tophide': view.topHide=!view.topHide; try{localStorage.setItem('lsa_tophide',view.topHide?'1':'0')}catch(e){} renderTop(); break;
    case'gohouse': view.nbMenu=false; DB.place='house'; DB.activeHouse=d.id; DB.house=DB.houses.find(h=>h.id===d.id)||DB.houses[0]; selKind='house'; sel=null;selProd=null; view.cells=[]; view.editSlot=null; save(); render(); break;
    case'export': doExport(); break;
    case'import': doImport(); break;
    case'camera': doSnapshot(); break;
    case'pdf': if(!DB.studyOn){DB.studyOn=true;sel=null;selProd=null;render();} toast('print dialog → Save as PDF'); setTimeout(()=>window.print(),150); break;

    case'selhouse': selKind='house'; sel=null; selProd=null; render(); break;
    case'room': case'selroom': if(DB.studyOn)break; selKind='room'; DB.house.active=d.id; sel=null; selProd=null; render(); break;
    case'roomcollapse':{const rm=DB.house.rooms.find(x=>x.id===d.id); if(rm){rm._collapsed=!rm._collapsed; render();}} break;

    case'sidetoggle': view.sideCollapsed=!view.sideCollapsed; try{localStorage.setItem('lsa_sidecollapsed',view.sideCollapsed?'1':'0')}catch(e){} render(); break;
    case'undo': undo(); break;
    case'redo': redo(); break;
    case'addcat':{const el=$('#newcat'); const v=el&&el.value.trim(); if(v){commit(()=>{ DB.house.cats=DB.house.cats||[]; if(!DB.house.cats.includes(v))DB.house.cats.push(v); }); toast('tag “'+v+'” created — drag it onto a card');}} break;
    case'tagdel':{ const tag=d.c; const used=DB.house.rooms.reduce((n,rm)=>n+(rm.cards||[]).filter(c=>(c.tag||[]).includes(tag)).length,0);
      if(used>0 && !confirm('Delete tag “'+tag+'”?\nIt will be removed from '+used+' card'+(used===1?'':'s')+'. (Undoable)')) break;
      commit(()=>{ DB.house.cats=(DB.house.cats||[]).filter(t=>t!==tag); DB.house.rooms.forEach(rm=>rm.cards.forEach(cd=>{ if(cd.tag)cd.tag=cd.tag.filter(t=>t!==tag); })); view.cells=selCells().filter(k=>{const i=k.indexOf('␟'); return k.slice(0,i)!==tag&&k.slice(i+1)!==tag;}); }); toast('tag “'+tag+'” deleted'+(used?' (Undo to restore)':'')); } break;

    case'house': DB.activeHouse=d.id; DB.house=DB.houses.find(h=>h.id===d.id)||DB.houses[0]; selKind='house'; sel=null;selProd=null; view.cells=[]; view.editSlot=null; save(); render(); break;    case'newnb': view.nbMenu=false; view.newNb={tpl:'',title:'',sub:''}; render(); break;
    case'nbtpl': if(view.newNb)view.newNb.tpl=d.id; render(); break;
    case'nbcancel': view.newNb=null; render(); break;
    case'nbprompt': (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(AI_PROMPT):Promise.reject()).then(()=>toast('AI prompt copied — paste it to an LLM, then paste the JSON back')).catch(()=>toast('copy failed — select the prompt manually')); break;
    case'nbcreate':{ const nb=view.newNb||{};
      if((nb.json||'').trim()){ view.newNb=null; if(!importHouse(nb.json)){ view.newNb=nb; render(); } break; }
      const title=(nb.title||'').trim()||'Untitled'; const sub=(nb.sub||'').trim(); let h;
      if(nb.tpl){ const t=DB.templates.find(x=>x.id===nb.tpl); h=clone(t); h.id=uid('h'); (h.rooms||[]).forEach(rm=>{rm.id=uid('r'); (rm.cards||[]).forEach(c=>c.id=uid('f'));}); h.active=h.rooms[0].id; }
      else { const rm={id:uid('r'),name:'Room 1',kind:'mixed',locked:false,services:{pin:true},categories:[],notes:[],cards:[]}; h={id:uid('h'),rooms:[rm],active:rm.id,style:DB.house.style||'',width:'medium',cats:[]}; }
      h.name=title; h.subtitle=sub; view.newNb=null;
      commit(()=>{ DB.houses.push(h); DB.activeHouse=h.id; DB.house=h; DB.place='house'; selKind='house'; sel=null; selProd=null; }); toast('created “'+title+'”'); } break;
    case'delnb':{ if(DB.houses.length<=1){toast('keep at least one notebook');break;} if(!confirm('Delete notebook “'+DB.house.name+'”? (Undoable)'))break; commit(()=>{ const id=DB.activeHouse; DB.houses=DB.houses.filter(x=>x.id!==id); DB.activeHouse=DB.houses[0].id; DB.house=DB.houses[0]; selKind='house'; sel=null;selProd=null; }); } break;

    case'housewidth': commit(()=>{ DB.house.width=d.v; }); break;    case'revop':{const s=curSlots()[benchSel]; if(s&&s.verbs&&s.verbs.reveal){ commit(()=>{ s.verbs.reveal.op=d.v; }); }} break;
    case'revkey':{const s=curSlots()[benchSel]; if(s&&s.verbs&&s.verbs.reveal){ commit(()=>{ s.verbs.reveal.key=d.k; }); }} break;
    case'addroom': commit(()=>{ const nr={id:uid('r'),name:'Room '+(DB.house.rooms.length+1),kind:'mixed',locked:false,services:{pin:true},categories:[],notes:[],cards:[]}; const ai=DB.house.rooms.findIndex(x=>x.id===DB.house.active); DB.house.rooms.splice(ai<0?DB.house.rooms.length:ai+1,0,nr); DB.house.active=nr.id; selKind='room'; sel=null;selProd=null; }); break;
    case'delroom':{if(DB.house.rooms.length<=1){toast('keep at least one room');break;} if(!confirm('Delete room “'+r.name+'”? (Undoable)'))break; commit(()=>{ DB.house.rooms=DB.house.rooms.filter(x=>x.id!==r.id); DB.house.active=DB.house.rooms[0].id; view.cells=selCells().filter(k=>{const i=k.indexOf('␟'); return k.slice(0,i)!==r.id&&k.slice(i+1)!==r.id;}); }); } break;

    case'adddivider': commit(()=>{ const nr={id:uid('r'),name:'Chapter',kind:'divider',locked:false,services:{},categories:[],notes:[],cards:[]}; const ai=DB.house.rooms.findIndex(x=>x.id===DB.house.active); DB.house.rooms.splice(ai<0?DB.house.rooms.length:ai+1,0,nr); DB.house.active=nr.id; selKind='room'; sel=null;selProd=null; }); break;
    case'lock':{ const rm=d.id?DB.house.rooms.find(x=>x.id===d.id):r; if(rm)commit(()=>{ rm.locked=!rm.locked; }); } break;
    case'svc':{ const rm=d.id?DB.house.rooms.find(x=>x.id===d.id):r; if(rm)commit(()=>{ rm.services[d.k]=!rm.services[d.k]; }); } break;
    case'fold': view.fold[d.s]=!view.fold[d.s]; render(); break;
    case'invfold': view.fold['inv:'+d.s]=!view.fold['inv:'+d.s]; render(); break;
    case'selprod': selProd=d.id; sel=null; selKind='product'; view.pdraft={}; view.prevFurn=null; view.prodVariety=null; render(); break;
    case'pickvariety': view.prodVariety={pid:selProd,v:d.v}; renderSide(); break;
    case'setvariety':{const f=findCard(sel); if(f){ const p=DB.products.find(x=>baseKey(x.name)===baseKey(f.card.name)); const v=p&&(p.varieties||[]).find(x=>x.name===d.v); if(v){ commit(()=>{ f.card.accent=v.accent||''; f.card.variety=v.name; }); } }} break;
    case'closedetail': selProd=null; selKind='room'; render(); break;
    case'prevmode': view.prevStudy=(d.m==='study'); render(); break;
    case'placeprod': placeProduct(d.id); break;
    case'settheme': view.themeMenu=false; if((DB.theme||'')!==d.id){ commit(()=>{ DB.theme=d.id; }); } else renderTop(); break;

    case'deselect': sel=null; selKind='room'; render(); break;
    case'ftag':{const f=findCard(sel); if(f){commit(()=>{ const t=f.card.tag; const i=t.indexOf(d.c); if(i<0)t.push(d.c);else t.splice(i,1); }); }} break;    case'mtxcell': toggleCells([d.rv+'␟'+d.cv]); render(); break;
    case'mtxrow':{ const {ck,D}=mtxEffectiveAxes(); toggleCells(D[ck].values().map(cv=>d.rv+'␟'+cv)); render(); } break;
    case'mtxcol':{ const {rk,D}=mtxEffectiveAxes(); toggleCells(D[rk].values().map(rv=>rv+'␟'+d.cv)); render(); } break;
    case'mtxclear': clearCells(); render(); break;
    case'mtxfold': view.fold.__matrix__=!view.fold.__matrix__; render(); break;
    case'mtxall':{ if(filterActive())clearCells(); else { const {rk,ck,D}=mtxEffectiveAxes(); const a=[]; D[rk].values().forEach(rv=>D[ck].values().forEach(cv=>a.push(rv+'␟'+cv))); view.cells=a; } render(); } break;
    case'mtxaxis':{ const ax=d.ax,nd=d.d, rk=view.mtxRow||'room', ck=view.mtxCol||'product'; if(ax==='row'){ if(ck===nd)view.mtxCol=rk; view.mtxRow=nd; } else { if(rk===nd)view.mtxRow=ck; view.mtxCol=nd; } clearCells(); render(); } break;
    case'fvar':{const f=findCard(sel); const p=DB.products.find(x=>x.id===d.id); if(f&&p){commit(()=>{ const c=f.card; c.slots=clone(p.slots); c.container=clone(p.container); c.rules=clone(p.rules); c.accent=p.accent||''; c.variety=varLabel(p.name)||'1'; c.state={}; });}} break;
    case'editslot':{ sel=d.fid; selKind='card'; selProd=null; view.editKey=null; view.editSlot={fid:d.fid,sid:d.s}; render(); const ta=document.querySelector('.ce[data-autofocus]'); if(ta){ ta.focus(); ta.selectionStart=ta.selectionEnd=ta.value.length; autoGrow(ta); } } break;
    case'edithere':{ view.editKey=d.key; view.editSlot=null;
      const km=String(d.key||'').match(/^(house|room|bench|seal):([^:]*)/);
      if(km){ if(km[1]==='house'){ selKind='house'; sel=null; selProd=null; } else if(km[1]==='room'){ selKind='room'; DB.house.active=km[2]; sel=null; selProd=null; } }
      render(); const ta=document.querySelector('.ce[data-autofocus]'); if(ta){ ta.focus(); ta.selectionStart=ta.selectionEnd=ta.value.length; autoGrow(ta); } } break;
    case'markans':{const fe=a.closest('.furn'); const f=fe&&findCard(fe.dataset.fid); if(f){ commit(()=>{ const i=+d.i; const next=correctSet(f.card.rules); const at=next.indexOf(i); if(at>=0)next.splice(at,1); else next.push(i); next.sort((x,y)=>x-y); f.card.rules=f.card.rules||{}; f.card.rules.answers=next; delete f.card.rules.answer; }); }} break;
    case'liststyle':{const f=findCard(sel); if(f){commit(()=>{ const c=f.card.content[d.s]||(f.card.content[d.s]={}); c.style=d.v; });}} break;
    case'pgscope':{const f=findCard(sel); if(f){commit(()=>{ const c=f.card.content[d.s]||(f.card.content[d.s]={}); c.scope=d.v; });}} break;
    case'pgtag':{const f=findCard(sel); if(f){commit(()=>{ const c=f.card.content[d.s]||(f.card.content[d.s]={}); const slot=(f.card.slots||[]).concat(f.card.back||[]).find(x=>x.id===d.s); const base=((c.track!=null?c.track:(slot&&slot.props.track))||[]).slice(); const i=base.indexOf(d.v); if(i>=0)base.splice(i,1); else base.push(d.v); c.track=base; });}} break;
    case'pgshow':{const f=findCard(sel); if(f){commit(()=>{ const c=f.card.content[d.s]||(f.card.content[d.s]={}); const slot=(f.card.slots||[]).concat(f.card.back||[]).find(x=>x.id===d.s); const nx=pgShow(c.show!=null?c.show:(slot&&slot.props.show)); nx[d.k]=!nx[d.k]; if(nx.mn||nx.pct||nx.bar)c.show=nx; });}} break;
    case'qbehav':{const f=findCard(sel); if(f){commit(()=>{ const slot=(f.card.slots||[]).concat(f.card.back||[]).find(x=>x.id===d.s); const c=f.card.content[d.s]||(f.card.content[d.s]={}); const eff=c[d.behav]!=null?c[d.behav]:(slot&&slot.props[d.behav]); c[d.behav]=!(eff===true); });}} break;
    case'qcheck':{const f=findFurn(a); if(f){ f.state=f.state||{}; f.state._qdone=f.state._qdone||{}; f.state._qdone[d.s]=true; if(!f._prev&&!f._fac)save(); render(); }} break;
    case'qreset':{const f=findFurn(a); if(f){ if(f.state&&f.state._qdone)delete f.state._qdone[d.s]; if(f.state&&f.state._qsel)delete f.state._qsel[d.s]; const slot=(f.slots||[]).concat(f.back||[]).find(x=>x.id===d.s); const props=slot?Object.assign({},slot.props,(f.content&&f.content[d.s])||{}):{}; if(props.key&&f.state)delete f.state[props.key]; if(!f._prev&&!f._fac)save(); render(); }} break;
    case'coptadd':{const fe=a.closest('.furn'); const f=fe&&findCard(fe.dataset.fid); if(f){const lk=d.key||'options'; const slot=(f.card.slots||[]).concat(f.card.back||[]).find(x=>x.id===d.s); const cur=(f.card.content[d.s]&&f.card.content[d.s][lk]!=null)?f.card.content[d.s][lk]:(slot&&slot.props[lk]); const lines=String(cur||'').split('\n'); pushHistory(); lines.push(lk==='items'?'new item':'new option'); f.card.content[d.s]=f.card.content[d.s]||{}; f.card.content[d.s][lk]=lines.join('\n'); save(); render();}} break;
    case'coptdel':{const fe=a.closest('.furn'); const f=fe&&findCard(fe.dataset.fid); if(f){const lk=d.key||'options'; const slot=(f.card.slots||[]).concat(f.card.back||[]).find(x=>x.id===d.s); const cur=(f.card.content[d.s]&&f.card.content[d.s][lk]!=null)?f.card.content[d.s][lk]:(slot&&slot.props[lk]); const lines=String(cur||'').split('\n'); const di=+d.i; pushHistory(); lines.splice(di,1); if(lk==='options'&&f.card.rules&&(Array.isArray(f.card.rules.answers)||f.card.rules.answer!=null)){ const cs=Array.isArray(f.card.rules.answers)?f.card.rules.answers:[f.card.rules.answer]; f.card.rules.answers=cs.filter(x=>x!==di).map(x=>x>di?x-1:x); delete f.card.rules.answer; }
      if(lk==='items'&&f.card.state&&f.card.state._done&&f.card.state._done[d.s]){ const od=f.card.state._done[d.s], nd={}; Object.keys(od).forEach(k=>{const a=+k; if(!od[k]||a===di)return; nd[a>di?a-1:a]=true;}); f.card.state._done[d.s]=nd; } f.card.content[d.s]=f.card.content[d.s]||{}; f.card.content[d.s][lk]=lines.join('\n'); save(); render(); toast((lk==='items'?'item':'option')+' removed (Undo to restore)');}} break;
    case'dupfurn':{const f=findCard(sel); if(f){ commit(()=>{ const nc=clone(f.card); nc.id=uid('f'); nc.state={}; const i=f.room.cards.indexOf(f.card); f.room.cards.splice(i+1,0,nc); sel=nc.id; selKind='card'; }); toast('card duplicated (Undo to restore)'); }} break;
    case'delfurn':{const f=findCard(sel); if(f){commit(()=>{ f.room.cards=f.room.cards.filter(c=>c.id!==sel); sel=null; selKind='room'; }); toast('card deleted (Undo to restore)');}} break;

    case'svcrun': runService(d.k,DB.house.rooms.find(x=>x.id===d.room)||r); break;
    case'archtoggle':{const rm=DB.house.rooms.find(x=>x.id===d.room); if(rm){rm._showArch=!rm._showArch; render();}} break;
    case'pin':{const f=findCard(d.fid); if(f){ commit(()=>{ const c=f.card; c.tag=c.tag||[]; const i=c.tag.indexOf('pinned'); if(i>=0){ c.tag.splice(i,1); if(!DB.house.rooms.some(r=>r.cards.some(x=>(x.tag||[]).includes('pinned')))) DB.house.cats=(DB.house.cats||[]).filter(t=>t!=='pinned'); } else { c.tag.push('pinned'); DB.house.cats=DB.house.cats||[]; if(!DB.house.cats.includes('pinned'))DB.house.cats.push('pinned'); } }); }} break;
    case'archive':{const f=findCard(d.fid); if(f){f.card.state._arch=true; save(); render(); toast('archived — see the Archive view');}} break;
    case'unarchive':{const f=findCard(d.fid); if(f){f.card.state._arch=false; save(); render(); toast('restored');}} break;

    case'flip':{ if(e.target.closest('[data-i],input,select,textarea,a,.fusegut'))break; const f=findFurn(e.target); if(f&&(f._fac||f._prev||DB.studyOn)){f.state._seen=true; f.state._flip=!f.state._flip; if(!f._prev&&!f._fac)save(); render();}} break;

    case'facmode': DB.factory.study=(d.m==='study'); render(); break;
    case'addbench': addBench(); break;
    case'dupbench':{ const src=DB.factory.benches.find(x=>x.id===d.id); if(src){ commit(()=>{ const nb=clone(src); nb.id=uid('c'); nb._edit=null; nb._src=src._src?clone(src._src):null; (nb.slots||[]).forEach(s=>s.id=uid('s')); if(nb.back)nb.back.forEach(s=>s.id=uid('s')); const i=DB.factory.benches.indexOf(src); DB.factory.benches.splice(i+1,0,nb); DB.factory.active=nb.id; DB.bench=nb; benchSel=null; }); toast('duplicated — tweak its look/name, then seal as a variety'); } } break;
    case'selbench': DB.factory.active=d.id; DB.bench=DB.factory.benches.find(b=>b.id===d.id); benchSel=null; render(); break;
    case'delbench': delBench(d.id); break;
    case'sealbench': openSeal(d.id); break;
    case'varadd':{ const d2=view.sealDraft; d2.varieties=d2.varieties||[]; d2.varieties.push({name:'Variety '+(d2.varieties.length+1),accent:''}); renderModal(); } break;
    case'vardel':{ const d2=view.sealDraft; if(d2.varieties){ d2.varieties.splice(+d.i,1); renderModal(); } } break;
    case'varaccent':{ const d2=view.sealDraft; const v=d2.varieties&&d2.varieties[+d.i]; if(v){ v.accent=d.c; renderModal(); } } break;
    case'sealconfirm': sealConfirm(); break;
    case'sealreplace': sealConfirm('replace'); break;
    case'sealnew': sealConfirm('new'); break;
    case'sealcancel': view.sealId=null; render(); break;
    case'sealship': view.sealDraft.store = (view.sealDraft.store===d.s ? null : d.s); render(); break;
    case'sealicon': view.sealDraft.icon = d.ic||''; render(); break;

    case'addslot': commit(()=>{ const arr=curSlots(); arr.push({id:uid('s'),type:d.t,w:12,props:SLOTS[d.t].make(),verbs:{}}); benchSel=arr.length-1; }); break;
    case'selslot': benchSel=+d.i; render(); break;
    case'delslot': commit(()=>{ const arr=curSlots(); arr.splice(+d.i,1); healFuse(arr); benchSel=null; }); break;
    case'flipverb': commit(()=>{ const b=DB.bench; b.container.flip=!b.container.flip; if(b.container.flip){ if(!b.back||!b.back.length) b.back=clone(b.slots).map(s=>Object.assign(s,{id:uid('s')})); } benchFace='front'; benchSel=null; }); break;
    case'bareverb': commit(()=>{ DB.bench.container.bare=!DB.bench.container.bare; }); break;
    case'bface': benchFace=d.f; benchSel=null; render(); break;
    case'bvar': commit(()=>{ DB.bench.accent=d.v; }); break;
    case'sverb':{const s=benchSel!=null?curSlots()[benchSel]:null; if(!s){toast('select a slot first (click one), then apply the verb');break;} commit(()=>{ s.verbs=s.verbs||{}; if(s.verbs[d.k])delete s.verbs[d.k]; else s.verbs[d.k]= d.k==='reveal'?{key:'pick',op:'==',val:0}:true; }); } break;
    case'fusetoggle':{ const i=+d.i; const ar=curSlots(); const s=ar[i]; if(s&&ar[i+1]){ commit(()=>{ s.fuse=!s.fuse; if(s.fuse){ if(s.fuseW==null)s.fuseW=1; if(ar[i+1].fuseW==null)ar[i+1].fuseW=1; } }); } } break;
    case'loadprod': commit(()=>{ const p=DB.products.find(x=>x.id===d.id); const nb={id:uid('c'),name:p.name,container:clone(p.container),slots:clone(p.slots),back:p.back?clone(p.back):undefined,rules:clone(p.rules),accent:p.accent||'',note:p.note||'',icon:p.icon||'',varieties:clone(p.varieties||[]),_src:{id:p.id,name:p.name}}; (nb.slots||[]).forEach(s=>s.id=uid('s')); (nb.back||[]).forEach(s=>s.id=uid('s')); DB.factory.benches.push(nb); DB.factory.active=nb.id; DB.bench=nb; benchSel=null; DB.place='factory'; }); toast('copied “'+(DB.bench.name)+'” — edit freely, then seal'); break;
    case'delprod':{const p=DB.products.find(x=>x.id===d.p); if(p && confirm('Delete product “'+baseName(p.name)+'”? (placed cards are unaffected — sealed copies. Undoable.)')){ commit(()=>{ DB.products=DB.products.filter(x=>x.id!==d.p); if(selProd===d.p){selProd=null;selKind='room';} }); toast('product deleted'); }} break;
  }
});

document.addEventListener('input',e=>{
  const a=e.target.closest('[data-act]'); if(!a)return; const d=a.dataset, act=a.dataset.act, r=room();
  switch(act){
    case'bname': beginEdit(); DB.bench.name=e.target.value.replace(/\n/g,' '); save(); break;
    case'bnote': beginEdit(); DB.bench.note=e.target.value; save(); break;
    case'sprop':{const s=curSlots()[benchSel]; let v=e.target.value; if(e.target.type==='number')v=+v; s.props[d.key]=v; refreshBenchPreview();} break;
    case'fuseratio':{ const i=+d.i; const ar=curSlots(); const s=ar[i], nx=ar[i+1]; if(s&&nx){ beginEdit(); const T=(s.fuseW||1)+(nx.fuseW||1); const r=+e.target.value/100; s.fuseW=Math.round(T*r*100)/100; nx.fuseW=Math.round(T*(1-r)*100)/100; save(); renderStage(); } } break;
    case'rev':{const s=curSlots()[benchSel]; if(s&&s.verbs&&s.verbs.reveal){ beginEdit(); const v=e.target.value; s.verbs.reveal[d.f]=(v!==''&&!isNaN(+v))?+v:v; save(); }} break;    case'sealname': view.sealDraft.name=e.target.value; break;
    case'sealiconfree': view.sealDraft.icon=e.target.value||''; break;
    case'sealnote': view.sealDraft.note=e.target.value; break;
    case'varname':{ const v=view.sealDraft.varieties&&view.sealDraft.varieties[+d.i]; if(v)v.name=e.target.value; } break;
    case'pdraft':{ view.pdraft[d.s]=view.pdraft[d.s]||{}; view.pdraft[d.s][d.key]=e.target.value; refreshPrev(); } break;
    case'fc':{beginEdit(); const f=findCard(sel); if(f){ f.card.content[d.s]=f.card.content[d.s]||{}; f.card.content[d.s][d.key]=e.target.value; refreshFurn(f.card);}} break;

    case'ce':{beginEdit(); const fe=e.target.closest('.furn'); const f=fe&&findCard(fe.dataset.fid); if(f){f.card.content[d.s]=f.card.content[d.s]||{}; f.card.content[d.s][d.key]=e.target.value; save();}} break;
    case'copt':{beginEdit(); const fe=e.target.closest('.furn'); const f=fe&&findCard(fe.dataset.fid); if(f){const lk=d.key||'options'; const slot=(f.card.slots||[]).concat(f.card.back||[]).find(x=>x.id===d.s); const cur=(f.card.content[d.s]&&f.card.content[d.s][lk]!=null)?f.card.content[d.s][lk]:(slot&&slot.props[lk]); const lines=String(cur||'').split('\n'); lines[+d.i]=e.target.value; f.card.content[d.s]=f.card.content[d.s]||{}; f.card.content[d.s][lk]=lines.join('\n'); save();}} break;
    case'nbtitle': if(view.newNb)view.newNb.title=e.target.value; break;
    case'nbsub': if(view.newNb)view.newNb.sub=e.target.value; break;
    case'nbjson': if(view.newNb)view.newNb.json=e.target.value; break;
    case'ht': beginEdit(); DB.house.name=e.target.value.replace(/\n/g,' '); save(); break;
    case'hs': beginEdit(); DB.house.subtitle=e.target.value; save(); break;
    case'rt':{beginEdit(); const re=e.target.closest('.room'); const rm=re&&DB.house.rooms.find(x=>x.id===re.dataset.room); if(rm){rm.title=e.target.value; rm.name=plainText(rm.title)||rm.name; save();}} break;
    case'rs':{beginEdit(); const re=e.target.closest('.room'); const rm=re&&DB.house.rooms.find(x=>x.id===re.dataset.room); if(rm){rm.subtitle=e.target.value; save();}} break;
    case'slide':{const f=findFurn(e.target); if(f&&(f._fac||f._prev)){f.state[d.key]=+e.target.value; refreshFurn(f);} else if(f&&DB.studyOn){(LIVE[f.id]=LIVE[f.id]||{})[d.key]=+e.target.value; refreshLive(e.target);}} break;
    case'searchin':{ const rm=DB.house.rooms.find(x=>x.id===d.room)||r; rm._q=e.target.value; const caret=e.target.selectionStart; renderStage(); if(!DB.studyOn)wireDnD(); const ni=document.querySelector(`[data-act="searchin"][data-room="${rm.id}"]`); if(ni){ ni.focus(); try{ni.setSelectionRange(caret,caret);}catch(_){} } } break;  }
});
document.addEventListener('change',e=>{
  const a=e.target.closest('[data-act]'); if(!a)return; const d=a.dataset, act=a.dataset.act, r=room();
  switch(act){    case'tagrename':{ const old=d.old, nv=e.target.value.trim(); if(old==='pinned'){ toast('“pinned” is maintained by the 📍 pin button and can’t be renamed'); render(); break; } if(!nv||nv===old){ render(); break; } commit(()=>{
      const cats=DB.house.cats||[]; const i=cats.indexOf(old);
      if(cats.includes(nv)){ if(i>=0)cats.splice(i,1); } else if(i>=0){ cats[i]=nv; }
      DB.house.rooms.forEach(rm=>rm.cards.forEach(cd=>{ if(cd.tag&&cd.tag.includes(old)){ cd.tag=cd.tag.filter(t=>t!==old); if(!cd.tag.includes(nv))cd.tag.push(nv); } }));
      view.cells=selCells().map(k=>{ const j=k.indexOf('␟'); let a=k.slice(0,j),b=k.slice(j+1); if(a===old)a=nv; if(b===old)b=nv; return a+'␟'+b; }).filter((k,ix,arr)=>arr.indexOf(k)===ix); }); } break;    case'bvarcustom': commit(()=>{ DB.bench.accent=e.target.value; }); break;
    case'pick':break;
    case'check':{const f=findFurn(e.target); if(f&&(f._fac||f._prev||DB.studyOn)){const i=+d.j; f.state._done=f.state._done||{}; const per=f.state._done[d.s]=f.state._done[d.s]||{}; per[i]=e.target.checked; if(!f._prev&&!f._fac)save(); refreshFurn(f);}} break;
  }
});

document.addEventListener('click',e=>{
  const o=e.target.closest('[data-i="pick"]'); if(!o)return;
  const f=findFurn(o); if(!f)return; if(!(f._fac||f._prev||DB.studyOn))return;
  const sid=o.dataset.s, key=o.dataset.key, j=+o.dataset.j;
  const slot=sid?(f.slots||[]).concat(f.back||[]).find(x=>x.id===sid):null;
  const props=slot?Object.assign({},slot.props,(f.content&&f.content[sid])||{}):{};
  const multi=correctSet(f.rules).length>1, submitMode=multi||!!props.submit;
  f.state=f.state||{};
  if(submitMode){ if(sid&&f.state._qdone&&f.state._qdone[sid])return; f.state._qsel=f.state._qsel||{}; const cur=f.state._qsel[sid]||{}; if(multi){ if(cur[j])delete cur[j]; else cur[j]=true; } else { for(const k in cur)delete cur[k]; cur[j]=true; f.state[key]=j; } f.state._qsel[sid]=cur; }
  else { if(f.state[key]===j)return; f.state[key]=j; }
  if(!f._prev&&!f._fac)save(); render();
});

function liveOf(f){ return f._prev? view.prevStudy : (f._fac? true : DB.studyOn); }
function elOf(f){ if(f._prev)return document.querySelector('.furn[data-fid="__prev"]'); if(f._fac)return document.querySelector(`.furn[data-fid="fac:${f._fac}"]`); return document.querySelector(`.furn[data-fid="${f.id}"]`); }
function findFurn(el){ const fe=el.closest('.furn'); if(!fe)return null; const id=fe.dataset.fid;
  if(id==='__prev')return view.prevFurn;
  if(id&&id.indexOf('fac:')===0)return getFacFurn(id.slice(4));
  for(const rm of DB.house.rooms){const f=rm.cards.find(c=>c.id===id); if(f)return f;} return null; }
function roomOf(f){ return DB.house.rooms.find(rm=>rm.cards.some(c=>c.id===f.id)); }
function slotLiveHTML(f,s,scope,room,live){ const def=SLOTS[s.type]; if(!def)return''; const props=Object.assign({},s.props,(f.content&&f.content[s.id])||{});
  if(s.verbs&&s.verbs.reveal && live){ if(!condOK(s.verbs.reveal,scope)) return ''; }
  let cls=''; if(s.verbs&&s.verbs.glow)cls+=' glow'; if(s.verbs&&s.verbs.emphasis)cls+=' emphasis';
  let inner=def.live(props,scope,f.rules||{},room,f,s); if(cls)inner=`<div class="${cls.trim()}">${inner}</div>`; return inner; }
function refreshLive(srcEl){ const el=srcEl&&srcEl.closest?srcEl.closest('.furn[data-fid]'):null; if(!el)return;
  const hit=findCard(el.dataset.fid); if(!hit)return; const f=hit.card; const scope=cardScope(f);
  const all=(f.slots||[]).concat(f.back||[]);
  // a fused chain with reveal verbs can gain/lose CELLS, not just cell contents — rebuild the body when a cell's visibility flips
  const side=(f.container&&f.container.flip&&f.state&&f.state._flip)?(f.back||[]):(f.slots||[]);
  const flip=side.some((s,i)=>{ if(!s||!s.verbs||!s.verbs.reveal)return false; const chained=(s.fuse&&side[i+1])||(i>0&&side[i-1]&&side[i-1].fuse); if(!chained)return false; return condOK(s.verbs.reveal,scope)!==!!el.querySelector(`.fusecell[data-sid="${s.id}"]`); });
  if(flip){ refreshFurn(f); return; }
  el.querySelectorAll('.cardslot[data-sid],.fusecell[data-sid]').forEach(cs=>{ const sid=cs.dataset.sid; const s=all.find(x=>x.id===sid); if(!s)return;
    if(srcEl && cs.contains(srcEl)){ cs.querySelectorAll('input[data-key]').forEach(n=>{ if(n===srcEl||document.activeElement===n)return; const k=n.dataset.key; if(scope[k]!=null)n.value=scope[k]; }); return; }
    cs.innerHTML=slotLiveHTML(f,s,scope,hit.room,true); }); }
function refreshFurn(f){ const el=elOf(f); if(el){const b=el.querySelector('.body'); if(b){ const room=(f._fac||f._prev)?null:roomOf(f); const edit=room?(!DB.studyOn&&!room.locked):false; b.innerHTML=cardInner(f,liveOf(f),room,edit);} } if(!f._prev&&!f._fac)save(); }
function fitPreview(){ const wrap=document.querySelector('.prev-wrap'), st=document.querySelector('.prev-stage'); if(!wrap||!st)return; const ref=720; const w=wrap.clientWidth-22; const sc=Math.min(1,Math.max(.2,w/ref)); st.style.transform='scale('+sc+')'; wrap.style.height=Math.ceil(st.getBoundingClientRect().height)+12+'px'; }
function refreshPrev(){ const p=DB.products.find(x=>x.id===selProd); if(!p)return; view.prevFurn=Object.assign(toFurn(applyDraft(p)),{_pid:p.id,state:(view.prevFurn&&view.prevFurn.state)||{}}); const el=document.querySelector('.furn[data-fid="__prev"] .body'); if(el)el.innerHTML=cardInner(view.prevFurn,view.prevStudy,null); fitPreview(); }
function refreshBenchPreview(){ save(); if(DB.place!=='factory'||benchSel==null)return; const cell=document.querySelectorAll('.faccard.on .bench-grid .benchslot')[benchSel]; const s=DB.bench.slots[benchSel]; if(cell&&s){const body=cell.querySelector('.bs-body'); if(body)body.innerHTML=SLOTS[s.type].live(Object.assign({},s.props),{},DB.bench.rules);} }
