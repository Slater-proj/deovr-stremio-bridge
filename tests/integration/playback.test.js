'use strict';
const { test, before, after, describe } = require('node:test'), assert = require('node:assert/strict');
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const { startMocks, hashOf } = require('../helpers/mocks'), { startBridge, playHls, ffmpegAvailable, sleep } = require('../helpers/bridge'), { makeFilm } = require('../helpers/media');

const HAS_FFMPEG = ffmpegAvailable();
const filmUrl = async (bridge, n) => { const v = await bridge.json(`/video/movie/mk${n}.json`); assert.ok(v.encodings, JSON.stringify(v)); return v.encodings[0].videoSources[0].url; };
const sessions = async bridge => (await bridge.json('/debug/perf')).ecranChargement.sessions;
const downloads = async bridge => (await bridge.json('/debug/downloads')).enCours;
const sumExtinf = pl => [...pl.matchAll(/#EXTINF:([\d.]+)/g)].reduce((a, m) => a + +m[1], 0);

describe('lecture : clic -> écran de chargement -> film', { skip: !HAS_FFMPEG && 'ffmpeg absent' }, () => {
  let mocks, bridge, film;
  before(async () => { film = makeFilm(60); mocks = await startMocks({ film: film.data }); bridge = await startBridge(mocks, { diskCheckMs: 1000 }); });
  after(async () => { await bridge.stop(); await mocks.close(); });

  test('le clic lance le téléchargement, l\'écran de chargement bascule sur le film, « En cours » passe en tête', { timeout: 90000 }, async () => {
    const url = await filmUrl(bridge, 1);
    assert.match(url, /\/live\/\w{40}\/0\/index\.m3u8$/, 'film torrent => écran de chargement à chaque clic');
    assert.equal(mocks.created.size, 0);
    const r = await playHls(url, { seconds: 60 });
    assert.ok(r.loader >= 1, 'segments de chargement vus'); assert.ok(r.real >= 8, 'segments du film vus'); assert.ok(r.ended, 'ENDLIST');
    assert.match(r.lastPlaylist, /#EXT-X-DISCONTINUITY/);
    const parts = r.lastPlaylist.split('#EXT-X-DISCONTINUITY'), realSum = sumExtinf(parts.slice(1).join(''));
    assert.ok(Math.abs(realSum - 60) < 8, `durée du film conservée (attendu ~60 s, obtenu ${realSum.toFixed(1)} s, ${parts.length - 1} discontinuité(s))\n${r.lastPlaylist.slice(0, 1500)}`);
    assert.equal(mocks.created.has(hashOf(1)), true, 'torrent déclaré à Stremio au clic');
    const lib = await bridge.json('/deovr'), enCours = lib.scenes[0];
    assert.equal(enCours.name, 'En cours'); assert.match(enCours.list[0].title, /^\[(PRÊT|EN COURS)/);
    const d = (await downloads(bridge))[0]; assert.equal(d.actif, true); assert.ok(d.chronologie.some(l => /CLIC n°1/.test(l)));
  });

  test('HEAD ne démarre rien', async () => {
    const url = await filmUrl(bridge, 4); const before = mocks.created.size;
    const r = await fetch(url, { method: 'HEAD' }); assert.equal(r.status, 200);
    assert.equal(mocks.created.size, before);
  });

  test('film sans source (0 pair) : l\'écran de chargement reste affiché, jamais de faux film', { timeout: 40000 }, async () => {
    const url = await filmUrl(bridge, 3);
    const r = await playHls(url, { seconds: 10 });
    assert.ok(r.loader >= 2); assert.equal(r.real, 0); assert.ok(!r.ended);
    const d = (await downloads(bridge)).find(x => /Film 3 /.test(x.film)); assert.ok(d && /RECHERCHE|BLOQUÉ/.test(d.etat), d && d.etat);
  });

  test('texte de l\'écran de chargement bien dessiné (régression : le signe % rendait le texte invisible)', { timeout: 40000 }, async t => {
    if ((await bridge.json('/debug/perf')).ecranChargement.police !== 'oui') return t.skip('aucune police trouvée sur cette machine');
    const url = await filmUrl(bridge, 3), base = url.replace('index.m3u8', '');
    await fetch(url); const seg = Buffer.from(await (await fetch(base + 'w0_0.ts')).arrayBuffer());
    const f = path.join(os.tmpdir(), 'loader-test.ts'); fs.writeFileSync(f, seg);
    const r = cp.spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-vf', 'crop=iw:ih*0.5:0:0,signalstats,metadata=print:key=lavfi.signalstats.YMAX', '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8' });
    const ymax = +(/YMAX=(\d+)/.exec(r.stderr) || [])[1]; assert.ok(ymax > 200, `texte blanc attendu dans la moitié haute (YMAX=${ymax})`);
  });

  test('tests de bascule 5 et 6 (sans torrent)', { timeout: 120000 }, async () => {
    // deux sessions indépendantes (une par type) : on les joue en parallèle, sans attente entre les deux
    await Promise.all(['flat', 'sbs'].map(async kind => {
      const r = await playHls(`${bridge.base}/test/switch/${kind}/index.m3u8`, { seconds: 40 });
      assert.ok(r.loader >= 3, `${kind}: chargement`); assert.ok(r.real >= 2, `${kind}: film`); assert.ok(r.ended, `${kind}: ENDLIST`);
    }));
  });
});

describe('fiabilité', { skip: !HAS_FFMPEG && 'ffmpeg absent' }, () => {
  test('ffmpeg tué en plein film : relancé à la bonne position, le film arrive jusqu\'au bout', { timeout: 120000 }, async () => {
    const film = makeFilm(60, '3M'), mocks = await startMocks({ film: film.data, fastSpeed: 1.2e6 }), bridge = await startBridge(mocks);
    try {
      const url = await filmUrl(bridge, 1);
      const play = playHls(url, { seconds: 100 });
      const s = await bridge.waitFor(async () => (await sessions(bridge)).find(x => x.segmentsReels >= 2 && x.ffmpegPid), 40000);
      process.kill(s.ffmpegPid, 'SIGKILL');
      const r = await play;
      assert.ok(r.ended, 'la lecture va jusqu\'à ENDLIST malgré le plantage');
      const real = r.lastPlaylist.split('#EXT-X-DISCONTINUITY').slice(1).join('');
      assert.ok(Math.abs(sumExtinf(real) - 60) < 14, `durée totale ~60 s (obtenu ${sumExtinf(real)})`);
      assert.ok((r.lastPlaylist.match(/#EXT-X-DISCONTINUITY/g) || []).length >= 2, 'discontinuité signalée à la reprise');
      assert.ok((await sessions(bridge))[0].relances >= 1);
    } finally { await bridge.stop(); await mocks.close(); }
  });

  test('disque presque plein : les segments déjà vus sont supprimés (playlist élaguée, numérotation HLS correcte)', { timeout: 90000 }, async () => {
    const film = makeFilm(90), mocks = await startMocks({ film: film.data }), bridge = await startBridge(mocks, { minFreeGB: 1e6, trimKeepSec: 12, diskCheckMs: 500 });
    try {
      const url = await filmUrl(bridge, 1), base = url.replace('index.m3u8', '');
      const r = await playHls(url, { seconds: 45 });
      await sleep(3000);
      const pl = await (await fetch(url)).text();
      const seq = +/#EXT-X-MEDIA-SEQUENCE:(\d+)/.exec(pl)[1];
      assert.ok(seq > 0, 'MEDIA-SEQUENCE avancé après élagage'); assert.match(pl, /#EXT-X-DISCONTINUITY-SEQUENCE:\d+/);
      assert.equal((await fetch(base + 'real/seg00000.ts')).status, 404, 'le plus ancien segment est supprimé');
      assert.ok((await sessions(bridge))[0].segmentsSupprimes > 0);
      assert.ok(r.real > 5);
    } finally { await bridge.stop(); await mocks.close(); }
  });

  test('cache Stremio trop petit : un seul film actif à la fois', { timeout: 90000 }, async () => {
    const film = makeFilm(30, '2M'), mocks = await startMocks({ film: film.data, cacheSize: Math.round(film.data.length * 1.5), fastSpeed: 3e6 }), bridge = await startBridge(mocks);
    try {
      await bridge.waitFor(async () => (await bridge.json('/debug/perf')).cacheStremio.lu, 15000);
      const u1 = await filmUrl(bridge, 1), u4 = await filmUrl(bridge, 4);
      await fetch(u1); await bridge.waitFor(async () => (await downloads(bridge)).some(d => d.pairs > 0), 15000); await sleep(2500);
      await fetch(u4); await sleep(1500);
      const d = await downloads(bridge), paused = d.filter(x => !x.actif);
      assert.equal(d.filter(x => x.actif).length, 1, JSON.stringify(d.map(x => [x.film, x.actif])));
      assert.match(paused[0].arret || paused[0].chronologie.join('|'), /cache Stremio/);
      assert.ok((await bridge.json('/debug/perf')).cacheStremio.avertissements.length > 0);
    } finally { await bridge.stop(); await mocks.close(); }
  });

  test('Stremio arrêté : message explicite, puis retour à la normale', { timeout: 60000 }, async () => {
    const mocks = await startMocks({ film: Buffer.alloc(1024) }), bridge = await startBridge(mocks, { stremioPingMs: 500 });
    try {
      mocks.state.stremioUp = false;
      await bridge.waitFor(async () => (await bridge.json('/debug/perf')).stremioArrete, 15000);
      const lib = await bridge.json('/deovr'); assert.match(lib.scenes[0].list[0].title, /Stremio ne répond pas/);
      mocks.state.stremioUp = true;
      await bridge.waitFor(async () => !(await bridge.json('/debug/perf')).stremioArrete, 15000);
    } finally { await bridge.stop(); await mocks.close(); }
  });
});

const HAS_X265 = HAS_FFMPEG && (() => { try { return /libx265/.test(cp.spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout); } catch { return false; } })();
describe('film HEVC : le lecteur DeoVR ne décode pas le HEVC dans un flux HLS', { skip: !HAS_X265 && 'ffmpeg sans libx265' }, () => {
  let mocks, bridge;
  before(async () => { mocks = await startMocks({ film: makeFilm(40, '', 'hevc').data }); bridge = await startBridge(mocks, {}); });
  after(async () => { await bridge.stop(); await mocks.close(); });

  test('chargement H.264 -> « PRÊT, relancez » -> la fiche propose ensuite le fichier direct (jamais de HEVC dans la playlist)', { timeout: 120000 }, async () => {
    const url = await filmUrl(bridge, 1);
    assert.match(url, /\/live\/\w{40}\/0\/index\.m3u8$/, 'premier clic : écran de chargement');
    assert.match((await (await fetch(url)).text()), /w0_0\.ts/);
    const ready = await bridge.waitFor(async () => { const x = (await sessions(bridge))[0]; return x && x.filmPret && x; }, 60000, 500);
    assert.ok(ready, 'film HEVC prêt');
    const pl = await (await fetch(url)).text();
    assert.ok(!/real\//.test(pl) && !/DISCONTINUITY/.test(pl) && !/ENDLIST/.test(pl), 'aucun segment HEVC dans le flux HLS :\n' + pl);
    const before = (pl.match(/#EXTINF/g) || []).length; await sleep(4500);
    assert.ok(((await (await fetch(url)).text()).match(/#EXTINF/g) || []).length >= before, 'l\'écran de chargement continue (message « relancez »)');
    const direct = await filmUrl(bridge, 1);
    assert.match(direct, /\/torrent\/\w{40}\/0\/video\.mp4/, 'la fiche rafraîchie propose le fichier direct');
    const r = await fetch(direct, { headers: { range: 'bytes=0-1023' } }); assert.equal(r.status, 206); assert.equal((await r.arrayBuffer()).byteLength, 1024);
    assert.match(JSON.stringify(await bridge.json('/debug/live')), /hevc/i, 'codec HEVC mesuré par ffmpeg');
  });
});
