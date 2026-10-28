const $=id=>document.getElementById(id);
let S={},tab='',lim=100,agent='',month='',q='',stat='';const CM={rm:'',am:'',tm:'',cm:''};let PSF='';
const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt=d=>d instanceof Date?`${String(d.getDate()).padStart(2,'0')} ${MN[d.getMonth()]} ${d.getFullYear()}`:String(d||'');
const mkey=d=>d instanceof Date?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`:'';
const mlabel=k=>{const[y,m]=k.split('-');return MN[m-1]+' '+y};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function find(h,res){for(const r of res){const k=h.find(x=>r.test(x));if(k)return k}return null}
function prep(name,rows){const h=rows.length?Object.keys(rows[0]):[];
 const c={date:find(h,[/date/i]),name:find(h,[/subscriber/i,/customer/i,/^name/i]),status:find(h,[/final.*status/i,/status/i]),
 pay:find(h,[/payment status/i,/pay/i]),agent:find(h,[/agent.?name/i,/^agent\s*$/i,/agent/i]),tl:find(h,[/team.?lead/i,/^tl$/i]),csp:find(h,[/csp status/i,/csp/i])};
 rows.forEach(r=>{let d=r[c.date];if(!(d instanceof Date)&&d){const p=new Date(d);d=isNaN(p)?null:p}r._d=d||null;r._m=mkey(r._d);
  r._n=String(r[c.name]||'');r._s=String(r[c.status]||'').trim().toUpperCase();r._a=String(r[c.agent]||'').trim();r._t=String(r[c.tl]||'').trim();r._c=String(r[c.csp]||'').trim();r._p=String(r[c.pay]||'')});
 S[name]={rows,c}}
function sample(){const ag=['FRANCISCO, ROSELYN','MALIWAT, MARK','GABAY, MANUEL','CADERAO, RONALD','TAMAYO, MARY ROSE','ARENA, LYKA','ESCARCHA, ALMA','AYON, MANUEL','REMOLLO, LEA'];
 const nm=['VANESSA AQUINO SISON','KATHLENE ANNE JIMENO AURE','CRISTINE JANE CRUZ HAINZ','RODERICK MIL GOMEZ','ERNA MAGPANTAY CAPINLAC','FAUSTO AMON TORDECILLA'];
 const st=['POSTED','POSTED','POSTED','PENDING','CANCELLED'],cs=['ACTIVE','FOR INSTALL','DISCONNECTED','ON HOLD'],tl=['LEA REMOLLO','JERIC NAVARRO','ANA REYES'],pay=['NO PAYMENT YET','WITH PAYMENT'];
 const mk=n=>Array.from({length:n},(_,i)=>({'DATE':new Date(2026,5+i%3,1+i%28),'SUBSCRIBER NAME':nm[i%6]+' '+(i+1),'FINAL STATUS':st[i*7%5],'PAYMENT':pay[i%2],'AGENT':ag[i*3%9],'TEAM LEADER':tl[i%3],'CSP STATUS':cs[i%4]}));
 S={};prep('PLDT',mk(120));prep('RED',mk(40));prep('VALIDATORS',mk(80));tab='PLDT';$('info').textContent='Sample data · load your .xlsx with Replace file'}
$('file').onchange=async e=>{const f=e.target.files[0];if(!f)return;const wb=XLSX.read(await f.arrayBuffer(),{cellDates:true});S={};
 let tot=0;wb.SheetNames.forEach(n=>{const r=XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:''});if(r.length){prep(n,r);tot+=r.length}});
 tab=Object.keys(S)[0];agent=month=q=stat='';$('q').value=$('ag').value='';lim=100;
 $('info').textContent=`${f.name} · ${tot.toLocaleString()} records, loaded ${new Date().toLocaleString('en',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`;render()};
const cur=()=>S[tab].rows;
const gm=()=>cur().filter(r=>!month||r._m===month);
const posted=r=>/posted/i.test(r._s);
function tally(rows,f){const m={};rows.forEach(r=>{const k=f(r);if(k)m[k]=(m[k]||0)+1});return Object.entries(m).sort((a,b)=>b[1]-a[1])}
function render(){
 $('tabs').innerHTML=Object.keys(S).map(n=>`<button class="${n===tab?'on':''}" data-t="${esc(n)}">${esc(n)} <span>${S[n].rows.length.toLocaleString()}</span></button>`).join('');
 document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;lim=100;agent=stat='';$('ag').value='';render()});
 const all=cur(),months=[...new Set(all.map(r=>r._m).filter(Boolean))].sort();
 $('mo').innerHTML='<option value="">All months</option>'+months.map(m=>`<option value="${m}" ${m===month?'selected':''}>${mlabel(m)}</option>`).join('');
 $('agl').innerHTML=[...new Set(all.map(r=>r._a).filter(Boolean))].sort().map(a=>`<option value="${esc(a)}">`).join('');
 const ql=q.toLowerCase(),al=agent.toLowerCase();
 const rows=all.filter(r=>(!ql||r._n.toLowerCase().includes(ql))&&(!al||r._a.toLowerCase().includes(al))&&(!month||r._m===month)&&(!stat||r._s===stat));
 $('cnt').textContent=`${rows.length.toLocaleString()} of ${all.length.toLocaleString()} records in ${tab}`;
 $('th').innerHTML='<tr><th>Date</th><th>Subscriber name</th><th>Final status</th><th>Payment</th><th>Agent</th></tr>';
 CUR=rows.slice(0,lim);$('tb').innerHTML=CUR.map((r,i)=>`<tr class="rr" data-i="${i}"><td>${fmt(r._d)}</td><td><b class="bl">${esc(r._n)}</b></td><td>${esc(r._s)}</td><td>${esc(r._p)}</td><td>${esc(r._a)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No matching records</td></tr>';
 $('more').style.display=rows.length>lim?'block':'none';
 const mk2=m=>cur().filter(r=>!m||r._m===m),ML2=m=>m?mlabel(m):'All months';for(const k in CM)if(CM[k]&&!months.includes(CM[k]))CM[k]='';['rm','am','tm','cm'].forEach(id=>mopts(id,months,CM[id]));const g=mk2(CM.rm),pg=g.filter(posted);
 const rk=tally(pg,r=>r._a);const mx=rk[0]?rk[0][1]:1;
 $('rs').textContent=`${ML2(CM.rm)} · ${pg.length} posted records · top ${Math.min(10,rk.length)} of ${rk.length} agents · click a bar to see subscriber name, account and payment status`;
 $('rank').innerHTML=rk.slice(0,10).map(([a,n],i)=>`<div class="bar" ${lk('a',a+' · posted',pg.filter(r=>r._a===a),3)}><span class="n">${i+1}</span><span class="nm" title="${esc(a)}">${esc(a)}</span><div class="tr"><i style="width:${n/mx*100}%"></i></div><b>${n}</b></div>`).join('')||'<div class="empty">No records</div>';
 renderFP();renderINS();
 {const g=mk2(CM.am);
 const sts=[...new Set(g.map(r=>r._s).filter(Boolean))].sort(),ags=tally(g,r=>r._a);
 $('as').textContent=`${ML2(CM.am)} · ${ags.length} agents · ${g.length} records · click a number to see subscriber names`;
 $('adata').innerHTML='<table><thead><tr><th>Agent</th>'+sts.map(s=>`<th>${esc(s)}</th>`).join('')+'</tr></thead><tbody>'+ags.map(([a])=>'<tr><td class="rr" '+lk('a',a,g.filter(r=>r._a===a))+'>'+esc(a)+'</td>'+sts.map(s=>{const n=g.filter(r=>r._a===a&&r._s===s).length;return `<td>${n?`<span class="num" ${lk('a',a+' · '+s,g.filter(r=>r._a===a&&r._s===s))}>${n}</span>`:''}</td>`}).join('')+'</tr>').join('')+'</tbody></table>';
 
 }{const g=mk2(CM.tm),pg=g.filter(posted);
 const tl=tally(pg,r=>r._t),tt=tl.reduce((s,x)=>s+x[1],0),tm=tl[0]?tl[0][1]:1;
 $('ts').textContent=`${ML2(CM.tm)} · ${pg.length} posted records · ${tl.length} team leaders`;
 $('tl').innerHTML='<table><thead><tr><th>#</th><th>Team leader</th><th></th><th>Total</th><th>Share</th></tr></thead><tbody>'+tl.map(([t,n],i)=>`<tr class="rr" ${lk('a',t+' · posted',pg.filter(r=>r._t===t))}><td>${i+1}</td><td>${esc(t)}</td><td style="width:35%"><div class="tr"><i style="width:${n/tm*100}%"></i></div></td><td><b>${n}</b></td><td>${(n/tt*100).toFixed(1)}%</td></tr>`).join('')+'</tbody></table>';
 }{const g=mk2(CM.cm);
 const cp=tally(g,r=>r._c),ct=cp.reduce((s,x)=>s+x[1],0);
 $('cs').textContent=`${ML2(CM.cm)} · ${cp.length} statuses · ${ct} subscribers`;
 $('csp').innerHTML='<table><thead><tr><th>CSP status</th><th>Count</th><th>Share</th></tr></thead><tbody>'+cp.map(([c,n])=>`<tr class="rr" ${lk('a','CSP status: '+c,g.filter(r=>r._c===c))}><td>${esc(c)}</td><td>${n}</td><td>${(n/ct*100).toFixed(1)}%</td></tr>`).join('')+'</tbody></table>';}
}
$('q').oninput=e=>{q=e.target.value;lim=100;render()};
$('ag').oninput=e=>{agent=e.target.value;stat='';lim=100;render()};
$('mo').onchange=e=>{month=e.target.value;lim=100;st2.dm=st2.pm=st2.bm=st2.sm=st2.gm=month;for(const k in CM)CM[k]=month;render()};['rm','am','tm','cm'].forEach(id=>$(id).onchange=e=>{CM[id]=e.target.value;render()});$('rp').onchange=e=>{PSF=e.target.value;render()};
$('clr').onclick=()=>{q=agent=stat='';$('q').value=$('ag').value='';lim=100;render()};
$('more').onclick=()=>{lim+=100;render()};


let CUR=[],LST=[];const R={a:[],b:[]};
const lk=(w,t,rows,x)=>{R[w].push([t,rows,x]);return `data-lk="${w}${R[w].length-1}"`};
const BL=['SUBSCRIBER NAME','SR','ACCOUNT PID','CSP STATUS','AGENT NAME'];
const DF=['SUBSCRIBER NAME','ACCOUNT PID','CSP STATUS','AVAILED PLAN','SR','PR','CSP REMARKS','HD RECOMMENDATION','FINAL STATUS','AGENT CODE','AGENT NAME','TEAM LEADER','PROMO','HOUSE #','ST NAME','BRGY','CITY','CLUSTER'];
const AL={'ACCOUNT PID':['ACCT','ACCOUNT','PID'],'SUBSCRIBER NAME':['SUBSCRIBERS NAME'],'CSP STATUS':['STATUS'],'AVAILED PLAN':['PLAN AVAILED'],'CSP REMARKS':['REMARKS'],'AGENT NAME':['AGENT'],'HOUSE #':['HOUSE#/ UNIT / FLOOR','HOUSE#'],'BRGY':['BGY']};
function dv(r,l){for(const a of [l,...(AL[l]||[])]){const k=Object.keys(r).find(k=>k.trim().toUpperCase()===a);if(k&&r[k]!==''&&r[k]!=null){const v=r[k];return v instanceof Date?fmt(v):String(v)}}return ''}
function mdl(h){$('mc').innerHTML=h;$('md').classList.add('on')}
function closeM(){window.__plRefresh=null;$('md').classList.remove('on')}
function showDetail(r,back){logEv('VIEW DETAILS','Dashboard',dv(r,'SUBSCRIBER NAME'));
 const pd=toD(r['POSTED DATE']);
 mdl(`<div class="mh"><div>${back?'<button class="btn" id="mback">← Back</button> ':''}</div><button class="btn" id="mx">✕</button></div><h2 class="bl nmB" style="margin:8px 0 2px">${esc(dv(r,'SUBSCRIBER NAME')||'—')}</h2><div class="sub">Sale date ${fmt(r._d)||'—'}${pd?' · Posted '+fmt(pd):''}</div><div class="dg">`+DF.filter(l=>l!=='PR'||'PR' in r).map(l=>{const v=dv(r,l);return `<div><label>${l.replace(' PID','')}</label><b class="${v&&BL.includes(l)?'bl':''}${l==='PR'&&v?' rd':''}${l==='SUBSCRIBER NAME'&&v?' nmB':''}${l==='ACCOUNT PID'&&v?' acR':''}${l==='FINAL STATUS'&&v?' stH':''}">${v?esc(v):'—'}</b></div>`+(l==='CSP REMARKS'?upRem(r):'')}).join('')+'</div>');
 $('mx').onclick=closeM;if(back)$('mback').onclick=back}
const payRec=()=>{try{return JSON.parse(localStorage.getItem('mm_pay'))||{}}catch(e){return {}}};
const payH=()=>{try{return JSON.parse(localStorage.getItem('mm_payh'))||[]}catch(e){return []}};
const paySave=R=>{try{localStorage.setItem('mm_pay',JSON.stringify(R))}catch(e){}};
const PK=r=>[dv(r,'SUBSCRIBER NAME'),r['DATE']||'',dv(r,'ACCOUNT PID')||dv(r,'SR')].join('|');
const isFP=r=>/^\s*FOR PAYMENT/i.test(r._s||'');
const PAYOPT=[['','Select action'],['cancel','For cancellation'],['nwtp','Not willing to pay'],['sched','Proceed scheduled payment']];
const upRem=r=>{const x=payRec()[PK(r)];if(!x||(!x.o&&!x.m))return '';const lab=(PAYOPT.find(z=>z[0]===x.o)||['',''])[1];return `<div style="grid-column:1/-1"><label>UPDATED REMARKS</label><b class="upr">${esc([lab,x.d?'pay on '+x.d:'',x.m].filter(Boolean).join(' \u00b7 '))}</b><div class="sub">${esc([x.bn,x.code?'('+x.code+')':'',x.by].filter(Boolean).join(' '))}${x.at?' \u00b7 '+esc(x.at):''}</div></div>`};
const NOCONTACT=/ringing|unattended|busy|no answer|not reachable|cannot be reached|out of coverage/i;
const solicited=(r,REC)=>{if(REC[PK(r)])return true;const t=String(r['PAYMENT REMARKS']||'').trim();return !!t&&!NOCONTACT.test(t)};
let FM='';
function renderFP(){const all=cur().filter(isFP),REC=payRec(),m={},ms=[...new Set(all.map(r=>r._m).filter(Boolean))].sort();if(FM&&!ms.includes(FM))FM='';mopts('fm',ms,FM);const rows=all.filter(r=>!FM||r._m===FM);
 rows.forEach(r=>{const a=r._a;if(!a)return;(m[a]=m[a]||[]).push(r)});
 const rk=Object.entries(m).map(([a,l])=>[a,l,l.filter(r=>solicited(r,REC)).length]).sort((x,y)=>y[1].length-x[1].length||y[2]-x[2]);
 const sol=rows.filter(r=>solicited(r,REC)).length;
 $('fps').textContent=`${FM?mlabel(FM):'All months'} \u00b7 ${rows.length} for payment \u00b7 ${sol} solicited \u00b7 ${rk.length} agents \u00b7 click an agent to see subscribers and record the action`;
 $('fpr').innerHTML=rk.length?`<div class="sc" style="max-height:300px"><table class="fpt"><thead><tr><th>#</th><th>Agent</th><th>For payment</th><th>Solicited</th></tr></thead><tbody>`+rk.map(([a,l,n],i)=>`<tr class="rr" ${lk('a',a+' \u00b7 FOR PAYMENT',l,4)}><td>${i+1}</td><td>${esc(a)}</td><td class="num">${l.length}</td><td class="num">${n}</td></tr>`).join('')+`</tbody><tfoot><tr><td></td><td><b>Total</b></td><td class="num">${rows.length}</td><td class="num">${sol}</td></tr></tfoot></table></div>`:'<div class="empty">No FOR PAYMENT records</div>'}
const INS=['ORDER CREATED','PAID','RESERVED FACILITY'],INSL={'ORDER CREATED':'Order created','PAID':'Paid','RESERVED FACILITY':'Reserved facility'};
const insSt=r=>String(r._c||r['ADMIN REMARKS']||'').trim().toUpperCase();
const cbrOf=r=>[...new Set([dv(r,'CBR 1'),dv(r,'CBR 2')].filter(Boolean))].join(' / ');
let IM='';
function renderINS(){const all=cur().filter(r=>INS.includes(insSt(r))),ms=[...new Set(all.map(r=>r._m).filter(Boolean))].sort();if(IM&&!ms.includes(IM))IM='';mopts('im',ms,IM);
 const rows=all.filter(r=>!IM||r._m===IM),m={};rows.forEach(r=>{const a=r._a;if(!a)return;(m[a]=m[a]||[]).push(r)});
 const rk=Object.entries(m).sort((x,y)=>y[1].length-x[1].length),cnt=(l,st)=>l.filter(r=>insSt(r)===st);
 $('ins').textContent=`${IM?mlabel(IM):'All months'} \u00b7 ${rows.length} for installation \u00b7 ${rk.length} agents \u00b7 click a number to see subscriber name, account and CBR`;
 $('insr').innerHTML=rk.length?`<div class="sc" style="max-height:300px"><table class="fpt ins"><thead><tr><th>#</th><th>Agent</th>${INS.map(x=>`<th>${INSL[x]}</th>`).join('')}<th>Total</th></tr></thead><tbody>`+rk.map(([a,l],i)=>`<tr><td>${i+1}</td><td class="rr" ${lk('a',a+' \u00b7 FOR INSTALLATION',l,5)}>${esc(a)}</td>${INS.map(x=>{const c=cnt(l,x);return `<td class="num">${c.length?`<span class="rr" ${lk('a',a+' \u00b7 '+INSL[x],c,5)}>${c.length}</span>`:'0'}</td>`}).join('')}<td class="num"><span class="rr" ${lk('a',a+' \u00b7 FOR INSTALLATION',l,5)}>${l.length}</span></td></tr>`).join('')+`</tbody><tfoot><tr><td></td><td><b>Total</b></td>${INS.map(x=>`<td class="num">${cnt(rows,x).length}</td>`).join('')}<td class="num">${rows.length}</td></tr></tfoot></table></div>`:'<div class="empty">No FOR INSTALLATION records</div>'}

let DB=null,DBP=null,DBW=true;
const dbMsg=t=>{const e=$('fpsy');if(e)e.textContent=t};
const strip=x=>{const o={};['o','d','m','at','by','code','bn','n','a','g'].forEach(k=>o[k]=x[k]==null?'':x[k]);return o};
function dbInit(){if(DBP)return DBP;DBP=(async()=>{
 if(typeof claude==='undefined'||!claude.use)return null;
 try{const u=await claude.use('user');if(u&&u.can){const w=u.can('data.write');DBW=w!==false}}catch(e){}
 try{DB=await claude.use('db')}catch(e){DB=null}
 if(!DB)return null;
 let first=true;
 DB.collection('pay').onSnapshot(snap=>{const L=payRec();let ch=false;const seen={};
  snap.docs.forEach(d=>{const x=d.data();if(!x||!x.key)return;seen[x.key]=1;const l=L[x.key];if(!l||String(x.at||'')>String(l.at||'')){L[x.key]=strip(x);ch=true}});
  if(ch){paySave(L);renderFP();if(window.__plRefresh)window.__plRefresh()}
  dbMsg(DBW?'Shared database connected \u00b7 remarks are live for all agents and admins':'Shared database connected (read-only: ask the owner for Contributor access to save remarks)');
  if(first){first=false;if(DBW){(async()=>{try{for(const [k,v] of Object.entries(payRec())){const l=seen[k];if(!l){await DB.doc('pay/p'+pwh(k)).set(Object.assign({key:k},v))}}}catch(e){}})()}}
 },e=>dbMsg('Shared database unavailable, using this browser only'));
 return DB})();return DBP}
function dbSave(key,rec,nt){dbInit().then(async()=>{if(!DB)return;
 try{await DB.doc('pay/p'+pwh(key)).set(Object.assign({key},rec));await DB.doc('payh/h'+pwh(key+'#'+rec.at+'#'+rec.by)).set(Object.assign({key},rec));dbMsg('Saved to shared database \u00b7 visible to all agents and admins');if(nt)nt.innerHTML+=' <span class="pok">\u00b7 shared</span>'}
 catch(e){dbMsg('Could not save to the shared database (needs Contributor access)');if(nt)nt.innerHTML+=' <span class="perr">\u00b7 not shared: no write access</span>'}})}
function dbLog(row){dbInit().then(async()=>{if(!DB||!DBW)return;try{await DB.doc('actlog/a'+pwh(row.visitor+'|'+row.time+'|'+row.action+'|'+row.search)).set(row)}catch(e){}})}
async function dbLogs(){await dbInit();if(!DB)return null;try{const s=await DB.collection('actlog').orderBy('time','desc').limit(1000).get();return s.docs.map(d=>d.data()).filter(Boolean)}catch(e){return null}}
const meNow=()=>{try{return ME}catch(e){return null}};
const seenKey=()=>'mm_pseen_'+((meNow()&&meNow().email)||'guest').toLowerCase();
const getSeen=()=>{try{return localStorage.getItem(seenKey())||''}catch(e){return ''}};
function renderFPNew(){const el=$('fpn');if(!el)return;const R=payRec(),me=((meNow()&&meNow().email)||'').toLowerCase(),seen=getSeen();
 const L=Object.entries(R).map(([k,v])=>Object.assign({key:k},v)).sort((x,y)=>String(y.at).localeCompare(String(x.at)));
 const isNew=x=>String(x.at||'')>seen&&String(x.by||'').toLowerCase()!==me;const nn=L.filter(isNew).length;
 const lab=o=>(PAYOPT.find(z=>z[0]===o)||['',o||''])[1],who=x=>[x.bn,x.code?'('+x.code+')':'',x.by].filter(Boolean).join(' ')||'\u2014';
 el.innerHTML=`<h4><span>Latest remarks from all agents \u00b7 live (${L.length} subscriber${L.length===1?'':'s'})</span>${nn?`<b class="nb">${nn} new</b>`:''}<button class="btn" id="fpns">Mark as seen</button><button class="btn" id="fpno">Open full log</button></h4>`+(L.slice(0,8).map(x=>`<div class="it${isNew(x)?' nw':''}">${isNew(x)?'<b class="nb">NEW</b>':''}<b>${esc(x.n||'\u2014')}</b> \u00b7 ${esc(x.g||'\u2014')} \u00b7 ${esc(lab(x.o))}${x.d?' \u00b7 pay on '+esc(x.d):''}${x.m?' \u00b7 '+esc(x.m):''}<div class="mt">${esc(who(x))} \u00b7 ${esc(x.at||'')}</div></div>`).join('')||'<div class="it mt">No remarks yet</div>');
 $('fpns').onclick=()=>{try{localStorage.setItem(seenKey(),L[0]?String(L[0].at):'')}catch(e){}renderFPNew()};$('fpno').onclick=showPayLog}
async function dbHist(){await dbInit();if(!DB)return null;try{const s=await DB.collection('payh').orderBy('at','desc').limit(1000).get();return s.docs.map(d=>d.data()).filter(x=>x&&x.key).map(x=>({key:x.key,n:x.n,a:x.a,g:x.g,o:x.o,d:x.d||'',m:x.m||'',at:x.at,by:x.by||'',code:x.code||'',bn:x.bn||''}))}catch(e){return null}}
{const _f=renderFP;renderFP=function(){_f();renderFPNew()}}
function syncPay(){if(!LOG_URL)return;return fetch(LOG_URL+(LOG_URL.includes('?')?'&':'?')+'read=pay').then(r=>r.json()).then(j=>{if(!j||!Array.isArray(j.rows))return;const L=payRec();let ch=false;
 j.rows.forEach(x=>{if(!x.key)return;const l=L[x.key];if(!l||String(x.at)>String(l.at||'')){L[x.key]={o:x.action,d:x.date||'',m:x.remarks||'',at:x.at,by:x.by||'',code:x.code||'',bn:x.byName||'',n:x.name||'',a:x.account||'',g:x.agent||''};ch=true}});
 if(ch){paySave(L);renderFP()}const e=$('fpsy');if(e)e.textContent='Database synced'}).catch(()=>{const e=$('fpsy');if(e)e.textContent='Could not reach the database, using this browser only'})}
function payCsv(){const R=payRec(),H=['Subscriber','Account','Agent','Action','Date of payment','Remarks','Saved by (name)','Saved by (email)','Agent code','Saved at'],q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
 const lab=o=>(PAYOPT.find(z=>z[0]===o)||['',o])[1];
 const data=[H.map(q).join(',')].concat(Object.values(R).sort((x,y)=>String(y.at).localeCompare(String(x.at))).map(x=>[x.n,x.a,x.g,lab(x.o),x.d,x.m,x.bn,x.by,x.code,x.at].map(q).join(','))).join('\r\n');
 (async()=>{let d=null;try{d=await claude.use('downloads')}catch(e){}
  if(d){try{await d.save({filename:'for_payment_database.csv',data})}catch(e){}return}
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'text/csv'}));a.download='for_payment_database.csv';document.body.appendChild(a);a.click();a.remove()})()}
function showPayLog(){let ALL=[],HIST=[],MODE='latest',VIEW=[];
 mdl(`<div class="mh"><h2 style="margin:0">For payment log</h2><button class="btn" id="mx">\u2715</button></div><div class="sub" id="pls">Loading...</div><div class="ctl"><select id="plm"><option value="latest">Latest remarks per subscriber</option><option value="all">All updates (history)</option></select><input id="plq" placeholder="Filter by subscriber, account, agent, action, remarks or who saved"><button class="btn" id="plr">Refresh</button><button class="btn" id="pld">Download CSV</button></div><div class="sc2" style="max-height:58vh"><table><thead><tr><th>Saved at</th><th>Subscriber</th><th>Account</th><th>Agent</th><th>Action</th><th>Date of payment</th><th>Remarks</th><th>Saved by</th><th>Updates</th></tr></thead><tbody id="plb"></tbody></table></div>`);
 $('mx').onclick=closeM;
 const lab=o=>(PAYOPT.find(z=>z[0]===o)||['',o||''])[1],who=x=>[x.bn,x.code?'('+x.code+')':'',x.by].filter(Boolean).join(' ')||'\u2014';
 const draw=()=>{const f=($('plq').value||'').trim().toLowerCase(),src=MODE==='all'?HIST:ALL;
  VIEW=src.filter(x=>!f||[x.n,x.a,x.g,lab(x.o),x.m,x.by,x.bn,x.code,x.d].join(' ').toLowerCase().includes(f));
  const cnt={};HIST.forEach(h=>{cnt[h.key]=(cnt[h.key]||0)+1});
  $('plb').innerHTML=VIEW.slice(0,500).map(x=>`<tr><td>${esc(x.at||'')}</td><td class="bl">${esc(x.n||'\u2014')}</td><td>${esc(x.a||'\u2014')}</td><td>${esc(x.g||'\u2014')}</td><td>${esc(lab(x.o))}</td><td>${esc(x.d||'\u2014')}</td><td>${esc(x.m||'\u2014')}</td><td>${esc(who(x))}</td><td>${MODE==='all'?'':(cnt[x.key]||1)}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">No for payment actions yet</td></tr>'};
 const load=async()=>{$('pls').textContent='Loading...';let hist=payH(),rem=false;
  if(LOG_URL){try{await syncPay();const r=await fetch(LOG_URL+(LOG_URL.includes('?')?'&':'?')+'read=payhist'),j=await r.json();if(j&&Array.isArray(j.rows)){hist=j.rows.map(x=>({key:x.key,n:x.name,a:x.account,g:x.agent,o:x.action,d:x.date||'',m:x.remarks||'',at:x.at,by:x.by||'',code:x.code||'',bn:x.byName||''}));rem=true}}catch(e){}}
  {const dh=await dbHist();if(dh){hist=dh;rem=true}}
  HIST=hist.slice().sort((x,y)=>String(y.at).localeCompare(String(x.at)));
  ALL=Object.entries(payRec()).map(([k,v])=>Object.assign({key:k},v)).sort((x,y)=>String(y.at).localeCompare(String(x.at)));
  const ag=new Set(ALL.map(x=>x.g).filter(Boolean)),sv2=new Set(ALL.map(x=>x.by).filter(Boolean));
  $('pls').textContent=`${ALL.length} subscriber${ALL.length===1?'':'s'} with remarks \u00b7 ${HIST.length} update${HIST.length===1?'':'s'} \u00b7 ${sv2.size} agent${sv2.size===1?'':'s'} saved remarks`+(rem?' \u00b7 shared database \u2014 visible to all agents':(LOG_URL?' \u00b7 could not reach the shared database, showing this browser only':' \u00b7 this browser only (add your Google Sheet link to share with all agents)'));draw()};
 window.__plRefresh=()=>{if($('plb'))load()};$('plq').oninput=draw;$('plm').onchange=e=>{MODE=e.target.value;draw()};$('plr').onclick=load;$('pld').onclick=()=>{if(MODE==='all')histCsv(HIST);else payCsv()};load()}
function histCsv(rows){const H=['Saved at','Subscriber','Account','Agent','Action','Date of payment','Remarks','Saved by (name)','Saved by (email)','Agent code'],q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"',lab=o=>(PAYOPT.find(z=>z[0]===o)||['',o||''])[1];
 const data=[H.map(q).join(',')].concat(rows.map(x=>[x.at,x.n,x.a,x.g,lab(x.o),x.d,x.m,x.bn,x.by,x.code].map(q).join(','))).join('\r\n');
 (async()=>{let d=null;try{d=await claude.use('downloads')}catch(e){}
  if(d){try{await d.save({filename:'for_payment_history.csv',data})}catch(e){}return}
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'text/csv'}));a.download='for_payment_history.csv';document.body.appendChild(a);a.click();a.remove()})()}
function showPayList(t,rows){const REC=payRec(),sh=rows.slice(0,200);
 const row=(r,i)=>{const x=REC[PK(r)]||{},nt=String(r['PAYMENT REMARKS']||'').trim();return `<tr data-i="${i}"><td class="bl">${esc(dv(r,'SUBSCRIBER NAME'))}</td><td class="bl">${esc(dv(r,'ACCOUNT PID')||'\u2014')}</td><td><select class="po">${PAYOPT.map(([v,l])=>`<option value="${v}"${x.o===v?' selected':''}>${l}</option>`).join('')}</select></td><td><input type="date" class="pd" value="${esc(x.d||'')}"${x.o==='sched'?'':' disabled'}></td><td><input class="pm" maxlength="300" placeholder="Remarks" value="${esc(x.m||'')}"><div class="pt sub">${x.at?'<span class="pok">Saved '+esc(x.at)+(x.bn?' \u00b7 '+esc(x.bn):'')+'</span>':(nt?'Note: '+esc(nt.slice(0,70)):'')}</div></td></tr>`};
 mdl(`<div class="mh"><h2 style="margin:0">${esc(t)}</h2><button class="btn" id="mx">\u2715</button></div><div class="sub">${rows.length} records${rows.length>200?' \u00b7 showing first 200':''} \u00b7 choose an action, set the payment date if scheduled and add remarks \u2014 it saves automatically</div><div class="sc2 pay" style="max-height:60vh"><table><thead><tr><th>Subscriber name</th><th>Account</th><th>Action</th><th>Date of payment</th><th>Remarks</th></tr></thead><tbody>`+sh.map(row).join('')+'</tbody></table></div>');
 $('mx').onclick=closeM;const mc=$('mc');
 mc.onchange=e=>{const el=e.target.closest('.po,.pd,.pm');if(!el)return;const tr=el.closest('tr'),sel=tr.querySelector('.po'),d=tr.querySelector('.pd'),mm=tr.querySelector('.pm').value.trim(),nt=tr.querySelector('.pt'),r=sh[+tr.dataset.i],o=sel.value,bad=x=>{nt.innerHTML='<span class="perr">'+x+'</span>'};
  if(el===sel){d.disabled=o!=='sched';if(d.disabled)d.value=''}
  if(!o)return bad('Choose an action to save.');if(o==='sched'&&!d.value)return bad('Set the date of payment to save.');
  const R2=payRec(),now=new Date(),p2=n=>String(n).padStart(2,'0'),at=`${now.getFullYear()}-${p2(now.getMonth()+1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`,lab=PAYOPT.find(z=>z[0]===o)[1],key=PK(r),dt=o==='sched'?d.value:'';
  const rec={o,d:dt,m:mm,at,by:(ME&&ME.email)||'',code:(ME&&ME.code)||'',bn:(ME&&ME.name)||'',n:dv(r,'SUBSCRIBER NAME'),a:dv(r,'ACCOUNT PID'),g:r._a||''};R2[key]=rec;paySave(R2);{const H=payH();H.push(Object.assign({key},rec));try{localStorage.setItem('mm_payh',JSON.stringify(H.slice(-2000)))}catch(er){}}
  if(LOG_URL){try{fetch(LOG_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify({type:'pay',key,name:rec.n,account:rec.a,agent:rec.g,label:lab,action:o,date:dt,remarks:mm,by:rec.by,code:rec.code,byName:rec.bn,at})}).catch(()=>{})}catch(er){}}
  dbSave(key,rec,nt);
  logEv('PAYMENT UPDATE','For payment',`${rec.n} \u00b7 ${rec.a||'no account'} \u00b7 ${lab}${dt?' \u00b7 pay on '+dt:''}${mm?' \u00b7 '+mm:''}`);
  nt.innerHTML='<span class="pok">Saved '+at+(rec.bn?' \u00b7 '+esc(rec.bn):'')+'</span>'};
 syncPay()}
function showList(t,rows,pm){
 if(pm===4)return showPayList(t,rows);
 LST=rows;const sh=rows.slice(0,200);
 const C=pm===5?[['Subscriber name',r=>dv(r,'SUBSCRIBER NAME'),'bl'],['Account',r=>dv(r,'ACCOUNT PID')||'\u2014','bl'],['CBR',r=>cbrOf(r)||'\u2014',''],['Status',r=>INSL[insSt(r)]||insSt(r),'']]:pm===3?[['Subscriber name',r=>dv(r,'SUBSCRIBER NAME'),'bl'],['Account',r=>dv(r,'ACCOUNT PID')||'\u2014','bl'],['Payment status',r=>dv(r,'PAYMENT STATUS')||'\u2014',''],['Final status',r=>r._s||'\u2014','']]:pm===2?[['Subscriber name',r=>dv(r,'SUBSCRIBER NAME'),'bl'],['Subdivision',r=>dv(r,'SUBDIVISION')||'\u2014',''],['Final status',r=>r._s||'\u2014','']]:[['Subscriber name',r=>dv(r,'SUBSCRIBER NAME'),'bl'],['Account',r=>dv(r,'ACCOUNT PID')||'\u2014','bl'],['CSP status',r=>dv(r,'CSP STATUS')||'\u2014','bl'],[pm?'Payment status':'Final status',r=>pm?(dv(r,'PAYMENT STATUS')||'\u2014'):r._s,''],['Agent',r=>r._a,'bl']];
 mdl(`<div class="mh"><h2 style="margin:0">${esc(t)}</h2><button class="btn" id="mx">\u2715</button></div><div class="sub">${rows.length.toLocaleString()} records${rows.length>200?' \u00b7 showing first 200':''}${pm===3||pm===5?'':' \u00b7 click a row for details'}</div><div class="sc2" style="max-height:60vh"><table><thead><tr>${C.map(c=>`<th>${c[0]}</th>`).join('')}</tr></thead><tbody>`+sh.map((r,i)=>`<tr class="${pm===3||pm===5?'':'rr'}" data-j="${i}">${C.map(c=>`<td class="${c[2]}">${esc(c[1](r))}</td>`).join('')}</tr>`).join('')+'</tbody></table></div>');
 $('mx').onclick=closeM;$('mc').querySelectorAll('tr[data-j]').forEach(tr=>pm!==3&&pm!==5&&(tr.onclick=()=>showDetail(sh[tr.dataset.j],()=>showList(t,rows,pm))))}
document.addEventListener('click',e=>{const l=e.target.closest('[data-lk]');if(l){const[w,i]=[l.dataset.lk[0],+l.dataset.lk.slice(1)],x=R[w][i];if(x)showList(x[0],x[1],x[2])}});
$('tb').onclick=e=>{const tr=e.target.closest('tr[data-i]');if(tr)showDetail(CUR[tr.dataset.i])};
$('md').onclick=e=>{if(e.target.id==='md')closeM()};document.addEventListener('keydown',e=>{if(e.key==='Escape')closeM()});
const toD=v=>v instanceof Date?v:(v?(isNaN(new Date(v))?null:new Date(v)):null);
const g1=(r,k)=>String(r[k]==null?'':r[k]).replace(/\s+/g,' ').trim().toUpperCase();
const pc=(p,n)=>n?Math.round(p/n*100):0,pill=x=>`<span class="pill ${x<40?'lo':x<70?'mid':'hi'}">${x}%</span>`;
const mb=(n,p,mx)=>`<div class="mb" style="width:${mx?n/mx*100:0}%"><i style="width:${n?Math.min(p/n,1)*100:0}%"></i></div>`;
const PAL=['#e4002b','#1c1c1c','#9b1111','#7a7a7a','#ff6b81','#4a4a4a'];
const st2={gm:'',gf:'',gt:'',gq:'',gs:'n',gl:20,sm:'',dm:'',pm:'',bm:'',sb:'EVENT TYPE',f:'',t:'',sq:'',bq:'',bs:'n',bl:20,site:''};
const pdm=r=>mkey(toD(r['POSTED DATE'])),sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
const mopts=(id,keys,cur)=>$(id).innerHTML='<option value="">All months</option>'+keys.map(k=>`<option value="${k}" ${k===cur?'selected':''}>${mlabel(k)}</option>`).join('');
const inc=(o,k,i)=>{(o[k]=o[k]||[0,0])[i]++};
function render2(){R.b=[];
 const rows=S.PLDT?S.PLDT.rows:[],PR=rows.filter(posted),ML=m=>m?mlabel(m):'All months';
 const sale=[...new Set(rows.map(r=>r._m).filter(Boolean))],pmo=[...new Set(rows.map(pdm).filter(Boolean))],allm=[...new Set([...sale,...pmo])].sort();
 // designation
 mopts('dm',allm,st2.dm);mopts('sm',allm,st2.sm);
 const dsg=r=>g1(r,'DESIGNATION')||'UNSPECIFIED',dp=PR.filter(r=>!st2.dm||pdm(r)===st2.dm),dl=tally(dp,dsg),dn=dp.length;
 let acc=0;const cg=dl.map(([k,n],i)=>{const a=acc/dn*100;acc+=n;return `${PAL[i%6]} ${a}% ${acc/dn*100}%`}).join(',');
 $('dsub').textContent=`${ML(st2.dm)} · Posted records · ${dl.length} designations`;
 $('dtop').innerHTML=`<div class="donut rr" ${lk('b','Posted records',dp)} style="background:conic-gradient(${cg||'var(--track) 0 100%'})"><div>${dn}</div></div><div style="flex:1">`+dl.map(([k,n],i)=>`<div class="lg rr" ${lk('b','Designation: '+k+' · posted',dp.filter(r=>dsg(r)===k))}><i style="background:${PAL[i%6]}"></i><span>${esc(k)}</span><b>${n}</b><span>${pc(n,dn)}%</span></div>`).join('')+'</div>';
 const bmo={};dp.forEach(r=>{const m=pdm(r);if(m){bmo[m]=bmo[m]||{};bmo[m][dsg(r)]=(bmo[m][dsg(r)]||0)+1}});
 const ms=Object.keys(bmo).sort(),mx=Math.max(1,...ms.map(m=>sum(bmo[m])));
 $('dmon').innerHTML=ms.map(m=>`<div class="mrow rr" ${lk('b','Posted · '+mlabel(m),dp.filter(r=>pdm(r)===m))}><span>${mlabel(m)}</span><div class="stk" style="width:${sum(bmo[m])/mx*100}%">`+dl.map(([k],i)=>`<i style="flex:${bmo[m][k]||0};background:${PAL[i%6]}"></i>`).join('')+`</div><b>${sum(bmo[m])}</b></div>`).join('');
 // plans
 mopts('pm',allm,st2.pm);
 const sol=rows.filter(r=>!st2.pm||r._m===st2.pm),pst=PR.filter(r=>!st2.pm||pdm(r)===st2.pm),ap=r=>g1(r,'AVAILED PLAN')||'NO PLAN',pl={};
 sol.forEach(r=>inc(pl,ap(r),0));pst.forEach(r=>inc(pl,ap(r),1));
 const pa=Object.entries(pl).sort((a,b)=>b[1][0]-a[1][0]||b[1][1]-a[1][1]),pmx=Math.max(1,...pa.map(x=>x[1][0]));
 $('psub').textContent=`${ML(st2.pm)} · solicited by sale date, posted by posted date · ${pa.length} plans · ${sol.length} solicited · ${pst.length} posted (${pc(pst.length,sol.length)}%)`;
 $('ptb').innerHTML=pa.map(([k,[n,p]],i)=>`<tr class="rr" ${lk('b',k+' · solicited',sol.filter(r=>ap(r)===k))}><td>${i+1}</td><td><b>${esc(k)}</b>${mb(Math.max(n,p),p,pmx)}</td><td><b>${n}</b></td><td class="gr rr" ${lk('b',k+' · posted',pst.filter(r=>ap(r)===k))}>${p}</td><td>${pill(pc(p,n))}</td></tr>`).join('');
 // barangay
 mopts('bm',allm,st2.bm);
 const bk=r=>{const b=g1(r,'BRGY'),c=g1(r,'CITY');return b?b+(c?', '+c:''):''},B={};
 rows.filter(r=>!st2.bm||r._m===st2.bm).forEach(r=>{const k=bk(r);if(k)inc(B,k,0)});
 PR.filter(r=>!st2.bm||pdm(r)===st2.bm).forEach(r=>{const k=bk(r);if(k)inc(B,k,1)});
 const all=Object.entries(B).map(([k,[n,p]])=>({k,n,p,r:pc(p,n)})),tn=all.reduce((s,x)=>s+x.n,0),tp=all.reduce((s,x)=>s+x.p,0),bq=st2.bq.toLowerCase();
 const bl=all.filter(x=>!bq||x.k.toLowerCase().includes(bq)).sort((a,b)=>b[st2.bs]-a[st2.bs]||b.n-a.n),bs=bl.slice(0,st2.bl),bx=Math.max(1,...bs.map(x=>x.n));
 $('bsub').textContent=`${ML(st2.bm)} · subscribers by sale date, posted by posted date · showing ${bs.length} of ${all.length} barangays`;
 $('bk').innerHTML=`<div><b>${all.length}</b>Barangays</div><div class="rr" ${lk('b','Barangay subscribers',rows.filter(r=>bk(r)&&(!st2.bm||r._m===st2.bm)))}><b>${tn}</b>Subscribers</div><div class="rr" ${lk('b','Barangay posted',PR.filter(r=>bk(r)&&(!st2.bm||pdm(r)===st2.bm)))}><b>${tp}</b>Posted</div><div><b>${pc(tp,tn)}%</b>Posted rate</div>`;
 $('btb').innerHTML=bs.map((x,i)=>`<tr class="rr" ${lk('b',x.k+' · subscribers',rows.filter(r=>bk(r)===x.k&&(!st2.bm||r._m===st2.bm)))}><td>${i+1}</td><td>${esc(x.k)}${mb(Math.max(x.n,x.p),x.p,bx)}</td><td><b>${x.n}</b></td><td class="gr rr" ${lk('b',x.k+' · posted',PR.filter(r=>bk(r)===x.k&&(!st2.bm||pdm(r)===st2.bm)))}>${x.p}</td><td>${pill(x.r)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No barangays</td></tr>';
 // barangay range
 mopts('gm',allm,st2.gm);
 {const gf=st2.gf?new Date(st2.gf+'T00:00:00'):null,gt=st2.gt?new Date(st2.gt+'T23:59:59'):null,inR=(d,m)=>(!st2.gm||m===st2.gm)&&(!gf||(d&&d>=gf))&&(!gt||(d&&d<=gt)),gk=r=>{const b=g1(r,'BRGY'),c=g1(r,'CITY');return b?b+(c?', '+c:''):''},gsr=rows.filter(r=>gk(r)&&inR(r._d,r._m)),gpr=PR.filter(r=>gk(r)&&inR(toD(r['POSTED DATE']),pdm(r))),G={};
 gsr.forEach(r=>inc(G,gk(r),0));gpr.forEach(r=>inc(G,gk(r),1));
 const ga=Object.entries(G).map(([k,[n,p]])=>({k,n,p,r:pc(p,n)})),gq=st2.gq.toLowerCase(),gl=ga.filter(x=>!gq||x.k.toLowerCase().includes(gq)).sort((a,b)=>b[st2.gs]-a[st2.gs]||b.n-a.n),gv=gl.slice(0,st2.gl),gx=Math.max(1,...gv.map(x=>Math.max(x.n,x.p)));
 $('gsub').textContent=`${st2.gm?mlabel(st2.gm):(st2.gf||st2.gt?'Date range':'All dates')} \u00b7 solicited by sale date, posted by posted date \u00b7 showing ${gv.length} of ${ga.length} barangays \u00b7 click a number to see subscriber name, subdivision and final status`;
 $('gk').innerHTML=`<div><b>${ga.length}</b>Barangays</div><div class="rr" ${lk('b','Solicited \u00b7 all barangays',gsr,2)}><b>${gsr.length}</b>Solicited</div><div class="rr" ${lk('b','Posted \u00b7 all barangays',gpr,2)}><b>${gpr.length}</b>Posted</div><div><b>${pc(gpr.length,gsr.length)}%</b>Posted rate</div>`;
 $('gtb').innerHTML=gv.map((x,i)=>`<tr><td>${i+1}</td><td class="rr" ${lk('b',x.k+' \u00b7 solicited',gsr.filter(r=>gk(r)===x.k),2)}><b>${esc(x.k)}</b></td><td class="rr" ${lk('b',x.k+' \u00b7 solicited',gsr.filter(r=>gk(r)===x.k),2)}><b>${x.n}</b></td><td class="gr rr" ${lk('b',x.k+' \u00b7 posted',gpr.filter(r=>gk(r)===x.k),2)}>${x.p}</td><td>${pill(x.r)}</td><td style="width:34%">${mb(Math.max(x.n,x.p),x.p,gx)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No barangays</td></tr>';}
 // site
 const SB=st2.sb,f=st2.f?new Date(st2.f+'T00:00:00'):null,t=st2.t?new Date(st2.t+'T23:59:59'):null;
 const sr=rows.filter(r=>r._d&&(!st2.sm||r._m===st2.sm)&&(!f||r._d>=f)&&(!t||r._d<=t)),sk=r=>g1(r,SB)||'UNSPECIFIED',T={};
 sr.forEach(r=>{inc(T,sk(r),0);if(posted(r))inc(T,sk(r),1)});
 const sq=st2.sq.toLowerCase(),sa=Object.entries(T).filter(([k])=>!sq||k.toLowerCase().includes(sq)).sort((a,b)=>b[1][0]-a[1][0]),sx=Math.max(1,...sa.map(x=>x[1][0])),ssn=sr.length,ssp=sr.filter(posted).length;
 $('ssub').textContent=`${st2.sm?mlabel(st2.sm):(st2.f||st2.t?'Date range':'All dates')} · subscribers by sale date, posted by posted date · ${Object.keys(T).length} sites · ${ssn} subscribers · ${ssp} posted · click a site to preview its subdivisions`;
 $('stb').innerHTML=`<tr style="background:var(--alt)"><td><b>All sites (${Object.keys(T).length})</b></td><td class="rr" ${lk('b','All sites · subscribers',sr)}><b>${ssn}</b></td><td class="gr rr" ${lk('b','All sites · posted',sr.filter(posted))}>${ssp}</td><td>${pill(pc(ssp,ssn))}</td><td>${mb(ssn,ssp,ssn)}</td></tr>`+sa.map(([k,[n,p]])=>`<tr class="${k===st2.site?'sel':''}"><td><span class="site" data-s="${esc(k)}">${esc(k)}</span></td><td class="rr" ${lk('b',k+' · subscribers',sr.filter(r=>sk(r)===k))}><b>${n}</b></td><td class="gr rr" ${lk('b',k+' · posted',sr.filter(r=>sk(r)===k&&posted(r)))}>${p}</td><td>${pill(pc(p,n))}</td><td>${mb(n,p,sx)}</td></tr>`).join('');
 document.querySelectorAll('.site').forEach(e=>e.onclick=()=>{st2.site=st2.site===e.dataset.s?'':e.dataset.s;render2()});
 const sd={};sr.filter(r=>sk(r)===st2.site).forEach(r=>{const k=g1(r,'SUBDIVISION')||'NO SUBDIVISION';inc(sd,k,0);if(posted(r))inc(sd,k,1)});
 $('sub2').innerHTML=st2.site?`<h3 style="margin:10px 0 4px">Subdivisions in ${esc(st2.site)}</h3><table><tbody>`+Object.entries(sd).sort((a,b)=>b[1][0]-a[1][0]).slice(0,15).map(([k,[n,p]])=>`<tr class="rr" ${lk('b',st2.site+' · '+k,sr.filter(r=>sk(r)===st2.site&&(g1(r,'SUBDIVISION')||'NO SUBDIVISION')===k))}><td>${esc(k)}</td><td><b>${n}</b></td><td class="gr">${p}</td><td>${pill(pc(p,n))}</td></tr>`).join('')+'</tbody></table>':'';
}
{const _r=render;render=function(){R.a=[];_r();render2()}}
['sm','dm','pm','bm'].forEach(id=>$(id).onchange=e=>{st2[id]=e.target.value;render2()});
$('bq').oninput=e=>{st2.bq=e.target.value;render2()};$('bs').onchange=e=>{st2.bs=e.target.value;render2()};$('bl').onchange=e=>{st2.bl=+e.target.value;render2()};
$('sb').onchange=e=>{st2.sb=e.target.value;st2.site='';render2()};$('gm').onchange=e=>{st2.gm=e.target.value;render2()};$('gf').onchange=e=>{st2.gf=e.target.value;render2()};$('gt').onchange=e=>{st2.gt=e.target.value;render2()};$('gclr').onclick=()=>{st2.gf=st2.gt='';$('gf').value=$('gt').value='';render2()};$('gq').oninput=e=>{st2.gq=e.target.value;render2()};$('gs').onchange=e=>{st2.gs=e.target.value;render2()};$('gl').onchange=e=>{st2.gl=+e.target.value;render2()};$('sf').onchange=e=>{st2.f=e.target.value;render2()};$('sto').onchange=e=>{st2.t=e.target.value;render2()};
$('sq').oninput=e=>{st2.sq=e.target.value;render2()};$('sclr').onclick=()=>{st2.f=st2.t='';$('sf').value=$('sto').value='';render2()};
S={};for(const n in DATA)prep(n,DATA[n].map(r=>({...r,DATE:r.DATE?new Date(r.DATE+'T00:00:00'):'','POSTED DATE':r['POSTED DATE']?new Date(r['POSTED DATE']+'T00:00:00'):''})));tab='PLDT';$('info').textContent='DATABASE_AUG_TO_OCT.xlsx · 5,138 records';render();
const PW='3mdaupland',nc=v=>String(v||'').trim().toUpperCase().replace(/^P/,'');
const AC={};['PLDT','RED'].forEach(t=>(DATA[t]||[]).forEach(r=>{const c=nc(r['AGENT CODE']);if(c&&!AC[c])AC[c]=r['AGENT NAME']}));
let ME=null,pendFc=false,suMode=false,lstep=0,pendC='',pendE='';const pwh=x=>{let a=3735928559,b=1103547991;for(let i=0;i<x.length;i++){const c=x.charCodeAt(i);a=Math.imul(a^c,2654435761);b=Math.imul(b^c,1597334677)}a=Math.imul(a^(a>>>16),2246822507)^Math.imul(b^(b>>>13),3266489909);b=Math.imul(b^(b>>>16),2246822507)^Math.imul(a^(a>>>13),3266489909);return (4294967296*(2097151&b)+(a>>>0)).toString(36)};
const ADMIN_EMAILS=[];/* OPTIONAL: emails allowed to see EVERYONE'S activity, e.g. ['you@email.com']. Leave empty = every logged-in agent sees the full list. */
const LOG_URL='';/* PASTE YOUR GOOGLE APPS SCRIPT WEB APP URL BETWEEN THE QUOTES */
const ld=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}},sv=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const VID=()=>{let v=ld('mm_vid','');if(!v){v='V'+Math.random().toString(36).slice(2,10);sv('mm_vid',v)}return v};
function logEv(action,where,search,em){if(!ME&&!em&&action!=='OPEN PORTAL')return;const d=new Date(),p=n=>String(n).padStart(2,'0'),row={time:`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,email:ME?ME.email:(em||''),code:ME?ME.code:'',name:ME?ME.name:'',action,where,search:search||'',device:(navigator.userAgent||'').slice(0,120),visitor:VID()};
 dbLog(row);const L=ld('mm_log',[]);L.push(row);sv('mm_log',L.slice(-5000));
 if(LOG_URL){try{fetch(LOG_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(row)}).catch(()=>{})}catch(e){}}}
function enter(c,quiet,em){setSu(false);$('lp').value='';$('lp2').value='';ME={code:c,email:em||'',name:AC[c]||''};document.body.classList.remove('lo','fcv');mode('in');$('t1').textContent='DASHBOARD';$('who').textContent='Agent '+c+(AC[c]?' \u00b7 '+AC[c]:'')+(ME.email?' \u00b7 '+ME.email:'');try{sessionStorage.setItem('agc',c);sessionStorage.setItem('age',ME.email)}catch(e){}if(!quiet)logEv('LOG IN','Login');renderFPNew();if(pendFc){pendFc=false;document.body.classList.add('fcv');mode('fc')}}
function setSu(on){suMode=on;lstep=0;pendC='';pendE='';$('sue').hidden=false;$('lul').textContent='Agent code (without the P)';$('lu').value='';$('lul').hidden=$('lu').hidden=true;$('lpl').hidden=$('lp').hidden=false;$('lpl').textContent=on?'Create your password (at least 6 characters)':'Password';$('lp').autocomplete=on?'new-password':'current-password';$('lp').value='';$('lp2').value='';$('lpl2').hidden=$('lp2').hidden=!on;$('lgo').textContent=on?'Sign up':'Log in';$('swi').classList.toggle('on',!on);$('swu').classList.toggle('on',on);$('lerr').textContent=''}
function agStep(em,msg){lstep=1;pendE=em;$('sue').hidden=true;$('lpl').hidden=$('lp').hidden=true;$('lpl2').hidden=$('lp2').hidden=true;$('lul').textContent=msg||'Enter your agent code to proceed';$('lul').hidden=$('lu').hidden=false;$('lu').value='';$('lgo').textContent='Proceed';$('lerr').textContent='';$('lu').focus()}
function tryLogin(){
 const em=lstep===1?pendE:$('le').value.trim().toLowerCase(),A=ld('mm_acc',{}),err=m=>{$('lerr').textContent=m;logEv(suMode?'SIGN UP FAILED':'LOGIN FAILED','Login',m,em)};
 if(lstep===1){const c=nc($('lu').value);
  if(AC[c]===undefined)return err('Agent code not found. Please check your agent code.');
  if(!A[em])return err('Account not found. Please sign up first.');
  $('lerr').textContent='';enter(c,false,em);return}
 if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return err('Enter a valid email address.');
 const pw=$('lp').value;
 if(suMode){
  if(A[em]){setSu(false);$('le').value=em;return err('You already have an account. Please log in with your email and password.')}
  if(pw.length<6)return err('Password must be at least 6 characters.');
  if(pw!==$('lp2').value)return err('Passwords do not match.');
  A[em]={h:pwh(em+':'+pw),at:Date.now()};sv('mm_acc',A);ME={code:'',email:em,name:''};logEv('SIGN UP','Sign up');ME=null;
  agStep(em,'Account created. Enter your agent code to proceed');return}
 const acc=A[em];
 if(!acc)return err('No account yet. Please sign up first with your email and a password.');
 if(acc.h!==pwh(em+':'+pw))return err('Incorrect password.');
 agStep(em)}
$('swi').onclick=()=>setSu(false);$('swu').onclick=()=>setSu(true);
$('lgo').onclick=tryLogin;['lu','lp','lp2','le'].forEach(id=>$(id).onkeydown=e=>{if(e.key==='Enter')tryLogin()});
$('lout').onclick=()=>{logEv('LOG OUT','Logout');ME=null;setSu(false);try{sessionStorage.removeItem('agc')}catch(e){}document.body.classList.add('lo');document.body.classList.remove('fcv');$('t1').textContent='LOG IN';mode('in');$('lu').value=$('lp').value=$('le').value='';closeM()};

const FR=FAC.r.map(x=>({c:FAC.c[x[0]],b:FAC.b[x[1]],s:FAC.s[x[2]],a:FAC.a[x[3]],l:x[4],h:x[5]?'Vertical':'Horizontal',f:x[6],e:x[7],n:x[8]}));
$('fcity').innerHTML='<option value="">Select city</option>'+[...FAC.c].sort().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
let fsel='';
function mode(m){const fc=m==='fc';$('t1').classList.toggle('on',!fc);$('t2').classList.toggle('on',fc);$('fcp').hidden=!fc;document.querySelector('.lc').hidden=fc;if(fc)fcRender()}
let FS=null;
function fcRun(m){
 const n=$('fn').value.trim(),st=$('fs').value.trim(),city=$('fcity').value,b=$('fb').value.trim(),msg=t=>{FS=null;$('fdet').innerHTML='';$('fres').innerHTML='<div class="empty">'+t+'</div>'};
 if(m==='n'){if(n.length<3)return msg('Enter at least 3 characters of the node.');FS={m,n};logEv('SEARCH','Facility checking - CAFAC search (node)',n)}
 else if(m==='s'){if(st.length<2)return msg('Enter at least 2 characters of the site name or address.');FS={m,st};logEv('SEARCH','Facility checking - Site / subdivision',st)}
 else{if(!city)return msg('Choose a city first, then a barangay (optional).');FS={m,city,b};logEv('SEARCH','Facility checking - City / barangay',[city&&'city: '+city,b&&'barangay: '+b].filter(Boolean).join('; '))}
 fcRender()}
function fcRender(){
 $('fdet').innerHTML='';
 if(!FS){$('fres').innerHTML='';return}
 const sc=(a,b)=>b[1]-a[1];
 if(FS.m==='n'){
  const q=FS.n.toLowerCase(),out=[];FR.forEach(r=>r.n.forEach(x=>{if(x[0].toLowerCase().includes(q))out.push([x,r])}));
  out.sort((a,b)=>a[0][0].localeCompare(b[0][0]));const av=out.reduce((s,[x])=>s+x[1],0);
  $('fres').innerHTML=`<div class="kpis"><div><b>${out.length}</b>Nodes found</div><div><b class="${av?'fav':'ffull'}">${av}</b>Available slots</div></div><div class="sub" style="margin-top:6px">Click a row to see its details</div><div class="sc2" style="max-height:38vh"><table><thead><tr><th>Node</th><th>LCP</th><th>Site / subdivision</th><th>Barangay</th><th>City</th><th>Available</th><th>Equipped</th><th>Util.</th><th>Status</th></tr></thead><tbody>`+(out.slice(0,300).map(([x,r],i)=>`<tr class="rr" data-i="${i}"><td class="bl">${esc(x[0])}</td><td>${esc(r.l)}</td><td>${esc(r.s)}</td><td>${esc(r.b)}</td><td>${esc(r.c)}</td><td><b>${x[1]}</b></td><td>${x[2]}</td><td>${x[3]}%</td><td class="${x[1]?'fav':'ffull'}">${x[1]?'AVAILABLE':'FULL'}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">No node found</td></tr>')+'</tbody></table></div>'+(out.length>300?'<div class="sub">Showing first 300 nodes, type more of the node to narrow</div>':'');
  $('fres').querySelectorAll('tr[data-i]').forEach(tr=>tr.onclick=()=>fcNode(...out[+tr.dataset.i]));
  return}
 const q=(FS.st||'').toLowerCase(),bq=(FS.b||'').toLowerCase(),G={};
 FR.forEach(r=>{if(FS.m==='s'?!(r.s+' '+r.a).toLowerCase().includes(q):((FS.city&&r.c!==FS.city)||(FS.b&&r.b!==FS.b)))return;
  const k=r.s+'|'+r.c,g=G[k]=G[k]||{k,s:r.s,c:r.c,bs:new Set(),l:0,n:0,av:0,eq:0,rows:[]};
  g.bs.add(r.b);g.l++;g.n+=r.n.length;g.rows.push(r);r.n.forEach(x=>{g.av+=x[1];g.eq+=x[2]})});
 const L=Object.values(G).sort((a,b)=>b.av-a.av||a.s.localeCompare(b.s)),tot=f=>L.reduce((s,g)=>s+f(g),0),ta=tot(g=>g.av),te=tot(g=>g.eq),sh=L.slice(0,150);
 $('fres').innerHTML=`<div class="kpis"><div><b>${L.length}</b>Sites</div><div><b>${tot(g=>g.l)}</b>LCPs</div><div><b>${tot(g=>g.n)}</b>NAPs</div><div><b class="${ta?'fav':'ffull'}">${ta}</b>Available slots</div><div><b>${te?Math.round((te-ta)/te*100):0}%</b>Utilization</div></div><div class="sub" style="margin-top:6px">Click a site to see its details</div><div class="sc2" style="max-height:34vh"><table><thead><tr><th>Site / subdivision</th><th>Barangay</th><th>City</th><th>LCPs</th><th>NAPs</th><th>Available</th><th>Util.</th><th>Status</th></tr></thead><tbody>`+(sh.map(g=>{const u=g.eq?Math.round((g.eq-g.av)/g.eq*100):0;return `<tr class="rr" data-k="${esc(g.k)}"><td class="bl">${esc(g.s)}</td><td>${esc([...g.bs].slice(0,2).join(', '))}${g.bs.size>2?' +'+(g.bs.size-2):''}</td><td>${esc(g.c)}</td><td>${g.l}</td><td>${g.n}</td><td><b>${g.av}</b></td><td>${u}%</td><td class="${g.av?'fav':'ffull'}">${g.av?'AVAILABLE':'FULL'}</td></tr>`}).join('')||'<tr><td colspan="8" class="empty">No matching site</td></tr>')+'</tbody></table></div>'+(L.length>150?'<div class="sub">Showing the top 150 sites, search to narrow</div>':'');
 $('fres').querySelectorAll('tr[data-k]').forEach(tr=>tr.onclick=()=>fcDetail(G[tr.dataset.k]))}
const kv=p=>'<div class="fdg">'+p.map(([k,v])=>`<div><label>${k}</label><b class="${v==='AVAILABLE'?'fav':v==='FULL'?'ffull':''}">${esc(String(v==null||v===''?'\u2014':v))}</b></div>`).join('')+'</div>';
function fcDetail(g){
 logEv('FACILITY CHECK','Facility checking',g.s+' \u00b7 '+g.c+' \u00b7 '+g.av+' available slots');
 const r0=g.rows[0],u=g.eq?Math.round((g.eq-g.av)/g.eq*100):0,ex=[...new Set(g.rows.map(r=>r.e))].join(', '),ns=[];
 g.rows.forEach(r=>r.n.forEach(x=>ns.push([x,r])));ns.sort((a,b)=>b[0][1]-a[0][1]);
 $('fdet').innerHTML=`<h3 class="fh">${esc(g.s)} \u00b7 ${esc(g.c)}</h3>`+kv([['Site / subdivision',g.s],['Site address',r0.a],['City',g.c],['Barangay',[...g.bs].join(', ')],['Exchange',ex],['Type',r0.h],['FA date',r0.f],['LCPs',g.l],['NAPs',g.n],['Available slots',g.av],['Equipped slots',g.eq],['Utilization',u+'%'],['Status',g.av?'AVAILABLE':'FULL']])+`<div class="sub" style="margin-top:8px">NAPs in this site \u00b7 click a NAP for its details</div><div class="sc2" style="max-height:30vh"><table><thead><tr><th>NAP</th><th>LCP</th><th>Barangay</th><th>Available</th><th>Equipped</th><th>Util.</th><th>Status</th></tr></thead><tbody>`+ns.slice(0,400).map(([x,r],i)=>`<tr class="rr" data-n="${i}"><td class="bl">${esc(x[0])}</td><td>${esc(r.l)}</td><td>${esc(r.b)}</td><td><b>${x[1]}</b></td><td>${x[2]}</td><td>${x[3]}%</td><td class="${x[1]?'fav':'ffull'}">${x[1]?'AVAILABLE':'FULL'}</td></tr>`).join('')+'</tbody></table></div>'+(ns.length>400?'<div class="sub">Showing first 400 NAPs</div>':'');
 $('fdet').querySelectorAll('tr[data-n]').forEach(tr=>tr.onclick=()=>fcNode(...ns[+tr.dataset.n]));
 $('fdet').scrollIntoView({block:'nearest'})}
function fcNode(x,r){
 logEv('FACILITY CHECK','Facility checking','Node '+x[0]);
 $('fdet').innerHTML=`<h3 class="fh">Node ${esc(x[0])}</h3>`+kv([['Node (NAP)',x[0]],['LCP',r.l],['Exchange',r.e],['Site / subdivision',r.s],['Site address',r.a],['Barangay',r.b],['City',r.c],['Type',r.h],['FA date',r.f],['Available slots',x[1]],['Equipped slots',x[2]],['Utilization',x[3]+'%'],['Status',x[1]?'AVAILABLE':'FULL']]);
 $('fdet').scrollIntoView({block:'nearest'})}
function fcBrgy(){const c=$('fcity').value,bs=c?[...new Set(FR.filter(r=>r.c===c).map(r=>r.b))].sort():[];$('fb').innerHTML=c?'<option value="">All barangays</option>'+bs.map(b=>`<option value="${esc(b)}">${esc(b)}</option>`).join(''):'<option value="">Select city first</option>';$('fb').disabled=!c}
function fcClrVis(){$('fclr').hidden=!($('fn').value||$('fs').value||$('fcity').value||FS)}
{const _r=fcRun;fcRun=function(m){_r(m);fcClrVis()}}
fcBrgy();['fn','fs'].forEach(id=>$(id).addEventListener('input',fcClrVis));
$('fcity').addEventListener('change',()=>{fcBrgy();fcClrVis()});
$('fclr').onclick=()=>{$('fn').value=$('fs').value='';$('fcity').value='';fcBrgy();FS=null;$('fres').innerHTML='';$('fdet').innerHTML='';fcClrVis()};
$('fnb').onclick=()=>fcRun('n');$('fsb').onclick=()=>fcRun('s');$('fcb').onclick=()=>fcRun('c');[['fn','n'],['fs','s']].forEach(([id,m])=>$(id).onkeydown=e=>{if(e.key==='Enter')fcRun(m)});
$('t1').onclick=()=>{if(document.body.classList.contains('lo'))mode('in');else document.body.classList.remove('fcv')};
$('t2').onclick=()=>{if(document.body.classList.contains('lo')){pendFc=true;mode('in');$('lerr').textContent='Please log in to use Facility Checking.';return}document.body.classList.add('fcv');mode('fc')};
$('hfc').onclick=()=>{document.body.classList.add('fcv');mode('fc')};

const lastS={},LBL={q:'Subscriber search',fq:'Facility checking search',bq:'Barangay search',gq:'Barangay solicited vs posted search',sq:'Site search'};
['q','fq','bq','gq','sq'].forEach(id=>{const el=$(id);if(!el)return;let t;el.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{const v=el.value.trim();if(v.length>1&&v!==lastS[id]&&ME){lastS[id]=v;const fl=id==='fq'?[$('fcity').value&&'city: '+$('fcity').value,$('fav').value&&'availability: '+($('fav').value==='y'?'with slot':'full')].filter(Boolean).join('; '):'';logEv('SEARCH',LBL[id],v+(fl?' ['+fl+']':''))}},1500)})});
function logCsv(rows){const H=['Time','Email','Agent code','Agent name','Action','Where','Search / details','Device','Visitor ID'],q=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';return '\ufeff'+[H.map(q).join(',')].concat(rows.map(r=>[r.time,r.email,r.code,r.name,r.action,r.where,r.search,r.device,r.visitor].map(q).join(','))).join('\r\n')}
async function dlCsv(rows){const data=logCsv(rows);let d=null;try{d=await claude.use('downloads')}catch(e){}
 if(d){try{await d.save({filename:'activity_log.csv',data})}catch(e){}return}
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'text/csv'}));a.download='activity_log.csv';document.body.appendChild(a);a.click();a.remove()}
async function loadLog(){let rows=ld('mm_log',[]),remote=false,fail=false;
 if(LOG_URL){try{const r=await fetch(LOG_URL+(LOG_URL.includes('?')?'&':'?')+'read=1'),j=await r.json();if(j&&Array.isArray(j.rows)){rows=j.rows;remote=true}else fail=true}catch(e){fail=true}}
 if(!remote){const dr=await dbLogs();if(dr){rows=dr;remote=true;fail=false}}
 return {rows,remote,fail}}
function showLog(){
 const me=((ME&&ME.email)||'').toLowerCase(),admin=!ADMIN_EMAILS.length||ADMIN_EMAILS.map(x=>x.toLowerCase()).includes(me);let ALL=[],VIEW=[];
 mdl(`<div class="mh"><h2 style="margin:0">Activity log</h2><button class="btn" id="mx">\u2715</button></div><div class="sub" id="lgs">Loading...</div><div class="ctl"><input id="lgq" placeholder="Filter by email, agent code or action"><button class="btn" id="lgr">Refresh</button><button class="btn" id="lgd">Download CSV</button></div><div class="sc2" style="max-height:58vh"><table><thead><tr><th>Date &amp; time</th><th>Email</th><th>Agent code</th><th>Action</th><th>Searched / viewed</th></tr></thead><tbody id="lgb"></tbody></table></div>`);
 $('mx').onclick=closeM;
 const draw=()=>{const f=($('lgq').value||'').trim().toLowerCase();
  VIEW=ALL.filter(r=>!f||[r.email,r.code,r.action,r.search,r.where].join(' ').toLowerCase().includes(f));
  $('lgb').innerHTML=VIEW.slice(0,500).map(r=>`<tr><td>${esc(r.time||'')}</td><td class="bl">${esc(r.email||'\u2014')}</td><td>${esc(r.code||'\u2014')}</td><td title="${esc(r.where||'')}">${esc(r.action||'')}</td><td>${esc(r.search||'\u2014')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No activity yet</td></tr>'};
 const load=async()=>{$('lgs').textContent='Loading...';const L=await loadLog();let rows=L.rows.slice().sort((a,b)=>String(b.time).localeCompare(String(a.time)));if(!admin)rows=rows.filter(r=>String(r.email||'').toLowerCase()===me);ALL=rows;
  const em=new Set(rows.map(r=>String(r.email||'').toLowerCase()).filter(Boolean));
  $('lgs').textContent=`${em.size} email${em.size===1?'':'s'} \u00b7 ${rows.length.toLocaleString()} activities`+(rows.length>500?' \u00b7 showing latest 500':'')+(admin?'':' \u00b7 your activity only')+(L.remote?' \u00b7 all devices':(LOG_URL&&L.fail?' \u00b7 could not reach the Google Sheet, showing this browser only':' \u00b7 this browser only (add your Google Sheet link to see everyone)'));draw()};
 $('lgq').oninput=draw;$('lgr').onclick=load;$('lgd').onclick=()=>dlCsv(VIEW);load()}
$('dlog').onclick=showLog;
try{const c=sessionStorage.getItem('agc'),e=sessionStorage.getItem('age')||'',acc=ld('mm_acc',{})[e];if(c&&AC[c]!==undefined&&acc)enter(c,true,e)}catch(e){}
logEv('OPEN PORTAL','Portal','');
dbInit();syncPay();$('fpd').onclick=payCsv;$('im').onchange=e=>{IM=e.target.value;renderINS()};$('fm').onchange=e=>{FM=e.target.value;renderFP()};$('dpay').onclick=showPayLog;
