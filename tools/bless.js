#!/usr/bin/env node
/**
 * Promote the current commit to the `known-good` baseline — only green code.
 * Runs the test gate, moves the movable `known-good` git tag to HEAD, pushes it
 * (an off-site copy), and reminds you to log it. Fall back later with:
 *   git checkout known-good -- .
 * Usage: `npm run bless -- "why this is good"`  (or `node tools/bless.js "note"`)
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const note = process.argv.slice(2).join(' ') || '';
const run = (cmd) => { console.log('$ ' + cmd); return execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString().trim(); };

try {
  console.log('== Test gate ==');
  execSync('node tools/run-tests.js', { cwd: ROOT, stdio: 'inherit' });

  const sha = run('git rev-parse --short HEAD');
  const date = new Date().toISOString().slice(0, 10);
  run('git tag -f known-good');
  run(`git tag -f known-good-${date}`);          // permanent dated snapshot too
  try { run('git push -f origin known-good'); run(`git push -f origin known-good-${date}`); }
  catch (e) { console.warn('(could not push tags — do it manually: git push -f origin known-good)'); }

  console.log(`\n✓ Blessed ${sha} as known-good (+ known-good-${date}).`);
  console.log(`  Add a row to KNOWN_GOOD.md: | ${date} | ${sha} | ${note || '…'} |`);
} catch (e) {
  console.error('\n✗ Not blessed — tests failed. Only green code becomes known-good.');
  process.exit(1);
}
