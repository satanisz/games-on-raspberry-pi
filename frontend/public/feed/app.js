const $ = s => document.querySelector(s);
let key = sessionStorage.getItem('feed-key') || '';
let data;
let noticeTimer;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = t => t ? new Date(t * 1000).toLocaleString('pl-PL', {timeZone:'Europe/Warsaw',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'Jeszcze nie pobrano';
function notice(text, error=false) { const n=$('#notice'); n.textContent=text; n.classList.toggle('error',error); n.hidden=false; clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>n.hidden=true,9000); }
async function api(path, method='GET', body) {
  const r=await fetch('/api/feed'+path, {method, headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'}, body:body===undefined?undefined:JSON.stringify(body)});
  const d=await r.json();
  if(!r.ok) { if(r.status===401) { $('#login').hidden=false; $('#app').hidden=true; } throw Error(typeof d.detail==='string'?d.detail:'Sprawdź poprawność wpisanych danych.'); }
  return d;
}
async function run(button, fn) { if(button) button.disabled=true; try {await fn();} catch(e) {notice(e.message,true);} finally {if(button) button.disabled=false;} }
function article(a,n) { return `<article class="article"><div class="article-top"><span>${esc(a.source)} · ${esc(a.topic||a.category||'Odkrycie')}</span><span class="number">${String(n).padStart(2,'0')}</span></div><h3><a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.title)} ↗</a></h3><p>${esc(a.summary||a.snippet?.slice(0,180)||'Zajrzyj do artykułu i odkryj nowy temat.')}</p><div class="reason">${esc(a.reason||date(a.published))}</div><div class="rating"><button class="${a.rating===1?'active':''}" data-rate="${a.id}:1">👍 Zaskoczyło mnie</button><button class="${a.rating===-1?'active':''}" data-rate="${a.id}:-1">👎 Słabe</button>${a.rating?`<button data-rate="${a.id}:0">Cofnij</button>`:''}</div></article>`; }
function renderSources() {
  const q=$('#source-search').value.toLocaleLowerCase();
  const sources=data.sources.filter(s=>(s.title+' '+s.category+' '+s.url).toLocaleLowerCase().includes(q));
  $('#source-count').textContent=`${sources.length} z ${data.sources.length} źródeł`;
  $('#source-list').innerHTML=sources.map(s=>`<div class="source-row" data-source="${s.id}"><div><strong>${esc(s.title)}</strong><small>${esc(s.url)}</small><small>${s.article_count} tekstów · ${esc(date(s.checked))}</small>${s.error?`<span class="error">${esc(s.error)}</span>`:''}</div><label>Temat<input data-field="category" maxlength="100" value="${esc(s.category)}" aria-label="Temat: ${esc(s.title)}"></label><label>Priorytet<select data-field="boost" aria-label="Priorytet: ${esc(s.title)}">${[[-2,'Rzadziej'],[0,'Normalnie'],[2,'Promuj']].map(([v,t])=>`<option value="${v}" ${s.boost===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="check"><input data-field="enabled" type="checkbox" ${s.enabled?'checked':''}>Aktywne</label></div>`).join('')||'<div class="empty">Brak źródeł pasujących do wyszukiwania.</div>';
}
function render() {
  $('#login').hidden=true; $('#app').hidden=false; $('#logout').hidden=false;
  const c=data.config;
  $('#time-label').textContent=c.hour;
  $('#status').innerHTML=`<div><strong>${data.sources.filter(s=>s.enabled).length} źródeł</strong><span>${data.sources.filter(s=>s.enabled&&s.error).length} wymaga sprawdzenia</span></div><div><strong>${c.chat_id?'Telegram połączony':'Połącz Telegram'}</strong><span>${c.enabled?'Codzienna wysyłka włączona':'Codzienna wysyłka wstrzymana'}</span></div><div><strong>Ostatnie pobranie</strong><span>${esc(date(c.last_refresh))}</span></div>`;
  const alerts=[];
  if(!c.chat_id) alerts.push('Aby odbierać zestawy, połącz Telegram przyciskiem w Ustawieniach i kliknij Start w rozmowie z botem.');
  if(c.worker_error) alerts.push(c.worker_error);
  for(const d of data.digests.filter(d=>d.state!=='sent')) alerts.push(`${d.day}: ${d.error||'Wysyłka w toku. Jeśli ten stan utrzymuje się po restarcie, sprawdź Telegram; ponowienie jest zablokowane.'}`);
  $('#alerts').innerHTML=alerts.map(a=>`<p class="alert">${esc(a)}</p>`).join('');
  $('#preview').innerHTML=data.preview.length?data.preview.map((a,i)=>article(a,i+1)).join(''):'<div class="empty">Nie ma jeszcze nowych tekstów pasujących do reguł. Pobierz źródła lub zwiększ dopuszczalny wiek artykułów.</div>';
  $('#history').innerHTML=data.digests.map(d=>`<h3>${esc(d.day)} <span class="pill">${d.state==='sent'?'WYSŁANO':'DO SPRAWDZENIA'}</span></h3><div class="article-grid">${JSON.parse(d.items).map((id,i)=>{const a=data.articles.find(a=>a.id===id);return a?article(a,i+1):'';}).join('')}</div>`).join('')||'<p class="muted">Tutaj pojawi się pierwszy wysłany zestaw.</p>';
  const f=$('#config-form');
  for(const name of ['hour','max_age_days','exploration','blocked_words','promoted_words','model']) f.elements[name].value=c[name];
  f.elements.enabled.checked=c.enabled; $('#explore-label').textContent=c.exploration+' / 100';
  $('#connections').textContent=`Telegram: ${data.telegram_configured?'token zapisany':'brak tokenu'}${c.chat_id?' · konto połączone':''}. Gemini: ${data.gemini_configured?'klucz zapisany':'brak klucza'}. ${c.llm_status}`;
  $('#pair').hidden=!data.pair_url; if(data.pair_url) $('#pair').href=data.pair_url;
  renderSources();
}
async function load() { data=await api('/state'); sessionStorage.setItem('feed-key',key); render(); }
$('#login-form').addEventListener('submit',e=>{e.preventDefault();key=$('#access').value.trim();run(e.submitter,load);});
$('#logout').onclick=()=>{sessionStorage.removeItem('feed-key');key='';data=null;$('#app').hidden=true;$('#login').hidden=false;$('#logout').hidden=true;$('#access').value='';};
$('#reload').onclick=e=>run(e.target,load);
$('#source-search').oninput=renderSources;
$('#config-form').elements.exploration.oninput=e=>$('#explore-label').textContent=e.target.value+' / 100';
$('#config-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const f=e.target.elements;await api('/config','PUT',{hour:f.hour.value,enabled:f.enabled.checked,max_age_days:Number(f.max_age_days.value),exploration:Number(f.exploration.value),blocked_words:f.blocked_words.value,promoted_words:f.promoted_words.value,model:f.model.value});notice('Zapisano reguły i ustawienia.');await load();});};
$('#source-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{await api('/sources','POST',Object.fromEntries(new FormData(e.target)));e.target.reset();notice('Dodano źródło. Artykuły zostaną pobrane w tle.');await load();});};
$('#opml').onchange=e=>run(null,async()=>{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw Error('Maksymalny rozmiar OPML to 1 MB.');const r=await api('/import','POST',{content:await file.text()});notice(`Dodano ${r.count} nowych źródeł. Duplikaty pominięto.`);e.target.value='';await load();});
$('#source-list').onchange=e=>run(e.target,async()=>{const row=e.target.closest('[data-source]');if(!row)return;const edit={enabled:row.querySelector('[data-field=enabled]').checked,boost:Number(row.querySelector('[data-field=boost]').value),category:row.querySelector('[data-field=category]').value};await api('/sources/'+row.dataset.source,'PATCH',edit);Object.assign(data.sources.find(s=>s.id===Number(row.dataset.source)),edit);notice('Zapisano źródło.');});
document.addEventListener('click',e=>{const b=e.target.closest('[data-rate]');if(b)run(b,async()=>{const [id,value]=b.dataset.rate.split(':');await api('/rating/'+id,'POST',{value:Number(value)});notice('Ocena zapisana.');await load();});});
for(const action of ['refresh','send']) $('#'+action).onclick=e=>run(e.target,async()=>{const r=await api('/actions/'+action,'POST');notice(r.message);setTimeout(()=>{if(key)run(null,load);},65000);});
$('#keys-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{await api('/keys','PUT',Object.fromEntries(new FormData(e.target)));e.target.reset();notice('Klucze zapisane na Malince.');await load();});};
if(key)run(null,load);
