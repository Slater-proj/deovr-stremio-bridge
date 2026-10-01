'use strict';
const { test, describe } = require('node:test'), assert = require('node:assert/strict');
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const server = path.join(__dirname, '..', '..', 'bridge', 'server.js'), pkg = require('../../package.json');
const run = (args, extra = {}) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-')); const r = cp.spawnSync(process.execPath, [server, ...args], { encoding: 'utf8', timeout: 20000, env: { ...process.env, BRIDGE_DATA_DIR: d, BRIDGE_NO_BROWSER: '1', ...extra } }); return { ...r, d }; };

describe('ligne de commande', () => {
  test('--version : numéro exact, sans rien écrire dans le dossier de données', () => { const r = run(['--version']); assert.equal(r.status, 0); assert.equal(r.stdout.trim(), pkg.version); assert.deepEqual(fs.readdirSync(r.d), []); });
  test('--help : liste les options', () => { const r = run(['--help']); assert.equal(r.status, 0); for (const o of ['--dev', '--login', '--logout', '--port', '--data-dir', '--report', '--diagnose', '--version']) assert.ok(r.stdout.includes(o), o); });
  test('--logout : supprime la clé enregistrée', () => {
    const S = require('../../bridge/secrets'), d = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-')); S.save(d, { authKey: 'k' });
    const r = cp.spawnSync(process.execPath, [server, '--logout'], { encoding: 'utf8', env: { ...process.env, BRIDGE_DATA_DIR: d } }); assert.equal(r.status, 0); assert.ok(!S.exists(d));
  });
});
