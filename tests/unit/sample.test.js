'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const L = require('../helpers/env');

test('samplePlan : 3 extraits = début, milieu, fin ; la dernière fenêtre finit avec le fichier (index MP4/MKV)', () => {
  const p = L.samplePlan(12e9, 6000, 3, 2, 15);   // 2 Go/1000 s... 12 Go pour 100 min
  assert.equal(p.length, 3);
  assert.deepEqual(p.map(r => r.fromSec), [0, 2940, 5880]); assert.deepEqual(p.map(r => r.toSec), [120, 3060, 6000]);
  assert.equal(p[0].from, 0); assert.equal(p[2].to, 12e9 - 1);
  const bps = 12e9 / 6000;
  assert.ok(Math.abs(p[1].from - (2940 - 15) * bps) < 2 && Math.abs(p[1].to - (3060 + 15) * bps) < 2, 'marge de 15 s de chaque côté');
  assert.ok(p.every(r => !r.done));
});

test('samplePlan : 1 extrait = le début ; durée inconnue = 90 min supposées ; film plus court que l\'extrait = tout le fichier ; pas de taille = rien', () => {
  assert.deepEqual(L.samplePlan(5e9, 3000, 1, 2, 15).map(r => r.fromSec), [0]);
  const u = L.samplePlan(9e9, 0, 3, 2, 0); assert.equal(u[2].toSec, 5400);
  const s = L.samplePlan(1e9, 80, 3, 2, 15); assert.ok(s.every(r => r.from === 0 && r.to === 1e9 - 1));
  assert.deepEqual(L.samplePlan(0, 100, 3, 2, 15), []);
  assert.equal(L.samplePlan(12e9, 6000, 5, 1, 0).length, 5);
});

test('zones reçues : lecture séquentielle fusionnée, trous gardés, texte en pourcentages', () => {
  const D = { size: 1000e6 };
  L.addHave(D, 0, 100e6); L.addHave(D, 100e6, 150e6); L.addHave(D, 500e6, 520e6); L.addHave(D, 990e6, 1000e6);
  assert.deepEqual(D.have, [[0, 150e6], [500e6, 520e6], [990e6, 1000e6]]);
  assert.equal(L.haveText(D), '0-15 %, 50-52 %, 99-100 %');
  L.addHave(D, 150e6, 500e6);   // le trou se comble : tout est fusionné jusqu'à 52 %
  assert.deepEqual(D.have, [[0, 520e6], [990e6, 1000e6]]);
  assert.equal(L.haveText({ size: 0, have: [[0, 1]] }), '');
});

test('dlState en mode échantillon : avancement des extraits, puis « PRÊTS »', () => {
  const D = o => ({ active: true, activatedAt: Date.now() - 5000, speed: 0, peers: 1, readBytes: 5e6, netBytes: 0, size: 1e9, maxPos: 0, progress: 0, meta: true, ...o });
  const was = [L.cfg.sampleMode, L.cfg.sampleMinutes]; L.cfg.sampleMode = true; L.cfg.sampleMinutes = 2;
  try {
    const plan = n => ({ n: 3, plan: [0, 1, 2].map(i => ({ done: i < n })) });
    assert.equal(L.dlState(D({ sample: plan(1), speed: 1.2e6 })).label, 'ÉCHANTILLONS 1/3 · 1,2 Mo/s');
    assert.equal(L.dlState(D({ sample: plan(1), live: { closed: false, realReady: true, producedSec: 30, playerSec: 0 } })).label, 'ÉCHANTILLONS 1/3 · PRÊT, relancez');
    assert.equal(L.dlState(D({ sample: plan(3) })).label, 'ÉCHANTILLONS PRÊTS · 3 × 2 min');
  } finally { [L.cfg.sampleMode, L.cfg.sampleMinutes] = was; }
});

test('vidéo locale sans indice VR dans son nom : format du réglage localDefaultFormat ; un nom VR garde son format', () => {
  const was = L.cfg.localDefaultFormat;
  try {
    L.cfg.localDefaultFormat = 'flat'; assert.equal(L.localFormat('film.mp4').screenType, 'flat');
    L.cfg.localDefaultFormat = 'vr180'; assert.deepEqual(L.localFormat('film.mp4'), { screenType: 'dome', stereoMode: 'sbs', is3d: true });
    L.cfg.localDefaultFormat = 'vr360'; assert.equal(L.localFormat('film.mp4').screenType, 'sphere');
    assert.equal(L.localFormat('scene_360_TB.mp4').stereoMode, 'tb');   // le nom l'emporte
  } finally { L.cfg.localDefaultFormat = was; }
});

test('réglages par défaut : mode échantillon éteint, 3 extraits de 2 min, dossier « videos » lu d\'office', () => {
  assert.equal(L.cfg.sampleMode, false); assert.equal(L.cfg.sampleCount, 3); assert.equal(L.cfg.sampleMinutes, 2); assert.equal(L.cfg.localFolder, true);
  assert.equal(L.cfg.formatMenu, 'free', 'menu FLAT/180/360 toujours disponible par défaut'); assert.equal(L.cfg.bindHost, '127.0.0.1', 'pas visible du réseau par défaut'); assert.equal(L.cfg.testScene, false, 'Test pont seulement en mode développeur');
  assert.ok(L.cfg.localDirs.includes(L.cfg.videosDir)); assert.match(L.cfg.videosDir, /videos$/);
});
