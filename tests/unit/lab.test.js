'use strict';
// Banc de test casque (bridge/lab.js) + étiquettes : les scènes sont bien décrites, le verdict détecte un lecteur qui recommence le flux.
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const L = require('../helpers/env'), { create, SCENES } = require('../../bridge/lab');

const mk = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-lab-')), logs = [], served = [];
  const lab = create({ cfg: { tempDir: dir, ffmpeg: 'ffmpeg' }, log: (l, m) => logs.push([l, m]), serveLocal: (req, res, f) => { served.push(path.basename(f)); res.end(); }, font: '', escF: x => x, ffmpegOk: true, hevcOk: true, thumb: b => b + '/t.jpg', runner: async () => '' });
  return { dir, logs, served, lab };
};
const req = (m = 'GET') => ({ method: m, headers: { host: 'x:4477' } }), res = () => ({ writeHead() {}, end() {} });

test('banc de test : chaque scène a une fiche JSON valide ; « path » et « sans format » seulement là où c\'est testé', () => {
  const { lab } = mk(), ids = new Set();
  for (const k of Object.keys(SCENES)) {
    const v = lab.video(k, 'http://h:1'); assert.ok(v, k); ids.add(v.id);
    if (SCENES[k].partial) { for (const f of ['screenType', 'stereoMode', 'is3d']) assert.equal(v[f], SCENES[k].partial[f], k + ' ' + f); }
    else if (SCENES[k].noFormat) { assert.equal(v.screenType, undefined, k); assert.equal(v.stereoMode, undefined, k); assert.equal(v.is3d, undefined, k); }
    else { assert.equal(v.screenType, 'dome'); assert.equal(v.stereoMode, 'sbs'); assert.equal(v.is3d, true); }
    if (SCENES[k].usePath) { assert.match(v.path, /\/lab\/h264-path\/index\.m3u8$/); assert.equal(v.encodings, undefined); }
    else assert.match(v.encodings[0].videoSources[0].url, new RegExp(`/lab/${k}/(index\\.m3u8|video\\.mp4|video\\.mkv|video_180_LR\\.mp4)$`));
  }
  assert.equal(ids.size, Object.keys(SCENES).length, 'ids distincts');
  assert.equal(lab.video('inconnu', 'http://h:1'), null);
  assert.ok(lab.video('guide', 'http://h:1').encodings[0].videoSources[0].url.endsWith('/lab/guide/video.mp4'));
  assert.equal(lab.items('http://h:1').length, Object.keys(SCENES).length + 1, 'scènes + mode d\'emploi');
});

test('banc de test : un lecteur qui redemande le 1er segment en moins de 30 s = ÉCHEC probable ; qui va au bout = OK probable ; un nouvel essai plus tard n\'est pas un échec', async () => {
  const { dir, lab, logs, served } = mk(), d = path.join(dir, 'lab');
  for (const k of ['h264-ts', 'hevc-ts']) { fs.mkdirSync(path.join(d, k), { recursive: true }); for (const f of ['index.m3u8', 'seg.m3u8', 'seg000.ts', 'seg005.ts']) fs.writeFileSync(path.join(d, k, f), 'x'); }
  assert.match(lab.data().scenes['h264-ts'].verdict, /pas encore ouvert/);
  for (const f of ['index.m3u8', 'seg000.ts', 'seg005.ts']) await lab.handle(req(), res(), 'h264-ts', f);
  assert.match(lab.data().scenes['h264-ts'].verdict, /OK probable/);
  { const realNow0 = Date.now; let t0 = realNow0(); Date.now = () => t0;
    try { await lab.handle(req(), res(), 'hevc-ts', 'seg000.ts'); t0 += 15000; await lab.handle(req(), res(), 'hevc-ts', 'seg000.ts'); } finally { Date.now = realNow0; } }   // le lecteur recommence à +15 s (mesuré)
  const v = lab.data().scenes['hevc-ts'].verdict; assert.match(v, /ÉCHEC probable/); assert.match(v, /1 fois/); assert.match(v, /15/);
  assert.ok(logs.some(([l, m]) => l === 'warn' && /RECOMMENCE/.test(m)), 'avertissement dans le journal');
  await lab.handle(req('HEAD'), res(), 'hevc-ts', 'seg000.ts'); assert.equal(lab.data().scenes['hevc-ts'].ouvertures.length, 2, 'HEAD ne compte pas');
  assert.ok(served.length >= 5);
  // 2e ouverture 100 s plus tard (l'utilisateur réessaie) : pas un échec
  const realNow = Date.now; let t = realNow();
  Date.now = () => t;
  try { t += 100000; await lab.handle(req(), res(), 'h264-ts', 'seg000.ts'); t += 100000; await lab.handle(req(), res(), 'h264-ts', 'seg000.ts'); await lab.handle(req(), res(), 'h264-ts', 'seg005.ts'); } finally { Date.now = realNow; }
  const w = lab.data().scenes['h264-ts'].verdict; assert.match(w, /OK probable/); assert.match(w, /nouveaux essais/); assert.doesNotMatch(w, /ÉCHEC/);
});

