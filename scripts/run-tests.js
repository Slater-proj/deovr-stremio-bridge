#!/usr/bin/env node
// Lance les tests node:test (toutes versions de Node >= 20) : `node scripts/run-tests.js [unit|integration]`
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..', 'tests');
const only = process.argv[2];
const files = [];
(function walk(d) {
  for (const n of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, n.name);
    if (n.isDirectory()) { if (n.name !== 'helpers') walk(p); } else if (/\.test\.js$/.test(n.name) && (!only || p.includes(path.sep + only + path.sep))) files.push(p);
  }
})(root);
if (!files.length) { console.error('Aucun test trouvé'); process.exit(1); }
files.sort();
const r = cp.spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
