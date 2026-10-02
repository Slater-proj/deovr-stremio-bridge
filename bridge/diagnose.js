// Diagnostic complet : node diagnose.js [tt1234567 ...]
// Produit diagnostic-report.txt / .json / debug.log  (secrets masqués) -> à me renvoyer.
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('./lib');
const { cfg, redact } = L;

const R = { when: new Date().toISOString(), checks: [], data: {} };
const lines = [];
let section = '';
function out(s = '') { console.log(s); lines.push(s); }
function head(t) { section = t; out(`\n=== ${t} ===`); }
function check(status, name, detail = '') {
  R.checks.push({ section, status, name, detail });
  out(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}
const ok = (n, d) => check('PASS', n, d), warn = (n, d) => check('WARN', n, d), fail = (n, d) => check('FAIL', n, d);
const timed = async fn => { const t = Date.now(); try { return [await fn(), Date.now() - t]; } catch (e) { return [{ __err: e }, Date.now() - t]; } };

// Requête Range comme le ferait DeoVR
async function probe(url, headers = {}, timeout = 25000) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { range: 'bytes=0-1023', ...headers }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
    let bytes = 0;
    if (r.body) { const rd = r.body.getReader(); const c = await rd.read(); bytes = c.value ? c.value.length : 0; rd.cancel().catch(() => {}); }
    return { status: r.status, ms: Date.now() - t0, type: r.headers.get('content-type'), range: r.headers.get('content-range'), accept: r.headers.get('accept-ranges'), len: r.headers.get('content-length'), bytes, finalHost: new URL(r.url).host };
  } catch (e) { return { error: e.message, ms: Date.now() - t0 }; }
}
function judgeProbe(name, p, isVideo = true) {
  if (p.error) return fail(name, `${p.error} (${p.ms} ms)`);
  const info = `HTTP ${p.status}, ${p.type || 'type ?'}, accept-ranges=${p.accept || '-'}, content-range=${p.range || '-'}, ${p.ms} ms, ${p.bytes} o lus`;
  if (p.status === 206) return ok(name, info);
  if (p.status === 200) return isVideo ? warn(name, info + ' — le serveur ignore Range : la lecture démarre mais le seek peut échouer') : ok(name, info);
  fail(name, info);
}

