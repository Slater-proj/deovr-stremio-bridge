'use strict';
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const { startMocks } = require('../helpers/mocks'), { startBridge, ffmpegAvailable } = require('../helpers/bridge'), { makePoster } = require('../helpers/media');

let mocks, bridge; const HAS_FFMPEG = ffmpegAvailable();
before(async () => {
  mocks = await startMocks({ film: Buffer.alloc(1024), poster: HAS_FFMPEG ? makePoster() : undefined });
  bridge = await startBridge(mocks);
});
after(async () => { await bridge.stop(); await mocks.close(); });

const library = () => bridge.json('/deovr');
const scene = (lib, name) => lib.scenes.find(s => s.name === name);

test('/deovr : onglets dans l\'ordre (En cours d\'abord), un onglet par catalogue Stremio, Test pont à la fin', async () => {
  const lib = await bridge.waitFor(async () => { const l = await library(); return scene(l, 'Top VR') && scene(l, 'Plus de seeds') && l; });
  const names = lib.scenes.map(s => s.name);
  assert.equal(names[0], 'En cours');
  assert.ok(names.includes('Nouveautés') && names.includes('Top VR') && names.includes('Films 3D'), names.join(', '));
  assert.equal(names[names.length - 1], 'Test pont');
  assert.ok(scene(lib, 'Test pont').list.length >= 6, 'tests 1 à 6 (+ mode d\'emploi et banc de test casque si ffmpeg)');
  assert.ok(!names.includes('Dramas'), 'le catalogue sans VR est masqué (vrOnly)');
  assert.equal(lib.authorized, '0');
});

test('« En cours » vide : des emplacements fixes et libres, qui s\'ouvrent sans erreur', async () => {
  const lib = await library(), list = scene(lib, 'En cours').list.filter(i => !/^Disque : /.test(i.title));   // la ligne d'information « Disque : N Go libres » s'ajoute en bas quand le disque du test est sous minFreeGB
  assert.equal(list.length, 6, 'emplacements fixes (coursSlots)');
  assert.match(list[0].title, /Emplacement 1 · libre/);
  assert.match(list[0].video_url, /\/video\/slot\/1\.json$/);
  const v = await bridge.json(new URL(list[0].video_url).pathname);
  assert.equal(v.title, 'Aucun film en cours');
});

