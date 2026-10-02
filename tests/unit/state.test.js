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
