'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const L = require('../helpers/env');
const cfg = L.cfg;
const mode = (m, fn) => { const old = cfg.startMode; cfg.startMode = m; try { fn(); } finally { cfg.startMode = old; } };

test('startMode « rapide » (défaut) : le film démarre dès minBufferSec de tampon, même avec un débit 10 fois trop faible (4e test : « au bout de 20-30 s on peut lancer »)', () => {
  assert.equal(cfg.startMode, 'rapide');
  assert.equal(L.bufferTarget({ need: 14.8e6, speed: 1.5e6, runtime: 4314 }), cfg.minBufferSec);   // cas réel du 02/10 : 8K HEVC 118 Mbit/s reçu à 1,5 Mo/s (avant : 1740 s d'attente)
  assert.equal(L.bufferTarget({ need: 1e6, speed: 2e6, runtime: 3600 }), cfg.minBufferSec);
});

test('bufferTarget « sans-coupure » : petit tampon si le débit suffit', () => mode('sans-coupure', () => {
  assert.equal(L.bufferTarget({ need: 1e6, speed: 2e6, runtime: 3600 }), cfg.minBufferSec);
  assert.equal(L.bufferTarget({ need: 1e6, speed: 1.1e6, runtime: 3600 }), Math.max(60, cfg.minBufferSec));
  assert.equal(L.bufferTarget({ need: 0, speed: 0, runtime: 3600 }), cfg.minBufferSec);
}));

test('bufferTarget « sans-coupure » : débit insuffisant -> avance = durée × (1 − débit/besoin) × 1,1, bornée', () => mode('sans-coupure', () => {
  const D = { need: 1e6, speed: 0.5e6, runtime: 3600 };   // il faut la moitié du film d'avance : 1980 s, plafonné par patientMaxMin
  const cap = Math.min(cfg.patientMaxMin, cfg.maxAheadMin - 1) * 60;
  assert.equal(L.bufferTarget(D), Math.min(1980, cap));
  const small = L.bufferTarget({ need: 1e6, speed: 0.9e6, runtime: 600 });   // 66 s -> au moins 120 s
  assert.equal(small, 120);
}));

test('waitPlan : attente avant lecture sans coupure', () => {
  const ok = L.waitPlan({ need: 1e6, speed: 2e6, runtime: 3600 });
  assert.equal(ok.ok, true); assert.equal(ok.waitSec, 0);
  const slow = L.waitPlan({ need: 1e6, speed: 0.5e6, runtime: 3600 });
  assert.equal(slow.ok, false); assert.equal(slow.leadSec, 1980); assert.ok(slow.waitSec > 0);
  assert.equal(L.waitPlan({ need: 0, speed: 0, runtime: 0 }), null);
  const huge = L.waitPlan({ need: 1e6, speed: 0.1e6, runtime: 7200 });
  assert.equal(huge.complete, false, 'film trop lourd pour ce débit : l\'avance nécessaire dépasse le plafond');
});
