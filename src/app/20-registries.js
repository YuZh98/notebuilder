/* ====================== slot + verb catalog (the FACTORY ingredients) ====================== */

// correct option(s) for a choice card, by original index. Prefers the array; reads the legacy
// scalar answer; with nothing set defaults to [0] for single (always one answer) and [] for multi.
// Same set drives Edit marking and Study grading, so the two never diverge.
function correctSet(rules){ if(rules&&Array.isArray(rules.answers))return rules.answers.slice(); if(rules&&rules.answer!=null)return [rules.answer]; return [0]; }
function shuffleIdx(n){ const a=[]; for(let i=0;i<n;i++)a.push(i); for(let i=n-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=a[i];a[i]=a[j];a[j]=t;} return a; }
// A control (slider) clamps ONLY when its range bound is a finite number. Empty min/max = free entry
// (e.g. an answer box). `+''` is 0, so the empty-string check must come before any numeric coercion.
const ctlMin=p=>(p.min!==''&&p.min!=null&&isFinite(+p.min))?+p.min:null;
const ctlMax=p=>(p.max!==''&&p.max!=null&&isFinite(+p.max))?+p.max:null;
function ctlClamp(p,v){ const mn=ctlMin(p),mx=ctlMax(p); if(mn!=null&&v<mn)v=mn; if(mx!=null&&v>mx)v=mx; return v; }
// Width (in ch) of the value box: hug the widest value the range allows (a bounded control), or the
// current value's length (free entry). Deterministic — no JS resize, works in every offline-file browser.
function ctlBoxW(p,v){ const mn=ctlMin(p),mx=ctlMax(p);
  const stepStr=(p.step!=null&&p.step!=='')?String(p.step):''; const dec=stepStr.indexOf('.')>=0?stepStr.length-stepStr.indexOf('.')-1:0;
  const len=n=>{ if(n==null||!isFinite(n))return 0; const s=Math.abs(+n).toFixed(dec); return s.length+(n<0?1:0); };
  const ch=(mn==null&&mx==null)?len(v):Math.max(len(mn),len(mx));
  return Math.max(4, ch+2); }   // +2 for the number spinner + breathing room; floor clears the arrows

