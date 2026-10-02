'use strict';
// Le « bundle » (tout le pont dans UN fichier, ce que l'exe embarque) se comporte comme `node server.js` : même CLI, mêmes dossiers, même serveur.
// Vérifie l'emballage (registre de modules, __dirname, argv) sans fabriquer l'exe lui-même (c'est le test de fumée de la CI Windows).
const { test, before, after, describe } = require('node:test'), assert = require('node:assert/strict');
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const root = path.join(__dirname, '..', '..'), pkg = require('../../package.json');
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

describe('bundle de l\'exe', () => {
  let tmp, bundle, app;
  const runner = flags => ['-e', `process.argv=[process.execPath,process.execPath,...${JSON.stringify(flags)}];require(${JSON.stringify(bundle)})`];   // imite argv d'un exe
  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-')); app = path.join(tmp, 'app'); fs.mkdirSync(app);
    const r = cp.spawnSync(process.execPath, [path.join(root, 'scripts', 'build-exe.js'), '--bundle-only', '--work', path.join(tmp, 'work')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); bundle = r.stdout.trim().split('\n').pop();
  });
  after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

  test('--version et --help', () => {
    const env = { ...process.env, BRIDGE_APP_DIR: app };
    let r = cp.spawnSync(process.execPath, runner(['--version']), { encoding: 'utf8', env }); assert.equal(r.status, 0, r.stderr); assert.ok(r.stdout.trim().startsWith(pkg.version), `--version = ${r.stdout.trim()}`); // en CI : suffixe de build « -dev.N.sha (commit, date) »
    r = cp.spawnSync(process.execPath, runner(['--help']), { encoding: 'utf8', env }); assert.ok(r.stdout.includes('--dev'));
    assert.deepEqual(fs.readdirSync(app), [], 'rien d\'écrit par --version / --help');
  });

  test('démarre, range TOUT dans <dossier de l\'exe>/data, ouvre /setup, mode --dev', { timeout: 40000 }, async () => {
    const port = await freePort(); let out = '';
    const p = cp.spawn(process.execPath, runner(['--dev', '--no-browser', '--port', String(port)]), { env: { ...process.env, BRIDGE_APP_DIR: app, DNS_MODE: 'system' } });
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    try {
      const t0 = Date.now(); while (!/Bridge prêt/.test(out)) { if (p.exitCode !== null || Date.now() - t0 > 20000) throw new Error('démarrage impossible :\n' + out.slice(-1500)); await sleep(100); }
      assert.match(out, /MODE DÉVELOPPEUR/);
      const dbg = await (await fetch(`http://127.0.0.1:${port}/debug`)).json();
      assert.equal(dbg.chemins.mode, 'portable'); assert.equal(path.resolve(dbg.chemins.donnees), path.join(app, 'data')); assert.equal(dbg.chemins.application, app);
      assert.equal((await fetch(`http://127.0.0.1:${port}/setup`)).status, 200); assert.equal((await fetch(`http://127.0.0.1:${port}/dev`)).status, 200);
      assert.ok(fs.existsSync(path.join(app, 'data', 'bridge-debug.log')));
      assert.deepEqual(fs.readdirSync(app).sort(), ['config.json', 'data'], 'seuls config.json et data\\ sont créés à côté de l\'exe');
      const cj = JSON.parse(fs.readFileSync(path.join(app, 'config.json'), 'utf8')); assert.equal(cj.port, 4477); assert.ok(cj._aide); assert.ok(!('email' in cj) && !('password' in cj));
      assert.equal(path.resolve(dbg.chemins.reglages), path.join(app, 'config.json'));
    } finally { p.kill(); await sleep(300); }
  });
});
