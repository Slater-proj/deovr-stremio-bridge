'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const L = require('../helpers/env');

test('redact : les URL d\'addon (qui contiennent des identifiants) ne sortent jamais en clair', () => {
  const r = L.redact('https://addon.example.com/secrettoken123/manifest.json');
  assert.ok(!r.includes('secrettoken123')); assert.ok(r.length > 0);
});

test('b64u + thumbUrl', () => {
  assert.equal(Buffer.from(L.b64u('http://x/p.jpg'), 'base64url').toString(), 'http://x/p.jpg');
  assert.equal(L.thumbUrl('http://b', ''), '');
});

test('wrapTxt coupe les lignes sans perdre de mots', () => {
  const t = 'un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize dix-sept';
  const lines = L.wrapTxt(t, 30); assert.ok(lines.length > 1); assert.ok(lines.every(l => l.length <= 30));
  assert.equal(lines.join(' '), t);
});

test('torrentQuery : sources de l\'addon + trackers publics', () => {
  const q = L.torrentQuery({ infoHash: 'a'.repeat(40), sources: ['tracker:udp://t.example:1337'] });
  assert.ok(q.includes('tr=') || q.includes('tracker'), q);
});

test('config.example.json : JSON valide, valeurs factices, chaque clé est connue du pont', () => {
  const ex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'bridge', 'config.example.json'), 'utf8'));
  assert.match(ex.email, /exemple|example/); assert.match(ex.password, /mot-de-passe|password/);
  const known = Object.keys(L.cfg);
  const aliases = new Set(['email', 'password', 'authKey', 'port', 'dnsMode', 'scanTimeoutMs']);
  for (const k of Object.keys(ex)) assert.ok(known.includes(k) || aliases.has(k), `clé de config.example.json inconnue du pont : ${k}`);
});

test('la version du pont = celle de package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  assert.equal(pkg.version, L.VERSION.split('.').length === 2 ? L.VERSION + '.0' : L.VERSION);
});
