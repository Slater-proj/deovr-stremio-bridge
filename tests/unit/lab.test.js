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

test('banc de test : chaque scène a une fiche JSON valide ; « path » seulement pour la scène qui le teste', () => {
  const { lab } = mk(), ids = new Set();
  for (const k of Object.keys(SCENES)) {
    const v = lab.video(k, 'http://h:1'); assert.ok(v, k); ids.add(v.id);
    assert.equal(v.screenType, 'dome'); assert.equal(v.stereoMode, 'sbs'); assert.equal(v.is3d, true);
    if (SCENES[k].usePath) { assert.match(v.path, /\/lab\/h264-path\/index\.m3u8$/); assert.equal(v.encodings, undefined); }
    else assert.match(v.encodings[0].videoSources[0].url, new RegExp(`/lab/${k}/(index\\.m3u8|video\\.mp4)$`));
  }
  assert.equal(ids.size, Object.keys(SCENES).length, 'ids distincts');
  assert.equal(lab.video('inconnu', 'http://h:1'), null);
  assert.ok(lab.video('guide', 'http://h:1').encodings[0].videoSources[0].url.endsWith('/lab/guide/video.mp4'));
  assert.equal(lab.items('http://h:1').length, Object.keys(SCENES).length + 1, 'scènes + mode d\'emploi');
});

test('banc de test : un lecteur qui redemande le 1er segment = ÉCHEC probable ; qui va au bout = OK probable', async () => {
  const { dir, lab, logs, served } = mk(), d = path.join(dir, 'lab');
  for (const k of ['h264-ts', 'hevc-ts']) { fs.mkdirSync(path.join(d, k), { recursive: true }); for (const f of ['index.m3u8', 'seg000.ts', 'seg005.ts']) fs.writeFileSync(path.join(d, k, f), 'x'); }
  assert.match(lab.data().scenes['h264-ts'].verdict, /pas encore ouvert/);
  for (const f of ['index.m3u8', 'seg000.ts', 'seg005.ts']) await lab.handle(req(), res(), 'h264-ts', f);
  assert.match(lab.data().scenes['h264-ts'].verdict, /OK probable/);
  for (const f of ['seg000.ts', 'seg000.ts']) await lab.handle(req(), res(), 'hevc-ts', f);
  const v = lab.data().scenes['hevc-ts'].verdict; assert.match(v, /ÉCHEC probable/); assert.match(v, /1 fois/);
  assert.ok(logs.some(([l, m]) => l === 'warn' && /RECOMMENCE/.test(m)), 'avertissement dans le journal');
  await lab.handle(req('HEAD'), res(), 'hevc-ts', 'seg000.ts'); assert.equal(lab.data().scenes['hevc-ts'].ouvertures.length, 2, 'HEAD ne compte pas');
  assert.ok(served.length >= 5);
});

test('pastille : seeders seulement, jamais la qualité (8K...) déjà présente dans le titre', () => {
  L.filmHealth.set('tt-lab', { level: 3, seeders: 12, res: 3840, t: Date.now() });
  assert.equal(L.healthTag({ id: 'tt-lab', name: 'Film 8K' }), '[S12] ');
  L.filmHealth.set('tt-lab2', { level: 3, seeders: 6, res: 2160, t: Date.now() });
  assert.equal(L.healthTag({ id: 'tt-lab2', name: 'Film 4K' }), '[S6] ');
});
