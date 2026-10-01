'use strict';
// Lance le vrai pont (node bridge/server.js) dans un dossier de données temporaire, branché sur les faux services.
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const root = path.join(__dirname, '..', '..');

const freePort = () => new Promise(ok => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ffmpegAvailable = () => { try { return cp.spawnSync('ffmpeg', ['-version']).status === 0; } catch { return false; } };

async function startBridge(mocks, config = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-test-')), port = await freePort();
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ firstWaitMs: 1500, scanConcurrency: 3, ...config }));
  let out = '';
  const proc = cp.spawn(process.execPath, [path.join(root, 'bridge', 'server.js')], {
    env: { ...process.env, PORT: String(port), BRIDGE_DATA_DIR: dataDir, ADDON_URLS: mocks.addonUrl, LOCAL_STREMIO: mocks.stremioUrl, SCRAPE_TRACKERS: mocks.trackerHostPort, DNS_MODE: 'system', DEBUG: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => out += d);
  const t0 = Date.now(); while (!/Bridge prêt/.test(out)) { if (proc.exitCode !== null || Date.now() - t0 > 20000) throw new Error('le pont ne démarre pas :\n' + out.slice(-1500)); await sleep(100); }
  const base = `http://127.0.0.1:${port}`;
  const api = {
    base, port, dataDir, proc, out: () => out,
    json: async (p, init) => { const r = await fetch(base + p, init); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } },
    get: (p, init) => fetch(base + p, init),
    async waitFor(fn, ms = 20000, every = 300) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('délai dépassé'); await sleep(every); } },
    async stop() { proc.kill(); await new Promise(ok => { proc.once('exit', ok); setTimeout(ok, 2000); }); try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {} },
  };
  return api;
}

// Un « lecteur » HLS minimal : relit la playlist, télécharge les segments, signale la bascule chargement -> film.
async function playHls(url, { seconds = 40, stopAfterReal = Infinity } = {}) {
  const base = url.replace(/index\.m3u8.*/, ''), got = new Set(), t0 = Date.now(), r = { loader: 0, real: 0, realFirstAt: null, ended: false, playlists: [], lastPlaylist: '' };
  while (Date.now() - t0 < seconds * 1000) {
    const pl = await (await fetch(url)).text(); r.lastPlaylist = pl; r.playlists.push(pl);
    const segs = pl.split('\n').filter(l => l && !l.startsWith('#'));
    for (const s of segs) {
      if (got.has(s)) continue; const resp = await fetch(base + s); await resp.arrayBuffer(); if (!resp.ok) continue; got.add(s);
      if (s.startsWith('real/')) { r.real++; if (r.realFirstAt === null) r.realFirstAt = (Date.now() - t0) / 1000; } else r.loader++;
      if (r.real >= stopAfterReal) return r;
    }
    if (/ENDLIST/.test(pl) && segs.every(s => got.has(s))) { r.ended = true; break; }
    await sleep(700);
  }
  return r;
}
module.exports = { startBridge, playHls, ffmpegAvailable, freePort, sleep };