test('pastilles : identiques dans la liste et dans la fiche, ASCII, jamais PRET/OK', async () => {
  const lib = await bridge.waitFor(async () => { const l = await library(); const s = scene(l, 'Top VR'); return s && s.list.every(i => /^\[/.test(i.title) && !/^\[S\?\]/.test(i.title)) && l; }, 30000);   // analyse de fond terminée : plus de « S? »
  for (const item of scene(lib, 'Top VR').list.slice(0, 4)) {
    const fiche = await bridge.json(new URL(item.video_url).pathname);
    assert.equal(fiche.title, item.title, 'titre de fiche = titre de liste');
    assert.match(item.title, /^\[(?:S\d+|S\?|HTTP)\] /, item.title);   // seeders seulement : la qualité (8K...) est déjà dans le titre du film
    assert.ok(![...item.title].some(c => c.codePointAt(0) > 0xFF && c !== '·'), 'pas d\'emoji');
    assert.ok(!/PRET|PRÊT|\bOK\b/.test(item.title.split('] ')[0]));
  }
});

test('les fiches ne démarrent AUCUN téléchargement (le clic seul le fait)', async () => {
  const lib = await library();
  for (const item of scene(lib, 'Top VR').list) await bridge.json(new URL(item.video_url).pathname);
  assert.equal(mocks.created.size, 0, 'aucun /create envoyé à Stremio');
  assert.ok(!mocks.history.some(h => /^(POST|GET) \/\w{40}\/(create|\d)/.test(h)), mocks.history.join('\n'));
});

test('film d\'un catalogue « VR » sans format dans le titre : fiche SANS format déclaré (le menu FLAT/180/360 de DeoVR reste disponible), format retenu visible dans /debug/video', async () => {
  const lib = await library(), item = scene(lib, 'Top VR').list.find(i => /Zoe/.test(i.title));
  const v = await bridge.json(new URL(item.video_url).pathname);
  assert.equal(v.screenType, undefined); assert.equal(v.stereoMode, undefined); assert.equal(v.is3d, undefined);
  const id = decodeURIComponent(new URL(item.video_url).pathname.split('/').pop().replace(/\.json$/, '')), type = new URL(item.video_url).pathname.split('/')[2];
  const d = await bridge.json(`/debug/video/${type}/${encodeURIComponent(id)}`); assert.equal(d.chosen.screenType, 'dome'); assert.equal(d.chosen.stereoMode, 'sbs');
});

test('disque presque plein : avertissement en tête de « En cours », état dans /debug/perf, aucun téléchargement', async () => {
  const b = await startBridge(mocks, { minFreeCriticalGB: 99999999 });   // seuil absurde : le disque de test est « presque plein »
  try {
    await b.waitFor(async () => (await b.json('/debug/perf')).disque.critique === true, 15000);
    const lib = await b.json('/deovr'); assert.match(scene(lib, 'En cours').list[0].title, /Disque presque plein/);
    assert.ok(/DISQUE PRESQUE PLEIN/.test(b.out()), 'journal');
  } finally { await b.stop(); }
});

test('formatMenu "declare" : le format est toujours déclaré (jamais plat) ; "free" : jamais déclaré', async () => {
  for (const [mode, declared] of [['declare', true], ['free', false]]) {
    const b = await startBridge(mocks, { formatMenu: mode });
    try {
      const lib = await b.json('/deovr'), item = scene(lib, 'Top VR').list.find(i => /Zoe/.test(i.title)), v = await b.json(new URL(item.video_url).pathname);
      if (declared) { assert.equal(v.screenType, 'dome'); assert.equal(v.stereoMode, 'sbs'); assert.equal(v.is3d, true); } else assert.equal(v.screenType, undefined);
    } finally { await b.stop(); }
  }
});

test('titre « 3D SBS » (catalogue Films 3D) : plat 3D côte à côte', async () => {
  const lib = await library(), item = scene(lib, 'Films 3D').list[0];
  const v = await bridge.json(new URL(item.video_url).pathname);
  assert.equal(v.stereoMode, 'sbs'); assert.equal(v.is3d, true);
});

test('recherche /s/<mot> : résultats filtrés', async () => {
  const lib = await bridge.json('/s/zoe');
  const all = lib.scenes.flatMap(s => s.list).filter(i => !/Test|Aucun|Plus de/.test(i.title));
  assert.ok(all.length > 0); assert.ok(all.every(i => /zoe/i.test(i.title)), all.map(i => i.title).join(' | '));
});

test('racine : JSON pour DeoVR, HTML pour un navigateur', async () => {
  const j = await bridge.get('/', { headers: { accept: 'application/json' } }); assert.match(j.headers.get('content-type'), /json/);
  const h = await bridge.get('/', { headers: { accept: 'text/html' } }); assert.match(h.headers.get('content-type'), /html/);
});

test('/ui et /t : pages HTML sans JavaScript, liens deovr://', async () => {
  const ui = await (await bridge.get('/ui')).text(); assert.match(ui, /deovr:\/\//); assert.ok(!/<script/i.test(ui));
  const t = await (await bridge.get('/t')).text(); assert.match(t, /deovr:\/\//);
});

test('fichiers de test : Range supporté', async () => {
  const r = await bridge.get('/test/test-2d.mp4', { headers: { range: 'bytes=0-99' } });
  assert.equal(r.status, 206); assert.equal((await r.arrayBuffer()).byteLength, 100);
});

test('vignettes : l\'affiche portrait devient une image 16:9 (960x540)', { skip: !HAS_FFMPEG && 'ffmpeg absent' }, async () => {
  const lib = await bridge.waitFor(async () => { const l = await library(); return scene(l, 'Top VR') && l; });
  const url = scene(lib, 'Top VR').list[0].thumbnailUrl; assert.match(url, /\/thumb\//);
  const r = await fetch(url); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/jpeg');
  const f = path.join(os.tmpdir(), 'thumb-test.jpg'); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  const probe = cp.spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' });
  assert.equal(probe.stdout.trim(), '960,540');
});

test('sécurité : pas de config.json ni de mot de passe dans les pages de diagnostic', async () => {
  for (const p of ['/debug/perf', '/debug/health', '/debug/requests', '/status.json', '/debug/downloads']) {
    const t = typeof (await bridge.json(p)) === 'string' ? await bridge.json(p) : JSON.stringify(await bridge.json(p));
    assert.ok(!/password|authKey/i.test(t), p);
  }
  assert.equal((await bridge.get('/config.json')).status, 404);
  for (const p of ['/debug', '/status.json', '/debug/requests', '/deovr']) assert.equal((await bridge.get(p)).headers.get('access-control-allow-origin'), null, `${p} : lisible par n'importe quelle page web (CORS)`);
});

test('sécurité : un nom de domaine extérieur dans l\'en-tête Host est refusé (DNS rebinding) ; localhost et l\'IP passent', async () => {
  const get = host => new Promise((ok, no) => require('http').get({ host: '127.0.0.1', port: bridge.port, path: '/debug', headers: { host } }, r => { r.resume(); r.on('end', () => ok(r.statusCode)); }).on('error', no));
  assert.equal(await get(`evil.example.com:${bridge.port}`), 403);
  assert.equal(await get(`localhost:${bridge.port}`), 200);
  assert.equal(await get(`127.0.0.1:${bridge.port}`), 200);
});

test('démarrage : les restes de live/ laissés par un arrêt brutal sont supprimés ; /debug/perf indique la place prise par le pont', async () => {
  const dataDir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'bridge-clean-')), old = require('path').join(dataDir, 'tmp', 'live', 'dead-0-1', 'real');
  require('fs').mkdirSync(old, { recursive: true }); require('fs').writeFileSync(require('path').join(old, 'seg00000.ts'), Buffer.alloc(2e6));
  const b = await startBridge(mocks, {}, { dataDir });
  try {
    assert.ok(!require('fs').existsSync(require('path').join(dataDir, 'tmp', 'live', 'dead-0-1')), 'dossier laissé par la précédente exécution');
    const p = await b.json('/debug/perf'); assert.equal(typeof p.disque.pont.total_Mo, 'number'); assert.match(p.disque.pont.dossier, /tmp$/);
    assert.match(b.out(), /nettoyage : \d+ Mo/);
  } finally { await b.stop(); }
});

test('onglet « Local » : le dossier videos du pont est lu d\'office (vide : message ; avec un fichier : vidéo listée, format lu dans le nom, MKV HEVC jamais converti en HLS)', async () => {
  const empty = await bridge.json('/deovr'), loc0 = scene(empty, 'Local');
  assert.ok(loc0, 'onglet Local présent'); assert.match(loc0.list[0].title, /Dossier vide/);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-local-')); fs.mkdirSync(path.join(dataDir, 'videos'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', '..', 'bridge', 'test', 'test-3d-sbs.mp4'), path.join(dataDir, 'videos', 'Ma_scene_180_LR.mp4'));
  const b = await startBridge(mocks, {}, { dataDir });
  try {
    const lib = await b.json('/deovr'), loc = scene(lib, 'Local');
    assert.equal(loc.list.length, 1); assert.equal(loc.list[0].title, 'Ma scene 180 LR');
    const v = await b.json(new URL(loc.list[0].video_url).pathname);
    assert.equal(v.screenType, 'dome'); assert.equal(v.stereoMode, 'sbs'); assert.match(v.encodings[0].videoSources[0].url, /\/localfile\//);
  } finally { await b.stop(); }
});

test('bibliothèque : deux demandes /deovr rapprochées (DeoVR relancé) = une seule construction', async () => {
  const b = await startBridge(mocks);
  try {
    const t0 = Date.now(); await b.json('/deovr'); await b.json('/deovr');
    const p = (await b.json('/debug/perf')).bibliotheque; assert.ok(p.servies_du_cache >= 1 && p.construites >= 1, JSON.stringify(p));
  } finally { await b.stop(); }
});

test('vidéo locale sans indice VR dans le nom : le format n\'est PAS déclaré (le menu FLAT/180/360/fisheye de DeoVR reste disponible) ; formatMenu "declare" le déclare', async () => {
  for (const [mode, declared] of [['auto', false], ['declare', true]]) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-local2-')); fs.mkdirSync(path.join(dataDir, 'videos'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '..', '..', 'bridge', 'test', 'test-2d.mp4'), path.join(dataDir, 'videos', 'ma video.mp4'));
    const b = await startBridge(mocks, { formatMenu: mode }, { dataDir });
    try {
      const loc = scene(await b.json('/deovr'), 'Local'), v = await b.json(new URL(loc.list[0].video_url).pathname);
      assert.equal(v.screenType !== undefined, declared, mode + ' : ' + JSON.stringify(v).slice(0, 200));
    } finally { await b.stop(); }
  }
});