test('banc de test : un MKV lu par plusieurs demandes en rafale (sondes) n\'est pas un redémarrage', async () => {
  const { dir, lab } = mk(); fs.mkdirSync(path.join(dir, 'lab', 'hevc-mkv'), { recursive: true }); fs.writeFileSync(path.join(dir, 'lab', 'hevc-mkv', 'video.mkv'), 'x');
  for (let i = 0; i < 3; i++) await lab.handle(req(), res(), 'hevc-mkv', 'video.mkv');
  const v = lab.data().scenes['hevc-mkv'].verdict; assert.doesNotMatch(v, /ÉCHEC/); assert.equal(lab.data().scenes['hevc-mkv'].ouvertures.length, 1);
});

test('banc de test : les scènes qui réutilisent un fichier (Labos 7, 8, 10, 11) pointent vers LE bon fichier', () => {
  const { lab } = mk();
  for (const k of ['hevc-nofmt', 'fmt-stereo', 'fmt-screen']) assert.match(lab.video(k, 'http://h:1').encodings[0].videoSources[0].url, new RegExp(`/lab/${k}/video\\.mp4$`), k);
  assert.match(lab.video('hevc-name', 'http://h:1').encodings[0].videoSources[0].url, /\/lab\/hevc-name\/video_180_LR\.mp4$/);
});

test('banc de test : le même MP4 est servi sous le nom video_180_LR.mp4 (Labo 8) et compté sur la scène 8', async () => {
  const { dir, lab, served } = mk(); fs.mkdirSync(path.join(dir, 'lab', 'hevc-mp4'), { recursive: true }); fs.writeFileSync(path.join(dir, 'lab', 'hevc-mp4', 'video.mp4'), 'x');
  await lab.handle(req(), res(), 'hevc-name', 'video_180_LR.mp4');
  assert.deepEqual(served, ['video.mp4']); assert.equal(lab.data().scenes['hevc-name'].ouvertures.length, 1);
});

test('pastille : seeders seulement, jamais la qualité (8K...) déjà présente dans le titre', () => {
  L.filmHealth.set('tt-lab', { level: 3, seeders: 12, res: 3840, t: Date.now() });
  assert.equal(L.healthTag({ id: 'tt-lab', name: 'Film 8K' }), '[S12] ');
  L.filmHealth.set('tt-lab2', { level: 3, seeders: 6, res: 2160, t: Date.now() });
  assert.equal(L.healthTag({ id: 'tt-lab2', name: 'Film 4K' }), '[S6] ');
});

test('banc de test : les Labos 5 et 12 affichent leur propre numéro et le bon codec de chargement (régression : le Labo 12 affichait « LABO 5 — CHARGEMENT (H.264) »)', async () => {
  const { dir, lab } = mk();
  for (const k of ['loader-fmp4', 'loader-hevc']) await lab.handle(req(), res(), k, 'index.m3u8');
  const a5 = fs.readFileSync(path.join(dir, 'lab', 'loader-fmp4', 'texte-a.txt'), 'utf8'), a12 = fs.readFileSync(path.join(dir, 'lab', 'loader-hevc', 'texte-a.txt'), 'utf8');
  assert.match(a5, /^LABO 5 — CHARGEMENT\nH\.264 TS$/m);
  assert.match(a12, /^LABO 12 — CHARGEMENT\nHEVC fMP4$/m, 'titre et codec sur des lignes courtes (≤ 32 caractères)'); assert.ok(!/LABO 5/.test(a12), a12);
  assert.match(fs.readFileSync(path.join(dir, 'lab', 'loader-hevc', 'texte-b.txt'), 'utf8'), /LABO 12 — FILM/);
});

