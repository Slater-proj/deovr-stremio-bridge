'use strict';
// Pages locales (/settings, /check) et onglet « Outils » de DeoVR.
const { test, before, after, describe } = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), http = require('http');
const { startMocks } = require('../helpers/mocks'), { startBridge, ffmpegAvailable } = require('../helpers/bridge');
const HAS_FFMPEG = ffmpegAvailable();
const NSP = 'NSPlayer/12.00.26100.9549 WMFSDK/12.00.26100.9549';

const rawGet = (port, p, host, method = 'GET', body) => new Promise((ok, no) => { const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { host, ...(body ? { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(body) } : {}) } }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => ok({ status: res.statusCode, text: b })); }); r.on('error', no); if (body) r.write(body); r.end(); });
const form = o => new URLSearchParams(o).toString();

describe('/settings : réglages sans éditer le JSON', () => {
  let mocks, bridge;
  before(async () => { mocks = await startMocks({ film: Buffer.alloc(1024) }); bridge = await startBridge(mocks); });
  after(async () => { await bridge.stop(); await mocks.close(); });
  const cfgFile = () => JSON.parse(fs.readFileSync(path.join(bridge.dataDir, 'config.json'), 'utf8'));
  const token = async () => /name="t" value="([0-9a-f]+)"/.exec((await bridge.get('/settings').then(r => r.text())))[1];

  test('réservée au PC : un Host qui n\'est pas localhost est refusé ; le formulaire contient les valeurs actuelles', async () => {
    assert.equal((await rawGet(bridge.port, '/settings', '192.168.1.50:4477')).status, 403);
    const r = await bridge.get('/settings'); assert.equal(r.status, 200); const t = await r.text();
    assert.match(t, /name="f_maxDownloads" value="3"/); assert.match(t, /<option selected>free<\/option>|<option selected>auto<\/option>/); assert.ok(!/authKey|password/i.test(t.replace(/mot de passe/gi, '')), 'aucun secret');
  });

  test('sans jeton : refus ; valeurs invalides : rien n\'est écrit ; expression de catalogue invalide refusée', async () => {
    const before = fs.readFileSync(path.join(bridge.dataDir, 'config.json'), 'utf8');
    assert.equal((await bridge.get('/settings', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ f_maxDownloads: '2' }) })).status, 403);
    const t = await token();
    for (const bad of [{ f_maxDownloads: '99' }, { f_maxDownloads: 'abc' }, { f_formatMenu: 'nimporte' }, { f_catalogExclude: '(' }, { f_loaderTextScale: '9' }]) {
      const r = await bridge.get('/settings', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ t, ...bad }) }); const x = await r.text();
      assert.match(x, /Rien n'a été enregistré/, JSON.stringify(bad));
    }
    assert.equal(fs.readFileSync(path.join(bridge.dataDir, 'config.json'), 'utf8'), before, 'config.json intact');
  });

  test('enregistrement : seules les valeurs changées sont écrites, le reste est conservé ; appliqué tout de suite (hot) ou après redémarrage', async () => {
    const t = await token(), keep = cfgFile();
    const r = await bridge.get('/settings', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ t, f_maxDownloads: '2', f_formatMenu: 'auto', f_sampleMode: '1', p_sampleMode: '1', f_port: '4999', f_localDirs: 'D:\\VR\n\n  E:\\Films  ', f_loaderTextScale: '1,3' }) });
    const x = await r.text(); assert.match(x, /Enregistré/); assert.match(x, /Appliqué tout de suite/); assert.match(x, /Après redémarrage du pont : .*Port/);
    const c = cfgFile(); assert.equal(c.maxDownloads, 2); assert.equal(c.formatMenu, 'auto'); assert.equal(c.sampleMode, true); assert.equal(c.port, 4999); assert.deepEqual(c.localDirs, ['D:\\VR', 'E:\\Films']); assert.equal(c.loaderTextScale, 1.3);
    for (const k of Object.keys(keep)) if (!['maxDownloads', 'formatMenu'].includes(k)) assert.deepEqual(c[k], keep[k], k + ' conservé');
    const live = (await bridge.json('/debug')).config; assert.equal(live.maxDownloads, 2); assert.equal(live.sampleMode, true); assert.equal(live.formatMenu, 'auto'); assert.notEqual(live.port, 4999, 'le port ne change qu\'au redémarrage');
  });

  test('un envoi partiel ne décoche rien (cases sans marqueur de présence = inchangées)', async () => {
    const t = await token(), before = (await bridge.json('/debug')).config;
    await bridge.get('/settings', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ t, f_holdMinutes: '45' }) });
    const after = (await bridge.json('/debug')).config; assert.equal(after.holdMinutes, 45); assert.equal(after.vrOnly, before.vrOnly); assert.equal(after.sampleMode, before.sampleMode); assert.deepEqual(after.types, before.types);
  });
});