test('par défaut (formatMenu "free") : aucune fiche ne déclare de format, même quand le titre le dit (3D SBS) : le menu FLAT/180/360/fisheye/SBS de DeoVR reste disponible', async () => {
  const b = await startBridge(mocks, { formatMenu: undefined });
  try {
    const lib = await b.json('/deovr'), item = scene(lib, 'Films 3D').list[0], v = await b.json(new URL(item.video_url).pathname);
    assert.equal(v.screenType, undefined); assert.equal(v.stereoMode, undefined); assert.equal(v.is3d, undefined); assert.ok(v.encodings);
  } finally { await b.stop(); }
});

test('vignettes : badge (résolution, format, seeders) et barre d\'avancement dessinés sur l\'image 16:9', { skip: !HAS_FFMPEG && 'ffmpeg absent' }, async () => {
  const lib = await bridge.waitFor(async () => { const l = await library(); return scene(l, 'Top VR') && l; });
  const url = scene(lib, 'Top VR').list[0].thumbnailUrl; assert.match(url, /\/thumb\/[\w-]+\.jpg\?b=/, 'badge dans l\'URL de la vignette');
  const plain = url.split('?')[0], get = async u => { const r = await fetch(u); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/jpeg'); return Buffer.from(await r.arrayBuffer()); };
  const a = await get(plain), b = await get(plain + '?b=8K%20VR180%20S12&p=40'), c = await get(plain + '?p=70');
  assert.ok(!a.equals(b) && !a.equals(c) && !b.equals(c), 'trois images différentes (sans, badge+avancement, avancement seul)');
  for (const [i, buf] of [b, c].entries()) { const f = path.join(os.tmpdir(), `thumb-ov-${i}.jpg`); fs.writeFileSync(f, buf); assert.equal(cp.spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim(), '960,540'); }
});
