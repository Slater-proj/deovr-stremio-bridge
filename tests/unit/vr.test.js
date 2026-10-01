'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const L = require('../helpers/env');

test('vrForce : « VR » dans le catalogue, le genre ou le titre force la déclaration VR', () => {
  L.filmCats.set('a1', ['Top VR']);
  assert.match(L.vrForce({ id: 'a1', name: 'Titre sans indice' }, ''), /VR/);
  L.filmCats.set('a2', ['Drames']);
  assert.ok(!L.vrForce({ id: 'a2', name: 'Titre normal' }, 'Drames'));
  assert.match(L.vrForce({ id: 'a3', name: 'Scene VR 8K' }, ''), /VR/);
  assert.match(L.vrForce({ id: 'a4', name: 'Titre', genres: ['VR'] }, ''), /VR/);
});

test('applyVR : un film VR n\'est jamais déclaré plat', () => {
  const flat = { screenType: 'flat', stereoMode: 'off', is3d: false };
  const r = L.applyVR(flat, 'catalogue VR');
  assert.equal(r.screenType, 'dome'); assert.equal(r.stereoMode, 'sbs'); assert.equal(r.is3d, true);
  const sphere = { screenType: 'sphere', stereoMode: 'tb', is3d: true };
  const r2 = L.applyVR(sphere, 'catalogue VR'); assert.equal(r2.screenType, 'sphere'); assert.equal(r2.stereoMode, 'tb');
  const none = L.applyVR(flat, ''); assert.equal(none.screenType, 'flat');
});

test('vrWhy : un film 3D / 180 / 360 est listé comme VR', () => {
  assert.ok(L.vrWhy({ id: 'z1', name: 'Film 3D SBS' }, 'Films'));
  assert.ok(L.vrWhy({ id: 'z2', name: 'Film 180' }, 'Films'));
  assert.ok(!L.vrWhy({ id: 'z3', name: 'Comédie romantique' }, 'Films'));
});
