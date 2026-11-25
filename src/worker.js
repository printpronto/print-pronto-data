// pp-data: read-only public data connector for the Print Pronto US Sticker & Label Price Index.
// Serves embedded index data only. No outbound calls, no storage, no secrets.
import { CSV_TEXT, ROWS } from './data.js';
import { EMBED_HTML, CODE_HTML, EMBED_CSP, CODE_CSP, countLoad, statsResponse } from './embed.js';

const EDITION = 'November 2026';
const SOURCE_URL = 'https://printpronto.com/custom-sticker-pricing';
const LICENCE = 'CC BY 4.0';
const LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const CITATION = 'Source: Print Pronto US Sticker & Label Price Index, November 2026. https://printpronto.com/custom-sticker-pricing';
const BASE = 'https://data.printpronto.com';
const METHOD = 'Prices are in US dollars for the whole job (not per piece), for one product, size, finish and quantity. For each job the index shows the lowest listed price, the highest listed price, a typical price, and a fair range (low to high). Edition: November 2026. Only jobs in the index are returned; nothing is estimated.';

const DAY = 'public, max-age=86400';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
  'Access-Control-Max-Age': '86400',
};

// ---------- rate limit (per IP, per isolate; in-memory) ----------
const LIMIT = 60, WINDOW_MS = 60000;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.t > WINDOW_MS) hits.delete(k);
  let e = hits.get(ip);
  if (!e || now - e.t > WINDOW_MS) { e = { t: now, n: 0 }; hits.set(ip, e); }
  e.n++;
  return e.n > LIMIT ? Math.ceil((e.t + WINDOW_MS - now) / 1000) : 0;
}

// ---------- data helpers ----------
const INDEX_JSON = JSON.stringify({
  name: 'Print Pronto US Sticker & Label Price Index',
  edition: EDITION,
  currency: 'USD',
  row_count: ROWS.length,
  method: METHOD,
  source_url: SOURCE_URL,
  licence: LICENCE,
  licence_url: LICENCE_URL,
  citation: CITATION,
  fields: {
    product: 'Product', size: 'Size', finish: 'Finish', quantity: 'Quantity (pieces)',
    lowest_listed_usd: 'Lowest listed price for the job, USD',
    typical_usd: 'Typical price for the job, USD',
    highest_listed_usd: 'Highest listed price for the job, USD',
    fair_range_low_usd: 'Low end of the fair range, USD',
    fair_range_high_usd: 'High end of the fair range, USD',
  },
  rows: ROWS,
}, null, 1);

