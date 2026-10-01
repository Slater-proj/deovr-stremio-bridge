'use strict';
// Faux environnement : addon Stremio (catalogues + flux), faux serveur de streaming Stremio (create / stats.json / remove / lecture Range),
// faux tracker UDP (BEP 15). Ports aléatoires => les tests peuvent tourner en parallèle de n'importe quoi.
const http = require('http'), dgram = require('dgram'), crypto = require('crypto');

const hashOf = n => crypto.createHash('sha1').update('film' + n).digest('hex');
// comportement par film : n%4 == 1 rapide, 2 lent, 3 mort (aucune réponse, 0 pair), 0 rapide
const behaviourOf = n => ({ 1: 'fast', 2: 'slow', 3: 'dead', 0: 'fast' })[n % 4];

async function startMocks({ film, poster, cacheSize = 2147483648, filmSize, fastSpeed = 8e6, slowSpeed = 1.5e5 } = {}) {
  const SPEED = { fast: fastSpeed, slow: slowSpeed, dead: 0 };
  const SIZE = film.length, sockets = [];
  const created = new Map(), cached = new Map(), history = [];
  const state = { stremioUp: true, cacheSize };
  const behOfHash = h => { for (let n = 1; n <= 40; n++) if (hashOf(n) === h) return behaviourOf(n); return 'dead'; };

  // ---- addon ----
  const mani = { id: 'test.mock', version: '1.0.0', name: 'Mock', resources: ['catalog', 'stream', 'meta'], types: ['movie'], idPrefixes: ['mk'], catalogs: [
    { type: 'movie', id: 'vr', name: 'Top VR', extra: [{ name: 'skip' }, { name: 'search' }] },
    { type: 'movie', id: 'd3', name: 'Films 3D', extra: [{ name: 'search' }] },
    { type: 'movie', id: 'dr', name: 'Dramas' }] };
  let addonBase = '';
  const mk = (n, suffix) => ({ id: 'mk' + n, type: 'movie', name: `Film ${n} ${suffix}`, poster: poster ? `${addonBase}/poster.jpg` : undefined, runtime: '2 min', year: 2020 + (n % 6) });
  const catalogs = () => ({
    vr: [...Array(12)].map((_, i) => mk(i + 1, i % 3 === 0 ? '8K 3840p' : 'Les aventures de Zoe')),
    d3: [...Array(6)].map((_, i) => mk(i + 13, '3D SBS 4K')),
    dr: [...Array(6)].map((_, i) => mk(i + 19, 'Drame 1080p')) });
  const addon = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]), cat = catalogs(), all = Object.values(cat).flat();
    if (u === '/poster.jpg' && poster) { r.setHeader('content-type', 'image/jpeg'); return r.end(poster); }
    r.setHeader('content-type', 'application/json');
    if (u === '/manifest.json') return r.end(JSON.stringify(mani));
    let m = u.match(/^\/catalog\/movie\/(\w+)(?:\/(.*))?\.json$/);
    if (m) { let l = cat[m[1]] || []; const sr = /search=([^&]*)/.exec(m[2] || ''); if (sr) l = all.filter(x => x.name.toLowerCase().includes(sr[1].toLowerCase())); return r.end(JSON.stringify({ metas: l })); }
    if (u.startsWith('/meta/')) return r.end(JSON.stringify({ meta: all.find(x => u.includes(x.id + '.')) }));
    m = u.match(/\/stream\/movie\/mk(\d+)\.json/);
    if (m) { const n = +m[1]; return setTimeout(() => r.end(JSON.stringify({ streams: [{ name: 'Src', title: '1080p x264', infoHash: hashOf(n), fileIdx: 0, behaviorHints: { videoSize: filmSize || SIZE } }] })), 100); }
    r.statusCode = 404; r.end('{}');
  });
  await new Promise(ok => addon.listen(0, '127.0.0.1', ok)); sockets.push(addon);
  addonBase = `http://127.0.0.1:${addon.address().port}`;

  // ---- faux serveur Stremio ----
  const stremio = http.createServer((q, r) => {
    const u = q.url.split('?')[0]; history.push(`${q.method} ${u}${q.headers.range ? ' ' + q.headers.range : ''}`);
    if (!state.stremioUp) { q.socket.destroy(); return; }
    if (u === '/settings') { r.setHeader('content-type', 'application/json'); return r.end(JSON.stringify({ options: [], values: { cacheSize: state.cacheSize, cacheRoot: require('os').tmpdir() } })); }
    const cr = u.match(/^\/(\w{40})\/create$/);
    if (cr && q.method === 'POST') { q.resume(); q.on('end', () => { if (!created.has(cr[1])) created.set(cr[1], Date.now()); r.end('{}'); }); return; }
    if (u.endsWith('/remove')) { created.delete(u.split('/')[1]); return r.end('ok'); }
    const st = u.match(/^\/(\w{40})(?:\/-?\d+)?\/stats\.json$/);
    if (st) {
      const h = st[1], b = behOfHash(h), c = created.get(h); r.setHeader('content-type', 'application/json');
      if (!c) return r.end(JSON.stringify({ peers: 0, downloaded: 0, files: [] }));
      const el = Date.now() - c, meta = b !== 'dead' && el > 1500;
      return r.end(JSON.stringify({ peers: b === 'dead' ? 0 : (el > 1000 ? 6 : 0), unchoked: b === 'dead' ? 0 : 3, swarmConnections: b === 'dead' ? 0 : 6, swarmSize: 20, downloaded: cached.get(h) || 0, downloadSpeed: SPEED[b], streamLen: filmSize || SIZE, files: meta ? [{ name: 'film.mp4', length: filmSize || SIZE }] : [], sources: [] }));
    }
    const m = u.match(/^\/(\w{40})\/(-?\d+)$/);
    if (m) {
      const h = m[1], b = behOfHash(h);
      if (!created.has(h)) created.set(h, Date.now());
      if (b === 'dead') return;   // jamais de réponse
      const wait = Math.max(0, 1500 - (Date.now() - created.get(h)));
      setTimeout(() => {
        const rg = /bytes=(\d+)-(\d*)/.exec(q.headers.range || ''), s = rg ? +rg[1] : 0, e = rg && rg[2] ? Math.min(+rg[2], SIZE - 1) : SIZE - 1;
        if (s >= SIZE) { r.writeHead(416, { 'content-range': `bytes */${SIZE}` }); return r.end(); }
        r.writeHead(rg ? 206 : 200, { 'content-type': 'video/mp4', 'content-range': `bytes ${s}-${e}/${SIZE}`, 'content-length': e - s + 1, 'accept-ranges': 'bytes' });
        if (q.method === 'HEAD') return r.end();
        let pos = s, closed = false; r.on('close', () => { closed = true; });
        const tick = () => {
          if (closed || pos > e) { if (!closed) r.end(); return; }
          const fast = pos < (cached.get(h) || 0), n = Math.min(65536, e - pos + 1);
          r.write(film.subarray(pos, pos + n)); pos += n; if (pos > (cached.get(h) || 0)) cached.set(h, pos);
          setTimeout(tick, fast ? 0 : Math.max(1, Math.round(n / SPEED[b] * 1000)));
        };
        tick();
      }, wait);
      return;
    }
    r.statusCode = 404; r.end();
  });
  await new Promise(ok => stremio.listen(0, '127.0.0.1', ok)); sockets.push(stremio);

  // ---- faux tracker UDP (BEP 15) ----
  const udp = dgram.createSocket('udp4');
  const seeds = h => { for (let n = 1; n <= 40; n++) if (hashOf(n) === h) return behaviourOf(n) === 'dead' ? 0 : behaviourOf(n) === 'slow' ? 4 : 20 + n; return 0; };
  udp.on('message', (m, ri) => {
    const act = m.readUInt32BE(8);
    if (act === 0) { const o = Buffer.alloc(16); o.writeUInt32BE(0, 0); m.copy(o, 4, 12, 16); Buffer.from('1122334455667788', 'hex').copy(o, 8); udp.send(o, ri.port, ri.address); }
    else if (act === 2) {
      const n = (m.length - 16) / 20, o = Buffer.alloc(8 + 12 * n); o.writeUInt32BE(2, 0); m.copy(o, 4, 12, 16);
      for (let k = 0; k < n; k++) { const h = m.subarray(16 + k * 20, 36 + k * 20).toString('hex'); o.writeUInt32BE(seeds(h), 8 + k * 12); o.writeUInt32BE(50, 12 + k * 12); o.writeUInt32BE(1, 16 + k * 12); }
      udp.send(o, ri.port, ri.address);
    }
  });
  await new Promise(ok => udp.bind(0, '127.0.0.1', ok));

  return {
    addonUrl: `${addonBase}/manifest.json`, stremioUrl: `http://127.0.0.1:${stremio.address().port}`, trackerHostPort: `127.0.0.1:${udp.address().port}`,
    state, created, history, hashOf, SIZE,
    async close() { udp.close(); for (const s of sockets) { s.closeAllConnections && s.closeAllConnections(); await new Promise(ok => s.close(ok)); } },
  };
}
module.exports = { startMocks, hashOf, behaviourOf };
