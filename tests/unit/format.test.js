'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const L = require('../helpers/env');

test('detectFormat : projection et stéréo lues dans le titre', () => {
  const cases = [
    ['Film 180 SBS 8K', 'dome', 'sbs'], ['Scene VR 360 TB 4K', 'sphere', 'tb'], ['Fisheye190 3D 6K', 'fisheye', 'sbs'],
    ['MKX200 8K', 'mkx200', 'sbs'], ['RF52 Scene', 'rf52', 'sbs'], ['VR180_LR_5760p', 'dome', 'sbs'], ['Foo 180 OU', 'dome', 'tb'],
    ['Vr180 3D SBS', 'dome', 'sbs'], ['Movie 3D Half-SBS 1080p', 'flat', 'sbs'], ['Movie Top-Bottom', 'flat', 'tb'],
    ['Normal movie 1080p', 'flat', 'off'], ['Film (2021) 4K HDR', 'flat', 'off'], ['Plain TB movie', 'flat', 'off'], ['Some LR file', 'flat', 'off'],
  ];
  for (const [title, screen, stereo] of cases) {
    const f = L.detectFormat(title);
    assert.equal(f.screenType, screen, `${title} -> screenType`); assert.equal(f.stereoMode, stereo, `${title} -> stereoMode`);
    assert.equal(f.is3d, stereo !== 'off' && !(screen === 'sphere' && stereo === 'off'), `${title} -> is3d`);
  }
});

test('detectFormat (fichiers locaux) : conventions _LR / _TB / _3dh / _3dv', () => {
  assert.equal(L.detectFormat('clip_LR_180', { local: true }).stereoMode, 'sbs');
  assert.equal(L.detectFormat('clip_TB_360', { local: true }).stereoMode, 'tb');
  assert.equal(L.detectFormat('clip_3dv', { local: true }).stereoMode, 'tb');
  assert.equal(L.detectFormat('clip_3dh', { local: true }).stereoMode, 'sbs');
});

test('detectRes : hauteur de la vidéo d\'après le titre', () => {
  assert.equal(L.detectRes('Film 8K'), 3840); assert.equal(L.detectRes('Film 4K'), 2160); assert.equal(L.detectRes('Film 1080p'), 1080);
  assert.equal(L.detectRes('VR180_LR_5760p'), 5760); assert.equal(L.detectRes('Film 6K'), 2880);
});

test('parseRuntime : durées Stremio -> secondes', () => {
  assert.equal(L.parseRuntime('2h 5min'), 7500); assert.equal(L.parseRuntime('95 min'), 5700); assert.equal(L.parseRuntime('1h'), 3600);
  assert.equal(L.parseRuntime(''), 0); assert.equal(L.parseRuntime(undefined), 0);
});

test('liveGeom : l\'écran de chargement a la disposition du film', () => {
  assert.deepEqual(L.liveGeom('dome', 'sbs'), { eyeW: 1920, eyeH: 1920, stack: 'h' });
  assert.deepEqual(L.liveGeom('dome', 'tb'), { eyeW: 2880, eyeH: 1440, stack: 'v' });
  assert.deepEqual(L.liveGeom('flat', 'off'), { eyeW: 1920, eyeH: 1080, stack: '' });
});