const SLOTS={
  text:{label:'Text',icon:'¶',kind:'write',make:()=>({text:'Write here. **bold**, *italic*, `code`, $a^2+b^2$, use {{key}} for a live value.'}),
    live:(p,st)=>`<div class="slot text">${mdBlock(interp(p.text||'',st))}</div>`,
    fields:[]},
  list:{label:'List',icon:'•',kind:'write',make:()=>({title:'',items:'First\nSecond\nThird',style:'bullets'}),
    live:(p,st,rules,room,host,slot)=>{const items=(p.items||'').split('\n').filter(x=>x.trim());
      if(p.style==='check'){const sid=slot?slot.id:''; const done=((st&&st._done)||{})[sid]||{};const n=items.filter((_,j)=>done[j]).length; return `<div class="slot"><div class="row sm"><b>${md(p.title||'')}</b><span class="spacer"></span><span class="muted">${n}/${items.length}</span></div>`+items.map((it,j)=>`<label class="taskit"><input type="checkbox" data-act="check" data-s="${sid}" data-j="${j}" ${done[j]?'checked':''}><span class="ti">${md(it)}</span></label>`).join('')+`</div>`;}
      const tag=p.style==='numbered'?'ol':'ul';
      return `${p.title?`<div class="slot row sm" style="margin-bottom:0"><b>${md(p.title)}</b></div>`:''}<${tag} class="slot">${items.map(x=>`<li>${md(x)}</li>`).join('')}</${tag}>`;},
    fields:[]},
  choice:{label:'Choice',icon:'◉',kind:'interact',make:()=>({q:'Pick the right one',options:'Right\nWrong\nAlso wrong',key:'pick',explanation:''}),
    live:(p,st,rules,room,f,s)=>{ const opts=(p.options||'').split('\n').filter(x=>x.trim());
      const correct=correctSet(rules), multi=correct.length>1, submitMode=multi||!!p.submit, sid=s?s.id:null;
      let order=opts.map((_,i)=>i);
      if(p.shuffle && DB.studyOn && f && sid){ f.state=f.state||{}; f.state._qord=f.state._qord||{}; if(!Array.isArray(f.state._qord[sid])||f.state._qord[sid].length!==opts.length) f.state._qord[sid]=shuffleIdx(opts.length); order=f.state._qord[sid]; }
      const picked=st[p.key];
      const selSet=(submitMode&&f&&f.state&&f.state._qsel&&sid)?(f.state._qsel[sid]||{}):null;
      const isSel=(j)=> submitMode ? !!(selSet&&selSet[j]) : (picked===j);
      const graded= submitMode ? !!(f&&f.state&&f.state._qdone&&sid&&f.state._qdone[sid]) : (picked!=null);
      const selected= submitMode ? Object.keys(selSet||{}).map(Number) : (picked!=null?[picked]:[]);
      const isRight= graded && selected.length===correct.length && selected.every(j=>correct.indexOf(j)>=0);
      const btn=(j)=>{ let c=''; if(graded){ if(correct.indexOf(j)>=0)c='right'; else if(isSel(j))c='wrong'; } else if(isSel(j))c='sel'; return `<button class="opt ${c}" data-i="pick" data-s="${esc(sid||'')}" data-key="${esc(p.key)}" data-j="${j}">${md(opts[j])}</button>`; };
      const verdict= graded?`<div class="qverdict ${isRight?'ok':'no'}">${isRight?'✓ Correct':'✗ Wrong'}${p.explanation?` <span class="qexpl">${md(p.explanation)}</span>`:''}</div>`:'';
      let foot=verdict;
      if(submitMode && (DB.studyOn||(f&&(f._fac||f._prev)))){ const b=graded?`<button class="btn sm" data-act="qreset" data-s="${esc(sid||'')}">Try again</button>`:`<button class="btn sm primary" data-act="qcheck" data-s="${esc(sid||'')}">Check</button>`; foot=`${verdict}<div class="row" style="margin-top:6px">${b}</div>`; }
      return `<div class="slot"><div style="font-weight:600;margin-bottom:4px">${md(p.q||'')}</div>`+order.map(btn).join('')+foot+`</div>`; },
    fields:[]},
  slider:{label:'Slider',icon:'⇄',kind:'interact',make:()=>({key:'a',min:0,max:100,value:50,step:1,showName:true,showValue:true,showSlider:true}),
    // Hide the bar (showSlider:false) + leave the range empty → a free number-entry box. Same slot.
    live:(p,st,rules,room,f)=>{ const mn=ctlMin(p),mx=ctlMax(p), stp=(p.step!=null&&p.step!=='')?p.step:1;
      const v=ctlClamp(p, st[p.key]!=null?+st[p.key]:+p.value);
      const sN=p.showName!==false, sV=p.showValue!==false, sS=p.showSlider!==false, interactive=DB.studyOn||(f&&(f._fac||f._prev));
      const rng=(mn!=null?` min="${mn}"`:'')+(mx!=null?` max="${mx}"`:'');
      // the box shows in Edit too (disabled) so the author sees exactly what Study renders
      const nm=sN?`<span class="muted">${esc(p.key||'')}</span>`:''; const valEl=sV?`<input type="number" data-act="slide" data-key="${esc(p.key)}" value="${v}"${rng} step="${esc(stp)}" style="width:${ctlBoxW(p,v)}ch"${interactive?'':' disabled'}>`:'';
      const head=(sN||sV)?`<div class="row sm">${nm}${nm&&valEl?' ':''}${valEl}</div>`:''; const sl=sS?`<input type="range" data-act="slide" data-key="${esc(p.key)}" min="${mn!=null?mn:0}" max="${mx!=null?mx:100}" step="${esc(stp)}" value="${v}"${interactive?'':' disabled'}>`:'';
      return `<div class="slot">${head}${sl}</div>`; },
    fields:[['key','Variable name','text','the variable this control sets, e.g. x'],['min','Min','num','leave empty for free entry'],['max','Max','num','leave empty for free entry'],['step','Step','num','drag/spin increment'],['value','Default','num'],['showName','name','bool'],['showValue','value','bool'],['showSlider','slider','bool']]},
  // Progress = a per-reader completion meter: counts finished cards over a scope (section/chapter/notebook),
  // optionally filtered to chosen tags. "Done" is derived per card (flip seen / choice answered / all ticked).
  progress:{label:'Progress',icon:'▰',kind:'track',make:()=>({label:'Progress',scope:'section',track:[],show:{mn:true,pct:false,bar:true}}),
    live:(p,st,rules,room,f)=>{ const sh=pgShow(p.show); let done,total;
      if(!room){ done=3; total=5; }                                   // preview (store/factory): a representative bar
      else { const t=pgCount(p,room); done=t.done; total=t.total; }
      const pct=total?Math.round(done/total*100):0;
      const lab=p.label?`<span class="muted">${md(p.label)}</span>`:'';
      const mn=sh.mn?`<span class="pgbox">${done} / ${total}</span>`:'';
      const pc=sh.pct?`<span class="pgbox">${pct}%</span>`:'';
      const parts=[lab,mn,pc].filter(Boolean).join(' ');
      const bar=sh.bar?`<div class="bar"><i style="width:${pct}%"></i></div>`:'';
      return `<div class="slot">${parts?`<div class="row sm">${parts}</div>`:''}${bar}</div>`;},
    fields:[]},
  compute:{label:'Formula',icon:'🟰',kind:'compute',make:()=>({expr:'',note:''}),
    live:(p,st)=>{let val=EXPR.ev(p.expr,st||{}); if(typeof val==='number'){ val=isFinite(val)?Math.round(val*1e4)/1e4:'—'; } else if(typeof val==='boolean'){ val=val?'true':'false'; } return `<div class="slot compute">${p.note?`<span class="muted">${md(p.note)}</span> `:''}<b class="cval">${esc(String(val))}</b></div>`;},
    fields:[['expr','Formula','text','your variables with + - * / // mod ^ sqrt, e.g. price * qty'],['note','Note (optional · math ok)','text','shown before the result, e.g. revenue $ ='],['out','Writes to variable (optional)','text','name other formulas can read']]},
  chart:{label:'Chart',icon:'∿',kind:'compute',make:()=>({fn:'x',x0:0,x1:10,y0:0,y1:10,xticks:5,yticks:5,hover:true,label:''}),
    live:(p,st)=>`<div class="slot chart">${p.label?`<div class="sm muted">${md(p.label)}</div>`:''}${plotSVG(p,st||{})}</div>`,
    fields:[['fn','f(x)','text','f of x — x is the horizontal axis; use your slider variables as parameters, e.g. a*x'],['x0','x min','num'],['x1','x max','num'],['y0','y min','num'],['y1','y max','num'],['xticks','x ticks','num'],['yticks','y ticks','num'],['hover','Hover line','bool'],['label','Caption','text']]},
};
const SLOT_ORDER=['text','list','choice','slider','progress','compute','chart'];

