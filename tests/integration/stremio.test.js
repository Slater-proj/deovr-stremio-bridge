'use strict';
// Réglages du serveur Stremio : le profil torrent (champs « bt… » de /settings) est recopié dans /debug/perf (donc dans le rapport) et un plafond de débit bas est signalé.
// Les noms exacts des champs ne sont pas vérifiés sur un vrai Stremio : sans champ « bt… », rien n'est signalé (test du bas).
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const { startMocks } = require('../helpers/mocks'), { startBridge } = require('../helpers/bridge');

let mocks, bridge;
before(async () => {
  mocks = await startMocks({ film: Buffer.alloc(1024), settings: { btDownloadSpeedHardLimit: 3670016, btMaxConnections: 35, btProfile: 'default', btNested: { x: 1 } } });
  bridge = await startBridge(mocks);
});
after(async () => { await bridge.stop(); await mocks.close(); });

test('profil torrent de Stremio : recopié dans /debug/perf, plafond de débit bas signalé', { timeout: 30000 }, async () => {
  const perf = await bridge.waitFor(async () => { const p = await bridge.json('/debug/perf'); return p.cacheStremio && p.cacheStremio.lu && p; }, 15000);
  assert.deepEqual(perf.cacheStremio.torrent, { btDownloadSpeedHardLimit: 3670016, btMaxConnections: 35, btProfile: 'default' });
  assert.ok(perf.cacheStremio.avertissements.some(m => /limite le débit des torrents à 3,7 Mo\/s/.test(m)), perf.cacheStremio.avertissements.join(' | '));
  assert.match(bridge.out(), /Stremio limite le débit des torrents/);
});

test('sans champ « bt… » dans /settings : aucun avertissement de profil', { timeout: 30000 }, async () => {
  const m2 = await startMocks({ film: Buffer.alloc(1024) }), b2 = await startBridge(m2);
  try {
    const perf = await b2.waitFor(async () => { const p = await b2.json('/debug/perf'); return p.cacheStremio && p.cacheStremio.lu && p; }, 15000);
    assert.equal(perf.cacheStremio.torrent, null);
    assert.ok(!perf.cacheStremio.avertissements.some(m => /profil torrent/.test(m)));
  } finally { await b2.stop(); await m2.close(); }
});
