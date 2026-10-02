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
  test('--report pendant que le pont tourne : ne renomme pas ses journaux et n\'y écrit pas de faux « arrêt du processus » (régression : rapport sans journal détaillé)', { timeout: 30000 }, () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-')), log = path.join(d, 'bridge-debug.log'), big = 'x'.repeat(6e6) + '\n2026-10-02T10:00:00.000Z [info] DERNIERE-LIGNE-DU-PONT https://addon.example.com/realdebrid=CLE-SECRETE-42/manifest.json C:\\Users\\Clement\\Downloads\\pont\n';
    fs.writeFileSync(log, big); fs.writeFileSync(path.join(d, 'bridge-requests.log'), 'r'.repeat(3e6));
    const r = cp.spawnSync(process.execPath, [server, '--report'], { encoding: 'utf8', timeout: 25000, env: { ...process.env, BRIDGE_DATA_DIR: d, BRIDGE_NO_BROWSER: '1', PORT: '9', LOCAL_STREMIO: 'http://127.0.0.1:9' } });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!fs.existsSync(log + '.old') && !fs.existsSync(path.join(d, 'bridge-requests.log.old')), 'journaux renommés par --report');
    const after = fs.readFileSync(log, 'utf8'); assert.ok(after.startsWith(big), 'journal du pont tronqué par --report'); assert.ok(!/arrêt du processus/.test(after), 'faux « arrêt du processus » écrit par --report');
    const rep = fs.readFileSync(path.join(d, 'rapport-support.txt'), 'utf8');
    assert.match(rep, /DERNIERE-LIGNE-DU-PONT https:\/\/hote-\w{5}\/…/);
    assert.ok(!/CLE-SECRETE-42|addon\.example|Clement/.test(rep), 'clé dans le chemin d\'une URL d\'addon, hôte ou nom du compte Windows en clair dans le rapport');
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
