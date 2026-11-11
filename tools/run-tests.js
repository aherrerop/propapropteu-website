#!/usr/bin/env node
/**
 * Local test gate — runs before every deploy and before `bless`.
 * 1. Syntax-checks every backend/*.gs (as JS) and js/*.js.
 * 2. Fails on any duplicate function definition across the .gs files
 *    (Apps Script concatenates them, so a duplicate silently shadows).
 * 3. Runs the engine's PURE functions (loaded from the real .gs files via `vm`,
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
const code = gs.map(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8')).join('\n');
// Stub the Apps Script globals so top-level var/function definitions load; the pure
// functions we call below don't touch any of these.
const sandbox = {
  Utilities: { formatDate: () => '', getUuid: () => 'uuid', newBlob: () => ({ getAs: () => ({ setName: () => ({}) }) }) },
  Session: { getScriptTimeZone: () => 'Europe/Madrid' },
  SpreadsheetApp: {}, PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  CacheService: {}, MailApp: { getRemainingDailyQuota: () => 100 }, UrlFetchApp: {}, DriveApp: {}, ScriptApp: {}, LanguageApp: {},
  Logger: { log: () => {} }, console, Math, Date, JSON, String, Number, Array, Object, isNaN, parseInt, parseFloat, encodeURIComponent, RegExp
};
vm.createContext(sandbox);
try { vm.runInContext(code, sandbox); pass('engine loads in sandbox'); }
catch (e) { fail('engine failed to load: ' + e.message); }

const eq = (a, b, m) => { if (a === b) pass(m); else fail(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); };

// Every function the router calls must exist (catches a handler deleted by mistake).
{
  const router = (code.match(/function dispatch_[\s\S]*?\n}\n/) || [''])[0];
  const called = new Set(); let m; const re = /return\s+([A-Za-z_][A-Za-z0-9_]*)\(/g;
  while ((m = re.exec(router))) called.add(m[1]);
  const missing = [...called].filter(n => typeof sandbox[n] !== 'function');
  if (missing.length) fail('router calls missing functions: ' + missing.join(', ')); else pass(`router handlers all exist (${called.size})`);
}

// --- To-do grouping (the heart of the system) ---
if (sandbox.groupTodo_) {
  let n = 0;
  const pc = (material, color, o) => Object.assign({ id: 'p' + (++n), orderNo: n, created: '2026-01-01T00:00:' + String(n).padStart(2, '0'), material, color, anyColor: false, copies: 1, grams: '', status: 'todo' }, o || {});
  const labels = list2 => list2.map(g => g.label + ':' + g.pieces.map(p => p.id).join(','));

  // the example from the spec: A,B,D PLA Black / C,E PETG White
  n = 0;
  let g = sandbox.groupTodo_([pc('PLA', 'Black'), pc('PLA', 'Black'), pc('PETG', 'White'), pc('PLA', 'Black'), pc('PETG', 'White')], []);
  eq(g.length, 2, 'two groups');
  eq(labels(g).join(' | '), 'PLA · Black:p1,p2,p4 | PETG · White:p3,p5', 'grouped, chronological inside, oldest group first on a tie');

  // different colours / materials never mix
  n = 0;
  g = sandbox.groupTodo_([pc('PLA', 'Black'), pc('PLA', 'Red'), pc('PETG', 'Black')], []);
  eq(g.length, 3, 'PLA Black / PLA Red / PETG Black are separate');

  // heaviest group first
  n = 0;
  g = sandbox.groupTodo_([pc('PLA', 'Black', { grams: 50 }), pc('PETG', 'White', { grams: 300 })], []);
  eq(g[0].label, 'PETG · White', 'heaviest group first');

  // a group with something prepared goes above everything; prepared goes first inside
  n = 0;
  g = sandbox.groupTodo_([pc('PETG', 'White', { grams: 300 }), pc('PLA', 'Black', { grams: 10 }), pc('PLA', 'Black', { grams: 10, status: 'prepared' })], []);
  eq(g[0].label, 'PLA · Black', 'prepared group first');
  eq(g[0].pieces[0].id, 'p3', 'prepared piece first inside its group');

  // "color not important" joins the SMALLEST group of its material
  n = 0;
  g = sandbox.groupTodo_([pc('PLA', 'Black', { grams: 200 }), pc('PLA', 'Red', { grams: 20 }), pc('PLA', '', { anyColor: true }), pc('PETG', 'White')], []);
  eq(g.filter(x => x.label === 'PLA · Red')[0].pieces.length, 2, 'any-colour joins the smallest PLA group');
  eq(g.filter(x => x.label === 'PLA · Black')[0].pieces.length, 1, 'any-colour did not join the bigger group');

  // ...or stands alone when there is no group of that material
  n = 0;
  g = sandbox.groupTodo_([pc('ABS', '', { anyColor: true }), pc('PLA', 'Black')], []);
  eq(g.filter(x => x.label === 'ABS · Any color').length, 1, 'any-colour alone gets its own group');

  // colour names match regardless of case; pieces without material go last
  n = 0;
  g = sandbox.groupTodo_([pc('', '', {}), pc('PLA', 'black'), pc('PLA', 'Black')], [{ material: 'PLA', color: 'Black', hex: '#000000' }]);
  eq(g.length, 2, 'case-insensitive colour match');
  eq(g[g.length - 1].label, 'Material not set', 'no-material group is last');
  eq(g[0].hex, '#000000', 'group carries the colour circle');
} else fail('groupTodo_ not found');

if (sandbox.sanitizeHtml_) {
  eq(sandbox.sanitizeHtml_('<ul><li onclick="x()">a</li></ul><script>alert(1)</script><img src=x>'), '<ul><li>a</li></ul>', 'sanitizeHtml strips scripts, attributes and unknown tags');
  eq(sandbox.sanitizeHtml_('<div><b>hi</b></div>'), '<p><b>hi</b></p>', 'sanitizeHtml keeps basic formatting');
} else fail('sanitizeHtml_ not found');

if (sandbox.slug_) {
  eq(sandbox.slug_('Penja Quadres  Pró!', {}), 'penja-quadres-pro', 'slug');
  eq(sandbox.slug_('ATLAS', { atlas: true }), 'atlas-2', 'slug stays unique');
} else fail('slug_ not found');

console.log('');
if (fails) { console.error(`TESTS FAILED (${fails}).`); process.exit(1); }
console.log('All tests passed.');
