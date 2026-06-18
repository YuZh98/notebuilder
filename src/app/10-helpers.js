/* ====================== util ====================== */
const $=s=>document.querySelector(s);
let _n=0; const uid=p=>(p||'b')+(_n++).toString(36)+Math.floor(performance.now()).toString(36).slice(-3);
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/* rich text + math — lifted verbatim from learning-spaces-core (escape-first, emit-our-tags, KaTeX trust:false) */
const PALETTE_KEYS=['accent','accent2','good','warn','muted','ink'];
let katexP=null,KX=null;

function loadKatex(){ if(katexP)return katexP; katexP=new Promise((res,rej)=>{
    if(typeof KATEX_JS!=='undefined' && KATEX_JS){ try{ const ks=document.createElement('style');ks.textContent=KATEX_CSS;document.head.appendChild(ks); const kj=document.createElement('script');kj.textContent=KATEX_JS;document.head.appendChild(kj); KX=window.katex; if(KX)return res(KX); }catch(e){} }
    const css=document.createElement('link');css.rel='stylesheet';css.href='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';document.head.appendChild(css);
    const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';s.onload=()=>{KX=window.katex;res(KX);};s.onerror=()=>rej(new Error('katex offline?'));document.head.appendChild(s);
  }); return katexP; }
function renderMath(tex,display){ if(KX){try{return KX.renderToString(tex,{throwOnError:false,displayMode:!!display,trust:false});}catch(e){return '<span class="math-err">'+esc(tex)+'</span>';}}
  loadKatex().then(()=>{ render(); }).catch(()=>{});
  return '<span class="math-raw">'+esc((display?'$$':'$')+tex+(display?'$$':'$'))+'</span>'; }
