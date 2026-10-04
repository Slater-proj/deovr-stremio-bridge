'use strict';
// Rejeu de séquences réelles (agents utilisateurs et enchaînements relevés dans les journaux des tests casque) + endurance : le pont ne renvoie jamais d'erreur 5xx
// inattendue, détecte les relances de DeoVR et ne grossit pas en mémoire.
const { test, describe, before, after } = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { startMocks, hashOf } = require('../helpers/mocks'), { startBridge, sleep } = require('../helpers/bridge');

const HMD = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/40.0.2214.111 Chrome/40.0.2214.111 Safari/537.36 HMD/0 HMDN/pimax dream air [DEO15.9.3915]/steam';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36';
const NSP = 'NSPlayer/12.00.26100.9549 WMFSDK/12.00.26100.9549';

describe('rejeu : saut sans réponse puis relance de DeoVR (séquence du 03/10)', () => {
  let mocks, bridge;
  before(async () => { mocks = await startMocks({ film: Buffer.alloc(3e6, 9), holeDelayMs: 6000 }); bridge = await startBridge(mocks, { seekGuardSec: 1, seekGuardMB: 0.1, seekPrefetchMB: 1 }); });
  after(async () => { await bridge.stop(); await mocks.close(); });

  test('lecture, saut dans une zone non reçue (503), puis 2 × /deovr + / de la fenêtre web : relance détectée, journalisée avec l\'état du PC ; aucune erreur 5xx inattendue', { timeout: 60000 }, async () => {
    const codes = [], get = async (p, ua, init = {}) => { const r = await fetch(bridge.base + p, { ...init, headers: { 'user-agent': ua, ...(init.headers || {}) } }); codes.push([p, r.status]); return r; };
    const lib = await (await get('/deovr', HMD)).json(); assert.ok(lib.scenes.length > 3);
    for (let i = 1; i <= 6; i++) await (await get(`/video/slot/${i}.json`, HMD)).text();   // DeoVR lit toutes les fiches de la liste
    const film = await (await get('/video/movie/mk1.json', HMD)).json(); assert.ok(film.encodings);
    const media = `/torrent/${hashOf(1)}/0/video.mp4`;
    assert.equal((await get(media, HMD, { method: 'HEAD' })).status, 200);
    const r0 = await get(media, NSP, { headers: { range: 'bytes=0-399999' } }), rd = r0.body.getReader(); let got = 0; while (got < 400000) { const { value, done } = await rd.read(); if (done) break; got += value.length; } await rd.cancel();
    const seek = await get(media, NSP, { headers: { range: 'bytes=2000000-' } }); assert.equal(seek.status, 503, 'saut sans réponse : refus rapide plutôt que gel');
    await sleep(300);
    // la relance : 2 demandes /deovr du casque rapprochées + la fenêtre web demande /
    await get('/deovr', HMD); await get('/deovr', HMD); const web = await get('/', WIN, { headers: { accept: 'text/html,application/xhtml+xml' } });
    assert.equal(web.status, 200); assert.match(await web.text(), /Pont DeoVR/);
    const perf = await (await get('/debug/perf', WIN)).json(); assert.equal(perf.relancesDeoVR.length, 1, JSON.stringify(perf.relancesDeoVR));
    const rl = perf.relancesDeoVR[0]; assert.ok(rl.derniereRequeteLecteur_ilYa_s <= 5 && /torrent/.test(rl.chemin) && rl.range === 'bytes=2000000-', JSON.stringify(rl)); assert.ok(rl.systeme.ramLibre_Go > 0 && rl.systeme.deovr === 'DEO15.9.3915', JSON.stringify(rl.systeme));
    assert.match(bridge.out(), /relancé juste après une lecture/);
    const ev = fs.readFileSync(path.join(bridge.dataDir, 'bridge-events.log'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); for (const t of ['demarrage-pont', 'saut-refuse', 'relance-deovr', 'lecteur']) assert.ok(ev.some(e => e.type === t), t + ' : ' + ev.map(e => e.type).join(','));
    assert.deepEqual(codes.filter(([p, s]) => s >= 500 && !(p === media && s === 503)), [], 'aucune erreur 5xx inattendue');
  });
});

describe('endurance : beaucoup d\'affichages de la liste, de fiches et de pages sans erreur ni fuite de mémoire', () => {
  let mocks, bridge;
  before(async () => { mocks = await startMocks({ film: Buffer.alloc(2e6, 3) }); bridge = await startBridge(mocks); });
  after(async () => { await bridge.stop(); await mocks.close(); });
  test('300 cycles (liste, fiches, état, voyants, page web) : aucun 5xx, mémoire stable', { timeout: 120000 }, async () => {
    const mem = async () => (await bridge.json('/debug/perf')).memoire.rssMo, m0 = await mem(), bad = [];
    const one = async i => {
      const lib = await bridge.json('/deovr', { headers: { 'user-agent': HMD } }), tab = lib.scenes.find(s => /Top VR/.test(s.name));
      const paths = [...(tab ? tab.list.slice(0, 4).map(x => new URL(x.video_url).pathname) : []), '/status.json', '/check.json', '/ui', '/debug/downloads', `/video/slot/${1 + (i % 6)}.json`];
      for (const p of paths) { const r = await fetch(bridge.base + p, { headers: { 'user-agent': HMD } }); await r.arrayBuffer(); if (r.status >= 500) bad.push([p, r.status]); }
      if (i % 25 === 0) { const r = await fetch(`${bridge.base}/torrent/${hashOf(1)}/0/video.mp4`, { headers: { range: 'bytes=0-65535', 'user-agent': NSP } }); await r.arrayBuffer(); if (r.status >= 500) bad.push(['torrent', r.status]); }
    };
    for (let b = 0; b < 300; b += 6) await Promise.all(Array.from({ length: 6 }, (_, k) => one(b + k)));
    assert.deepEqual(bad, [], 'aucune erreur 5xx'); const m1 = await mem(); assert.ok(m1 - m0 < 150, `mémoire : ${m0} Mo -> ${m1} Mo`);
  });
});