const CVERBS={ flip:{label:'Flip (two-sided)',icon:'⟳'}, bare:{label:'Frameless',icon:'▢'} };  // container MODES (shape) — distinct from SVERBS, the per-slot EFFECTS
window.CVERBS=CVERBS;
const SVERBS={ reveal:{label:'Reveal-when',icon:'👁'}, glow:{label:'Glow',icon:'✦'}, emphasis:{label:'Emphasis',icon:'❝'} };

const VAR=[{name:'Default',accent:''},{name:'Blue',accent:'#6ea8fe'},{name:'Violet',accent:'#b388ff'},{name:'Mint',accent:'#54d6a0'},{name:'Amber',accent:'#f0a500'},{name:'Rose',accent:'#ff6b81'},{name:'Cyan',accent:'#34e1ff'},{name:'Lime',accent:'#9ade3b'},{name:'Coral',accent:'#ff8a5c'},{name:'Slate',accent:'#8b93a7'}];
const baseName=n=>String(n||'').split('--')[0].trim();
const baseKey=n=>baseName(n).toLowerCase().replace(/\s+/g,' ');
const varLabel=n=>String(n||'').includes('--')?String(n).split('--').slice(1).join('--').trim():null;

function groupStore(storeId){ const map=new Map(); DB.products.filter(p=>(p.store||null)===storeId).forEach(p=>{const k=baseKey(p.name); if(!map.has(k))map.set(k,{base:baseName(p.name),items:[]}); map.get(k).items.push(p);}); return [...map.values()]; }

