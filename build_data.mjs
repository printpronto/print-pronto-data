// Reads index.csv (copy of the source CSV) and writes src/data.js with CSV text + parsed rows.
import fs from 'node:fs';
const csv = fs.readFileSync('index.csv','utf8').replace(/^﻿/,'');
const lines = csv.trim().split(/\r?\n/);
const head = lines[0].split(',');
const rows = lines.slice(1).map(l=>{const c=l.split(',');const o={};head.forEach((h,i)=>o[h]=c[i]);
  return {product:o.product,size:o.size,finish:o.finish,quantity:+o.quantity,lowest_listed_usd:+o.lowest_usd,typical_usd:+o.typical_usd,highest_listed_usd:+o.highest_usd,fair_range_low_usd:+o.fair_range_low_usd,fair_range_high_usd:+o.fair_range_high_usd};});
if(lines.slice(1).some(l=>l.split(',').length!==head.length)) throw new Error('bad csv');
fs.writeFileSync('src/data.js','export const CSV_TEXT = '+JSON.stringify(csv)+';\nexport const ROWS = '+JSON.stringify(rows)+';\n');
console.log(rows.length,'rows');
