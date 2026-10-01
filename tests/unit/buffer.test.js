'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const L = require('../helpers/env');
const cfg = L.cfg;

test('bufferTarget : petit tampon si le débit suffit', () => {
  assert.equal(L.bufferTarget({ need: 1e6, speed: 2e6, runtime: 3600 }), cfg.minBufferSec);
  assert.equal(L.bufferTarget({ need: 1e6, speed: 1.1e6, runtime: 3600 }), Math.max(60, cfg.minBufferSec));
  assert.equal(L.bufferTarget({ need: 0, speed: 0, runtime: 3600 }), cfg.minBufferSec);
});

test('bufferTarget : débit insuffisant -> avance = durée × (1 − débit/besoin) × 1,1, bornée', () => {
  const D = { need: 1e6, speed: 0.5e6, runtime: 3600 };   // il faut la moitié du film d'avance : 1980 s, plafonné par patientMaxMin
  const cap = Math.min(cfg.patientMaxMin, cfg.maxAheadMin - 1) * 60;
  assert.equal(L.bufferTarget(D), Math.min(1980, cap));
  const small = L.bufferTarget({ need: 1e6, speed: 0.9e6, runtime: 600 });   // 66 s -> au moins 120 s
  assert.equal(small, 120);
});

test('waitPlan : attente avant lecture sans coupure', () => {
  const ok = L.waitPlan({ need: 1e6, speed: 2e6, runtime: 3600 });
  assert.equal(ok.ok, true); assert.equal(ok.waitSec, 0);
  const slow = L.waitPlan({ need: 1e6, speed: 0.5e6, runtime: 3600 });
  assert.equal(slow.ok, false); assert.equal(slow.leadSec, 1980); assert.ok(slow.waitSec > 0);
  assert.equal(L.waitPlan({ need: 0, speed: 0, runtime: 0 }), null);
  const huge = L.waitPlan({ need: 1e6, speed: 0.1e6, runtime: 7200 });
  assert.equal(huge.complete, false, 'film trop lourd pour ce débit : l\'avance nécessaire dépasse le plafond');
});
