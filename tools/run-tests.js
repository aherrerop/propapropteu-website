#!/usr/bin/env node
/**
 * Local test gate — runs before every deploy and before `bless`.
 * 1. Syntax-checks every backend/*.gs (as JS) and js/*.js.
 * 2. Fails on any duplicate function definition across the .gs files
 *    (Apps Script concatenates them, so a dup silently shadows — like R&R's
 *    reference check).
 * 3. Runs the engine's PURE functions (loaded from the real Code.gs via `vm`,
 *    so no drift) against assertions.
 *
 * Exits non-zero on any failure. Usage: `node tools/run-tests.js` (or `npm test`).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let fails = 0;
const fail = (m) => { console.error('  ✗ ' + m); fails++; };
const pass = (m) => console.log('  ✓ ' + m);

function list(dir, ext) {
  const d = path.join(ROOT, dir);
  return fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.endsWith(ext)).map(f => path.join(dir, f)) : [];
}

/* ---- 1. syntax ---- */
console.log('Syntax check:');
const gs = list('backend', '.gs');
const js = list('js', '.js');
for (const rel of gs.concat(js)) {
  const abs = path.join(ROOT, rel);
  let checkPath = abs;
  let tmp = null;
  if (rel.endsWith('.gs')) { tmp = path.join(os.tmpdir(), 'ppt_' + path.basename(rel) + '.js'); fs.copyFileSync(abs, tmp); checkPath = tmp; }
  try { execSync(`node --check "${checkPath}"`, { stdio: 'pipe' }); pass(rel); }
  catch (e) { fail(rel + ' — ' + String(e.stderr || e.message).split('\n')[0]); }
  finally { if (tmp) try { fs.unlinkSync(tmp); } catch (e) {} }
}

/* ---- 2. duplicate function definitions across .gs ---- */
console.log('Duplicate-function check:');
const seen = {};
let dup = 0;
for (const rel of gs) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const re = /^function\s+([A-Za-z0-9_]+)\s*\(/gm;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    if (seen[name]) { fail(`duplicate function "${name}" in ${rel} (also ${seen[name]})`); dup++; }
    else seen[name] = rel;
  }
}
if (!dup) pass(`no duplicates (${Object.keys(seen).length} functions)`);

/* ---- 3. pure-function unit tests (real code via vm) ---- */
console.log('Pure-logic tests:');
const code = fs.readFileSync(path.join(ROOT, 'backend', 'Code.gs'), 'utf8');
// Stub the Apps Script globals so top-level var/function definitions load; the pure
// functions we call below don't touch any of these.
const sandbox = {
  Utilities: { formatDate: () => '', getUuid: () => 'uuid', newBlob: () => ({ getAs: () => ({ setName: () => ({}) }) }) },
  Session: { getScriptTimeZone: () => 'Europe/Madrid' },
  SpreadsheetApp: {}, PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  CacheService: {}, MailApp: { getRemainingDailyQuota: () => 100 }, UrlFetchApp: {}, DriveApp: {}, ScriptApp: {},
  Logger: { log: () => {} }, console, Math, Date, JSON, String, Number, Array, Object, isNaN, parseInt, parseFloat, encodeURIComponent, RegExp
};
vm.createContext(sandbox);
try { vm.runInContext(code, sandbox); pass('Code.gs loads in sandbox'); }
catch (e) { fail('Code.gs failed to load: ' + e.message); }

const eq = (a, b, m) => { if (a === b) pass(m); else fail(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); };
const near = (a, b, m) => { if (Math.abs(a - b) < 1e-9) pass(m); else fail(`${m} (got ${a}, want ${b})`); };

if (sandbox.normStatus_) {
  eq(sandbox.normStatus_('pendent pagament'), 'awaiting_payment', 'normStatus legacy ca→en');
  eq(sandbox.normStatus_('paid'), 'paid', 'normStatus passthrough');
  eq(sandbox.normStatus_(''), 'new', 'normStatus empty→new');
} else fail('normStatus_ not found');

if (sandbox.nextPeriod_) {
  eq(sandbox.nextPeriod_('2026-11'), '2026-12', 'nextPeriod month');
  eq(sandbox.nextPeriod_('2026-12'), '2027-01', 'nextPeriod year roll');
} else fail('nextPeriod_ not found');

if (sandbox.fmtMin_) {
  eq(sandbox.fmtMin_(0), '?', 'fmtMin 0');
  eq(sandbox.fmtMin_(90), '1h 30min', 'fmtMin 90');
  eq(sandbox.fmtMin_(45), '45min', 'fmtMin 45');
} else fail('fmtMin_ not found');

if (sandbox.planQueue_) {
  const mk = (cat, mat, col, any) => ({ category: cat, material: mat, color: col, anyColor: !!any, gramsEst: 10, timeEst: 30, units: 1 });
  const r1 = sandbox.planQueue_([mk('product', 'PLA', 'red'), mk('product', 'PLA', 'red'), mk('product', 'PLA', 'red')], { product: 60, research: 30, personal: 10 });
  eq(r1.count, 3, 'planQueue same count');
  eq(r1.filamentChanges, 0, 'planQueue same → 0 changes');
  const r2 = sandbox.planQueue_([mk('product', 'PETG', 'red'), mk('product', 'PLA', 'red'), mk('product', 'PETG', 'red'), mk('product', 'PLA', 'red')], { product: 100, research: 0, personal: 0 });
  eq(r2.filamentChanges, 1, 'planQueue groups material → 1 change');
  const jobs = [];
  for (let i = 0; i < 6; i++) jobs.push(mk('product', 'PLA', 'c' + i));
  for (let i = 0; i < 3; i++) jobs.push(mk('research', 'PLA', 'r' + i));
  jobs.push(mk('personal', 'PLA', 'x'));
  const r3 = sandbox.planQueue_(jobs, { product: 60, research: 30, personal: 10 });
  eq(r3.count, 10, 'planQueue 6/3/1 consumes all');
  eq(r3.order.filter(j => j.category === 'product').length, 6, 'planQueue 6 products');
  eq(r3.order.filter(j => j.category === 'personal').length, 1, 'planQueue 1 personal');
  eq(sandbox.planQueue_([mk('product', 'PLA', 'red'), mk('product', 'PLA', 'blue', true)], { product: 100, research: 0, personal: 0 }).filamentChanges, 0, 'planQueue anyColor no change');
} else fail('planQueue_ not found');

// IVA split identity (the formula placeOrder uses)
near(121 / 1.21, 100, 'IVA base');
near(121 - 121 / 1.21, 21, 'IVA amount');

console.log('');
if (fails) { console.error(`TESTS FAILED (${fails}).`); process.exit(1); }
console.log('All tests passed.');
