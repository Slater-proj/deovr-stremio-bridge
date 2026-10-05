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

test('config.example.json : JSON valide, aucun identifiant, chaque clé est connue du pont', () => {
  const ex = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'bridge', 'config.example.json'), 'utf8'));
  for (const k of ['email', 'password', 'authKey']) assert.ok(!(k in ex), `config.example.json ne doit pas contenir ${k} (connexion via /setup)`);
  const known = Object.keys(L.cfg);
  const aliases = new Set(['email', 'password', 'authKey', 'port', 'dnsMode', 'scanTimeoutMs']);
  for (const k of Object.keys(ex)) assert.ok(known.includes(k) || aliases.has(k), `clé de config.example.json inconnue du pont : ${k}`);
});

test('la version du pont = celle de package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  assert.equal(pkg.version, L.VERSION.split('.').length === 2 ? L.VERSION + '.0' : L.VERSION);
});

test('config.json créé au premier lancement : clés connues, port 4477, aucun identifiant', () => {
  const S = require('../../bridge/settings'), known = Object.keys(L.cfg);
  assert.equal(S.DEFAULTS.port, 4477);
  for (const k of Object.keys(S.DEFAULTS)) assert.ok(k === '_aide' || known.includes(k), `réglage inconnu du pont : ${k}`);
  for (const k of ['email', 'password', 'authKey']) assert.ok(!(k in S.DEFAULTS), k);
  const f = path.join(require('os').tmpdir(), `settings-${process.pid}.json`); fs.rmSync(f, { force: true });
  assert.equal(S.ensure(f), 'cree'); assert.equal(S.ensure(f), 'existe'); assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).port, 4477); fs.rmSync(f, { force: true });
  fs.writeFileSync(f, '{"port":9}'); assert.equal(S.ensure(f), 'existe'); assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).port, 9, 'un fichier existant n\'est jamais écrasé'); fs.rmSync(f, { force: true });
});

test('mémoire : les données périmées sont oubliées (le pont peut tourner des jours), celles du moment sont gardées', () => {
  const now = Date.now();
  L.cache.set('vieux', { t: now - 7 * 3600000, v: 1 }); L.cache.set('frais', { t: now, v: 2 });
  L.clickDead.set('vieux-film', now - 3 * 3600000); L.clickDead.set('film-du-jour', now);
  L.healthMemo.set('vieux:0', { t: now - 2 * 3600000, level: 1 });
  L.pruneMemory(now);
  assert.ok(!L.cache.has('vieux') && L.cache.has('frais'));
  assert.ok(!L.clickDead.has('vieux-film') && L.clickDead.has('film-du-jour'));
  assert.ok(!L.healthMemo.has('vieux:0'));
  L.cache.delete('frais'); L.clickDead.delete('film-du-jour');
});

test('hostAllowed (anti DNS rebinding) : localhost, IP et noms du réseau local acceptés ; un nom de domaine extérieur refusé', () => {
  for (const h of ['localhost:4477', '127.0.0.1:4477', '192.168.1.131:4477', '[::1]:4477', 'monpc:4477', 'monpc.local:4477', 'pc.home.arpa', undefined]) assert.ok(L.hostAllowed(h), String(h));
  for (const h of ['evil.example.com:4477', 'rebind.attaquant.net', '127.0.0.1.nip.io:4477']) assert.ok(!L.hostAllowed(h), h);
});

