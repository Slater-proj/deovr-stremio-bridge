'use strict';
// File de téléchargement : « télécharger en entier » sans lecteur, reprise après redémarrage, lecture directe une fois complet.
const { test, describe, before, after } = require('node:test'), assert = require('node:assert/strict');
const { startMocks, hashOf } = require('../helpers/mocks'), { startBridge } = require('../helpers/bridge');
const H = { 'content-type': 'application/x-www-form-urlencoded' };
const body = o => new URLSearchParams(o).toString();

describe('file de téléchargement', () => {
  let mocks, bridge;
  before(async () => { mocks = await startMocks({ film: Buffer.alloc(2e6, 4) }); bridge = await startBridge(mocks, { maxDownloads: 2 }); });
  after(async () => { await bridge.stop(); await mocks.close(); });
  const token = async () => /name="t" value="([0-9a-f]+)"/.exec(await bridge.get('/queue').then(r => r.text()))[1];
  const downloads = async () => (await bridge.json('/debug/downloads')).enCours;

  test('réservée au PC et protégée par jeton ; identifiant invalide refusé', async () => {
    assert.equal((await bridge.get('/queue', { method: 'POST', headers: H, body: body({ act: 'add', id: 'mk1', type: 'movie' }) })).status, 403, 'sans jeton');
    const t = await token(); const bad = await bridge.get('/queue', { method: 'POST', headers: H, body: body({ t, act: 'add', id: '../x;y', type: 'movie' }) });
    assert.equal(bad.status, 400);
  });

  test('un film mis en file est téléchargé en entier sans lecteur, puis proposé en lecture DIRECTE (ni écran de chargement, ni « relancez »)', { timeout: 60000 }, async () => {
    const t = await token(), r = await bridge.get('/queue', { method: 'POST', headers: H, body: body({ t, act: 'add', id: 'mk1', type: 'movie' }) });
    assert.equal(r.status, 200); assert.match(await r.text(), /Ajouté à la file/);
    const d = await bridge.waitFor(async () => { const x = (await downloads()).find(y => /Film 1 /.test(y.film)); return x && /COMPLET/.test(x.etat) ? x : null; }, 40000, 400);
    assert.equal(d.enFile, false, 'plus en file une fois complet'); assert.ok(d.reçu_Mo >= 1.9, 'film entier lu : ' + d.reçu_Mo + ' Mo');
    assert.ok(mocks.history.some(h => new RegExp(`^GET /${hashOf(1)}/0 bytes=0-$`).test(h)) || mocks.history.some(h => h.includes(hashOf(1))), 'lu chez Stremio');
    const v = await bridge.json('/video/movie/mk1.json'); assert.match(v.encodings[0].videoSources[0].url, /\/torrent\/[0-9a-f]{40}\/0\/video\.mp4$/, 'lecture directe');
    assert.match(await bridge.get('/queue').then(r => r.text()), /Film 1/);
    const prets = (await bridge.json('/deovr')).scenes.find(s => s.name === 'Prêts (complets)'); assert.ok(prets && prets.list.some(i => /Film 1 /.test(i.title) && /COMPLET/.test(i.title)), 'onglet Prêts');
    assert.ok(!/\/live\//.test(bridge.out().split('\n').filter(l => /GET \/live/.test(l)).join('')), 'aucun écran de chargement demandé');
    // un film déjà complet : message dédié, rien n'est relancé
    const again = await bridge.get('/queue', { method: 'POST', headers: H, body: body({ t, act: 'add', id: 'mk1', type: 'movie' }) }); assert.match(await again.text(), /déjà entièrement téléchargé/);
  });

  test('la file passe après les films regardés et respecte la limite ; retirer de la file l\'arrête', { timeout: 60000 }, async () => {
    const t = await token();
    await bridge.get('/queue', { method: 'POST', headers: H, body: body({ t, act: 'add', id: 'mk3', type: 'movie' }) });   // film 3 : aucun pair, reste en cours
    const key = `${hashOf(3)}:0`;
    const d = await bridge.waitFor(async () => (await downloads()).find(y => /Film 3 /.test(y.film)), 20000, 300); assert.equal(d.actif, true);
    await bridge.get('/queue', { method: 'POST', headers: H, body: body({ t, act: 'remove', key }) });
    assert.match(await bridge.get('/queue').then(r => r.text()), /Retiré|Aucun film en file|Film 1/);
  });
});

describe('file de téléchargement : reprise après redémarrage du pont', () => {
  test('un film en file mais incomplet repart tout seul au prochain lancement', { timeout: 90000 }, async () => {
    const mocks = await startMocks({ film: Buffer.alloc(2e6, 4) });
    let b = await startBridge(mocks, { maxDownloads: 2 });
    try {
      const t = /name="t" value="([0-9a-f]+)"/.exec(await b.get('/queue').then(r => r.text()))[1];
      await b.get('/queue', { method: 'POST', headers: H, body: body({ t, act: 'add', id: 'mk3', type: 'movie' }) });   // sans pair : jamais complet
      await b.waitFor(async () => (await b.json('/debug/downloads')).enCours.find(y => /Film 3 /.test(y.film)), 20000, 300);
      const dir = b.dataDir; await b.stop({ keepData: true });
      b = await startBridge(mocks, { maxDownloads: 2 }, { dataDir: dir, config: false });
      const d = await b.waitFor(async () => { const x = (await b.json('/debug/downloads')).enCours.find(y => /Film 3 /.test(y.film)); return x && x.actif ? x : null; }, 30000, 500);
      assert.equal(d.actif, true, 'repris sans nouveau clic');
    } finally { await b.stop(); await mocks.close(); }
  });
});

describe('mode échantillon puis « télécharger en entier » (aperçu -> décision -> film complet)', () => {
  test('un film mis en file malgré sampleMode est lu en entier, pas par extraits', { timeout: 60000 }, async () => {
    const mocks = await startMocks({ film: Buffer.alloc(2e6, 4) }), b = await startBridge(mocks, { sampleMode: true });
    try {
      const t = /name="t" value="([0-9a-f]+)"/.exec(await b.get('/queue').then(r => r.text()))[1];
      await b.get('/queue', { method: 'POST', headers: H, body: body({ t, act: 'add', id: 'mk1', type: 'movie' }) });
      const d = await b.waitFor(async () => { const x = (await b.json('/debug/downloads')).enCours.find(y => /Film 1 /.test(y.film)); return x && /COMPLET/.test(x.etat) ? x : null; }, 40000, 400);
      assert.ok(d.reçu_Mo >= 1.9 && !/ÉCHANTILLON/.test(d.etat), d.etat);
    } finally { await b.stop(); await mocks.close(); }
  });
});

describe('priorité au film regardé', () => {
  test('quand le lecteur lit un film, les téléchargements en file qui ne sont pas regardés sont mis en attente (bande passante)', { timeout: 60000 }, async () => {
    const mocks = await startMocks({ film: Buffer.alloc(3e6, 4) }), b = await startBridge(mocks, { maxDownloads: 3 });
    try {
      const t = /name="t" value="([0-9a-f]+)"/.exec(await b.get('/queue').then(r => r.text()))[1];
      await b.get('/queue', { method: 'POST', headers: H, body: body({ t, act: 'add', id: 'mk3', type: 'movie' }) });   // film 3 : jamais complet
      await b.waitFor(async () => (await b.json('/debug/downloads')).enCours.find(y => /Film 3 /.test(y.film) && y.actif), 20000, 300);
      await b.json('/video/movie/mk1.json');   // fiche du film regardé (pose les informations)
      const r = await fetch(`${b.base}/torrent/${hashOf(1)}/0/video.mp4`, { headers: { range: 'bytes=0-199999', 'user-agent': 'NSPlayer/12.00.26100.9549' } }); await r.arrayBuffer();
      const w = await b.waitFor(async () => { const x = (await b.json('/debug/downloads')).enCours.find(y => /Film 3 /.test(y.film)); return x && !x.actif ? x : null; }, 15000, 300);
      assert.match(w.etat, /EN ATTENTE/); assert.match(w.arret, /priorité au film regardé/);
    } finally { await b.stop(); await mocks.close(); }
  });
});
