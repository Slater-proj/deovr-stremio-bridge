'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const L = require('../helpers/env');

const D = o => ({ active: true, activatedAt: Date.now() - 5000, speed: 0, peers: 0, readBytes: 0, netBytes: 0, size: 1e9, maxPos: 0, progress: 0, meta: false, ...o });

test('dlState : libellés affichés dans DeoVR', () => {
  assert.equal(L.dlState(D({ active: false })).code, 'pause');
  assert.equal(L.dlState(D({ bgDone: true, active: false })).label, 'EN CACHE · COMPLET');
  assert.equal(L.dlState(D({ active: true, maxPos: 1e9 })).label, 'PRÊT · COMPLET');
  const search = L.dlState(D({ peers: 2 })); assert.equal(search.code, 'search'); assert.match(search.label, /RECHERCHE · 2 pairs/);
  const stuck = L.dlState(D({ activatedAt: Date.now() - 90000 })); assert.equal(stuck.code, 'stuck'); assert.equal(stuck.label, 'BLOQUÉ · 0 pair');
  const ready = L.dlState(D({ readBytes: 1e6, meta: true, live: { closed: false, realReady: true, producedSec: 500, playerSec: 20 } }));
  assert.equal(ready.code, 'ready'); assert.match(ready.label, /^PRÊT · .* en tampon$/);
});

test('dlState : les libellés tiennent en ASCII + Latin-1 (DeoVR n\'affiche pas les emoji)', () => {
  for (const d of [D({ active: false }), D({ peers: 1 }), D({ activatedAt: 0 }), D({ readBytes: 5e6, meta: true, speed: 1e6, progress: 0.18, need: 5e5 })])
    assert.ok(![...L.dlState(d).label].some(c => c.codePointAt(0) > 0xFF && c !== '·' && c !== '…'), L.dlState(d).label);
});

test('film « mort au clic » (aucune donnée ni métadonnée après 90 s malgré des pairs) : BLOQUÉ, puis ÉCHEC en pause, retiré de « Plus de seeds » et classé en fin de liste', () => {
  const blocked = L.dlState(D({ id: 'dead-1', peers: 2, activatedAt: Date.now() - 100000 }));
  assert.equal(blocked.code, 'stuck'); assert.equal(blocked.label, 'BLOQUÉ · aucune donnée');   // avant : « RECHERCHE · 2 pairs » indéfiniment
  L.catalogMetas.set('dead-1', { id: 'dead-1', name: 'Film VR 180' }); L.filmHealth.set('dead-1', { level: 2, seeders: 6, t: Date.now() });
  assert.ok(L.seedMetas().some(m => m.id === 'dead-1'), 'annoncé S6 par les trackers');
  L.clickDead.set('dead-1', Date.now());
  assert.ok(!L.seedMetas().some(m => m.id === 'dead-1'), 'plus dans « Plus de seeds »');
  assert.equal(L.tagInfo({ id: 'dead-1', name: 'Film VR 180' }).label, 'ÉCHEC · aucune donnée');
  assert.equal(L.dlState(D({ id: 'dead-1', active: false })).label, 'ÉCHEC · aucune donnée');
  L.clickDead.set('dead-1', Date.now() - 3 * 3600000);
  assert.ok(L.seedMetas().some(m => m.id === 'dead-1'), 'nouvelle chance après 2 h');
  L.clickDead.delete('dead-1');
});

test('dlState : avancement lisible dans la VR (Go reçus / total, débit, temps restant)', () => {
  const l = L.dlState(D({ readBytes: 5e6, meta: true, size: 17e9, progress: 0.18, speed: 1.4e6, need: 5e5 })).label;
  assert.match(l, /^EN COURS 18 % · 3,1\/17,0 Go · 1,4 Mo\/s · reste ~2,8 h$/);
  assert.match(L.dlState(D({ readBytes: 5e6, meta: true, size: 17e9, progress: 0.18 })).label, /^EN COURS 18 % · 3,1\/17,0 Go$/, 'sans débit : pas de temps restant');
  assert.match(L.dlState(D({ readBytes: 5e6, meta: true, size: 2e9, progress: 0.5, speed: 5e6 })).label, /reste ~3 min$/);
});

test('disque : les clics sont acceptés jusqu\'au dernier moment (1 Go), l\'avance par film est plafonnée', () => {
  assert.equal(L.cfg.minFreeCriticalGB, 1); assert.equal(L.cfg.maxAheadMB, 1000); assert.equal(L.cfg.diskCheckMs, 5000);
});

test('cleanTemp : les restes d\'une exécution interrompue (live/, hls/) sont supprimés tout de suite ; les vignettes restent ; tmpUsage compte l\'espace pris', () => {
  const fs = require('fs'), path = require('path'), T = L.cfg.tempDir;
  fs.mkdirSync(path.join(T, 'live', 'abc-1-1', 'real'), { recursive: true }); fs.writeFileSync(path.join(T, 'live', 'abc-1-1', 'real', 'seg00000.ts'), Buffer.alloc(3e6));
  fs.mkdirSync(path.join(T, 'hls', 'x'), { recursive: true }); fs.writeFileSync(path.join(T, 'hls', 'x', 'seg.ts'), Buffer.alloc(2e6));
  fs.mkdirSync(path.join(T, 'thumbs'), { recursive: true }); fs.writeFileSync(path.join(T, 'thumbs', 'a.jpg'), 'x');
  assert.ok(L.tmpUsage().total_Mo >= 5, JSON.stringify(L.tmpUsage()));
  const freed = L.cleanTemp();
  assert.ok(freed >= 5e6); assert.deepEqual(fs.readdirSync(path.join(T, 'live')), []); assert.deepEqual(fs.readdirSync(path.join(T, 'hls')), []); assert.ok(fs.existsSync(path.join(T, 'thumbs', 'a.jpg')));
});
