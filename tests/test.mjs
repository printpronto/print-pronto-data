// usage: node tests/test.mjs <baseUrl>   (e.g. http://127.0.0.1:8787 or https://data.printpronto.com)
import fs from 'node:fs';
const BASE = process.argv[2];
const SRC = fs.readFileSync('index.csv', 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
const HEAD = SRC[0].split(',');
const CSVROWS = SRC.slice(1).map(l => { const c = l.split(','); const o = {}; HEAD.forEach((h, i) => o[h] = c[i]); return o; });
let pass = 0, fail = 0; const all = [];
const ok = (c, m) => { if (c) pass++; else { fail++; } console.log((c ? 'PASS ' : 'FAIL ') + m); };
async function get(path, opt = {}) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(BASE + path, opt);
    if (r.status === 429) { const w = Number(r.headers.get('retry-after') || 5); await new Promise(s => setTimeout(s, (w + 1) * 1000)); continue; }
    const t = await r.text(); all.push({ path, body: t });
    return { r, t };
  }
  throw new Error('rate limited repeatedly');
}
const post = (b, extra = {}) => get('/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...extra }, body: JSON.stringify(b) });
let id = 1;
const call = async (name, args) => { const { t } = await post({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } }); return JSON.parse(t).result; };
const txt = r => r.content[0].text;
const CITE = 'Source: Print Pronto US Sticker & Label Price Index, November 2026. https://printpronto.com/custom-sticker-pricing';

// 1. GET endpoints
const exp = { '/': 'text/html', '/index.json': 'application/json', '/index.csv': 'text/csv', '/llms.txt': 'text/plain' };
const bodies = {};
for (const [p, ct] of Object.entries(exp)) {
  const { r, t } = await get(p); bodies[p] = t;
  ok(r.status === 200 && (r.headers.get('content-type') || '').startsWith(ct), `GET ${p} 200 ${ct} (${r.headers.get('content-type')})`);
  ok(r.headers.get('access-control-allow-origin') === '*' && /max-age=86400/.test(r.headers.get('cache-control') || ''), `GET ${p} CORS + 1-day cache`);
}
ok(bodies['/llms.txt'].includes(CITE), 'llms.txt has citation line');
ok(bodies['/index.csv'].trim() === SRC.join('\n').trim() || bodies['/index.csv'].trim().replace(/\r/g,'') === SRC.join('\n'), 'index.csv identical to source CSV');
const J = JSON.parse(bodies['/index.json']);
ok(J.rows.length === 197 && J.edition === 'November 2026' && J.licence === 'CC BY 4.0' && J.source_url.includes('custom-sticker-pricing'), 'index.json metadata + 197 rows');

// 2. 10 random rows JSON == CSV == file
let rowOk = 0;
for (let k = 0; k < 10; k++) {
  const i = Math.floor(Math.random() * 197), c = CSVROWS[i], j = J.rows[i];
  const m = j.product === c.product && j.size === c.size && j.finish === c.finish && j.quantity === +c.quantity && j.lowest_listed_usd === +c.lowest_usd && j.typical_usd === +c.typical_usd && j.highest_listed_usd === +c.highest_usd && j.fair_range_low_usd === +c.fair_range_low_usd && j.fair_range_high_usd === +c.fair_range_high_usd;
  const cl = bodies['/index.csv'].trim().split(/\r?\n/)[i + 1] === SRC[i + 1];
  if (m && cl) rowOk++; else console.log('row mismatch', i);
}
ok(rowOk === 10, '10 random rows: JSON == CSV == source file');
// full compare too
ok(J.rows.every((j, i) => { const c = CSVROWS[i]; return j.product === c.product && j.size === c.size && j.finish === c.finish && j.quantity === +c.quantity && j.lowest_listed_usd === +c.lowest_usd && j.typical_usd === +c.typical_usd && j.highest_listed_usd === +c.highest_usd && j.fair_range_low_usd === +c.fair_range_low_usd && j.fair_range_high_usd === +c.fair_range_high_usd; }), 'all 197 rows JSON == source CSV');

