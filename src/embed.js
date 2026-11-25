// Embeddable price widget pages (/embed, /embed/code) and private load counts (/embed/stats).
// Index data only. No cookies, no external scripts, no personal data stored.
import { ROWS } from './data.js';

const SRC = 'https://printpronto.com/custom-sticker-pricing';
const BASE = 'https://data.printpronto.com';

// Compact data: lists + rows [p,s,f,qty,lowest,typical,highest,fairLow,fairHigh]
const P = [...new Set(ROWS.map(r => r.product))];
const S = [...new Set(ROWS.map(r => r.size))];
const F = [...new Set(ROWS.map(r => r.finish))];
const DATA = JSON.stringify({
  p: P, s: S, f: F,
  r: ROWS.map(r => [P.indexOf(r.product), S.indexOf(r.size), F.indexOf(r.finish), r.quantity, r.lowest_listed_usd, r.typical_usd, r.highest_listed_usd, r.fair_range_low_usd, r.fair_range_high_usd]),
}).replace(/</g, '\\u003c');

const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

const CSS = `:root{color-scheme:light dark;--bg:#fff;--fg:#1c1f23;--mut:#5b6470;--line:#d9dee5;--card:#f5f7fa;--acc:#0b5fd1;--ok:#17703a;--warn:#9a5b00;--bad:#b3261e}
@media(prefers-color-scheme:dark){:root{--bg:#15181c;--fg:#eceff3;--mut:#a3adba;--line:#2f353d;--card:#1e2329;--acc:#6fa8ff;--ok:#5fd18a;--warn:#f0b35a;--bad:#ff8a80}}
*{box-sizing:border-box}html,body{margin:0}body{font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg);padding:12px}
h1{font-size:16px;margin:0 0 10px}
.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
label{display:block;font-size:12px;color:var(--mut);margin-bottom:2px}
select,input{width:100%;font:inherit;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:6px;padding:7px 6px;min-height:38px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:10px}
.big{font-size:26px;font-weight:700}.sub{color:var(--mut);font-size:12px}
.row{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-top:1px solid var(--line);margin-top:3px}
.v{font-weight:600;margin-top:8px}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}
footer{margin-top:10px;font-size:12px;color:var(--mut)}a{color:var(--acc)}
textarea{width:100%;min-height:150px;font:12px/1.4 ui-monospace,Consolas,monospace;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:6px;padding:8px}
button{font:inherit;font-weight:600;color:#fff;background:var(--acc);border:0;border-radius:6px;padding:9px 14px;min-height:40px;cursor:pointer}
@media(prefers-color-scheme:dark){button{color:#0b1220}}
iframe{width:100%;max-width:480px;height:520px;border:1px solid var(--line);border-radius:8px}`;