// {{key}} interpolation — SAFE (variable lookup only, no eval)
function interp(t,st){ return String(t).replace(/\{\{(\w+)\}\}/g,(m,k)=>(st&&st[k]!=null?st[k]:'?')); }

function condOK(c,st){ if(!c||!c.key)return true; const a=st?st[c.key]:undefined, b=isNaN(+c.val)?c.val:+c.val;
  switch(c.op){case'==':return a==b;case'!=':return a!=b;case'>=':return a>=b;case'<=':return a<=b;case'>':return a>b;case'<':return a<b;} return true; }

/* EXPR — pure arithmetic evaluator for compute/chart. NO eval/Function: hand-written lexer/parser over a
   FIXED function whitelist; identifiers resolve from env (the card's state), else a constant, else 0; no
   member access, no host objects. Ported from the proto (factory-v5). Reactive: read state in, value out. */
const EXPR=(()=>{const FN={sin:Math.sin,cos:Math.cos,tan:Math.tan,exp:Math.exp,log:Math.log,sqrt:Math.sqrt,abs:Math.abs,sign:Math.sign,round:Math.round,floor:Math.floor,ceil:Math.ceil,min:Math.min,max:Math.max,pow:Math.pow,clamp:(x,a,b)=>Math.max(a,Math.min(b,x))},K={pi:Math.PI,e:Math.E,true:true,false:false};
 function lex(s){const t=[];let i=0;while(i<s.length){const c=s[i];if(/\s/.test(c)){i++;continue}if(/[0-9.]/.test(c)){let j=i+1;while(j<s.length&&/[0-9.]/.test(s[j]))j++;t.push({t:'n',v:+s.slice(i,j)});i=j;continue}if(/[a-zA-Z_]/.test(c)){let j=i+1;while(j<s.length&&/[a-zA-Z0-9_]/.test(s[j]))j++;t.push({t:'id',v:s.slice(i,j)});i=j;continue}const two=s.slice(i,i+2);if(['==','!=','<=','>=','&&','||','//'].includes(two)){t.push({t:'o',v:two});i+=2;continue}if('+-*/%^<>!?:(),'.includes(c)){t.push({t:'o',v:c});i++;continue}i++}t.push({t:'eof'});return t}
 function parse(tk){let p=0;const pk=()=>tk[p],eat=()=>tk[p++],PR={'||':1,'&&':2,'==':3,'!=':3,'<':4,'<=':4,'>':4,'>=':4,'+':5,'-':5,'*':6,'/':6,'%':6,'//':6,'^':7};
  function prim(){const k=eat();if(k.t=='n'||k.t=='s')return{k:'v',v:k.v};if(k.t=='id'){if(pk().t=='o'&&pk().v=='('){eat();const a=[];if(!(pk().t=='o'&&pk().v==')')){a.push(ex(0));while(pk().t=='o'&&pk().v==','){eat();a.push(ex(0))}}eat();return{k:'call',f:k.v,a}}return{k:'id',v:k.v}}if(k.t=='o'&&k.v=='('){const e=ex(0);eat();return e}if(k.t=='o'&&(k.v=='-'||k.v=='!'))return{k:'u',o:k.v,e:prim()};return{k:'v',v:0}}
  function ex(m){let L=prim();for(;;){const k=pk();if(k.t=='o'&&k.v=='?'&&m===0){eat();const a=ex(0);eat();const b=ex(0);L={k:'t',c:L,a,b};continue}if(k.t=='o'&&PR[k.v]!=null&&PR[k.v]>=m){eat();const R=ex(k.v=='^'?PR[k.v]:PR[k.v]+1);L={k:'b',o:k.v,l:L,r:R};continue}break}return L}return ex(0)}
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k); // OWN keys only — never resolve prototype props (constructor/__proto__/toString…)
 function ev(z,env){switch(z.k){case'v':return z.v;case'id':return own(env,z.v)?env[z.v]:(own(K,z.v)?K[z.v]:0);case'u':{const v=ev(z.e,env);return z.o=='-'?-v:!v}case'call':{const f=own(FN,z.f)?FN[z.f]:null;return f?f.apply(0,z.a.map(x=>ev(x,env))):0}case't':return ev(z.c,env)?ev(z.a,env):ev(z.b,env);case'b':{const l=ev(z.l,env),r=ev(z.r,env);switch(z.o){case'+':return l+r;case'-':return l-r;case'*':return l*r;case'/':return l/r;case'//':return Math.floor(l/r);case'%':return l%r;case'^':return Math.pow(l,r);case'==':return l==r;case'!=':return l!=r;case'<':return l<r;case'<=':return l<=r;case'>':return l>r;case'>=':return l>=r;case'&&':return l&&r;case'||':return l||r}}}}
 const cache=Object.create(null);return{ev(s,env){try{s=String(s==null?'':s).replace(/\bmod\b/gi,'%');if(!s.trim())return 0;if(!(s in cache))cache[s]=parse(lex(s));return ev(cache[s],env||{})}catch(e){return 0}}}})();

