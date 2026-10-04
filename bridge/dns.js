'use strict';
// DNS de secours : si le DNS du PC / de la box / du FAI ne résout pas un hôte (ou renvoie une adresse bidon), on interroge un DNS public (UDP, puis DNS sur HTTPS).
// Remplace dns.lookup pour tout le processus : à installer une seule fois.
module.exports = function installDns({ cfg, log }) {
// ---------- DNS de secours : si le DNS du PC/box/FAI ne résout pas un hôte (ou renvoie une adresse bidon), on demande à un DNS public ----------
const dnsMod = require('dns'), sysLookup = dnsMod.lookup;
const pubResolver = new dnsMod.Resolver({ timeout: 2500, tries: 2 });
try { pubResolver.setServers(cfg.publicDns); } catch (e) { log('warn', `publicDns invalide : ${e.message}`); }
const dnsPub = new Map(), dnsForce = new Map(), dnsLocal = new Map(), dnsStats = { system: 0, publicUsed: 0, publicFail: 0, hosts: {} };
const isBogon = a => /^(0\.|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1?$|fe80:)/i.test(a || '');
const dnsCare = h => typeof h === 'string' && h.includes('.') && !/^[\d.]+$/.test(h) && !h.includes(':') && !/(^|\.)(localhost|local|lan|home)$/i.test(h);
function dohResolve(host) {   // DNS sur HTTPS vers une adresse IP (aucun DNS nécessaire)
  return new Promise((ok, no) => {
    const r = require('https').get({ host: '1.1.1.1', path: `/dns-query?name=${encodeURIComponent(host)}&type=A`, headers: { accept: 'application/dns-json' }, timeout: 4000 }, res => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => { try { const a = (JSON.parse(b).Answer || []).filter(x => x.type === 1).map(x => x.data); a.length ? ok(a) : no(new Error('DoH : aucune réponse')); } catch (e) { no(e); } });
    });
    r.on('timeout', () => r.destroy(new Error('DoH timeout'))); r.on('error', no);
  });
}
async function publicResolve(host) {
  const m = dnsPub.get(host); if (m && Date.now() - m.t < 10 * 60000) return m.a;
  let a; try { a = await new Promise((ok, no) => pubResolver.resolve4(host, (e, x) => (e ? no(e) : ok(x)))); } catch (e) { a = await dohResolve(host); }
  dnsPub.set(host, { t: Date.now(), a }); return a;
}
function viaPublic(host, opts, cb, origErr) {
  publicResolve(host).then(a => {
    dnsStats.publicUsed++; dnsStats.hosts[host] = 'public';
    if (!dnsForce.has(host)) log('info', `DNS : « ${host} » résolu par le DNS public (${a[0]})`);
    dnsForce.set(host, Date.now());
    if (opts.all) cb(null, a.map(x => ({ address: x, family: 4 }))); else cb(null, a[0], 4);
  }, e => { dnsStats.publicFail++; dnsStats.hosts[host] = 'échec'; cb(origErr || e); });
}
dnsMod.lookup = function (host, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; } else if (typeof opts === 'number') opts = { family: opts }; opts = opts || {};
  if (cfg.dnsMode === 'system' || !dnsCare(host) || opts.family === 6) return sysLookup.call(dnsMod, host, opts, cb);
  if (cfg.dnsMode === 'public' || (dnsForce.has(host) && Date.now() - dnsForce.get(host) < 30 * 60000)) return viaPublic(host, opts, (e, ...r) => (e ? sysLookup.call(dnsMod, host, opts, cb) : cb(null, ...r)));
  sysLookup.call(dnsMod, host, opts, (err, addr, fam) => {
    const first = Array.isArray(addr) ? (addr[0] || {}).address : addr;
    if (!err && first && (!isBogon(first) || Date.now() - (dnsLocal.get(host) || 0) < 30 * 60000)) { dnsStats.system++; return cb(null, addr, fam); }
    if (!dnsForce.has(host)) log('warn', `DNS du PC : « ${host} » ${err ? 'non résolu (' + err.code + ')' : 'résolu vers une adresse locale ' + first} -> essai DNS public`);
    if (err) return viaPublic(host, opts, cb, err);
    viaPublic(host, opts, (e, ...r) => { if (!e) return cb(null, ...r); dnsLocal.set(host, Date.now()); dnsStats.hosts[host] = 'local'; cb(null, addr, fam); });   // adresse locale (addon hébergé chez soi, ex. 192.168.x) inconnue du DNS public : on garde la réponse du DNS du PC (30 min) au lieu d'échouer
  });
};
const forcePublicDns = host => { if (cfg.dnsMode !== 'system' && dnsCare(host) && !dnsForce.has(host)) { dnsForce.set(host, Date.now()); return true; } return false; };
  return { dnsPub, dnsForce, dnsLocal, dnsStats, forcePublicDns };
};
