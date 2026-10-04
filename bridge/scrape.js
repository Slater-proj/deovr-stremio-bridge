'use strict';
// Scrape des trackers UDP (BEP 15) : nombre de seeders SANS démarrer de torrent.
const dgram = require('dgram'), crypto = require('crypto');
module.exports = function createScrape({ cfg, log }) {
const scrapeStats = { asked: 0, answered: 0, lastOk: 0, per: {} };
function udpScrape(hostport, hashes, timeout = 4500) {
  return new Promise(resolve => {
    const i = hostport.lastIndexOf(':'), host = hostport.slice(0, i), port = +hostport.slice(i + 1);
    const sock = dgram.createSocket('udp4'), out = new Map(), tid = crypto.randomBytes(4); let stage = 0, done = false;
    const c = Buffer.alloc(16); c.writeUInt32BE(0x417, 0); c.writeUInt32BE(0x27101980, 4); c.writeUInt32BE(0, 8); tid.copy(c, 12);
    let tm, rt;
    const fin = ok => { if (done) return; done = true; clearTimeout(tm); clearTimeout(rt); try { sock.close(); } catch {} resolve(ok ? out : null); };
    tm = setTimeout(() => fin(false), timeout);
    rt = setTimeout(() => { if (stage === 0) sock.send(c, port, host, () => {}); }, 1800);   // un paquet UDP peut se perdre : un seul renvoi
    sock.on('error', () => fin(false));
    sock.on('message', m => {
      if (m.length < 8 || !m.subarray(4, 8).equals(tid)) return;
      const action = m.readUInt32BE(0);
      if (stage === 0 && action === 0 && m.length >= 16) {
        stage = 1;
        sock.send(Buffer.concat([m.subarray(8, 16), Buffer.from([0, 0, 0, 2]), tid, ...hashes.map(h => Buffer.from(h, 'hex'))]), port, host, e => { if (e) fin(false); });
      } else if (stage === 1 && action === 2) {
        hashes.forEach((h, k) => { const o = 8 + k * 12; if (m.length >= o + 12) out.set(h, { seeders: m.readUInt32BE(o), completed: m.readUInt32BE(o + 4), leechers: m.readUInt32BE(o + 8) }); });
        fin(true);
      } else if (action === 3) fin(false);
    });
    sock.send(c, port, host, e => { if (e) fin(false); });
  });
}
const seedMemo = new Map(), seedPending = new Map(); let seedTimer = null;
function seedInfo(hash) {   // -> { seeders, leechers, completed, trackers } | null (aucun tracker n'a répondu : on ne conclut rien)
  hash = String(hash).toLowerCase();
  const m = seedMemo.get(hash);
  if (m && Date.now() - m.t < (m.v ? 10 : 1) * 60000) return Promise.resolve(m.v);
  return new Promise(res => {
    const l = seedPending.get(hash) || []; l.push(res); seedPending.set(hash, l);
    if (!seedTimer) seedTimer = setTimeout(flushSeeds, 250);
  });
}
async function flushSeeds() {
  seedTimer = null;
  const batch = [...seedPending]; seedPending.clear();
  for (let i = 0; i < batch.length; i += 60) {
    const chunk = batch.slice(i, i + 60), hashes = chunk.map(x => x[0]);
    const results = await Promise.all(cfg.scrapeTrackers.map(async t => {
      scrapeStats.asked++; const r = await udpScrape(t, hashes), st = scrapeStats.per[t] = scrapeStats.per[t] || { ok: 0, fail: 0 };
      if (r) { scrapeStats.answered++; scrapeStats.lastOk = Date.now(); st.ok++; } else st.fail++;
      return r;
    }));
    const answered = results.filter(Boolean);
    if (!answered.length) log('warn', `scrape : aucun des ${cfg.scrapeTrackers.length} trackers n'a répondu (UDP bloqué par le pare-feu/routeur ?) : santé estimée par mesure réelle uniquement`);
    for (const [h, resolvers] of chunk) {
      let v = null;
      if (answered.length) { v = { seeders: 0, leechers: 0, completed: 0, trackers: answered.length }; for (const r of answered) { const x = r.get(h); if (x) { v.seeders = Math.max(v.seeders, x.seeders); v.leechers = Math.max(v.leechers, x.leechers); v.completed = Math.max(v.completed, x.completed); } } }
      seedMemo.set(h, { t: Date.now(), v }); resolvers.forEach(r => r(v));
    }
  }
}
  return { udpScrape, seedInfo, scrapeStats, seedMemo };
};