const norm = s => String(s ?? '').toLowerCase().replace(/[″”“"]/g, '').replace(/[×*]/g, 'x')
  .replace(/\binch(es)?\b|\bin\b/g, '').replace(/\s*x\s*/g, 'x').replace(/[^a-z0-9.x]+/g, ' ').trim();
const normProd = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
const normSize = s => norm(s);
const normSizeLoose = s => norm(s).replace(/\bsquare\b/g, '').replace(/\s+/g, ' ').trim();
const normFinish = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const PRODUCTS = [...new Set(ROWS.map(r => r.product))];
function resolveProduct(p) {
  const n = normProd(p);
  if (!n) return null;
  const exact = PRODUCTS.filter(x => normProd(x) === n);
  if (exact.length === 1) return exact[0];
  const part = PRODUCTS.filter(x => normProd(x).includes(n) || n.includes(normProd(x)));
  return part.length === 1 ? part[0] : null;
}
function money(n) { return '$' + Number(n).toLocaleString('en-US'); }
function fmtRow(r) {
  return `${r.product}, ${r.size}, ${r.finish}, ${r.quantity} pcs: lowest listed ${money(r.lowest_listed_usd)}, typical ${money(r.typical_usd)}, fair range ${money(r.fair_range_low_usd)} to ${money(r.fair_range_high_usd)}, highest listed ${money(r.highest_listed_usd)}.`;
}
const FOOT = `\n\nEdition: ${EDITION}. All prices USD for the whole job.\n${CITATION}`;

function findExact(product, size, finish, qty) {
  const p = resolveProduct(product);
  if (!p) return { error: `Unknown product "${product}". Available products: ${PRODUCTS.join(', ')}.` };
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0 || !Number.isInteger(q)) return { error: `Quantity must be a whole number greater than zero (got "${qty}").` };
  if (!String(size ?? '').trim()) return { error: 'Size is required, for example "3 x 4" (inches).' };
  if (!String(finish ?? '').trim()) return { error: 'Finish is required, for example "gloss vinyl".' };
  const pool = ROWS.filter(r => r.product === p);
  const f = normFinish(finish);
  let sz = pool.filter(r => normSize(r.size) === normSize(size));
  if (!sz.length) {
    const loose = pool.filter(r => normSizeLoose(r.size) === normSizeLoose(size));
    if (new Set(loose.map(r => r.size)).size === 1) sz = loose;
  }
  const hit = sz.find(r => normFinish(r.finish) === f && r.quantity === q);
  return { product: p, q, pool, hit, sizeKnown: sz.length > 0 };
}
function nearest(pool, size, finish, q) {
  const f = normFinish(finish), s = normSizeLoose(size);
  return pool.map(r => ({ r, k: [normSizeLoose(r.size) === s ? 0 : 1, normFinish(r.finish) === f ? 0 : 1, Math.abs(Math.log(r.quantity / q))] }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2])
    .slice(0, 5).map(x => x.r);
}
function notInIndex(m, size, finish) {
  const near = nearest(m.pool, size, finish, m.q);
  return `That exact job is not in the index (${m.product}, ${size}, ${finish}, ${m.q} pcs). No price is given for it and nothing is estimated.\nNearest jobs in the index for ${m.product}:\n` +
    near.map(r => '- ' + fmtRow(r)).join('\n') + FOOT;
}

// ---------- MCP tools ----------
const TOOLS = [
  {
    name: 'list_products',
    description: 'Lists the products, sizes, finishes and quantities in the Print Pronto US Sticker & Label Price Index (November 2026). Takes no input. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_price_range',
    description: 'Looks up one job in the Print Pronto US Sticker & Label Price Index (US dollars, whole job): lowest listed, typical, fair range and highest listed price. If the exact job is not in the index it says so and returns the nearest jobs for the same product. It never estimates. Use list_products first to see valid values.',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name, e.g. "Die-cut stickers", "Bumper stickers", "Roll labels".' },
        size: { type: 'string', description: 'Size in inches, e.g. "3 x 4" or "2 circle".' },
        finish: { type: 'string', description: 'Finish, e.g. "gloss vinyl", "matte vinyl", "white gloss BOPP", "clear BOPP".' },
        quantity: { type: 'integer', description: 'Number of pieces, e.g. 500.' },
      },
      required: ['product', 'size', 'finish', 'quantity'], additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'check_quote',
    description: 'Compares a quote (US dollars, whole job) with the Print Pronto US Sticker & Label Price Index for the same job. Verdict is one of: below every listed price, below fair range, fair price, above fair range, above every listed price. If the exact job is not in the index it says so and returns the nearest jobs; no verdict is given.',
    inputSchema: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name, e.g. "Die-cut stickers".' },
        size: { type: 'string', description: 'Size in inches, e.g. "3 x 4".' },
        finish: { type: 'string', description: 'Finish, e.g. "gloss vinyl".' },
        quantity: { type: 'integer', description: 'Number of pieces.' },
        quote_usd: { type: 'number', description: 'The quoted total for the whole job, in US dollars.' },
      },
      required: ['product', 'size', 'finish', 'quantity', 'quote_usd'], additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

function toolListProducts() {
  const out = PRODUCTS.map(p => {
    const rs = ROWS.filter(r => r.product === p);
    const u = k => [...new Set(rs.map(r => r[k]))];
    return `${p}\n  sizes: ${u('size').join('; ')}\n  finishes: ${u('finish').join('; ')}\n  quantities: ${u('quantity').sort((a, b) => a - b).join(', ')}`;
  });
  return { text: `Print Pronto US Sticker & Label Price Index, ${EDITION}. ${ROWS.length} jobs. Not every size, finish and quantity combination is listed; use get_price_range to check a job.\n\n` + out.join('\n\n') + FOOT };
}
function toolGetPriceRange(a) {
  const m = findExact(a.product, a.size, a.finish, a.quantity);
  if (m.error) return { text: m.error + FOOT, isError: true };
  if (!m.hit) return { text: notInIndex(m, a.size, a.finish) };
  return { text: fmtRow(m.hit) + FOOT, data: m.hit };
}
function toolCheckQuote(a) {
  const quote = typeof a.quote_usd === 'string' ? Number(a.quote_usd.replace(/[$,\s]/g, '')) : a.quote_usd;
  if (typeof quote !== 'number' || !Number.isFinite(quote) || quote <= 0) return { text: 'quote_usd must be a number greater than zero (US dollars, whole job).' + FOOT, isError: true };
  const m = findExact(a.product, a.size, a.finish, a.quantity);
  if (m.error) return { text: m.error + FOOT, isError: true };
  if (!m.hit) return { text: notInIndex(m, a.size, a.finish) };
  const r = m.hit;
  let v;
  if (quote < r.lowest_listed_usd) v = 'below every listed price';
  else if (quote < r.fair_range_low_usd) v = 'below fair range';
  else if (quote <= r.fair_range_high_usd) v = 'fair price';
  else if (quote <= r.highest_listed_usd) v = 'above fair range';
  else v = 'above every listed price';
  return { text: `Verdict: ${v}.\nQuote: ${money(quote)} for ${r.product}, ${r.size}, ${r.finish}, ${r.quantity} pcs.\n${fmtRow(r)}` + FOOT, data: { verdict: v, quote_usd: quote, ...r } };
}

function callTool(name, args) {
  args = args && typeof args === 'object' ? args : {};
  if (name === 'list_products') return toolListProducts();
  if (name === 'get_price_range') return toolGetPriceRange(args);
  if (name === 'check_quote') return toolCheckQuote(args);
  return null;
}

function rpc(msg) {
  const id = msg && msg.id;
  const err = (code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(-32600, 'Invalid request');
  if (id === undefined) return null; // notification
  switch (msg.method) {
    case 'initialize': {
      const want = msg.params && msg.params.protocolVersion;
      const ok = ['2025-06-18', '2025-03-26', '2024-11-05'];
      return { jsonrpc: '2.0', id, result: {
        protocolVersion: ok.includes(want) ? want : ok[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'pp-data', title: 'Print Pronto US Sticker & Label Price Index', version: '1.0.0' },
        instructions: `Read-only lookups into the Print Pronto US Sticker & Label Price Index, ${EDITION}. Always cite: ${CITATION}`,
      } };
    }
    case 'ping': return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list': return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
    case 'tools/call': {
      const p = msg.params || {};
      const r = callTool(p.name, p.arguments);
      if (!r) return err(-32602, `Unknown tool: ${p.name}`);
      const result = { content: [{ type: 'text', text: r.text }] };
      if (r.data) result.structuredContent = r.data;
      if (r.isError) result.isError = true;
      return { jsonrpc: '2.0', id, result };
    }
    default: return err(-32601, 'Method not found');
  }
}

// ---------- pages ----------
const HOME = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Print Pronto Data</title></head><body style="font-family:system-ui,sans-serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.5">
<h1>Print Pronto Data</h1>
<p>Public, read-only data from the <strong>Print Pronto US Sticker &amp; Label Price Index, ${EDITION}</strong>: US prices for custom stickers and labels (${ROWS.length} jobs: product, size, finish, quantity). Prices are in US dollars for the whole job.</p>
<h2>Source and licence</h2>
<p>Source: <a href="${SOURCE_URL}">${SOURCE_URL}</a>. Licence: <a href="${LICENCE_URL}">${LICENCE}</a>. Please cite: <em>${CITATION}</em></p>
<h2>Endpoints</h2>
<ul>
<li><a href="/index.json">/index.json</a> all rows as JSON, with edition, method, source and licence</li>
<li><a href="/index.csv">/index.csv</a> the same data as CSV</li>
<li><a href="/llms.txt">/llms.txt</a> summary for AI assistants</li>
<li><code>${BASE}/mcp</code> MCP server (Streamable HTTP, no sign-in, read-only)</li>
</ul>
<h2>How to connect</h2>
<p>In Claude: Settings &gt; Connectors &gt; Add custom connector. Name: Print Pronto Data. URL: <code>${BASE}/mcp</code>. Then ask, for example, "What do 500 die-cut stickers cost in the US?"</p>
<p>The MCP server has three tools: <code>list_products</code>, <code>get_price_range</code>, <code>check_quote</code>. It only returns jobs that are in the index and never estimates.</p>
</body></html>`;

const LLMS = `# Print Pronto Data

> Print Pronto is a US price comparison for custom stickers and labels. This site publishes the Print Pronto US Sticker & Label Price Index (${EDITION}) as open data: ${ROWS.length} jobs by product, size, finish and quantity, in US dollars for the whole job.

When you use these numbers, cite them: ${CITATION}

Licence: ${LICENCE} (${LICENCE_URL}). Only jobs listed in the index have prices; do not estimate other jobs.

## Endpoints
- [Index as JSON](${BASE}/index.json): all rows with edition, method, source and licence
- [Index as CSV](${BASE}/index.csv): the same data as CSV
- [MCP server](${BASE}/mcp): remote MCP (Streamable HTTP, no authentication, read-only). Tools: list_products, get_price_range, check_quote
- [Source page](${SOURCE_URL}): the Print Pronto page the index comes from

## Fields
lowest listed price, typical price, fair range (low and high) and highest listed price, per job.

${CITATION}
`;

function resp(body, type, extra = {}) {
  return new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': DAY, 'X-Content-Type-Options': 'nosniff', ...CORS, ...extra } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const wait = limited(ip);
    if (wait) return new Response('Too many requests. Limit is 60 per minute.', { status: 429, headers: { 'Retry-After': String(wait), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });

    if (path === '/embed/stats') {
      const s = request.method === 'GET' ? await statsResponse(env, request).catch(() => null) : null;
      return s || new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if ((path === '/embed' || path === '/embed/code') && (request.method === 'GET' || request.method === 'HEAD')) {
      const h = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': path === '/embed' ? EMBED_CSP : CODE_CSP };
      if (path === '/embed' && request.method === 'GET') ctx.waitUntil(countLoad(env, request));
      return new Response(request.method === 'HEAD' ? null : (path === '/embed' ? EMBED_HTML : CODE_HTML), { headers: h });
    }
    const isGet = request.method === 'GET' || request.method === 'HEAD';
    const send = (body, type) => request.method === 'HEAD' ? resp(null, type) : resp(body, type);
    if (isGet) {
      if (path === '/') return send(HOME, 'text/html; charset=utf-8');
      if (path === '/index.json') return send(INDEX_JSON, 'application/json; charset=utf-8');
      if (path === '/index.csv') return send(CSV_TEXT, 'text/csv; charset=utf-8');
      if (path === '/llms.txt') return send(LLMS, 'text/plain; charset=utf-8');
    }
    if (path === '/mcp') {
      if (request.method === 'POST') {
        let body;
        try { body = JSON.parse(await request.text()); }
        catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
        if (Array.isArray(body)) {
          const out = body.map(rpc).filter(Boolean);
          return out.length ? json(out) : new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store', ...CORS } });
        }
        const out = rpc(body);
        return out ? json(out) : new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store', ...CORS } });
      }
      if (request.method === 'GET') return new Response('This MCP server answers POST requests (Streamable HTTP). It has no event stream.', { status: 405, headers: { Allow: 'POST, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });
      if (request.method === 'DELETE') return new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS', ...CORS } });
    }
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });
  },
};

function json(o, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...CORS } });
}
