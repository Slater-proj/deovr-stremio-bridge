#!/usr/bin/env node
// Test de fumée de l'archive portable : lance VRAIMENT l'exe (ffmpeg et vidéos de test embarqués) et vérifie le parcours de base.
//   node scripts/smoke-exe.js <dossier extrait de l'archive>      (contient DeoVR-Stremio-Bridge[.exe])
// Vérifie : --version / --help, démarrage, données uniquement dans <dossier>\data, page /setup, bibliothèque DeoVR, écran de chargement ET film
// produits par le ffmpeg embarqué (test de bascule), rapport de support, déconnexion. Échoue (code 1) au premier défaut.
const cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os'), net = require('net');
const dir = path.resolve(process.argv[2] || '.'), win = process.platform === 'win32';
const exe = path.join(dir, win ? 'DeoVR-Stremio-Bridge.exe' : 'DeoVR-Stremio-Bridge'), pkg = require('../package.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0; const ok = m => console.log('✓ ' + m), ko = m => { console.error('✗ ' + m); failed++; };
const must = (c, m) => { if (!c) { ko(m); throw new Error(m); } ok(m); };
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sh = (args, o = {}) => cp.spawnSync(exe, args, { encoding: 'utf8', timeout: 60000, cwd: dir, windowsHide: true, ...o });

(async () => {
  must(fs.existsSync(exe), `exécutable présent (${path.basename(exe)}, ${(fs.statSync(exe).size / 1e6).toFixed(0)} Mo)`);
  for (const f of ['test/test-2d.mp4', 'ffmpeg/' + (win ? 'ffmpeg.exe' : 'ffmpeg'), 'ffmpeg/' + (win ? 'ffprobe.exe' : 'ffprobe'), 'LISEZMOI.txt', 'THIRD-PARTY-NOTICES.txt', 'docs/USAGE.md']) must(fs.existsSync(path.join(dir, f)), `fichier de l'archive : ${f}`);
  let r = sh(['--version']); must(r.status === 0 && r.stdout.trim().startsWith(pkg.version), `--version = ${pkg.version} (obtenu « ${r.stdout.trim()} » ${r.stderr.trim()})`);
  r = sh(['--help']); must(r.status === 0 && r.stdout.includes('--dev'), '--help');
  const ff = cp.spawnSync(path.join(dir, 'ffmpeg', win ? 'ffmpeg.exe' : 'ffmpeg'), ['-version'], { encoding: 'utf8' }); must(ff.status === 0, 'le ffmpeg embarqué s\'exécute (' + String(ff.stdout).split('\n')[0] + ')');
  must(!fs.existsSync(path.join(dir, 'data')), 'aucun dossier data avant le premier lancement (--version/--help n\'écrivent rien)');

  const port = await freePort(); let out = '';
  const proc = cp.spawn(exe, ['--dev', '--no-browser', '--port', String(port)], { cwd: dir, env: { ...process.env, BRIDGE_NO_BROWSER: '1' }, windowsHide: true });
  proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => out += d);
  const base = `http://127.0.0.1:${port}`, get = async (p, init) => { const x = await fetch(base + p, init); return { status: x.status, text: await x.text(), headers: x.headers }; };
  try {
    const t0 = Date.now(); while (!/Bridge prêt/.test(out)) { if (proc.exitCode !== null || Date.now() - t0 > 45000) throw new Error('le pont ne démarre pas :\n' + out.slice(-2000)); await sleep(200); }
    ok(`le pont démarre (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    must(/MODE DÉVELOPPEUR/.test(out), 'mode --dev annoncé dans la console');
    must(fs.existsSync(path.join(dir, 'data', 'bridge-debug.log')), 'journaux dans <dossier>\\data');
    const st = JSON.parse((await get('/status.json')).text); must(Array.isArray(st), '/status.json répond');
    const dbg = JSON.parse((await get('/debug')).text); must(path.resolve(dbg.chemins.donnees) === path.join(dir, 'data'), 'données dans <dossier>\\data (' + dbg.chemins.donnees + ')'); must(dbg.chemins.mode === 'portable', 'mode portable');
    must(path.resolve(dbg.config.ffmpeg) === path.join(dir, 'ffmpeg', win ? 'ffmpeg.exe' : 'ffmpeg'), 'ffmpeg embarqué utilisé par le pont');
    must((await get('/dev')).status === 200, 'page /dev (mode développeur)');
    const setup = await get('/setup'); must(setup.status === 200 && /name="t" value="[0-9a-f]{32,}"/.test(setup.text), 'page de connexion /setup');
    must((await get('/setup', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a%40b.c&password=x' })).status === 403, 'connexion refusée sans jeton');
    const lib = JSON.parse((await get('/deovr')).text); must(lib.scenes.some(s => s.name === 'En cours') && lib.scenes.some(s => /Test/i.test(s.name)), 'bibliothèque DeoVR (En cours + Test pont)');
    must(lib.scenes[0].list.some(x => /Connexion Stremio requise/.test(x.title)), 'invite de connexion affichée dans « En cours »');
    // écran de chargement puis film, produits par le ffmpeg embarqué
    const url = `${base}/test/switch/flat/index.m3u8`; let loader = 0, real = 0, ended = false; const got = new Set(), t1 = Date.now();
    while (Date.now() - t1 < 90000 && !ended) {
      const pl = (await get('/test/switch/flat/index.m3u8')).text, segs = pl.split('\n').filter(l => l && !l.startsWith('#'));
      for (const s of segs) { if (got.has(s)) continue; const x = await fetch(`${base}/test/switch/flat/${s}`), b = await x.arrayBuffer(); if (!x.ok || b.byteLength < 1000) continue; got.add(s); s.startsWith('real/') ? real++ : loader++; }
      if (/ENDLIST/.test(pl) && segs.every(s => got.has(s))) ended = true; else await sleep(700);
    }
    must(loader >= 3, `écran de chargement généré par ffmpeg (${loader} segments)`); must(real >= 2 && ended, `film converti par ffmpeg jusqu'à ENDLIST (${real} segments)`);
    // rapport de support pendant que le pont tourne
    r = sh(['--report', '--no-pause'], { env: { ...process.env, PORT: String(port) } }); const rep = path.join(dir, 'data', 'rapport-support.txt');
    must(r.status === 0 && fs.existsSync(rep), '--report écrit data\\rapport-support.txt');
    const txt = fs.readFileSync(rep, 'utf8'); must(/ÉTAT EN DIRECT/.test(txt) && txt.includes(pkg.version), 'rapport : version et état en direct du pont'); must(!/AUTHKEY|authKey":"[^*"]/.test(txt), 'rapport : aucune clé d\'authentification');
  } finally {
    proc.kill(); await sleep(1500);
  }
  if (failed === 0) { const appdata = win ? path.join(process.env.APPDATA || '', 'DeoVR-Stremio-Bridge') : ''; must(!appdata || !fs.existsSync(appdata), 'rien n\'a été créé dans %APPDATA%'); }
  r = sh(['--logout']); must(r.status === 0, '--logout');
  console.log(failed ? `\n${failed} contrôle(s) en échec` : '\nTest de fumée de l\'archive : OK'); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('\nÉCHEC : ' + e.message); process.exit(1); });
