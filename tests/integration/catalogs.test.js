'use strict';
// Addon lent : son catalogue est ignoré au premier affichage puis rechargé en arrière-plan avec plus de patience.
// Régression (journaux du 02/10, catalogues TMDB) : la relance réutilisait l'échec mémorisé (60 s) et la quarantaine de l'hôte -> « toujours en échec » sans jamais réessayer.
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const { startMocks } = require('../helpers/mocks'), { startBridge } = require('../helpers/bridge');

let mocks, bridge;
before(async () => {
  mocks = await startMocks({ film: Buffer.alloc(1024), slowCatalogMs: 1500 });
  bridge = await startBridge(mocks, { catalogTimeoutMs: 700 });   // 700 ms au premier essai (trop court), 4 × 700 ms pour la relance patiente (assez)
});
after(async () => { await bridge.stop(); await mocks.close(); });

test('catalogue lent : ignoré au premier affichage, puis disponible grâce à la relance patiente', { timeout: 40000 }, async () => {
  const lib = await bridge.waitFor(async () => { const l = await bridge.json('/deovr'); return l.scenes && l.scenes.some(s => s.name === 'Lent VR') && l; }, 20000);
  assert.ok(lib.scenes.find(s => s.name === 'Lent VR').list.length > 0);
  assert.match(bridge.out(), /catalogue « Lent VR » : chargé \(addon lent\)/);
  assert.doesNotMatch(bridge.out(), /catalogue « Lent VR » : toujours en échec/);
});