describe('/check : voyants', () => {
  let mocks, bridge;
  before(async () => { mocks = await startMocks({ film: Buffer.alloc(1024) }); bridge = await startBridge(mocks); });
  after(async () => { await bridge.stop(); await mocks.close(); });
  test('/check.json : Stremio, compte, ffmpeg, disque ; /check : page lisible', async () => {
    const list = await bridge.json('/check.json'); const by = Object.fromEntries(list.map(c => [c.id, c]));
    assert.equal(by.stremio.status, 'ok'); assert.equal(by.compte.status, 'ok'); assert.ok(by.disque && by.temp && by.reseau && by.deovr);
    assert.equal(by.reseau.status, 'ok', 'par défaut : ce PC seulement'); if (HAS_FFMPEG) assert.ok(['ok', 'warn'].includes(by.ffmpeg.status));
    const page = await bridge.get('/check').then(r => r.text()); assert.match(page, /Vérifications/); assert.match(page, /Stremio \(serveur de streaming\)/);
    await bridge.json('/deovr', { headers: { 'user-agent': 'Mozilla/5.0 Chromium/40 HMD/0 HMDN/test [DEO15.9.3915]/steam' } });
    assert.equal((await bridge.json('/check.json')).find(c => c.id === 'deovr').status, 'ok', 'DeoVR vu');
  });
});

describe('onglet Outils de DeoVR', { skip: !HAS_FFMPEG && 'ffmpeg absent' }, () => {
  let mocks, bridge;
  before(async () => { mocks = await startMocks({ film: Buffer.alloc(1024) }); bridge = await startBridge(mocks); });
  after(async () => { await bridge.stop(); await mocks.close(); });

  test('l\'onglet est avant « Test pont » ; la fiche d\'un outil ne fait RIEN (DeoVR lit toutes les fiches d\'une liste)', async () => {
    const lib = await bridge.json('/deovr'), names = lib.scenes.map(s => s.name); assert.ok(names.indexOf('Outils') > 0 && names.indexOf('Outils') < names.indexOf('Test pont'), names.join(','));
    const tools = lib.scenes.find(s => s.name === 'Outils'); assert.equal(tools.list.length, 6);
    for (const it of tools.list) { const v = await bridge.json(new URL(it.video_url).pathname); assert.match(v.encodings[0].videoSources[0].url, /\/tool\/\w+\/run\.mp4$/); }
    assert.ok(!/outil « /.test(bridge.out()), 'aucune action exécutée par les fiches');
  });

  test('l\'action n\'est exécutée que pour le lecteur vidéo de DeoVR (pas un navigateur) ; elle renvoie un clip avec le résultat', { timeout: 60000 }, async () => {
    const url = `${bridge.base}/tool/echantillon/run.mp4`;
    assert.equal((await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 Chrome/111' } })).status, 403);
    assert.equal((await fetch(url, { method: 'HEAD', headers: { 'user-agent': NSP } })).status, 200); assert.ok(!/outil « /.test(bridge.out()), 'HEAD ne déclenche rien');
    assert.equal((await bridge.json('/debug')).config.sampleMode, false);
    const r = await fetch(url, { headers: { 'user-agent': NSP, range: 'bytes=0-' } }); assert.ok([200, 206].includes(r.status)); assert.equal(r.headers.get('content-type'), 'video/mp4'); assert.ok((await r.arrayBuffer()).byteLength > 1000);
    assert.equal((await bridge.json('/debug')).config.sampleMode, true, 'mode échantillon activé'); assert.equal(JSON.parse(fs.readFileSync(path.join(bridge.dataDir, 'config.json'), 'utf8')).sampleMode, true, 'et enregistré');
    await fetch(url, { headers: { 'user-agent': NSP, range: 'bytes=0-' } }); assert.equal((await bridge.json('/debug')).config.sampleMode, true, 'redemandé aussitôt (plages du lecteur) : une seule exécution');
  });

  test('état, pause et rapport : le clip répond et l\'effet est réel (rapport-support.txt écrit)', { timeout: 90000 }, async () => {
    for (const k of ['etat', 'pause']) { const r = await fetch(`${bridge.base}/tool/${k}/run.mp4`, { headers: { 'user-agent': NSP } }); assert.equal(r.status, 200, k); await r.arrayBuffer(); }
    const r = await fetch(`${bridge.base}/tool/rapport/run.mp4`, { headers: { 'user-agent': NSP } }); assert.equal(r.status, 200); await r.arrayBuffer();
    const rep = path.join(bridge.dataDir, 'rapport-support.txt'); assert.ok(fs.existsSync(rep), 'rapport écrit'); assert.match(fs.readFileSync(rep, 'utf8'), /ÉVÉNEMENTS/);
  });
});

describe('/settings : jamais d\'injection de HTML', () => {
  let mocks, bridge;
  before(async () => { mocks = await startMocks({ film: Buffer.alloc(1024) }); bridge = await startBridge(mocks); });
  after(async () => { await bridge.stop(); await mocks.close(); });
  test('une valeur de texte contenant du HTML est affichée échappée', async () => {
    const t = /name="t" value="([0-9a-f]+)"/.exec(await bridge.get('/settings').then(r => r.text()))[1], evil = '"><script>alert(1)</script>';
    await bridge.get('/settings', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ t, f_catalogExclude: evil }) });
    const page = await bridge.get('/settings').then(r => r.text()); assert.ok(!page.includes('<script>alert(1)'), 'pas de balise injectée'); assert.ok(page.includes('&lt;script&gt;'), 'valeur affichée échappée');
  });
});