(async () => {
  out(`DeoVR/Stremio bridge — diagnostic du ${R.when}`);

  // 1. Environnement
  head('1. Environnement');
  const major = +process.versions.node.split('.')[0];
  (major >= 18 ? ok : fail)('Node.js', `v${process.versions.node} (18+ requis)`);
  ok('Système', `${os.platform()} ${os.release()} ${os.arch()}`);
  const nets = Object.values(os.networkInterfaces()).flat().filter(n => n.family === 'IPv4' && !n.internal);
  R.data.lan = nets.map(n => n.address);
  ok('Adresses LAN', R.data.lan.join(', ') || 'aucune');
  const cfgSafe = { ...cfg, email: cfg.email ? cfg.email.replace(/^(.).*(@.*)$/, '$1***$2') : '', password: cfg.password ? '***' : '', authKey: cfg.authKey ? '***' : '', addonUrls: cfg.addonUrls.map(redact) };
  R.data.config = cfgSafe;
  out('Config : ' + JSON.stringify(cfgSafe));
  fs.existsSync(L.PATHS.configFile) ? ok('config.json présent : ' + L.PATHS.configFile) : warn('config.json absent', 'variables d\'environnement utilisées ?');

  // 2. Stremio compte + addons
  head('2. Compte Stremio et addons');
  if (!cfg.addonUrls.length) {
    const [r, ms] = await timed(() => fetch('https://api.strem.io/api/addonCollectionGet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"type":"AddonCollectionGet","authKey":"x","update":true}', signal: AbortSignal.timeout(10000) }));
    r.__err ? fail('api.strem.io joignable', r.__err.message) : ok('api.strem.io joignable', `HTTP ${r.status}, ${ms} ms`);
  }
  let addons = [];
  const [ad, adMs] = await timed(() => L.getAddons());
  if (ad.__err) { fail('Récupération des addons', ad.__err.message); return finish(); }
  addons = ad; ok('Récupération des addons', `${addons.length} addon(s) en ${adMs} ms`);
  R.data.addons = addons.map(a => ({
    name: a.manifest.name, version: a.manifest.version, url: redact(a.base + '/manifest.json'),
    types: a.manifest.types, resources: (a.manifest.resources || []).map(r => (typeof r === 'string' ? r : `${r.name}(${(r.types || []).join('|')})`)),
    catalogs: (a.manifest.catalogs || []).map(c => ({ type: c.type, id: c.id, name: c.name, extra: L.catalogExtra(c).map(e => `${e.name}${e.isRequired ? '*' : ''}${e.options ? `[${e.options.length}]` : ''}`) })),
  }));
  for (const a of R.data.addons) out(`  • ${a.name} v${a.version} ${a.url}\n      ressources: ${a.resources.join(', ')}\n      catalogues: ${a.catalogs.map(c => `${c.type}/${c.id}{${c.extra}}`).join(' ; ') || '-'}`);
  const streamAddons = addons.filter(a => L.supports(a, 'stream', 'movie'));
  streamAddons.length ? ok('Addons de flux (movie)', streamAddons.map(a => a.manifest.name).join(', ')) : fail('Aucun addon de flux pour "movie"', 'impossible de lire un film');
  addons.some(a => L.supports(a, 'meta', 'movie')) ? ok('Addon meta (movie)') : warn('Aucun addon meta', 'titres/durées limités au catalogue');

  // 2b. Réseau vers chaque hôte d'addon (fetch vs node:https, IPv4/IPv6)
  head('2b. Réseau vers les addons');
  const dns = require('dns').promises;
  const hosts = new Map();
  for (const a of addons) { try { const u = new URL(a.base + '/manifest.json'); if (!hosts.has(u.host)) hosts.set(u.host, u.href); } catch {} }
  for (const [host, href] of hosts) {
    if (/^(127\.0\.0\.1|localhost)/.test(host)) continue;
    const row = { host };
    try { const r = await dns.lookup(host.replace(/:\d+$/, ''), { all: true }); row.dns = r.map(x => `${x.address}(v${x.family})`).join(' '); } catch (e) { row.dns = 'ÉCHEC ' + e.code; }
    if (/^ÉCHEC/.test(row.dns)) { try { const pr = new dns.Resolver(); pr.setServers(['1.1.1.1', '8.8.8.8']); row.dnsPublic = (await pr.resolve4(host.replace(/:\d+$/, ''))).join(' '); } catch (e) { row.dnsPublic = 'ÉCHEC ' + e.code; } }
    const tries = { fetch: async () => (await fetch(href, { signal: AbortSignal.timeout(10000) })).status,
      fetch_ua: async () => (await fetch(href, { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) StremioShell/4.4.168' }, signal: AbortSignal.timeout(10000) })).status,
      https_auto: async () => (await L.nodeGet(href, { timeout: 10000 })).status,
      https_ipv4: async () => (await L.nodeGet(href, { family: 4, timeout: 10000 })).status,
      https_ipv6: async () => (await L.nodeGet(href, { family: 6, timeout: 10000 })).status };
    for (const [k, fn] of Object.entries(tries)) { const t = Date.now(); try { row[k] = 'HTTP ' + await fn() + ` ${Date.now() - t}ms`; } catch (e) { row[k] = `ERR ${e.code || (e.cause && e.cause.code) || ''} ${(e.cause && e.cause.message) || e.message}`.trim(); } }
    R.data.network = (R.data.network || []).concat(row);
    const good = /HTTP 2/.test(row.fetch);
    (good ? ok : /HTTP 2/.test(row.https_auto + row.https_ipv4) ? warn : fail)(`Réseau ${host}`, `dns=${row.dns}${row.dnsPublic ? ' | dns public=' + row.dnsPublic : ''} | fetch=${row.fetch} | avec UA Stremio=${row.fetch_ua} | https=${row.https_auto} | ipv4=${row.https_ipv4} | ipv6=${row.https_ipv6}`);
  }
  const dnsBlocked = (R.data.network || []).filter(r => /^ÉCHEC/.test(r.dns) && r.dnsPublic && !/^ÉCHEC/.test(r.dnsPublic));
  if (dnsBlocked.length) warn('DNS local défaillant', `${dnsBlocked.length} hôte(s) non résolus par le DNS de cette machine mais résolus par un DNS public : le DNS du PC/routeur/FAI ou un filtre (antivirus, contrôle parental, AdGuard/Pi-hole, VPN) est en cause. Le pont contourne automatiquement ce blocage (dnsMode « auto » : DNS public en secours ; « public » pour le forcer)`);
  out('  proxy système : ' + (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'aucun') + ' | NODE_OPTIONS=' + (process.env.NODE_OPTIONS || '-'));

  // 3. Catalogues
  head('3. Catalogues -> onglets');
  const why = [];
  const entries = L.listCatalogs(addons, why);
  R.data.skippedCatalogs = why;
  ok('Onglets générés', `${entries.filter(e => !e.search).length} onglets + ${entries.filter(e => e.search).length} recherches (max affiché: ${cfg.maxTabs})`);
  for (const w of why) out(`  ignoré: ${w.catalog} « ${w.name} » — ${w.reason}`);
  const samples = []; const vrHits = [];
  for (const e of entries.filter(e => !e.search).slice(0, cfg.maxTabs)) {
    const [metas, ms] = await timed(() => L.fetchCatalog(e));
    if (metas.__err) { fail(`Catalogue « ${e.name} »`, metas.__err.message); continue; }
    const noPoster = metas.filter(m => !m.poster).length;
    (metas.length ? ok : warn)(`Catalogue « ${e.name} »`, `${metas.length} films, ${ms} ms, ${noPoster} sans affiche`);
    metas.slice(0, 2).forEach(m => samples.push({ id: m.id, type: m.type || 'movie', name: m.name }));
    metas.filter(m => L.VR_RE.test(m.name || '')).slice(0, 2).forEach(m => vrHits.push({ id: m.id, type: m.type || 'movie', name: m.name }));
  }
  R.data.samples = samples; R.data.vrHits = vrHits;
  out(`  titres avec marqueur 3D/VR détectés dans les catalogues : ${vrHits.length ? vrHits.map(v => v.name).join(' | ') : 'aucun'}`);
  const q = 'a';
  const se = entries.filter(e => e.search)[0];
  if (se) { const [m, ms] = await timed(() => L.fetchCatalog(se, q)); m.__err ? fail('Recherche', m.__err.message) : ok(`Recherche « ${se.name} » (q=${q})`, `${m.length} résultats, ${ms} ms`); }
  else warn('Aucun catalogue de recherche', 'la fonction ?q= ne renverra rien');

  // 4. Serveur bridge + validation format DeoVR
  head('4. Serveur bridge et format JSON DeoVR');
  let server;
  try { server = await L.start(0); } catch (e) { fail('Démarrage du serveur', e.message); return finish(); }
  const port = server.address().port; const base = `http://127.0.0.1:${port}`;
  ok('Serveur démarre', `port de test ${port}, écoute sur 0.0.0.0`);
  if (R.data.lan[0]) {
    const [r] = await timed(() => fetch(`http://${R.data.lan[0]}:${port}/deovr`, { signal: AbortSignal.timeout(8000) }));
    r.__err ? fail('Accès via IP LAN', r.__err.message) : ok('Accès via IP LAN', `http://${R.data.lan[0]}:${port} répond (le pare-feu Windows peut encore bloquer d'AUTRES appareils)`);
  }
  const lib = await (await fetch(`${base}/deovr`)).json();
  const scenes = lib.scenes || [];
  (Array.isArray(lib.scenes) ? ok : fail)('/deovr : tableau "scenes"', `${scenes.length} scène(s), authorized=${JSON.stringify(lib.authorized)}`);
  const badScene = scenes.filter(s => !s.name || !Array.isArray(s.list) || !s.list.length);
  badScene.length ? fail('Scènes invalides', badScene.length + ' sans nom ou vides') : ok('Scènes valides');
  const items = scenes.flatMap(s => s.list);
  const badItem = items.filter(i => !i.title || typeof i.videoLength !== 'number' || !/^https?:/.test(i.video_url));
  badItem.length ? fail('Éléments invalides', `${badItem.length}/${items.length}`) : ok('Éléments valides', `${items.length} vidéos`);
  const noThumb = items.filter(i => !/^https?:/.test(i.thumbnailUrl || '')).length;
  noThumb ? warn('Vignettes manquantes', `${noThumb}/${items.length}`) : ok('Toutes les vignettes ont une URL');
  const httpThumb = items.filter(i => /^http:/.test(i.thumbnailUrl || '')).length;
  if (httpThumb) warn('Vignettes en http://', `${httpThumb} — HTTPS requis sur Android/Quest autonome`);
  for (const i of items.slice(0, 3)) if (i.thumbnailUrl) { const p = await probe(i.thumbnailUrl, {}, 10000); p.error || p.status >= 400 || !/^image\//.test(p.type || '') ? warn('Vignette inaccessible', `${redact(i.thumbnailUrl)} ${p.error || p.status + ' ' + p.type}`) : ok('Vignette accessible', `${p.type}`); }
  out(`  taille /deovr : ${JSON.stringify(lib).length} octets`);

  // 4b. Trackers UDP (scrape des seeders : base des pastilles)
  head('4b. Trackers UDP (nombre de seeders sans démarrer de torrent)');
  {
    const h = 'aa'.repeat(20); let okN = 0;
    for (const t of cfg.scrapeTrackers) { const t0 = Date.now(); const r = await L.udpScrape(t, [h]); r ? (okN++, ok('tracker ' + t, `répond en ${Date.now() - t0} ms`)) : warn('tracker ' + t, 'pas de réponse (bloqué ? hors service ?)'); }
    okN ? ok('Scrape UDP', `${okN}/${cfg.scrapeTrackers.length} trackers répondent : les pastilles seront calculées vite`) : fail('Scrape UDP', 'aucun tracker UDP ne répond : pare-feu/routeur/VPN bloque l\'UDP sortant. Les pastilles resteront ⚪ jusqu\'à la mesure réelle (lente).');
    R.data.scrape = { trackers: cfg.scrapeTrackers, ok: okN };
  }

  // 5. Vidéos : flux, format, Range
  head('5. Flux vidéo (par film testé)');
  const argIds = process.argv.slice(2).map(id => ({ id, type: 'movie', name: '(argument)' }));
  const targets = [...argIds, ...vrHits.slice(0, 2), ...samples.slice(0, 3)].filter((v, i, a) => a.findIndex(x => x.id === v.id) === i).slice(0, 6);
  R.data.videos = [];
  for (const t of targets) {
    out(`\n-- ${t.name} (${t.type}/${t.id})`);
    const [a, ms] = await timed(() => L.analyzeVideo(t.type, t.id, base, `127.0.0.1:${port}`));
    if (a.__err) { fail('Analyse des flux', a.__err.message); continue; }
    const kinds = {}; a.candidates.forEach(c => { kinds[c.kind] = (kinds[c.kind] || 0) + 1; });
    (a.candidates.length ? ok : fail)('Flux trouvés', `${a.candidates.length} en ${ms} ms — ${JSON.stringify(kinds)}`);
    const hints = new Set(); a.candidates.forEach(c => Object.keys(c.raw.behaviorHints || {}).forEach(h => hints.add(h)));
    if (hints.size) out(`  behaviorHints vus : ${[...hints].join(', ')}`);
    a.candidates.slice(0, 5).forEach(c => out(`  · [${c.kind}] ${c.addon} | ${c.text.replace(/\s+/g, ' ').slice(0, 90)} | ${c.resolution}p ${c.screenType}/${c.stereoMode} | santé=${c.health} seeders(trackers)=${c.scrape ? c.scrape.seeders : '?'} | ${c.codec} | format=${c.fmt ? c.fmt.container + '/' + (c.fmt.codec || '?') + (c.fmt.note ? ' (' + c.fmt.note + ')' : '') : 'non lu'} | ${redact(c.url || c.raw.externalUrl || '')}`));
    const rec = { t, candidates: a.candidates.length, kinds, chosen: a.best && { screenType: a.best.screenType, stereoMode: a.best.stereoMode }, probes: [] };
    R.data.videos.push(rec);
    if (!a.best) { warn('Aucun flux lisible', 'uniquement des liens non supportés (YouTube/externe) ?'); continue; }
    const v = await (await fetch(`${base}/video/${t.type}/${encodeURIComponent(t.id)}.json`)).json();
    const okShape = v.encodings?.[0]?.videoSources?.length && v.encodings[0].videoSources.every(s => s.resolution && /^https?:/.test(s.url));
    okShape ? ok('JSON vidéo valide', `${v.screenType}/${v.stereoMode} is3d=${v.is3d}, résolutions: ${v.encodings[0].videoSources.map(s => s.resolution).join('/')}`) : fail('JSON vidéo invalide', JSON.stringify(v).slice(0, 200));
    // Sources testées : une directe, une proxied et, pour les torrents, celle qui a le plus de seeders (URL réellement donnée à DeoVR)
    const seeders = c => c.seeders || +((c.text.match(/👤\s*(\d+)/) || [])[1] || 0);
    const pick = [];
    for (const k of ['direct', 'proxied']) { const c = a.sources.find(x => x.kind === k) || a.candidates.find(x => x.kind === k); if (c) pick.push(c); }
    const tor = a.candidates.filter(x => x.kind === 'torrent').sort((x, y) => seeders(y) - seeders(x))[0];
    if (tor) pick.push(tor);
    for (const s of pick) {
      const isT = s.kind === 'torrent';
      if (s.kind === 'direct' && /^http:/.test(s.url)) warn('Flux en http://', 'HTTPS requis sur Android/Quest autonome');
      if (!isT) {
        const p = await probe(s.url, {}, 25000);
        judgeProbe(`Range ${s.kind} ${s.resolution}p (${redact(s.url)})`, p);
        rec.probes.push({ kind: s.kind, res: s.resolution, ...p });
        if (s.kind === 'direct' && p.error) judgeProbe('  → via relais du bridge', await probe(`${base}/proxy/${Buffer.from(s.url).toString('base64url')}/e30/video.mp4`));
        continue;
      }
      // Torrent : lecture via le relais du bridge -> serveur Stremio local ; on suit aussi les statistiques du torrent
      const hash = s.raw.infoHash.toLowerCase();
      const idx = Number.isInteger(s.raw.fileIdx) ? s.raw.fileIdx : -1;
      out(`  torrent testé : ${hash.slice(0, 8)}… fileIdx=${idx} seeders(annoncés)=${seeders(s)} trackers=${(s.raw.sources || []).length}`);
      const stats = async label => {
        for (const sp of [`${hash}/stats.json`, `${hash}/${idx}/stats.json`]) {
          try {
            const r = await fetch(`${cfg.localStremio}/${sp}`, { signal: AbortSignal.timeout(5000) });
            const txt = await r.text();
            let brief = txt.slice(0, 200);
            try { const j = JSON.parse(txt); brief = JSON.stringify(Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === 'number' || typeof v === 'boolean'))).slice(0, 300); } catch {}
            out(`  stats ${label} (${sp.includes(String(idx)) && idx !== -1 ? 'avec idx' : 'globales'}) : HTTP ${r.status} ${brief}`);
            rec.stats = rec.stats || []; rec.stats.push({ label, sp: sp.replace(hash, 'hash'), status: r.status, brief });
            if (r.ok) return;
          } catch (e) { out(`  stats ${label} : ${L.errInfo ? L.errInfo(e) : e.message}`); }
        }
      };
      const pp = probe(s.url, {}, 90000);
      await new Promise(r => setTimeout(r, 8000)); await stats('après 8 s');
      await new Promise(r => setTimeout(r, 15000)); await stats('après 23 s');
      const p = await pp;
      judgeProbe(`Range torrent via bridge ${s.resolution}p (${redact(s.url)})`, p);
      rec.probes.push({ kind: 'torrent', res: s.resolution, ...p });
      if (p.error || p.status >= 400) {
        const direct = await probe(s.origUrl, {}, 30000);
        judgeProbe('  → directement sur le serveur Stremio local (sans le bridge)', direct);
        rec.probes.push({ kind: 'torrent-direct', ...direct });
        await stats('après échec');
        warn('Torrent non lisible', 'si Stremio lit ce même film chez toi, envoie-moi ce rapport ; sinon le trafic torrent (pare-feu/VPN/FAI) est bloqué');
      }
    }
  }

  // 6. Serveur Stremio local (torrents)
  head('6. Serveur Stremio local (torrents)');
  const [ls, lsMs] = await timed(() => fetch(`${cfg.localStremio}/settings`, { signal: AbortSignal.timeout(6000) }));
  if (ls.__err) (Object.values(R.data.videos.flatMap(v => Object.keys(v.kinds))).includes('torrent') ? fail : warn)('Serveur Stremio local', `${cfg.localStremio} injoignable : ${ls.__err.message} — lance l'app Stremio`);
  else { let sv = ''; try { const j = await ls.json(); sv = `serveur v${j.values?.serverVersion || j.serverVersion || '?'}`; } catch {} ok('Serveur Stremio local', `${cfg.localStremio} répond HTTP ${ls.status} (${lsMs} ms) ${sv}`); }


  head('6a. Bibliothèque locale');
  { const files = cfg.localDirs.length ? L.scanLocal() : [];
    if (!cfg.localDirs.length) warn('Aucun dossier local configuré', 'ajoute "localDirs": ["D:\\\\VR"] dans config.json : c\'est la voie la plus fiable pour tester la lecture VR');
    else { files.length ? ok('Vidéos locales trouvées', files.length + ' fichier(s)') : fail('Aucune vidéo dans les dossiers locaux', cfg.localDirs.map(() => '<dossier>').join(', '));
      for (const f of files.slice(0, 3)) { const v = L.localVideo(f.id, base, cfg.platform); if (v) { const p = await probe(v.encodings[0].videoSources[0].url); judgeProbe(`Lecture locale « ${f.name.slice(0, 40)} » (${v.screenType}/${v.stereoMode}, ${v.encodings[0].videoSources[0].resolution}p)`, p, false); } } } }
  head('6b. Conversion MKV (ffmpeg)');
  { const r = require('child_process').spawnSync(cfg.ffmpeg, ['-version'], { timeout: 5000, encoding: 'utf8' });
    r.status === 0 ? ok('ffmpeg', (r.stdout || '').split('\n')[0]) : warn('ffmpeg absent', `plateforme=${cfg.platform} : DeoVR Windows ne lit pas le MKV ; installe ffmpeg (winget install Gyan.FFmpeg) pour les convertir à la volée`); }
  // 7. Scène de test : le pont sait-il servir un flux que DeoVR peut lire ? (sans torrent, sans internet)
  head('7. Vidéos de test embarquées (lecture DeoVR)');
  try {
    const lib = await (await fetch(`${base}/deovr`, { signal: AbortSignal.timeout(60000) })).json();
    const sc = (lib.scenes || []).find(x => /Test/.test(x.name));
    if (!sc) warn('Scène de test absente', 'testScene désactivé ?');
    else for (const it of sc.list) {
      const v = await (await fetch(it.video_url)).json();
      const src = v.encodings[0].videoSources[0];
      const p1 = await probe(src.url), size = /\/(\d+)$/.exec(p1.range || '');
      judgeProbe(`${it.title} — début`, p1);
      if (size) judgeProbe(`${it.title} — saut au milieu (seek)`, await probe(src.url, { range: `bytes=${Math.floor(+size[1] / 2)}-${Math.floor(+size[1] / 2) + 1023}` }));
      const th = await probe(it.thumbnailUrl); (th.status === 206 || th.status === 200) ? ok('  vignette', `HTTP ${th.status}`) : fail('  vignette', th.error || `HTTP ${th.status}`);
      R.data.testScene = (R.data.testScene || []).concat({ title: it.title, json: v, probe: p1 });
    }
    out('→ À tester dans DeoVR : ouvre l\'onglet « Test pont » et lance les 4 vidéos. Dis-moi lesquelles démarrent.');
  } catch (e) { fail('Scène de test', e.message); }

  // 8. Ce que le pont a vu passer (requêtes de DeoVR incluses si le serveur tourne dans la même session)
  head('8. Journal des requêtes du pont');
  R.data.requests = L.reqLog.slice(-60);
  for (const r of R.data.requests.slice(-25)) out(`  ${r.status} ${r.method} ${r.path.slice(0, 70)} range=${r.range || '-'} envoyé=${r.sent} o en ${r.ms} ms${r.clientClosedEarly ? ' (fermé avant la fin)' : ''}${r.upstream?.sniff ? ' format=' + r.upstream.sniff : ''}`);
  out('  (En usage réel, le pont écrit toutes les requêtes de DeoVR dans bridge-requests.log : envoie-moi ce fichier après un essai en casque.)');
  return finish();
})().catch(e => { fail('Erreur inattendue', e.stack || e.message); finish(); });

function finish() {
  const c = R.checks; const n = s => c.filter(x => x.status === s).length;
  out(`\n=== RÉSUMÉ === PASS ${n('PASS')} | WARN ${n('WARN')} | FAIL ${n('FAIL')}`);
  for (const x of c.filter(x => x.status === 'FAIL')) out(`  FAIL [${x.section}] ${x.name} — ${x.detail}`);
  R.data.log = L.logBuf.slice(-200);
  fs.writeFileSync(path.join(L.DATA_DIR || __dirname, 'diagnostic-report.txt'), lines.join('\n'));
  fs.writeFileSync(path.join(L.DATA_DIR || __dirname, 'diagnostic-report.json'), JSON.stringify(R, null, 2));
  fs.writeFileSync(path.join(L.DATA_DIR || __dirname, 'debug.log'), L.logBuf.join('\n'));
  out('\nRapports écrits : diagnostic-report.txt, diagnostic-report.json, debug.log (secrets masqués)');
  setTimeout(() => process.exit(n('FAIL') ? 1 : 0), 200);
}
