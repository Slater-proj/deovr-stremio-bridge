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
  test('port : 4477 par défaut, config.json le change, la variable PORT l\'emporte ; "dev": true active le mode développeur', () => {
    const lib = path.join(__dirname, '..', '..', 'bridge', 'lib.js'), d = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'));
    const get = (env, cfgJson) => { if (cfgJson) fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify(cfgJson)); const e = { ...process.env, BRIDGE_DATA_DIR: d, ...env }; if (!('PORT' in env)) delete e.PORT; delete e.BRIDGE_DEV; delete e.DEBUG;
      return JSON.parse(cp.spawnSync(process.execPath, ['-e', `const c=require(${JSON.stringify(lib)}).cfg;console.log(JSON.stringify({port:c.port,dev:c.dev}))`], { encoding: 'utf8', env: e }).stdout); };
    assert.deepEqual(get({}), { port: 4477, dev: false });
    assert.deepEqual(get({}, { port: 4590, dev: true }), { port: 4590, dev: true });
    assert.equal(get({ PORT: '4600' }).port, 4600);
  });
});
