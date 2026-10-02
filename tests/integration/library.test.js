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
  const lib = await library(), list = scene(lib, 'En cours').list;
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

test('film d\'un catalogue « VR » : déclaré VR (jamais plat) même sans indice dans le titre', async () => {
  const lib = await library(), item = scene(lib, 'Top VR').list.find(i => /Zoe/.test(i.title));
  const v = await bridge.json(new URL(item.video_url).pathname);
  assert.equal(v.screenType, 'dome'); assert.equal(v.stereoMode, 'sbs'); assert.equal(v.is3d, true);
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
});