// 3. MCP
let { r, t } = await post({ jsonrpc: '2.0', id: id++, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
let ij = JSON.parse(t);
ok(r.status === 200 && ij.result.serverInfo.name === 'pp-data' && ij.result.capabilities.tools, 'MCP initialize');
({ r } = await post({ jsonrpc: '2.0', method: 'notifications/initialized' }));
ok(r.status === 202, 'MCP notifications/initialized 202');
({ t } = await post({ jsonrpc: '2.0', id: id++, method: 'tools/list' }));
const tl = JSON.parse(t).result.tools.map(x => x.name);
ok(JSON.stringify(tl) === JSON.stringify(['list_products', 'get_price_range', 'check_quote']), 'tools/list = 3 tools');

// list_products x5
for (let k = 0; k < 5; k++) { const x = await call('list_products', {}); const s = txt(x); ok(!x.isError && s.endsWith(CITE) && CSVROWS.every(c => s.includes(c.size) && s.includes(c.finish)) && s.includes('Die-cut stickers'), `list_products #${k + 1}`); }

const rowsFor = [10, 50, 100, 150, 190].map(i => CSVROWS[i]);
// get_price_range x5 (exact)
for (const [k, c] of rowsFor.entries()) {
  const x = await call('get_price_range', { product: c.product, size: c.size, finish: c.finish, quantity: +c.quantity }); const s = txt(x);
  const want = [c.lowest_usd, c.typical_usd, c.highest_usd, c.fair_range_low_usd, c.fair_range_high_usd].every(v => s.includes('$' + Number(v).toLocaleString('en-US')));
  ok(!x.isError && want && x.structuredContent.lowest_listed_usd === +c.lowest_usd && s.endsWith(CITE), `get_price_range exact #${k + 1} ${c.product} ${c.size} ${c.quantity}`);
}
// loose input forms
{ const c = CSVROWS.find(c => c.product === 'Die-cut stickers' && c.size.startsWith('3″ × 4″') && c.finish === 'gloss vinyl' && c.quantity === '500');
  const x = await call('get_price_range', { product: 'die cut sticker', size: '3x4', finish: 'Gloss Vinyl', quantity: '500' });
  ok(c && !x.isError && x.structuredContent && x.structuredContent.lowest_listed_usd === +c.lowest_usd, 'get_price_range loose input "die cut sticker / 3x4 / 500"'); }
// not in index
{ const x = await call('get_price_range', { product: 'Die-cut stickers', size: '3x4', finish: 'gloss vinyl', quantity: 777 }); const s = txt(x);
  ok(!x.isError && /not in the index/.test(s) && s.includes('Nearest jobs') && !x.structuredContent && s.endsWith(CITE), 'get_price_range job not in index -> nearest, no estimate'); }
// bad inputs
{ const x = await call('get_price_range', { product: 'Mugs', size: '3x4', finish: 'x', quantity: 5 }); ok(x.isError && /Unknown product/.test(txt(x)) && txt(x).endsWith(CITE), 'get_price_range bad product'); }
{ const x = await call('get_price_range', { product: 'Die-cut stickers', size: '3x4', finish: 'gloss vinyl', quantity: -5 }); ok(x.isError && /Quantity/.test(txt(x)), 'get_price_range bad quantity'); }
{ const x = await call('get_price_range', { product: 'Die-cut stickers', size: '', finish: 'gloss vinyl', quantity: 500 }); ok(x.isError, 'get_price_range empty size'); }

// check_quote x5 exact: one per verdict
const c0 = CSVROWS[50]; const args = q => ({ product: c0.product, size: c0.size, finish: c0.finish, quantity: +c0.quantity, quote_usd: q });
const lo = +c0.lowest_usd, fl = +c0.fair_range_low_usd, fh = +c0.fair_range_high_usd, hi = +c0.highest_usd, mid = Math.round((fl + fh) / 2);
const cases = [[lo - 1, 'below every listed price'], [(lo + fl) / 2 < fl && fl > lo ? fl - 0.5 : lo, 'below fair range'], [mid, 'fair price'], [(fh + hi) / 2 > fh ? fh + 0.5 : fh, 'above fair range'], [hi + 1, 'above every listed price']];
for (const [q, v] of cases) { const x = await call('check_quote', args(q)); const s = txt(x); ok(!x.isError && s.startsWith('Verdict: ' + v + '.') && s.endsWith(CITE) && x.structuredContent.verdict === v, `check_quote ${q} -> ${v} (row ${lo}/${fl}/${fh}/${hi})`); }
// boundaries
{ for (const [q, v] of [[fl, 'fair price'], [fh, 'fair price'], [lo, lo < fl ? 'below fair range' : 'fair price'], [hi, hi > fh ? 'above fair range' : 'fair price']]) { const x = await call('check_quote', args(q)); ok(txt(x).startsWith('Verdict: ' + v + '.'), `check_quote boundary ${q} -> ${v}`); } }
{ const x = await call('check_quote', { product: 'Die-cut stickers', size: '3x4', finish: 'gloss vinyl', quantity: 777, quote_usd: 100 }); ok(!x.isError && /not in the index/.test(txt(x)) && !/Verdict/.test(txt(x)), 'check_quote job not in index -> no verdict'); }
{ const x = await call('check_quote', { ...args(0) }); ok(x.isError, 'check_quote bad quote 0'); }
{ const x = await call('check_quote', { ...args('abc') }); ok(x.isError, 'check_quote bad quote text'); }
{ const x = await call('check_quote', { ...args('$' + mid) }); ok(!x.isError && txt(x).startsWith('Verdict: fair price'), 'check_quote quote "$123" string accepted'); }
{ ({ t } = await post({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name: 'nope', arguments: {} } })); ok(JSON.parse(t).error.code === -32602, 'unknown tool -> JSON-RPC error'); }
{ ({ r, t } = await get('/mcp', { method: 'POST', body: '{bad' })); ok(r.status === 400, 'bad JSON -> 400'); }
{ ({ r } = await get('/mcp')); ok(r.status === 405, 'GET /mcp -> 405'); }
{ ({ r } = await get('/nope')); ok(r.status === 404, '404 for unknown path'); }
{ ({ r } = await get('/mcp', { method: 'OPTIONS' })); ok(r.status === 204 && r.headers.get('access-control-allow-origin') === '*', 'OPTIONS preflight'); }

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