// shared client logic: matching + cascading selects
const CORE = `var D=DATA,$=function(i){return document.getElementById(i)};
function nz(s){return String(s==null?'':s).toLowerCase().replace(/[\\u2033"\\u201d\\u201c]/g,'').replace(/[\\u00d7*]/g,'x').replace(/inch(es)?|\\bin\\b/g,'').replace(/[^a-z0-9.x]/g,'')}
function np(s){return nz(s).replace(/s$/,'')}
function money(n){return '$'+Number(n).toLocaleString('en-US')}
function rowsFor(p,s,f){return D.r.filter(function(r){return (p==null||r[0]===p)&&(s==null||r[1]===s)&&(f==null||r[2]===f)})}
function uniqSorted(a,num){var u=[];a.forEach(function(x){if(u.indexOf(x)<0)u.push(x)});return num?u.sort(function(a,b){return a-b}):u}
function fill(sel,items,labels,want){var cv=+sel.value,cur=want!=null&&items.indexOf(want)>=0?want:(items.indexOf(cv)>=0?cv:items[0]);
sel.innerHTML='';items.forEach(function(it){var o=document.createElement('option');o.value=it;o.textContent=labels(it);sel.appendChild(o)});sel.value=cur}
function pick(labels,idx,q,fn){var n=fn(q),i,m=[];for(i=0;i<idx.length;i++)if(fn(labels[idx[i]])===n)return idx[i];
for(i=0;i<idx.length;i++)if(fn(labels[idx[i]]).replace('square','')===n.replace('square',''))m.push(idx[i]);return m.length===1?m[0]:-1}
function cascade(ids,want){var P=$(ids[0]),S=$(ids[1]),F=$(ids[2]),Q=$(ids[3]);
if(!P.options.length){D.p.forEach(function(x,i){var o=document.createElement('option');o.value=i;o.textContent=x;P.appendChild(o)})}
if(want.p!=null)P.value=want.p;var p=+P.value;
fill(S,uniqSorted(rowsFor(p).map(function(r){return r[1]})),function(i){return D.s[i]},want.s);var s=+S.value;
fill(F,uniqSorted(rowsFor(p,s).map(function(r){return r[2]})),function(i){return D.f[i]},want.f);var f=+F.value;
fill(Q,uniqSorted(rowsFor(p,s,f).map(function(r){return r[3]}),1),function(q){return Number(q).toLocaleString('en-US')},want.q);
return rowsFor(p,s,f).filter(function(r){return r[3]===+Q.value})[0]}
function wanted(){var u=new URLSearchParams(location.search),w={},t,i,p;
t=u.get('product');if(t){i=pick(D.p,D.p.map(function(x,k){return k}),t,np);if(i>=0)w.p=i}
p=w.p!=null?w.p:0;
t=u.get('size');if(t){i=pick(D.s,uniqSorted(rowsFor(p).map(function(r){return r[1]})),t,nz);if(i>=0)w.s=i}
t=u.get('finish');if(t){var fi=uniqSorted(rowsFor(p).map(function(r){return r[2]}));i=pick(D.f,fi,t,function(x){return String(x).toLowerCase().replace(/[^a-z0-9]/g,'')});if(i>=0)w.f=i}
t=u.get('qty');if(t&&/^\\d+$/.test(t))w.q=+t;return w}`;

const WIDGET_JS = `var DATA=${DATA};${CORE}
var ids=['p','s','f','q'],cur;
function render(w){cur=cascade(ids,w||{});var has=!!cur;$('res').hidden=!has;$('none').hidden=has;
if(has){$('ty').textContent=money(cur[5]);$('fr').textContent=money(cur[7])+' to '+money(cur[8]);$('lo').textContent=money(cur[4]);$('hi').textContent=money(cur[6]);}
check()}
function check(){var v=$('qt').value.replace(/[$,\\s]/g,''),el=$('vd');if(!cur||v===''||isNaN(+v)||+v<=0){el.textContent='';return}
var q=+v,t,c;if(q<cur[4]){t='Below every listed price';c='warn'}else if(q<cur[7]){t='Below fair range';c='ok'}else if(q<=cur[8]){t='Fair price';c='ok'}else if(q<=cur[6]){t='Above fair range';c='warn'}else{t='Above every listed price';c='bad'}
el.className='v '+c;el.textContent=t+' ('+money(q)+' vs fair range '+money(cur[7])+' to '+money(cur[8])+')'}
['p','s','f','q'].forEach(function(id,i){$(id).addEventListener('change',function(){var w={};if(i===0)w.p=+$('p').value;else{w.p=+$('p').value;if(i>1)w.s=+$('s').value;if(i>2)w.f=+$('f').value}render(w)})});
$('qt').addEventListener('input',check);render(wanted());`;

function page(title, body, js) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><title>${title}</title><style>${CSS}</style></head><body>${body}<script>${js}</script></body></html>`;
}

const PICKERS = `<div class="g"><div><label for="p">Product</label><select id="p"></select></div><div><label for="s">Size</label><select id="s"></select></div><div><label for="f">Finish</label><select id="f"></select></div><div><label for="q">Quantity</label><select id="q"></select></div></div>`;

export const EMBED_HTML = page('Print Pronto sticker and label price check',
  `<h1>US sticker &amp; label prices</h1>${PICKERS}