test('vignettes : badge et avancement passent dans l\'URL ; paramètres reçus assainis (ASCII sûr, avancement arrondi à 10 %)', () => {
  assert.equal(L.thumbUrl('http://b', ''), '');
  assert.equal(L.thumbUrl('http://b', 'not-a-url'), 'not-a-url');
  const u = L.thumbUrl('http://b', 'http://x/p.jpg', { badge: '8K VR180 S34', prog: 40 });
  if (u.startsWith('http://b/thumb/')) assert.match(u, /\.jpg\?b=8K%20VR180%20S34&p=40$/);   // sans ffmpeg, l'URL d'origine est rendue telle quelle
  const sp = q => new URLSearchParams(q);
  assert.deepEqual(L.cleanOv(sp('b=8K%20VR180%20S34&p=43')), { badge: '8K VR180 S34', prog: 40 });
  assert.deepEqual(L.cleanOv(sp('b=%27%3B%3Cscript%3E%25x%60&p=250')), { badge: 'script%x', prog: 100 });
  assert.deepEqual(L.cleanOv(sp('')), { badge: '', prog: null });
  assert.equal(L.cleanOv(sp('b=' + 'A'.repeat(100))).badge.length, 40);
});

test('badge de vignette : seeders par paliers (un nombre exact relancerait ffmpeg à chaque variation) ; résolution et format dans le badge', () => {
  assert.deepEqual([0, 1, 2, 3, 9, 10, 29, 30, 99, 100, 500].map(L.seedBucket), ['S0', 'S1', 'S2', 'S3+', 'S3+', 'S10+', 'S10+', 'S30+', 'S30+', 'S100+', 'S100+']);
  L.catalogMetas.set('bd-1', { id: 'bd-1', name: 'Scene VR180 SBS 8K' });
  L.filmHealth.set('bd-1', { level: 3, seeders: 34, res: 3840, t: Date.now() }); const a = L.badgeText({ id: 'bd-1', name: 'Scene VR180 SBS 8K' });
  L.filmHealth.set('bd-1', { level: 3, seeders: 37, res: 3840, t: Date.now() }); assert.equal(L.badgeText({ id: 'bd-1', name: 'Scene VR180 SBS 8K' }), a, 'même badge pour 34 et 37 seeders');
  assert.match(a, /^8K VR180 S30\+$/);
});

test('plage horaire de la file de téléchargement : vide = toujours ; plage de nuit franchissant minuit', () => {
  const was = L.cfg.queueHours, at = (h, m) => new Date(2026, 9, 4, h, m);
  try {
    L.cfg.queueHours = ''; assert.equal(L.inQueueHours(at(12, 0)), true);
    L.cfg.queueHours = '23:00-07:00'; assert.deepEqual([at(23, 30), at(2, 0), at(6, 59), at(7, 0), at(12, 0), at(22, 59)].map(d => L.inQueueHours(d)), [true, true, true, false, false, false]);
    L.cfg.queueHours = '09:00-17:00'; assert.deepEqual([at(9, 0), at(12, 0), at(17, 0), at(8, 59)].map(d => L.inQueueHours(d)), [true, true, false, false]);
  } finally { L.cfg.queueHours = was; }
});

test('titres lisibles dans DeoVR : listes de mots-clés et d\'appareils retirées, studio et titre gardés', () => {
  const c = L.cleanTitle;
  assert.equal(c('[Studio A] Un titre - Sous-titre (99352) [2026-09-25, Mot1, Mot2, Mot3, Mot4, Mot5,'), '[Studio A] Un titre - Sous-titre (99352)', 'groupe tronqué par l\'addon');
  assert.equal(c('[Studio B / Site.com] Autre titre (Episode 1) [2026 г., A, B, C, VR, 60 FPS, 180°, 6K, 3072p] [Oculus Rift / Vive]'), '[Studio B / Site.com] Autre titre (Episode 1)');
  assert.equal(c('Avatar (2009)'), 'Avatar (2009)'); assert.equal(c('Film 1 8K 3840p'), 'Film 1 8K 3840p');
  assert.equal(c('Titre [4K] suite'), 'Titre [4K] suite', 'un court groupe sans virgules reste');
  assert.equal(c('[Studio seul]'), '[Studio seul]', 'le tout premier groupe (le studio) n\'est jamais retiré');
  assert.equal(c('[a, b, c, d]'), '[a, b, c, d]', 'jamais un titre vidé');
  assert.equal(c(''), ''); assert.equal(c(null), '');
});
