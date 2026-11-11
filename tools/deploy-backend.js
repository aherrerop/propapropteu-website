#!/usr/bin/env node
/**
 * Deploy the engine — but ONLY if the test gate passes first (like R&R's deploy:*).
 * Usage: `npm run deploy:backend -- "what changed"`  (or `node tools/deploy-backend.js "msg"`)
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const DEPLOY_ID = 'AKfycbx03Ql3nWT1bFbsRDfTm6AXQXG-hS4J6KHPxpaKsnIviajJxj56xyFh9dF77qCp84sn';
const msg = process.argv.slice(2).join(' ') || 'update';

function run(cmd, opts) { console.log('\n$ ' + cmd); execSync(cmd, Object.assign({ stdio: 'inherit' }, opts)); }

try {
  console.log('== Test gate ==');
  run('node tools/run-tests.js', { cwd: ROOT });
  console.log('\n== Push ==');
  run('clasp -u propapat push -f', { cwd: BACKEND });
  console.log('\n== Redeploy ==');
  run(`clasp -u propapat redeploy ${DEPLOY_ID} -d "${msg.replace(/"/g, "'")}"`, { cwd: BACKEND });
  console.log('\n✓ Deployed. Bump ENGINE_VERSION in Code.gs on the next change.');
} catch (e) {
  console.error('\n✗ Deploy aborted (tests failed or clasp error). Nothing was deployed if the gate failed.');
  process.exit(1);
}