test('Labos 13 à 15 (bascule HEVC automatique) : Labo 13 = vrai format de film (HEVC Main 10 8192×4096 en MKV, copié tel quel en fMP4 hvc1) ; textes 14 et 15 justes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-lab-')), calls = [];
  const lab = create({ cfg: { tempDir: dir, ffmpeg: 'ffmpeg' }, log: () => {}, serveLocal: (q, r) => r.end(), font: '', escF: x => x, ffmpegOk: true, hevcOk: true, thumb: b => b + '/t.jpg', runner: async a => { calls.push(a.join(' ')); return ''; } });
  for (const k of ['loader-8k', 'loader-h264fmp4', 'loader-wrong']) await lab.handle(req(), res(), k, 'index.m3u8');
  const c13 = calls.filter(c => /b_src\.mkv/.test(c));
  assert.ok(c13.some(c => /s=4096x4096/.test(c) && /yuv420p10le/.test(c) && /libx265/.test(c)), 'film 8K 10 bits encodé en MKV');
  assert.ok(c13.some(c => /-i b_src\.mkv/.test(c) && /-c:v copy -tag:v hvc1/.test(c) && /-hls_segment_type fmp4/.test(c)), 'copié tel quel en HLS fMP4 (comme le ferait le pont)');
  const txt = (k, f) => fs.readFileSync(path.join(dir, 'lab', k, f), 'utf8');
  assert.match(txt('loader-h264fmp4', 'texte-a.txt'), /^LABO 14 — CHARGEMENT\nH\.264 fMP4$/m);
  assert.match(txt('loader-wrong', 'texte-b.txt'), /^LABO 15 — FILM\nH\.264 fMP4$/m);
  assert.match(txt('loader-8k', 'texte-b.txt'), /^HEVC 10 bits 8K fMP4$/m);
  for (const k of ['loader-8k', 'loader-h264fmp4', 'loader-wrong', 'zap-vod']) assert.ok(lab.video(k, 'http://h:1').encodings[0].videoSources[0].url.endsWith(`/lab/${k}/index.m3u8`), k);
  assert.equal(lab.video('zap-vod', 'http://h:1').videoLength, 90);
});

test('Labo 16 (zapper) : un segment demandé loin du précédent est compté comme un saut ; lecture dans l\'ordre = aucun saut', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-lab-')), logs = [];
  const lab = create({ cfg: { tempDir: dir, ffmpeg: 'ffmpeg' }, log: (l, m) => logs.push(m), serveLocal: (q, r) => r.end(), font: '', escF: x => x, ffmpegOk: true, hevcOk: true, thumb: b => b, runner: async () => '', zapDelayMs: 0 });
  const d = path.join(dir, 'lab', 'zap-vod'); fs.mkdirSync(d, { recursive: true }); for (let i = 0; i < 23; i++) fs.writeFileSync(path.join(d, `seg${String(i).padStart(3, '0')}.ts`), 'x'); fs.writeFileSync(path.join(d, 'seg.m3u8'), '#EXTM3U');
  for (const i of [0, 1, 2]) await lab.handle(req(), res(), 'zap-vod', `seg00${i}.ts`);
  assert.match(lab.data().scenes['zap-vod'].verdict, /aucun saut/);
  for (const i of ['015', '016', '005']) await lab.handle(req(), res(), 'zap-vod', `seg${i}.ts`);
  const v = lab.data().scenes['zap-vod'].verdict; assert.match(v, /2 saut\(s\)/); assert.match(v, /0 1 2 15 16 5/);
  assert.ok(logs.some(m => /SAUT du segment 2 au segment 15/.test(m)));
});