function applyMarks(t){ return t.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g,'$1<i>$2</i>').replace(/_([^_\n]+?)_/g,'<i>$1</i>').replace(/~~([^~]+?)~~/g,'<s>$1</s>').replace(/==([^=]+?)==/g,'<mark>$1</mark>')
    .replace(/\{c:([a-z0-9]+)\}([\s\S]+?)\{\/c\}/g,(m,k,x)=>'<span style="color:var(--'+(PALETTE_KEYS.includes(k)?k:'ink')+')">'+x+'</span>')
    .replace(/\{bg:([a-z0-9]+)\}([\s\S]+?)\{\/bg\}/g,(m,k,x)=>'<mark style="background:color-mix(in srgb,var(--'+(PALETTE_KEYS.includes(k)?k:'accent2')+') 32%,transparent)">'+x+'</mark>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(m,txt,url)=>{const safe=/^(https?:|mailto:|#|\/)/i.test(url)?url:'#';return '<a href="'+safe+'" target="_blank" rel="noopener noreferrer">'+txt+'</a>';}); }
function mdInline(raw){ const st=[],keep=h=>{st.push(h);return '@@K'+(st.length-1)+'K@@';};
  let t=String(raw==null?'':raw).replace(/\$(\S[^$\n]*?\S|\S)\$/g,(m,x)=>keep(renderMath(x.trim(),false)));
  t=esc(t).replace(/`([^`]+)`/g,(m,x)=>keep('<code>'+x+'</code>')); t=applyMarks(t).replace(/\n/g,'<br>');
  return t.replace(/@@K(\d+)K@@/g,(m,i)=>st[+i]); }
function mdBlock(raw){ const st=[],keep=h=>{st.push(h);return '@@K'+(st.length-1)+'K@@';};
  let t=String(raw==null?'':raw).replace(/\$\$([\s\S]+?)\$\$/g,(m,x)=>keep(renderMath(x.trim(),true))).replace(/\$(\S[^$\n]*?\S|\S)\$/g,(m,x)=>keep(renderMath(x.trim(),false)));
  t=esc(t).replace(/`([^`]+)`/g,(m,x)=>keep('<code>'+x+'</code>'));
  const L=t.split('\n'); let o='',lt=null; const cl=()=>{if(lt){o+='</'+lt+'>';lt=null;}};
  const isRow=s=>/^\s*\|.*\|\s*$/.test(s); const isSep=s=>s.includes('-')&&/^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(s);
  const cells=s=>s.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim());
  const alignOf=s=>{const l=s.startsWith(':'),r=s.endsWith(':');return l&&r?'center':r?'right':l?'left':'';};
  for(let i=0;i<L.length;i++){ const ln=L[i]; let m;
    if(isRow(ln)&&i+1<L.length&&isSep(L[i+1])){ cl();
      const head=cells(ln), al=cells(L[i+1]).map(alignOf); let j=i+2,body='';
      while(j<L.length&&isRow(L[j])){ const cs=cells(L[j]); body+='<tr>'+head.map((_,k)=>`<td${al[k]?` style="text-align:${al[k]}"`:''}>`+applyMarks(cs[k]||'')+'</td>').join('')+'</tr>'; j++; }
      o+='<table class="md-table"><thead><tr>'+head.map((h,k)=>`<th${al[k]?` style="text-align:${al[k]}"`:''}>`+applyMarks(h)+'</th>').join('')+'</tr></thead>'+(body?`<tbody>${body}</tbody>`:'')+'</table>'; i=j-1; continue; }
    if(m=ln.match(/^(#{1,3})\s+(.*)$/)){cl();const lv=m[1].length+1;o+='<h'+lv+'>'+applyMarks(m[2])+'</h'+lv+'>';}
    else if(m=ln.match(/^&gt;\s?(.*)$/)){cl();o+='<blockquote>'+applyMarks(m[1])+'</blockquote>';}
    else if(m=ln.match(/^\s*[-*]\s+(.*)$/)){if(lt!=='ul'){cl();o+='<ul>';lt='ul';}o+='<li>'+applyMarks(m[1])+'</li>';}
    else if(m=ln.match(/^\s*\d+\.\s+(.*)$/)){if(lt!=='ol'){cl();o+='<ol>';lt='ol';}o+='<li>'+applyMarks(m[1])+'</li>';}
    else {cl(); if(ln.trim()){ const ind=(ln.match(/^ +/)||[''])[0]; o+='<div>'+'&nbsp;'.repeat(ind.length)+applyMarks(ln.slice(ind.length))+'</div>'; } else o+='<br>'; } }
  cl(); return o.replace(/@@K(\d+)K@@/g,(m,i)=>st[+i]); }
const md=mdInline;
const FIELD_SIZING = (typeof CSS!=='undefined' && CSS.supports && CSS.supports('field-sizing','content'));
function autoGrow(ta){ if(!ta||FIELD_SIZING)return; ta.style.height='auto'; ta.style.height=(ta.scrollHeight+2)+'px'; } // height fallback where field-sizing isn't supported

const plainText=s=>String(s||'').replace(/^#{1,6}\s*/,'').replace(/\$[^$]*\$/g,'').replace(/\{\/?[^}]*\}/g,'').replace(/[*_`~]/g,'').replace(/\s+/g,' ').trim();

const SYMBOLS=['α','β','γ','δ','ε','θ','λ','μ','π','ρ','σ','φ','ω','Σ','Π','∑','∫','√','∞','≤','≥','≠','≈','±','×','÷','→','∈','∉','∀','∃','¬','ℝ','ℕ','ℤ','𝔼','😀','🔥','✅','⭐','📌','💡','❓','📘','🎯','⚠️'];
function mdbarHTML(){ return [['b','𝐁'],['i','𝑰'],['code','‹›'],['hl','▣'],['h','H'],['ul','•'],['math','∑'],['mathb','∬']].map(([k,l])=>`<button class="mdbtn" data-md="${k}" title="${k}">${l}</button>`).join('')
  +`<details class="mdpad"><summary title="symbols/emoji">Ω</summary><div class="padgrid">`+SYMBOLS.map(s=>`<button class="symbtn" data-sym="${esc(s)}">${esc(s)}</button>`).join('')+`</div></details>`
  +`<details class="mdpad"><summary title="color">🎨</summary><div class="padgrid">`+['accent','accent2','good','warn','muted'].map(c=>`<button class="colbtn" data-col="${c}" style="color:var(--${c})">A</button>`).join('')+`</div></details>`; }
function taWrap(ta,pre,post,ph){const s=ta.selectionStart,e=ta.selectionEnd,v=ta.value,sel=v.slice(s,e)||ph||'';ta.value=v.slice(0,s)+pre+sel+post+v.slice(e);ta.focus();ta.selectionStart=s+pre.length;ta.selectionEnd=s+pre.length+sel.length;ta.dispatchEvent(new Event('input',{bubbles:true}));}
function taPre(ta,pre){const s=ta.selectionStart,v=ta.value,ls=v.lastIndexOf('\n',s-1)+1;ta.value=v.slice(0,ls)+pre+v.slice(ls);ta.focus();ta.selectionStart=ta.selectionEnd=s+pre.length;ta.dispatchEvent(new Event('input',{bubbles:true}));}
function taIns(ta,t){const s=ta.selectionStart,v=ta.value;ta.value=v.slice(0,s)+t+v.slice(ta.selectionEnd);ta.focus();ta.selectionStart=ta.selectionEnd=s+t.length;ta.dispatchEvent(new Event('input',{bubbles:true}));}
function doMd(btn,ta){ if(!ta)return; const a=btn.dataset.md,sym=btn.dataset.sym,col=btn.dataset.col;
  if(sym!=null){taIns(ta,sym);return;} if(col){taWrap(ta,'{c:'+col+'}','{/c}','text');return;}
  ({b:()=>taWrap(ta,'**','**','bold'),i:()=>taWrap(ta,'*','*','italic'),code:()=>taWrap(ta,'`','`','code'),hl:()=>taWrap(ta,'==','==','mark'),h:()=>taPre(ta,'## '),ul:()=>taPre(ta,'- '),math:()=>taWrap(ta,'$','$','x'),mathb:()=>taWrap(ta,'\n$$\n','\n$$\n','x^2')}[a]||(()=>{}))(); }
function clone(o){return JSON.parse(JSON.stringify(o));}
let toastT; function toast(m){ let t=$('#toast'); if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t);} t.textContent=m; t.style.display='block'; clearTimeout(toastT); toastT=setTimeout(()=>t.style.display='none',1700); }
function showDust(){ const d=$('#dustbin'); if(d)d.classList.add('show'); }
function hideDust(){ const d=$('#dustbin'); if(d)d.classList.remove('show'); }
function overDust(ev){ const d=$('#dustbin'); if(!d||!d.classList.contains('show'))return false; const r=d.getBoundingClientRect(); return ev.clientX>=r.left&&ev.clientX<=r.right&&ev.clientY>=r.top&&ev.clientY<=r.bottom; }