function fmtNum(v){ if(!isFinite(v))return '0'; const a=Math.abs(v); if(a!==0&&(a>=10000||a<0.001))return v.toPrecision(3); return String(Math.round(v*1000)/1000); }
function plotSVG(p, scope){ const W=320,H=150,L=44,B=22,T=10,R=12,n=120;
  let x0=+p.x0,x1=+p.x1; if(!isFinite(x0))x0=0; if(!isFinite(x1)||x1<=x0)x1=x0+1;
  let y0=+p.y0,y1=+p.y1; const autoY=!(isFinite(y0)&&isFinite(y1)&&y1>y0);
  const pts=[]; let mn=Infinity,mx=-Infinity;
  for(let i=0;i<n;i++){ const x=x0+(x1-x0)*i/(n-1); let y=EXPR.ev(p.fn,Object.assign({},scope,{x})); if(typeof y!=='number'||!isFinite(y))y=NaN; pts.push([x,y]); if(isFinite(y)){if(y<mn)mn=y;if(y>mx)mx=y;} }
  if(autoY){ if(!(mx>mn)){mn-=0.5;mx+=0.5;} y0=mn; y1=mx; }
  const pw=W-L-R, ph=H-T-B; const sx=x=>L+(x-x0)/(x1-x0)*pw, sy=y=>T+(1-(y-y0)/(y1-y0))*ph;
  let d='',pen=false; pts.forEach(q=>{ const y=q[1]; if(!isFinite(y)||y<y0||y>y1){pen=false;return;} d+=(pen?'L':'M')+sx(q[0]).toFixed(1)+' '+sy(y).toFixed(1)+' '; pen=true; });  // clip: only the in-range curve draws (no flat clamp line)
  const ts='font:9px ui-monospace,monospace;fill:var(--muted)'; const ax=[`<rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="none" stroke="var(--line)"/>`];
  const xt=Math.round(+p.xticks||0), yt=Math.round(+p.yticks||0);
  if(xt>=1)for(let i=0;i<=xt;i++){ const xv=x0+(x1-x0)*i/xt, X=sx(xv).toFixed(1); ax.push(`<line x1="${X}" y1="${T}" x2="${X}" y2="${T+ph}" stroke="var(--line)" opacity=".22"/>`); ax.push(`<text x="${X}" y="${H-6}" text-anchor="middle" style="${ts}">${fmtNum(xv)}</text>`); }
  if(yt>=1)for(let i=0;i<=yt;i++){ const yv=y0+(y1-y0)*i/yt, Y=sy(yv); ax.push(`<line x1="${L}" y1="${Y.toFixed(1)}" x2="${L+pw}" y2="${Y.toFixed(1)}" stroke="var(--line)" opacity=".22"/>`); ax.push(`<text x="${L-4}" y="${(Y+3).toFixed(1)}" text-anchor="end" style="${ts}">${fmtNum(yv)}</text>`); }
  const hv=!!p.hover; const cur=hv?`<line class="chart-cur" y1="${T}" y2="${T+ph}" stroke="var(--accent)" stroke-dasharray="3 3" style="display:none"/><text class="chart-val" y="${T+11}" style="font:10px ui-monospace,monospace;fill:var(--accent);display:none"></text>`:'';
  const da=hv?` data-hover="1" data-fn="${esc(p.fn||'')}" data-x0="${x0}" data-x1="${x1}" data-y0="${y0}" data-y1="${y1}" data-l="${L}" data-pw="${pw}" data-t="${T}" data-ph="${ph}"`:'';
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" style="display:block;cursor:${hv?'crosshair':'default'}"${da}>${ax.join('')}<path d="${d.trim()}" fill="none" stroke="var(--cardc,var(--accent))" stroke-width="2"/>${cur}</svg>`; }
function wireChartHover(e){ const t=e.target; const svg=t&&t.closest?t.closest('svg.chart-svg[data-hover="1"]'):null;
  document.querySelectorAll('svg.chart-svg .chart-cur,svg.chart-svg .chart-val').forEach(el=>{ if(!svg||!svg.contains(el))el.style.display='none'; });
  if(!svg)return; const r=svg.getBoundingClientRect(), vb=svg.viewBox.baseVal; if(!r.width)return;
  const px=(e.clientX-r.left)/r.width*vb.width; const L=+svg.dataset.l,pw=+svg.dataset.pw,T=+svg.dataset.t,ph=+svg.dataset.ph;
  const x0=+svg.dataset.x0,x1=+svg.dataset.x1,y0=+svg.dataset.y0,y1=+svg.dataset.y1;
  let xv=x0+(px-L)/pw*(x1-x0); xv=Math.max(x0,Math.min(x1,xv)); const ff=findFurn(svg); let yv=EXPR.ev(svg.dataset.fn,Object.assign({},ff?cardScope(ff):{},{x:xv}));
  const X=L+(xv-x0)/(x1-x0)*pw, cur=svg.querySelector('.chart-cur'), val=svg.querySelector('.chart-val');
  if(cur){cur.setAttribute('x1',X.toFixed(1));cur.setAttribute('x2',X.toFixed(1));cur.style.display='';}
  if(val){val.textContent='('+fmtNum(xv)+', '+fmtNum(yv)+')'; val.setAttribute('x',Math.min(L+pw-62,Math.max(L+2,X+4)).toFixed(1)); val.style.display='';}
}
document.addEventListener('mousemove', wireChartHover);
