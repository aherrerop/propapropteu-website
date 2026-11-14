#!/usr/bin/env node
/**
 * Build p/<id>.html (one page per product) and sitemap.xml from data/products.json,
 * with the SAME functions the engine uses on publish (backend/Pages.gs, loaded via vm).
 * Usage: node tools/build-pages.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'backend/Pages.gs'), 'utf8'), ctx);

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8'));
const template = fs.readFileSync(path.join(ROOT, 'product.html'), 'utf8');
const dir = path.join(ROOT, 'p');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);
const keep = new Set();
for (const p of data.products) {
  const f = p.id + '.html'; keep.add(f);
  fs.writeFileSync(path.join(dir, f), ctx.productPageHtml_(template, p));
}
for (const f of fs.readdirSync(dir)) if (f.endsWith('.html') && !keep.has(f)) fs.unlinkSync(path.join(dir, f));
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), ctx.sitemapXml_(data.products));
console.log('Built ' + keep.size + ' product page(s) + sitemap.xml');