<div class="card" id="res"><div class="sub">Typical price for this job (USD, whole job)</div><div class="big" id="ty"></div>
<div class="row"><span>Fair range</span><span id="fr"></span></div><div class="row"><span>Lowest listed</span><span id="lo"></span></div><div class="row"><span>Highest listed</span><span id="hi"></span></div></div>
<div class="card" id="none" hidden>That job is not in the index.</div>
<div class="card"><label for="qt">Check a quote (USD, whole job)</label><input id="qt" type="text" inputmode="decimal" placeholder="e.g. 250" autocomplete="off"><div id="vd" class="v" aria-live="polite"></div></div>
<footer>Source: <a href="${SRC}" target="_blank" rel="noopener">Print Pronto US Sticker &amp; Label Price Index, November 2026</a></footer>`,
  WIDGET_JS);

const CODE_JS = `var DATA=${DATA};${CORE}
var ids=['p','s','f','q'],cur;
var LINE='<p>Prices: <a href="${SRC}">Print Pronto US Sticker &amp; Label Price Index</a></p>';
function build(w){cur=cascade(ids,w||{});if(!cur)return;
var qs='product='+encodeURIComponent(D.p[cur[0]])+'&size='+encodeURIComponent(D.s[cur[1]])+'&finish='+encodeURIComponent(D.f[cur[2]])+'&qty='+cur[3];
var url='${BASE}/embed?'+qs;
$('code').value='<iframe src="'+url.replace(/&/g,'&amp;')+'" width="100%" height="520" style="border:0;max-width:480px" loading="lazy" title="Print Pronto US sticker and label price check"></iframe>\\n'+LINE;
var rel='/embed?'+qs;if($('pv').getAttribute('src')!==rel)$('pv').setAttribute('src',rel)}
['p','s','f','q'].forEach(function(id,i){$(id).addEventListener('change',function(){var w={p:+$('p').value};if(i>1)w.s=+$('s').value;if(i>2)w.f=+$('f').value;build(w)})});
$('copy').addEventListener('click',function(){var t=$('code').value,b=$('copy');function done(m){b.textContent=m;setTimeout(function(){b.textContent='Copy embed code'},1800)}
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){done('Copied')},function(){fb()})}else fb();
function fb(){$('code').focus();$('code').select();try{document.execCommand('copy');done('Copied')}catch(e){done('Press Ctrl+C')}}});
build({});`;

export const CODE_HTML = page('Embed the Print Pronto price check',
  `<h1>Embed the Print Pronto price check</h1>
<p class="sub">Pick the defaults your readers see. Copy the code below into your page. Keep the line under the frame: it is the link back to the source.</p>${PICKERS}
<div class="card"><label for="code">Embed code (frame plus source link)</label><textarea id="code" readonly spellcheck="false"></textarea><p><button id="copy" type="button">Copy embed code</button></p></div>
<div class="card"><div class="sub">Preview</div><iframe id="pv" title="Preview" loading="lazy"></iframe>
<p>Prices: <a href="${SRC}">Print Pronto US Sticker &amp; Label Price Index</a></p></div>
<footer>Source: <a href="${SRC}" target="_blank" rel="noopener">Print Pronto US Sticker &amp; Label Price Index, November 2026</a>. Data licence: <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. The frame sets no cookies and shows no ads.</footer>`,
  CODE_JS);

export const EMBED_CSP = CSP;
export const CODE_CSP = CSP + "; frame-src 'self'";

// ---- private load counts (by referring site; counts only) ----
export async function countLoad(env, request) {
  try {
    if (!env.DB) return;
    let host = 'direct';
    const ref = request.headers.get('Referer');
    if (ref) { try { host = new URL(ref).hostname.toLowerCase().slice(0, 100); } catch { host = 'other'; } }
    if (host === 'data.printpronto.com') return;
    if (host !== 'direct' && !/^[a-z0-9][a-z0-9.-]*$/.test(host)) host = 'other';
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare('INSERT INTO embed_loads(day,host,n) VALUES(?,?,1) ON CONFLICT(day,host) DO UPDATE SET n=n+1').bind(day, host).run();
  } catch { /* counting must never break the widget */ }
}

export async function statsResponse(env, request) {
  const key = request.headers.get('X-Stats-Key') || '';
  if (!env.STATS_KEY || !env.DB || key.length !== env.STATS_KEY.length) return null;
  let diff = 0; for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ env.STATS_KEY.charCodeAt(i);
  if (diff) return null;
  const { results } = await env.DB.prepare("SELECT host, SUM(n) AS loads, MAX(day) AS last_day FROM embed_loads WHERE day >= date('now','-90 day') GROUP BY host ORDER BY loads DESC LIMIT 200").all();
  return new Response(JSON.stringify({ window: 'last 90 days', by_referring_site: results }, null, 1), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
