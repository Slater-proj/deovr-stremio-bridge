// Noyau du bridge DeoVR <-> Stremio (partagé par server.js, report.js et diagnose.js). Node 20+, zéro dépendance.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { parseRuntime, VR_RE, resLabel, fmtLabel, mbs, fmtDur, detectRes, detectCodec, detectFormat, probeContainer, sniff, wrapTxt } = require('./format');   // fonctions pures (format.js)

// ---------- Configuration ----------
let file = {};
const PATHS = require('./paths').resolve();   // exe : <dossier de l'exe>\data ; node server.js : dossier du code ; BRIDGE_DATA_DIR / --data-dir : imposé (voir paths.js)
const DATA_DIR = PATHS.dataDir, APP_DIR = PATHS.appDir, RES_DIR = PATHS.resDir;   // DATA_DIR : clé Stremio chiffrée, journaux, état, temporaires ; RES_DIR : ffmpeg et vidéos de test
let configError = '';
try { file = JSON.parse(fs.readFileSync(PATHS.configFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') configError = e.message; }   // config.json illisible : signalé au démarrage (server.js)
const env = process.env;
try { if (env.IPV4_FIRST !== '0') require('dns').setDefaultResultOrder('ipv4first'); } catch {}
const cfg = {
  port: +(env.PORT || file.port || 4477),   // port du pont, 4477 par défaut (peu courant : 8080 est pris par beaucoup de logiciels) ; --port N ou la variable PORT l'emportent
  bindHost: env.BIND_HOST || file.bindHost || '127.0.0.1',   // '127.0.0.1' (défaut) = accessible uniquement depuis ce PC (PCVR) ; '0.0.0.0' = aussi depuis le réseau local (casque autonome) : le pont n'a aucune authentification
  email: env.STREMIO_EMAIL || file.email || '',   // ANCIEN réglage, inutile : la connexion se fait par la page /setup ; migré puis effacé s'il est présent avec password
  password: env.STREMIO_PASSWORD || file.password || '',   // ANCIEN réglage (voir email) : jamais réécrit par le pont
  authKey: env.STREMIO_AUTHKEY || file.authKey || '',
  addonUrls: file.addonUrls || (env.ADDON_URLS ? env.ADDON_URLS.split(',') : []), // optionnel : manifests en dur (tests)
  localStremio: (env.LOCAL_STREMIO || file.localStremio || 'http://127.0.0.1:11470').replace(/\/$/, ''),
  localStremioPublic: (env.LOCAL_STREMIO_PUBLIC || file.localStremioPublic || '').replace(/\/$/, ''), // URL vue par DeoVR ('' = auto)
  catalogInclude: file.catalogInclude || '',
  catalogExclude: file.catalogExclude || '',
  genreTabs: file.genreTabs ?? false,
  maxGenresPerCatalog: file.maxGenresPerCatalog || 6,   // plafond d'onglets par catalogue à genres
  maxTabs: file.maxTabs || 20,
  itemsPerTab: file.itemsPerTab || 150,
  pagesPerTab: file.pagesPerTab || 2,               // pages Stremio (skip) chargées par onglet
  streamsTimeoutMs: file.streamsTimeoutMs || 12000, // attente max des addons de flux avant de répondre à DeoVR
  types: file.types || ['movie'],
  vrOnly: file.vrOnly ?? true,                     // n'afficher que les films VR/3D (titre, catalogue ou genre marqués) : mettre false pour tout voir
  cacheMinutes: file.cacheMinutes || 10,
  catalogTimeoutMs: file.catalogTimeoutMs || 8000,   // un addon lent ne doit pas bloquer tout /deovr
  authorized: String(file.authorized ?? '0'),      // valeur du champ "authorized" (doc DeoVR : "0")
  forceProxy: file.forceProxy ?? false,            // faire passer TOUS les flux par le proxy du bridge
  healthCheckMs: file.healthCheckMs ?? 10000,     // test de santé des torrents avant de les proposer (0 = désactivé)
  torrentStartMs: +(env.TORRENT_START_MS || file.torrentStartMs || 120000),   // au-delà, le relais répond 504 au lieu de laisser DeoVR charger à l'infini
  platform: (env.DEOVR_PLATFORM || file.platform || 'windows').toLowerCase(),   // 'windows' (DeoVR PC : MP4/MOV/AVI, pas MKV/AV1/VP9) ou 'quest' (MKV/WebM/AV1 ok)
  ffmpeg: file.ffmpeg || env.FFMPEG || [RES_DIR, APP_DIR].flatMap(d => ['ffmpeg.exe', 'ffmpeg'].map(n => path.join(d, 'ffmpeg', n))).find(f => fs.existsSync(f)) || 'ffmpeg',   // pour convertir MKV -> HLS à la volée (DeoVR Windows ne lit pas MKV)
  remux: file.remux ?? true,
  localDirs: file.localDirs || (env.LOCAL_DIRS ? env.LOCAL_DIRS.split(';').filter(Boolean) : []),   // dossiers de vidéos supplémentaires sur ce PC (onglet « Local »)
  localFolder: file.localFolder ?? true,           // true = le dossier « videos » du pont (à côté de l'exe) est lu aussi : copiez-y des vidéos téléchargées ailleurs, elles apparaissent dans l'onglet « Local »
  videosDir: env.BRIDGE_VIDEOS_DIR || file.videosDir || PATHS.videosDir,   // emplacement du dossier « videos » (par défaut : à côté de l'exe)
  localDefaultFormat: ['flat', 'vr180', 'vr360'].includes(file.localDefaultFormat) ? file.localDefaultFormat : 'flat',   // vidéo locale sans indice VR dans son nom (_180_LR, _360, _TB…) : "flat" = écran plat ; "vr180" = VR180 côte à côte ; "vr360" = sphère 360° mono
  sampleMode: file.sampleMode ?? false,           // MODE ÉCHANTILLON : au lieu de tout télécharger, ne récupérer que des extraits (début, milieu, fin…) pour avoir un aperçu rapide du film ; le film est lu en direct (les zones non téléchargées bloquent la lecture)
  sampleCount: Math.min(12, Math.max(1, Math.round(+file.sampleCount) || 3)),   // nombre d'extraits répartis du début à la fin du film (3 = début, milieu, fin)
  sampleMinutes: +file.sampleMinutes > 0 ? +file.sampleMinutes : 2,   // durée de chaque extrait, en minutes
  readAheadMB: file.readAheadMB ?? 300,            // lecture directe : le pont télécharge en plus jusqu'à N Mo DEVANT la position du lecteur (octets jetés, ils restent dans le cache de Stremio) pour que la lecture ne rattrape pas le téléchargement ; 0 = désactivé
  thumbBadges: file.thumbBadges ?? true,           // badges dessinés sur les vignettes (résolution, VR180/VR360/3D, seeders ; barre d'avancement dans « En cours ») : lisibles malgré l'absence d'emoji dans les titres de DeoVR
  toolsTab: file.toolsTab ?? true,                 // onglet « Outils » dans DeoVR (rapport, pause, nettoyage, état, mode échantillon) : actions lancées depuis la VR, exécutées quand le lecteur vidéo de DeoVR sur ce PC les ouvre
  seekGuardSec: file.seekGuardSec ?? 5,            // saut du lecteur dans une zone pas encore reçue : si Stremio n'envoie rien en N s, réponse immédiate 503 (le lecteur de DeoVR abandonne de toute façon vers 7 s et DeoVR se relance) et la zone est préchargée ; 0 = désactivé (le lecteur gèle jusqu'à 2 min)
  seekGuardMB: file.seekGuardMB ?? 20,             // le garde ne joue qu'après ce volume déjà lu en direct par le lecteur (jamais pendant l'ouverture du fichier) et pour un saut au-delà du quart de ce volume
  seekPrefetchMB: file.seekPrefetchMB ?? 300,      // après un saut refusé : Mo préchargés à partir de la position demandée (le prochain essai du lecteur trouve les données)
  samplePadSec: file.samplePadSec ?? 15,          // marge ajoutée de chaque côté d'un extrait (le débit d'un film varie : sans marge, le bord de l'extrait manquerait)
  showHealth: file.showHealth ?? true,            // pastille de santé dans le titre
  scanAll: file.scanAll ?? false,                 // analyser aussi les films sans marqueur VR/3D dans le titre
  scanConcurrency: file.scanConcurrency ?? 6,     // films classés en parallèle (phase rapide : addons + trackers, sans démarrer de torrent)
  hostConcurrency: file.hostConcurrency ?? 4,     // requêtes simultanées max vers un même addon
  jsonConcurrency: file.jsonConcurrency ?? 6,     // fiches vidéo calculées en parallèle (DeoVR les demande toutes d'un coup)
  scrapeTrackers: file.scrapeTrackers || (env.SCRAPE_TRACKERS ? env.SCRAPE_TRACKERS.split(',') : ['tracker.opentrackr.org:1337', 'open.stealth.si:80', 'tracker.torrent.eu.org:451', 'exodus.desync.com:6969', 'open.demonii.com:1337']),   // trackers UDP interrogés (nombre de seeders sans démarrer de torrent)
  sortByHealth: file.sortByHealth ?? true,        // films sains (vert/orange) en premier dans les listes
  uiPageSize: file.uiPageSize || 48,              // cartes par page sur /ui
  scrapeMinSeeders: file.scrapeMinSeeders ?? 1,   // seeders minimum annoncés par les trackers pour ne pas classer un film « noir »
  scanMax: file.scanMax ?? 100,                   // films analysés (addons + trackers UDP, sans torrent) par affichage de liste
  scanMs: file.scanMs ?? 25000,                   // diagnostic seulement (diagnose.bat / ?measure=1)
  testScene: file.testScene ?? !!(env.BRIDGE_DEV || file.dev),   // onglet « Test pont » (vidéos de test et banc de test casque, Labos 1 à 16) : affiché par défaut seulement en mode développeur (--dev)
  extraTrackers: file.extraTrackers || [],        // trackers ajoutés à TOUS les torrents (en plus de ceux de l'addon et des trackers publics)
  holdMinutes: file.holdMinutes ?? 30,             // un film lancé reste actif (téléchargement continu) ce temps après la dernière activité du lecteur
  formatMenu: ['auto', 'declare', 'free'].includes(file.formatMenu) ? file.formatMenu : 'free',   // PAR DÉFAUT "free" (menu FLAT / 180 / 360 / fisheye / SBS toujours disponible, choix retenu par vidéo). Mesuré au casque : dès que la fiche déclare screenType/stereoMode, DeoVR cache son sélecteur de mode (FLAT/180/360/fisheye). "declare" = toujours déclarer (image juste d'emblée, pas de menu) ; "free" = ne jamais déclarer (menu présent, image côte à côte brute jusqu'à votre choix, DeoVR le retient par film) ; "auto" = déclarer seulement si le titre/flux dit le format
  loaderTextScale: +file.loaderTextScale > 0 ? +file.loaderTextScale : 1,   // taille du texte de l'écran de chargement en VR (1 = défaut ; 0.7 plus petit, 1.3 plus grand)
  minFreeCriticalGB: file.minFreeCriticalGB ?? 1,  // disque : les clics sont toujours acceptés ; sous ce seuil (dernier moment) les téléchargements sont arrêtés, les fichiers temporaires supprimés et les nouveaux clics refusés avec un message (Stremio plante sinon)
  coursSlots: file.coursSlots ?? 6,                // onglet « En cours » : nombre d'emplacements fixes (DeoVR ne redemande la bibliothèque qu'en entrant sur le site, mais il relit la fiche de chaque film à chaque affichage de la liste)
  maxDownloads: file.maxDownloads ?? 3,            // films téléchargés en même temps (le plus ancien est mis en pause au-delà)
  minBufferSec: file.minBufferSec ?? 20,           // tampon minimum (secondes de film converties) avant de passer de l'écran de chargement au film
  maxAheadMin: file.maxAheadMin ?? 30,             // ffmpeg ne prépare pas plus de N minutes de film d'avance sur le lecteur
  maxAheadMB: file.maxAheadMB ?? 1000,             // ... ni plus de N Mo de segments temporaires d'avance par film (films 8K très lourds : 14 Mo/s remplissent 4 Go en 5 min)
  firstWaitMs: file.firstWaitMs ?? 0,              // attente max avant de répondre à la 1re demande du lecteur (0 = l'écran de chargement apparaît tout de suite)
  startMode: ['rapide', 'sans-coupure'].includes(file.startMode) ? file.startMode : 'rapide',   // "rapide" : le film démarre dès minBufferSec de film en tampon, même si le débit est trop faible (pauses possibles ; pratique pour zapper) ; "sans-coupure" : attend l'avance nécessaire pour aller au bout sans pause (patientMaxMin)
  patientMaxMin: file.patientMaxMin ?? 45,         // startMode "sans-coupure", débit trop faible : le pont attend d'avoir assez d'avance pour finir le film sans coupure, au plus N min de film d'avance
  landscapeThumbs: file.landscapeThumbs ?? true,   // vignettes 16:9 composées (DeoVR affiche en paysage) ; false = affiche Stremio brute
  stremioPingMs: file.stremioPingMs ?? 15000,      // fréquence du test « Stremio répond-il ? »
  ffmpegRestarts: file.ffmpegRestarts ?? 3,        // relances de ffmpeg si la conversion plante en cours de film
  diskCheckMs: file.diskCheckMs ?? 5000,          // fréquence du contrôle d'espace disque (en plus : au plus 1 s pendant que ffmpeg écrit)
  minFreeGB: file.minFreeGB ?? 15,                 // en dessous, les segments déjà vus depuis longtemps sont supprimés (dossier temporaire)
  trimKeepSec: file.trimKeepSec ?? 300,            // ... en gardant ce nombre de secondes derrière le lecteur
  loaderMaxMin: file.loaderMaxMin ?? 30,           // l'écran de chargement s'arrête après N min sans aucune donnée
  loadingScreen: file.loadingScreen ?? 'always',   // écran de chargement HLS à CHAQUE clic sur un torrent : 'always' | 'auto' (seulement si pas déjà prêt) | 'off'
  hevcDirect: file.hevcDirect ?? true,             // film non H.264 (HEVC...) : le lecteur DeoVR ne le décode pas dans un flux HLS -> écran de chargement, puis lecture directe au clic suivant (true) ou tentative HLS (false)
  loadingCodec: file.loadingCodec || 'h264',       // codec de l'écran d'attente : h264 (seul codec que le lecteur DeoVR/Windows décode dans un flux HLS : mesuré au casque) ; hevc seulement pour des essais
  asciiBadges: file.asciiBadges ?? true,           // DeoVR n'affiche pas les emoji dans ses listes : pastilles en texte [+++] [++] [+] [x] [?]
  jsonDeadlineMs: file.jsonDeadlineMs ?? 8000,     // DeoVR abandonne une fiche vidéo après ~10 s : on répond toujours avant
  dnsMode: (env.DNS_MODE || file.dnsMode || 'auto').toLowerCase(),   // auto : DNS du PC puis DNS public si échec | public : DNS public d'abord | system : DNS du PC seulement
  publicDns: file.publicDns || ['1.1.1.1', '8.8.8.8', '9.9.9.9'],
  debug: !!(env.DEBUG || file.debug || env.BRIDGE_DEV || file.dev),
  dev: !!(env.BRIDGE_DEV || file.dev),                          // mode développeur (--dev, ou "dev": true dans config.json) : journaux détaillés, ffmpeg bavard, page /dev
  stremioApi: (env.STREMIO_API || file.stremioApi || 'https://api.strem.io').replace(/\/$/, ''),   // API du compte Stremio (changer seulement pour les tests)
  tempDir: env.BRIDGE_TMP || file.tempDir || path.join(DATA_DIR, 'tmp'),   // vignettes et segments de lecture (peut être placé sur un autre disque)
};
if (cfg.localFolder && !cfg.localDirs.includes(cfg.videosDir)) cfg.localDirs = [...cfg.localDirs, cfg.videosDir];
const VERSION_INFO = require('./version'), VERSION = VERSION_INFO.version.split('.').slice(0, 2).join('.'), VERSION_FULL = VERSION_INFO.version + (VERSION_INFO.build && VERSION_INFO.build.suffix ? VERSION_INFO.build.suffix : '');

// ---------- Logs (buffer circulaire, consultable sur /debug) ----------
const DEBUGFILE = path.join(DATA_DIR, 'bridge-debug.log');
const rotate = (f, max) => { try { if (fs.existsSync(f) && fs.statSync(f).size > max) fs.renameSync(f, f + '.old'); } catch {} };   // appelé par start() seulement : --report / --diagnose chargent ce module pendant que le pont tourne et ne doivent pas toucher à ses journaux
const logBuf = [];
const recentWarn = new Map();
function log(level, ...a) {
  const text = a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  if (level === 'warn') {   // évite d'inonder le journal avec la même alerte
    const now = Date.now();
    if ((recentWarn.get(text) || 0) > now - 5000) return;
    recentWarn.set(text, now); if (recentWarn.size > 300) recentWarn.clear();
  }
  const line = `${new Date().toISOString()} [${level}] ${text}`;
  logBuf.push(line); if (logBuf.length > 500) logBuf.shift();
  if (cfg.debug || level !== 'debug') console.log(line);
  try { fs.appendFileSync(DEBUGFILE, line + '\n'); } catch {}
}

// ---------- Filets de sécurité : aucune erreur ne doit arrêter le pont sans laisser de trace ----------
process.on('uncaughtException', e => { log('error', `EXCEPTION NON GÉRÉE (le pont continue) : ${e && e.stack || e}`); });
process.on('unhandledRejection', e => { log('error', `PROMESSE REJETÉE NON GÉRÉE : ${e && e.stack || e}`); });

const { dnsPub, dnsForce, dnsLocal, dnsStats, forcePublicDns } = require('./dns')({ cfg, log });   // DNS de secours (dns.js)

// Masque les secrets (clés debrid dans les URLs d'addons/flux)
function redact(u) {
  if (!u) return u;
  try {
    const x = new URL(u);
    const ext = (x.pathname.match(/\.[a-z0-9]{2,4}$/i) || [''])[0];
    return `${x.protocol}//${x.host}/…${ext}${x.search ? '?…' : ''}`;
  } catch { return String(u).slice(0, 40) + '…'; }
}

// ---------- Utilitaires ----------
const cache = new Map();
const failCache = new Map();
const inflight = new Map();
async function cached(key, ttlMs, fn, o = {}) {   // o.retry : nouvel essai voulu (relance patiente d'un addon lent) -> l'échec mémorisé ne compte pas
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const f = failCache.get(key);
  if (f && !o.retry && Date.now() - f.t < 60000) throw f.e; // évite de re-attendre un addon en panne à chaque ouverture
  if (inflight.has(key)) return inflight.get(key);   // la même requête est déjà en cours : on la partage (DeoVR en envoie des dizaines identiques)
  const p = (async () => {
    try { const v = await fn(); cache.set(key, { t: Date.now(), v }); failCache.delete(key); return v; }
    catch (e) {
      if (hit) { log('warn', `données périmées réutilisées (${e.message})`); return hit.v; }
      failCache.set(key, { t: Date.now(), e }); throw e;
    }
  })();
  inflight.set(key, p); p.then(() => inflight.delete(key), () => inflight.delete(key));
  return p;
}
function makeLimiter(max) {
  let n = 0; const q = [];
  const run = async (fn, prio) => { if (n >= max) await new Promise(r => (prio ? q.unshift(r) : q.push(r))); n++; try { return await fn(); } finally { n--; const x = q.shift(); if (x) x(); } };
  run.waiting = () => q.length; run.running = () => n; return run;
}
const causeOf = e => { const c = e && e.cause; return c ? ` [${c.code || c.name || ''} ${c.message || ''}]`.replace(/\s+\]/, ']') : ''; };
// Transport alternatif via node:https (contourne certains soucis de fetch/undici : IPv6, proxy...)
function nodeGet(url, { family, method = 'GET', headers = {}, body, timeout = 15000 } = {}, hops = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? require('https') : http;
    const req = lib.request(u, { method, headers: { 'user-agent': UA, ...headers }, family, timeout }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 4) {
        res.resume();
        return resolve(nodeGet(new URL(res.headers.location, u).href, { family, method, headers, body, timeout }, hops + 1));
      }
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) StremioShell/4.4.168 Chrome/108.0.0.0 Safari/537.36';
const hostDown = new Map();
const DEAD_CODES = ['UND_ERR_CONNECT_TIMEOUT', 'ENOTFOUND', 'ENOENT', 'EAI_AGAIN', 'ECONNREFUSED'];
const hostLimiters = new Map();
function getJson(url, opts = {}) {
  let host = ''; try { host = new URL(url).host; } catch {}
  if (/^(127\.0\.0\.1|localhost)/.test(host)) { const { prio, ...o } = opts; return getJsonRaw(url, o); }
  if (!hostLimiters.has(host)) hostLimiters.set(host, makeLimiter(cfg.hostConcurrency));
  const { prio, ...o } = opts;
  return hostLimiters.get(host)(() => getJsonRaw(url, o), prio);
}
async function getJsonRaw(url, opts = {}) {
  const t0 = Date.now();
  const host = new URL(url).host;
  const down = hostDown.get(host);
  if (down && !opts.ignoreDown && Date.now() - down.t < 120000) throw new Error(`hôte injoignable (${down.code}) — ${redact(url)}`);
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(15000), ...opts, headers: { 'user-agent': UA, ...(opts.headers || {}) } });
    log('debug', `GET ${redact(url)} -> ${r.status} (${Date.now() - t0} ms)`);
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${redact(url)}`);
    return await r.json();
  } catch (e) {
    let code = e.cause && e.cause.code;
    const hn = host.replace(/:\d+$/, '');
    if (!opts._dnsRetry && (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'ENOENT' || /certificate|ERR_TLS|UNABLE_TO_VERIFY/i.test(String(code) + (e.cause && e.cause.message))) && forcePublicDns(hn)) {
      log('warn', `connexion impossible à ${hn} (${code}) : nouvel essai avec l'adresse donnée par le DNS public (blocage DNS du FAI ?)`);
      try { return await getJsonRaw(url, { ...opts, _dnsRetry: true, signal: AbortSignal.timeout(12000) }); } catch (e4) { log('warn', `échec aussi via DNS public pour ${hn} : ${e4.message}`); }
    }
    if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_SOCKET') {   // dernier essai : IPv4 forcé via node:https
      try {
        const g = await nodeGet(url, { family: 4, method: opts.method, headers: opts.headers, body: opts.body, timeout: 12000 });
        log('info', `IPv4 forcé OK pour ${redact(url)} -> ${g.status}`);
        if (g.status >= 400) throw new Error(`HTTP ${g.status} sur ${redact(url)}`);
        return JSON.parse(g.text);
      } catch (e3) { if (/^HTTP /.test(e3.message)) throw e3; }
    }
    if (e.name === 'TimeoutError' || e.name === 'AbortError') code = 'TIMEOUT';
    if (code === 'TIMEOUT' && opts.noQuarantine) throw new Error(`délai dépassé (${e.message}) — ${redact(url)}`);
    if (code === 'TIMEOUT') { hostDown.set(host, { t: Date.now() + 120000, code }); throw new Error(`délai dépassé (${e.message}) — ${redact(url)}`); }   // 4 min de pause au total pour un hôte trop lent
    if (DEAD_CODES.includes(code)) {   // inutile de réessayer : DNS/connexion impossible. On évite de re-attendre 10 s à chaque requête.
      hostDown.set(host, { t: Date.now(), code });
      throw new Error(`réseau : ${e.message}${causeOf(e)} — ${redact(url)}`);
    }
    if (!/fetch failed/i.test(e.message)) throw e;
    log('warn', `fetch a échoué pour ${redact(url)}${causeOf(e)} -> repli node:https`);
    let last = e;
    for (const family of [undefined, 4]) {
      try {
        const g = await nodeGet(url, { family, method: opts.method, headers: opts.headers, body: opts.body });
        log('info', `repli node:https OK (family=${family || 'auto'}) pour ${redact(url)} -> ${g.status}`);
        if (g.status >= 400) throw new Error(`HTTP ${g.status} sur ${redact(url)}`);
        return JSON.parse(g.text);
      } catch (e2) { last = e2; }
    }
    throw new Error(`réseau : ${e.message}${causeOf(e)} ; repli : ${last.code || ''} ${last.message} — ${redact(url)}`);
  }
}
const b64u = s => Buffer.from(s).toString('base64url');
const unb64u = s => Buffer.from(s, 'base64url').toString();

// ---------- Stremio : addons du compte ----------
let loginNeeded = false;   // vrai tant que le compte Stremio n'est pas connecté (message dans « En cours » ; page /setup)
const auth = require('./auth')({ cfg, log, dataDir: DATA_DIR, configFile: PATHS.configFile,
  post: (url, body) => getJson(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  onChange: () => { cache.clear(); failCache.clear(); libMemo.clear(); loginNeeded = false; } });
async function getAddons() {
  return cached('addons', 30 * 60000, async () => {
    if (cfg.addonUrls.length) {
      return Promise.all(cfg.addonUrls.map(async u => ({
        base: u.replace(/\/manifest\.json$/, ''), manifest: await getJson(u),
      })));
    }
    let ak; try { ak = await auth.key(); loginNeeded = false; } catch (e) { if (e.code === 'NEED_LOGIN') loginNeeded = true; throw e; }
    const authKey = ak.authKey;
    const col = await getJson(`${cfg.stremioApi}/api/addonCollectionGet`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'AddonCollectionGet', authKey, update: true }),
    });
    if (col.error && (col.error.code === 1 || /session|auth/i.test(String(col.error.message || '')))) { auth.invalid(); loginNeeded = true; throw auth.needLoginError(); }
    if (!col.result?.addons) throw new Error('addonCollectionGet : réponse inattendue ' + JSON.stringify(col).slice(0, 200));
    return col.result.addons.map(a => ({
      base: a.transportUrl.replace(/\/manifest\.json$/, ''), manifest: a.manifest,
    }));
  });
}

const resName = r => (typeof r === 'string' ? r : r.name);
// Ressource supportée ? Les types peuvent être au niveau de la ressource OU du manifest.
function supports(addon, res, type, id) {
  const m = addon.manifest;
  return (m.resources || []).some(r => {
    if (resName(r) !== res) return false;
    const types = (typeof r === 'object' && r.types) || m.types;
    if (types && !types.includes(type)) return false;
    const prefixes = (typeof r === 'object' && r.idPrefixes) || m.idPrefixes;   // ex: ["tt"], ["pt:"]
    if (id && prefixes && !prefixes.some(p => String(id).startsWith(p))) return false;
    return true;
  });
}

// ---------- Catalogues -> onglets ----------
function catalogExtra(c) {
  return c.extra || (c.extraSupported || []).map(n => ({ name: n, isRequired: (c.extraRequired || []).includes(n) }));
}
function listCatalogs(addons, why) {
  const out = [];
  const inc = cfg.catalogInclude && new RegExp(cfg.catalogInclude, 'i');
  const exc = cfg.catalogExclude && new RegExp(cfg.catalogExclude, 'i');
  const skip = (c, reason) => why && why.push({ catalog: `${c.type}/${c.id}`, name: c.name, reason });
  for (const a of addons) {
    for (const c of a.manifest.catalogs || []) {
      if (!cfg.types.includes(c.type)) { skip(c, `type ${c.type} non géré`); continue; }
      const extra = catalogExtra(c);
      const genre = extra.find(e => e.name === 'genre');
      const search = extra.find(e => e.name === 'search');
      const otherRequired = extra.filter(e => e.isRequired && e.name !== 'genre' && e.name !== 'search');
      const name = c.name || c.id;
      if (search) out.push({ addon: a, cat: c, search: true, name: `Recherche · ${name}` });
      if (search && search.isRequired) continue;
      if (otherRequired.length) { skip(c, `paramètre requis: ${otherRequired.map(e => e.name)}`); continue; }
      if (inc && !inc.test(name)) { skip(c, 'catalogInclude'); continue; }
      if (exc && exc.test(name)) { skip(c, 'catalogExclude'); continue; }
      if (genre && genre.isRequired) {
        for (const g of (genre.options || []).slice(0, cfg.maxGenresPerCatalog)) out.push({ addon: a, cat: c, genre: g, name: `${name} · ${g}`, addonName: a.manifest.name });
      } else {
        out.push({ addon: a, cat: c, name });
        if (cfg.genreTabs && genre) for (const g of (genre.options || []).slice(0, cfg.maxGenresPerCatalog)) out.push({ addon: a, cat: c, genre: g, name: `${name} · ${g}` });
      }
    }
  }
  // Répartition équitable : un onglet par addon à tour de rôle (sinon un gros addon occupe tous les onglets)
  const searches = out.filter(e => e.search);
  const groups = new Map();
  for (const e of out.filter(e => !e.search)) { if (!groups.has(e.addon)) groups.set(e.addon, []); groups.get(e.addon).push(e); }
  const rr = []; const lists = [...groups.values()];
  for (let i = 0; lists.some(l => i < l.length); i++) for (const l of lists) if (i < l.length) rr.push(l[i]);
  return [...rr, ...searches];
}

const catalogMetas = new Map();
async function fetchCatalog(entry, query, skip = 0, patient = false) {
  const { addon, cat } = entry;
  const extra = [];
  if (entry.genre) extra.push(`genre=${encodeURIComponent(entry.genre)}`);
  if (query) extra.push(`search=${encodeURIComponent(query)}`);
  if (skip) extra.push(`skip=${skip}`);
  const url = `${addon.base}/catalog/${cat.type}/${encodeURIComponent(cat.id)}${extra.length ? '/' + extra.join('&') : ''}.json`;
  const data = await cached(url, cfg.cacheMinutes * 60000, () => getJson(url, { signal: AbortSignal.timeout(cfg.catalogTimeoutMs * (patient ? 4 : 1)), ...(patient ? { ignoreDown: true, noQuarantine: true } : {}) }), { retry: patient });   // patient : relance en arrière-plan d'un addon lent (ni l'échec mémorisé ni la quarantaine de l'hôte ne l'empêchent)
  for (const m of data.metas || []) if (m && m.id) { catalogMetas.set(m.id, m); noteCat(m.id, entry); }
  return data.metas || [];
}
// Première page + pages suivantes (skip) si le catalogue en propose
async function fetchCatalogPages(entry, query, patient = false) {
  const first = await fetchCatalog(entry, query, 0, patient);
  const supportsSkip = catalogExtra(entry.cat).some(e => e.name === 'skip');
  if (query || !supportsSkip || first.length < 10 || cfg.pagesPerTab < 2) return first;
  const rest = await Promise.all(Array.from({ length: cfg.pagesPerTab - 1 }, (_, i) =>
    fetchCatalog(entry, query, first.length * (i + 1), patient).catch(() => [])));
  return first.concat(...rest);
}


// ---------- VR : un film est déclaré VR à DeoVR dès que son catalogue / sa catégorie / son genre / son titre l'indique ----------
const filmCats = new Map();   // id film -> Set des noms de catalogues et de genres qui le listent
function noteCat(id, entry) {
  let s = filmCats.get(id); if (!s) filmCats.set(id, s = new Set());
  s.add(String(entry.cat.name || entry.cat.id)); if (entry.genre) s.add(String(entry.genre));
  if (filmCats.size > 30000) filmCats.clear();
}
const catNames = (m, sceneName) => [sceneName, ...(filmCats.get(m.id) || [])].filter(Boolean).map(x => String(x).replace(/^Recherche · /, ''));
function vrForce(m, sceneName) {   // raison pour laquelle le film DOIT être déclaré VR (jamais « écran plat ») ; '' = aucune raison forte
  const c = catNames(m, sceneName).find(x => /vr/i.test(x)); if (c) return `catalogue/catégorie « ${c} » contient VR`;
  const g = [].concat(m.genres || m.genre || []).find(x => /vr|virtual reality/i.test(String(x))); if (g) return `genre « ${g} »`;
  if (/(^|[^a-z0-9])vr([^a-z0-9]|$)|vr[-. ]?(180|360)/i.test(m.name || '')) return 'le titre contient VR';
  return '';
}
function vrWhy(m, sceneName) {   // le film est-il à lister comme VR/3D ? (filtre « VR seulement »)
  const f = vrForce(m, sceneName); if (f) return f;
  if (VR_RE.test(m.name || '')) return 'titre (3D/180/360/SBS)';
  const c = catNames(m, sceneName).find(x => /(^|[^a-z0-9])(3d|180|360)([^a-z0-9]|$)/i.test(x)); return c ? `catalogue « ${c} »` : '';
}
const isVR = (m, sceneName) => !!vrWhy(m, sceneName);
function applyVR(f, why) {   // film déclaré VR par son catalogue : jamais plat. Format du titre s'il existe (360, tb, fisheye, mkx200…), sinon dôme 180° côte à côte
  if (!why || f.screenType !== 'flat') return f;
  return { screenType: 'dome', stereoMode: f.stereoMode === 'off' ? 'sbs' : f.stereoMode, is3d: true, forced: why };
}
const formatOf = (m, sceneName) => applyVR(detectFormat(m.name || ''), vrForce(m, sceneName));
const MINLV = { black: 0, red: 1, orange: 2, green: 3 };
// Pastille : TOUJOURS la même dans la liste ET dans le titre de la fiche vidéo (DeoVR remplace le titre de la liste par celui de la fiche après 2-3 s).
// Film lancé par un clic : état du téléchargement ; sinon : seeders annoncés par les trackers (aucun test, aucun téléchargement).
// Film « mort au clic » : téléchargement lancé, mais aucune métadonnée ni aucun octet après 90 s alors que les trackers annonçaient des seeders
// (constaté le 02/10 : torrents annoncés S6 par les trackers publics, 2 pairs qui n'envoient rien). Classé en fin de liste et retiré de « Plus de seeds » pendant 2 h.
const clickDead = new Map();   // id film -> date du constat
const isClickDead = id => { const t = clickDead.get(id); return !!t && Date.now() - t < 2 * 3600000; };
function tagInfo(m) {
  const D = dlByFilm.get(m.id);
  if (D) { const s = dlState(D); return { label: s.label, cls: s.cls, dl: true }; }
  if (isClickDead(m.id)) return { label: 'ÉCHEC · aucune donnée', cls: 'k' };
  const h = filmHealth.get(m.id);
  if (!h) return (isVR(m, '') || cfg.scanAll) ? { label: 'S?', cls: 'u' } : null;
  const S = h.http ? 'HTTP' : (h.level < 0 && !h.seeders) ? 'S?' : 'S' + (h.seeders || 0);
  return { label: S, cls: h.http ? 'g' : ({ 3: 'g', 2: 'o', 1: 'r', 0: 'k' }[h.level] || 'u') };
}
const DOT = { g: '🟢', o: '🟠', r: '🔴', k: '⚫', u: '⚪', b: '🔵' };
function healthTag(m, html) {
  if (!cfg.showHealth) return '';
  const t = tagInfo(m); if (!t) return '';
  return html ? `${DOT[t.cls] || '⚪'} [${t.label}] ` : `[${t.label}] `;
}
// ----- vignettes : DeoVR affiche des vignettes en PAYSAGE (16:9) ; les affiches Stremio sont en portrait -> on compose une image 16:9 (affiche entière centrée sur un fond flou) -----
const thumbBusy = new Map(); let thumbActive = 0; const thumbWait = [];
function thumbUrl(base, url, ov) {   // ov : { badge, prog } -> texte et barre d'avancement dessinés sur la vignette
  if (!(url && cfg.landscapeThumbs && ffmpegOk && /^https?:\/\//i.test(url))) return url || '';
  const q = ov && (ov.badge || ov.prog != null) ? '?' + [ov.badge ? 'b=' + encodeURIComponent(ov.badge) : '', ov.prog != null ? 'p=' + ov.prog : ''].filter(Boolean).join('&') : '';
  return `${base}/thumb/${b64u(url)}.jpg${q}`;
}
function cleanOv(sp) {   // paramètres de la vignette reçus par l'URL : texte restreint (ASCII sûr pour drawtext), progression arrondie à 10 %
  const badge = String(sp.get('b') || '').replace(/[^A-Za-z0-9 .|%+\-\/]/g, '').trim().slice(0, 40), p = sp.get('p');
  return { badge, prog: p !== null && p !== '' && isFinite(+p) ? Math.max(0, Math.min(100, Math.round(+p / 10) * 10)) : null };
}
function badgeText(m) {   // « 8K VR180 S34 » : ce que le titre ne dit pas assez lisiblement
  try { const h = filmHealth.get(m.id), res = resLabel((h && h.res) || detectRes(m.name || '')), f = fmtLabel('', formatOf(m, '')), t = tagInfo(m); return [res, f, t && /^(S\d+|HTTP)$/.test(t.label) ? t.label : ''].filter(Boolean).join(' '); } catch { return ''; }
}
async function makeThumb(url, ov = {}) {
  const thumbDir = path.join(cfg.tempDir, 'thumbs'), sha = x => require('crypto').createHash('sha1').update(x).digest('hex'), over = !!(ov.badge || ov.prog != null);
  const f = path.join(thumbDir, sha(over ? `${url}|${ov.badge || ''}|${ov.prog ?? ''}` : url) + '.jpg'), src = path.join(thumbDir, sha(url) + '.src');   // l'affiche d'origine est gardée : les variantes (badge, avancement) ne la retéléchargent pas
  if (fs.existsSync(f)) return f;
  if (thumbBusy.has(f)) return thumbBusy.get(f);
  const p = (async () => {
    while (thumbActive >= 3) await new Promise(r => thumbWait.push(r));
    thumbActive++;
    try {
      fs.mkdirSync(thumbDir, { recursive: true });
      if (!fs.existsSync(src)) { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error('HTTP ' + r.status); fs.writeFileSync(src, Buffer.from(await r.arrayBuffer())); }
      let g = '[0:v]split[a][b];[a]scale=960:540:force_original_aspect_ratio=increase,crop=960:540,boxblur=24:4,eq=brightness=-0.15[bg];[b]scale=960:540:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2', tf = '';
      if (ov.badge && FONT) { tf = f + '.txt'; fs.writeFileSync(tf, ov.badge, 'utf8'); g += `,drawbox=x=0:y=ih-76:w=iw:h=76:color=black@0.6:t=fill,drawtext=fontfile='${escF(FONT)}':textfile='${escF(tf)}':expansion=none:fontcolor=white:fontsize=40:x=24:y=h-62`; }
      if (ov.prog != null) { g += ',drawbox=x=0:y=ih-10:w=iw:h=10:color=0x334455:t=fill'; if (ov.prog > 0) g += `,drawbox=x=0:y=ih-10:w=iw*${ov.prog / 100}:h=10:color=0x33cc77:t=fill`; }
      const err = await new Promise(ok => { const pr = cp.spawn(cfg.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-filter_complex', g, '-frames:v', '1', '-q:v', '4', f], { stdio: ['ignore', 'ignore', 'pipe'] }); let e = ''; pr.stderr.on('data', d => e += d); pr.on('error', x => ok(x.message)); pr.on('exit', c => ok(c === 0 ? '' : e.trim().slice(-200))); });
      if (tf) try { fs.rmSync(tf, { force: true }); } catch {}
      if (err) throw new Error(err);
      return f;
    } finally { thumbActive--; const w = thumbWait.shift(); if (w) w(); }
  })();
  thumbBusy.set(f, p); p.then(() => thumbBusy.delete(f), () => thumbBusy.delete(f));
  return p;
}
function metaToItem(m, base) {
  return {
    title: healthTag(m) + (m.name || m.id),
    videoLength: parseRuntime(m.runtime),
    thumbnailUrl: thumbUrl(base, m.background && /^https?:/i.test(m.background) ? m.background : m.poster, cfg.thumbBadges ? { badge: badgeText(m) } : null),
    video_url: `${base}/video/${m.type || 'movie'}/${encodeURIComponent(m.id)}.json`,
  };
}
const isHidden = id => { const h = filmHealth.get(id); return !!(h && h.hidden); };   // seulement les films SANS aucune source exploitable
// tri : beaucoup de seeders d'abord, inconnu au milieu, 0 seeder annoncé en fin de liste (jamais masqué)
const sortKey = id => { if (isClickDead(id)) return 0.4; const h = filmHealth.get(id); if (!h || h.level < 0) return 2.5; return ({ 3: 5, 4: 5, 2: 4, 1: 2.8, 0: 0.5 })[h.level] ?? 2.5; };
function toScene(name, metas, base) {
  if (cfg.vrOnly) metas = metas.filter(m => isVR(m, name));
  const seen = new Set();
  metas = metas.filter(m => m.id && !seen.has(m.id) && seen.add(m.id)).filter(m => !isHidden(m.id));
  if (cfg.sortByHealth) metas = metas.map((m, i) => [m, i]).sort((x, y) => (sortKey(y[0].id) - sortKey(x[0].id)) || (x[1] - y[1])).map(x => x[0]);
  metas = metas.slice(0, cfg.itemsPerTab);
  queueScans(metas, name, base);
  const list = metas.map(m => metaToItem(m, base));
  return list.length ? { name: name.slice(0, 40), list } : null;
}
function queueScans(metas, name, base) {   // analyse légère (addons + trackers UDP), jamais de torrent
  let queued = 0;
  for (const m of metas) if (queued < cfg.scanMax && (cfg.scanAll || isVR(m, name)) && !scanSet.has(m.id)) { const h = filmHealth.get(m.id); if (!h || h.level < 0 || Date.now() - h.t > 30 * 60000) { enqueueScan(m.type || 'movie', m.id, base); queued++; } }
}
const TESTS = {
  'mp4-2d': { title: 'Test 1 · MP4 2D (direct)', file: 'test-2d.mp4', stereo: 'off' },
  'mp4-3d': { title: 'Test 2 · MP4 3D côte à côte (direct)', file: 'test-3d-sbs.mp4', stereo: 'sbs' },
  'mkv-2d': { title: 'Test 3 · MKV 2D (direct)', file: 'test-2d.mkv', stereo: 'off' },
  'relay-2d': { title: 'Test 4 · MP4 2D via le relais (comme les torrents)', file: 'test-2d.mp4', stereo: 'off', relay: true },
  'bascule-2d': { title: 'Test 5 · Chargement puis vidéo 2D (bascule)', file: 'test-2d.mp4', stereo: 'off', hls: 'flat' },
  'bascule-sbs': { title: 'Test 6 · Chargement puis vidéo 3D (bascule, taille différente)', file: 'test-3d-sbs.mp4', stereo: 'sbs', hls: 'sbs' },
  'empty': { title: 'Aucun film en cours', file: 'test-2d.mp4', stereo: 'off', hidden: true },   // renvoyé par l'onglet « En cours » vide ; absent de l'onglet Test
};
let labInst = null;   // banc de test casque (bridge/lab.js), créé à la première utilisation
const lab = () => labInst || (labInst = require('./lab').create({ cfg, log, serveLocal, font: FONT, escF, ffmpegOk, hevcOk: hevcEnc === 'libx265', thumb: base => `${base}/test/thumb.jpg` }));
function testScene(base) {
  return { name: 'Test pont', list: [...Object.entries(TESTS).filter(([, t]) => !t.hidden).map(([k, t]) => ({ title: t.title, videoLength: 12, thumbnailUrl: `${base}/test/thumb.jpg`, video_url: `${base}/video/test/${k}.json` })), ...(ffmpegOk ? lab().items(base) : [])] };
}
function testVideo(key, base) {
  const t = TESTS[key]; if (!t) return null;
  const direct = `${base}/test/${t.file}`;
  const url = t.hls ? `${base}/test/switch/${t.hls}/index.m3u8` : t.relay ? `${base}/proxy/${b64u(`http://127.0.0.1:${new URL(base).port || 80}/test/${t.file}`)}/${b64u('{}')}/video.mp4` : direct;
  return { id: 9000 + Object.keys(TESTS).indexOf(key), title: t.title, videoLength: 12, thumbnailUrl: `${base}/test/thumb.jpg`, screenType: 'flat', stereoMode: t.stereo, is3d: t.stereo !== 'off', encodings: [{ name: 'h264', videoSources: [{ resolution: t.stereo === 'sbs' ? 1080 : 1080, url }] }] };
}
function serveTestFile(req, res, name) {
  const f = path.join(RES_DIR, 'test', path.basename(name));
  if (!/^[\w.-]+$/.test(name) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const ext = path.extname(f).toLowerCase();
  return serveLocal(req, res, f, { '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.jpg': 'image/jpeg' }[ext] || 'application/octet-stream');
}
function serveLocal(req, res, f, type) {
  const size = fs.statSync(f).size;
  let start = 0, end = size - 1, code = 200;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) { if (m[1] !== '') { start = +m[1]; if (m[2] !== '') end = Math.min(+m[2], size - 1); } else if (m[2] !== '') start = Math.max(0, size - +m[2]); code = 206; }
  if (start > end || start >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
  const h = { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'no-cache' };
  if (code === 206) h['content-range'] = `bytes ${start}-${end}/${size}`;
  res.writeHead(code, h);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(f, { start, end }).on('error', () => res.destroy()).pipe(res);
}
// ---------- Bibliothèque locale (vidéos sur ce PC : fonctionne sans internet, sans Stremio, sans torrent) ----------
const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|avi|mpg|mpeg|webm|ts)$/i;
const localIndex = { t: 0, files: [] }, probeCache = new Map(), localTitles = new Map();
function scanLocal() {
  if (Date.now() - localIndex.t < 30000) return localIndex.files;
  const files = [];
  cfg.localDirs.forEach((dir, di) => {
    const walk = (d, depth) => {
      let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { log('warn', `dossier local illisible (${d}) : ${e.message}`); return; }
      for (const e of ents) {
        const p = path.join(d, e.name);
        if (e.isDirectory() && depth < 3) walk(p, depth + 1);
        else if (e.isFile() && VIDEO_EXT.test(e.name)) { let st; try { st = fs.statSync(p); } catch { continue; } files.push({ id: b64u(`${di}|${path.relative(dir, p)}`).slice(0, 60), path: p, name: e.name, size: st.size, mtime: st.mtimeMs }); }
      }
    };
    walk(dir, 0);
  });
  files.sort((x, y) => y.mtime - x.mtime); localIndex.t = Date.now(); localIndex.files = files;
  for (const f of files) localTitles.set(f.id, f.name);
  return files;
}
const localFormat = name => {   // format lu dans le nom du fichier ; sinon réglage localDefaultFormat
  const f = detectFormat(name, { local: true });
  if (f.screenType !== 'flat' || f.is3d || cfg.localDefaultFormat === 'flat') return f;
  return cfg.localDefaultFormat === 'vr180' ? { screenType: 'dome', stereoMode: 'sbs', is3d: true } : { screenType: 'sphere', stereoMode: 'off', is3d: false };
};
const localDeclare = name => {   // même règle que formatMenu des films : format déclaré seulement s'il est lu dans le nom (ou imposé par localDefaultFormat) ; sinon le menu FLAT / 180 / 360 / fisheye de DeoVR reste disponible (il retient le choix par vidéo)
  const f0 = detectFormat(name, { local: true }), named = f0.screenType !== 'flat' || f0.is3d || cfg.localDefaultFormat !== 'flat';
  return cfg.formatMenu === 'declare' || (cfg.formatMenu === 'auto' && named);
};
const localFile = id => scanLocal().find(x => x.id === id) || null;   // uniquement les fichiers listés : pas de chemin libre
const cleanName = n => n.replace(VIDEO_EXT, '').replace(/[_.]+/g, ' ').trim();
function probeLocal(f) {
  if (probeCache.has(f.path)) return probeCache.get(f.path);
  let info = {};
  try {
    const r = cp.spawnSync(cfg.ffmpeg.replace(/ffmpeg(\.exe)?$/i, (m, e) => 'ffprobe' + (e || '')), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height:format=duration', '-of', 'json', f.path], { timeout: 10000, encoding: 'utf8' });
    if (r.status === 0) { const j = JSON.parse(r.stdout), st = (j.streams || [])[0] || {}; info = { codec: st.codec_name, w: st.width, h: st.height, dur: Math.round(+((j.format || {}).duration) || 0) }; }
  } catch {}
  probeCache.set(f.path, info); return info;
}
function localScene(base) {
  const files = scanLocal().slice(0, 300);
  if (!files.length) return cfg.localFolder ? { name: 'Local', list: [{ title: 'Dossier vide : copiez vos vidéos dans le dossier « videos » du pont', videoLength: 12, thumbnailUrl: `${base}/test/thumb.jpg`, video_url: `${base}/video/test/empty.json` }] } : null;
  return { name: 'Local', list: files.map(f => ({ title: cleanName(f.name), videoLength: (probeCache.get(f.path) || {}).dur || 0, thumbnailUrl: `${base}/localthumb/${f.id}.jpg`, video_url: `${base}/video/local/${f.id}.json` })) };
}
function localVideo(id, base, platform) {
  const f = localFile(id); if (!f) return null;
  const info = probeLocal(f), ext = path.extname(f.name).toLowerCase(), fmt = localFormat(f.name);
  const bad = platform === 'windows' && ((ext === '.mkv' && info.codec !== 'hevc') || ext === '.webm' || info.codec === 'av1' || info.codec === 'vp9');   // MKV HEVC : lu directement (Labo 9), le convertir en HLS TS le ferait redémarrer à 15 s
  const canRemux = bad && ffmpegOk && info.codec !== 'av1' && info.codec !== 'vp9';
  if (bad && !canRemux) log('warn', `« ${f.name} » : format non lu par DeoVR Windows (MKV/AV1/VP9) et ffmpeg indisponible : installe ffmpeg`);
  const url = canRemux ? `${base}/hls/local/${f.id}/index.m3u8` : `${base}/localfile/${f.id}/video${ext}`;
  log('info', `vidéo locale « ${f.name} » : ${info.codec || '?'} ${info.w || '?'}x${info.h || '?'} ${fmt.screenType}/${fmt.stereoMode} ${canRemux ? '(converti en HLS)' : bad ? '(format à risque)' : '(direct)'}`);
  return { id: 5000 + Math.abs([...f.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 4000, title: cleanName(f.name), videoLength: info.dur || 0, thumbnailUrl: `${base}/localthumb/${f.id}.jpg`,
    ...(localDeclare(f.name) ? { screenType: fmt.screenType, stereoMode: fmt.stereoMode, is3d: fmt.is3d } : {}), encodings: [{ name: 'h264', videoSources: [{ resolution: info.h || detectRes(f.name) || 1080, url }] }] };
}
async function localThumb(req, res, id) {
  const f = localFile(id), fallback = () => serveTestFile(req, res, 'thumb.jpg');
  if (!f || !ffmpegOk) return fallback();
  const dir = path.join(cfg.tempDir, 'thumbs'); fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, id.replace(/[^\w-]/g, '') + '.jpg');
  if (!fs.existsSync(out)) {
    const fmt = localFormat(f.name), crop = fmt.stereoMode === 'sbs' ? 'crop=iw/2:ih:0:0,' : fmt.stereoMode === 'tb' ? 'crop=iw:ih/2:0:0,' : '';
    await new Promise(r => cp.execFile(cfg.ffmpeg, ['-y', '-loglevel', 'error', '-ss', '8', '-i', f.path, '-frames:v', '1', '-vf', crop + 'scale=480:-2', out], { timeout: 25000 }, () => r()));
  }
  return fs.existsSync(out) ? serveLocal(req, res, out, 'image/jpeg') : fallback();
}
// ---------- Onglets « intelligents » (aucun n'est basé sur une mesure qui télécharge) ----------
const slotKeys = [];   // emplacement n -> clé "hash:idx" du film : un film garde le même emplacement tant qu'il est dans le registre
function slotSync() {
  const n = Math.max(1, cfg.coursSlots | 0);
  slotKeys.length = n; for (let i = 0; i < n; i++) if (!slotKeys[i] || !dls.has(slotKeys[i])) slotKeys[i] = null;
  for (const D of [...dls.values()].sort((x, y) => (y.active - x.active) || (y.lastPlayer - x.lastPlayer))) {
    if (slotKeys.includes(D.key)) continue;
    let i = slotKeys.indexOf(null);
    if (i < 0) { const c = slotKeys.map((k, j) => ({ j, D: dls.get(k) })).filter(x => x.D && !x.D.active).sort((x, y) => x.D.lastPlayer - y.D.lastPlayer)[0]; if (!c) break; i = c.j; }   // plus d'emplacement libre : le film en pause le plus ancien cède sa place
    slotKeys[i] = D.key;
  }
  return slotKeys;
}
function dlScene(base) {   // « En cours » : emplacements FIXES (la liste ne change pas de forme, donc DeoVR n'a pas besoin de la redemander) ; chaque emplacement pointe vers /video/slot/<n>.json, résolu au moment où DeoVR lit la fiche
  const list = slotSync().map((k, i) => { const D = k && dls.get(k); return D
    ? { title: '[' + dlState(D).label + '] ' + D.title, videoLength: D.runtime || 0, thumbnailUrl: thumbUrl(base, D.poster || '', cfg.thumbBadges ? { badge: ({ dl: 'EN COURS', ready: 'PRET', complete: 'COMPLET', pause: 'PAUSE', stuck: 'BLOQUE', search: 'RECHERCHE', meta: 'RECHERCHE', sample: 'ECHANTILLONS' })[dlState(D).code] || '', prog: Math.round(100 * (D.progress || 0)) } : null), video_url: `${base}/video/slot/${i + 1}.json` }
    : { title: `Emplacement ${i + 1} · libre (lancez un film)`, videoLength: 12, thumbnailUrl: `${base}/test/thumb.jpg`, video_url: `${base}/video/slot/${i + 1}.json` }; });
  if (disk.low && !disk.critical) list.push({ title: `Disque : ${disk.freeGB} Go libres (fichiers du pont : ${(tmpUsage().total_Mo / 1000).toFixed(1).replace('.', ',')} Go)`, videoLength: 12, thumbnailUrl: `${base}/test/thumb.jpg`, video_url: `${base}/video/test/empty.json` });
  if (disk.critical) list.unshift({ title: `ATTENTION · Disque presque plein (${disk.freeGB} Go libres) : libérez de la place`, videoLength: 12, thumbnailUrl: `${base}/test/thumb.jpg`, video_url: `${base}/video/test/empty.json` });
  if (loginNeeded) list.unshift({ title: `ATTENTION · Connexion Stremio requise : sur le PC, ouvrez http://localhost:${cfg.port}/setup`, videoLength: 12, thumbnailUrl: `${base}/test/thumb.jpg`, video_url: `${base}/video/test/empty.json` });
  if (stremioDown) list.unshift({ title: 'ATTENTION · Stremio ne répond pas : lancez Stremio', videoLength: 12, thumbnailUrl: `${base}/test/thumb.jpg`, video_url: `${base}/video/test/empty.json` });
  return { name: 'En cours', list };
}
const vrPool = () => [...catalogMetas.values()].filter(m => (!cfg.vrOnly || isVR(m, '')) && !isHidden(m.id));
function seedMetas(limit = 60) {   // « Plus de seeds » : seeders annoncés par les trackers (scrape UDP)
  return vrPool().map(m => ({ m, h: filmHealth.get(m.id) })).filter(x => x.h && (x.h.seeders || 0) > 0 && !isClickDead(x.m.id)).sort((a, b) => b.h.seeders - a.h.seeders).slice(0, limit).map(x => x.m);
}
function newMetas(limit = 60) {   // « Nouveautés » : année de sortie la plus récente
  return vrPool().map((m, i) => ({ m, y: +yearOf(m) || 0, i })).filter(x => x.y).sort((a, b) => b.y - a.y || a.i - b.i).slice(0, limit).map(x => x.m);
}
function hqMetas(limit = 60) {   // « Haute qualité » : d'après le TITRE ou la source (indicatif : un titre ne garantit pas la définition réelle)
  return vrPool().filter(m => { const h = filmHealth.get(m.id); return (h && h.res >= 2160) || detectRes(m.name) >= 2160; }).slice(0, limit);
}
function sceneOf(name, metas, base) { if (!metas.length) return null; queueScans(metas.slice(0, 40), name, base); return { name, list: metas.map(m => metaToItem(m, base)) }; }
const slowRetry = new Map();   // nom du catalogue -> dernière relance en arrière-plan
async function catalogScenes(query, max) {   // [{ name, metas }] (réutilisé par la bibliothèque DeoVR et par /ui)
  const addons = await getAddons();
  const entries = listCatalogs(addons).filter(e => (query ? e.search : !e.search)).slice(0, max || cfg.maxTabs), failed = [];
  const res = (await Promise.all(entries.map(async e => {
    try { return { name: e.name, metas: await fetchCatalogPages(e, query) }; }
    catch (err) {
      failed.push(e.name); log('debug', `catalogue ignoré « ${e.name} » : ${err.message}`);
      const k = e.name + '|' + (query || ''); if (!query && Date.now() - (slowRetry.get(k) || 0) > 5 * 60000) {   // addon lent : on réessaie en arrière-plan avec plus de patience, l'onglet apparaîtra au prochain affichage
        slowRetry.set(k, Date.now());
        setTimeout(() => fetchCatalogPages(e, query, true).then(() => log('info', `catalogue « ${e.name} » : chargé (addon lent), disponible au prochain affichage`)).catch(er => log('debug', `catalogue « ${e.name} » : toujours en échec (${er.message})`)), 500).unref();
      }
      return null;
    }
  }))).filter(Boolean);
  if (failed.length) log('warn', `${failed.length} catalogue(s) trop lent(s) ou en panne, ignoré(s) pour cet affichage (addon externe, pas le pont) : ${failed.join(', ')}. Nouvelle tentative en arrière-plan.`);
  return res;
}
const libMemo = new Map(), libCount = { construites: 0, servies_du_cache: 0 };
function libFor(base, q) {   // bibliothèque servie à DeoVR : 8 s de cache (DeoVR la redemande 2 fois en 1 s à chaque relance) ; vidée dès qu'un film change d'état
  const k = base + '|' + (q || ''), h = libMemo.get(k);
  if (h && Date.now() - h.t < 8000) { libCount.servies_du_cache++; return h.p; }
  libCount.construites++; const p = buildLibrary(base, q); libMemo.set(k, { t: Date.now(), p }); p.catch(() => libMemo.delete(k)); if (libMemo.size > 20) libMemo.clear();
  return p;
}
async function buildLibrary(base, query) {
  let scenes = [];
  try {
    const cs = await catalogScenes(query);
    scenes = cs.map(x => toScene(x.name, x.metas, base)).filter(Boolean);
    if (query) { const all = cs.flatMap(x => x.metas), sc = toScene(`Résultats · ${query}`.slice(0, 40), all, base); if (sc) scenes.unshift(sc); log('info', `recherche « ${query} » : ${all.length} résultat(s) dans ${cs.length} catalogue(s)`); }
  } catch (e) { log('warn', `catalogues Stremio indisponibles (${e.message}) : seuls les onglets locaux et de test sont affichés`); }
  if (!query) {
    const pre = [dlScene(base)];
    if (cfg.localDirs.length) { const ls = localScene(base); if (ls) pre.push(ls); }
    pre.push(...[sceneOf('Plus de seeds', seedMetas(), base), sceneOf('Nouveautés', newMetas(), base), sceneOf('Haute qualité (titre)', hqMetas(), base)].filter(Boolean));
    scenes = [...pre, ...scenes];
    if (cfg.toolsTab && ffmpegOk) scenes.push(toolsMod().scene(base));
    if (cfg.testScene) scenes.push(testScene(base));
  }
  return { scenes, authorized: cfg.authorized };
}
// /catalogs : liste lisible des catalogues (pour construire des URLs /deovr?catalog=...&genre=...)
async function catalogList() {
  const addons = await getAddons();
  return addons.flatMap(a => (a.manifest.catalogs || []).filter(c => cfg.types.includes(c.type)).map(c => {
    const extra = catalogExtra(c), g = extra.find(e => e.name === 'genre');
    return { addon: a.manifest.name, id: c.id, type: c.type, name: c.name, genreRequired: !!(g && g.isRequired), genres: g && g.options, search: !!extra.find(e => e.name === 'search') };
  }));
}
// /deovr?catalog=<id ou partie du nom>&genre=<genre> : un catalogue précis, hors limite d'onglets
async function browse(base, key, genre) {
  const addons = await getAddons(); const k = key.toLowerCase(); const scenes = [];
  for (const a of addons) for (const c of a.manifest.catalogs || []) {
    if (!cfg.types.includes(c.type)) continue;
    if (c.id.toLowerCase() !== k && !(c.name || '').toLowerCase().includes(k)) continue;
    try {
      const sc = toScene(`${c.name || c.id}${genre ? ' · ' + genre : ''}`, await fetchCatalogPages({ addon: a, cat: c, genre }, null), base);
      if (sc) scenes.push(sc);
    } catch (err) { log('warn', `browse « ${c.name} » : ${err.message}`); }
  }
  return { scenes, authorized: cfg.authorized };
}

// ---------- Streams -> JSON vidéo DeoVR ----------

// URL de base du serveur Stremio local telle que DeoVR doit l'appeler
function localBaseFor(reqHost) {
  if (cfg.localStremioPublic) return cfg.localStremioPublic;
  const host = (reqHost || '').replace(/:\d+$/, '');
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:${new URL(cfg.localStremio).port || 11470}`;
  return cfg.localStremio;
}

// Format officiel (stremio-core) : {serveur}/{infoHash}/{fileIdx|-1}?tr=<source>&tr=...&f=<fileMustInclude>
// -1 = plus gros fichier. Le bridge relaie ce flux (Range) pour que DeoVR ne parle qu'à une seule adresse.
const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce', 'udp://open.tracker.cl:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce', 'udp://open.stealth.si:80/announce',
  'udp://exodus.desync.com:6969/announce', 'udp://tracker.tiny-vps.com:6969/announce',
  'udp://opentracker.io:6969/announce', 'https://tracker.tamersunion.org:443/announce',
  'udp://open.demonii.com:1337/announce', 'udp://tracker.dler.org:6969/announce', 'udp://explodie.org:6969/announce',
  'http://bt.t-ru.org/ann?magnet', 'http://bt2.t-ru.org/ann?magnet', 'http://bt3.t-ru.org/ann?magnet', 'http://bt4.t-ru.org/ann?magnet',
];
const torrentQ = new Map();   // hash -> paramètres tr=/f= gardés côté pont
const sniffedExt = new Map();   // hash/idx -> extension réelle (détectée sur les premiers octets)
function torrentQuery(s) {
  const q = new URLSearchParams();
  const own = (s.sources || []).filter(Boolean);
  for (const t of own) q.append('tr', t);
  const have = new Set(own.map(t => t.replace(/^tracker:/, '')));
  for (const t of [...DEFAULT_TRACKERS, ...cfg.extraTrackers, ...cfg.scrapeTrackers.map(x => `udp://${x}/announce`)]) if (!have.has(t)) { have.add(t); q.append('tr', 'tracker:' + t); }   // v8.2 : TOUJOURS ajouter les trackers publics (les seeders vus par le scrape y sont)
  if (!own.some(t => /^dht:/.test(t))) q.append('tr', 'dht:' + String(s.infoHash).toLowerCase());
  for (const f of [].concat(s.fileMustInclude || [])) q.append('f', f);
  return q.toString();
}
function toPlayable(s, base) {
  const hints = s.behaviorHints || {};
  const headers = hints.proxyHeaders?.request;
  const extOf = (name, d) => ((name || '').match(/\.[a-z0-9]{2,4}$/i) || [d])[0];
  if (s.url) {
    if (headers || cfg.forceProxy) {
      let ext = '.mp4'; try { ext = extOf(new URL(s.url).pathname, '.mp4'); } catch {}
      return { kind: 'proxied', origUrl: s.url, url: `${base}/proxy/${b64u(s.url)}/${b64u(JSON.stringify(headers || {}))}/video${ext}` };
    }
    return { kind: 'direct', url: s.url };
  }
  if (s.infoHash && /^[0-9a-f]{40}$/i.test(s.infoHash)) {
    const q = torrentQuery(s);
    const idx = Number.isInteger(s.fileIdx) ? s.fileIdx : -1;
    torrentQ.set(s.infoHash.toLowerCase(), q);
    const ext = sniffedExt.get(`${s.infoHash.toLowerCase()}/${idx}`) || extOf(hints.filename, '.mp4');
    return { kind: 'torrent', origUrl: `${cfg.localStremio}/${s.infoHash.toLowerCase()}/${idx}${q ? '?' + q : ''}`, url: `${base}/torrent/${s.infoHash.toLowerCase()}/${idx}/video${ext}` };
  }
  return { kind: 'unsupported', url: null };   // ytId, externalUrl, nzb, archives...
}

// Lit l'en-tête d'un fichier (128 Ko) : conteneur, codec, fichier lisible ? (archives/ISO exclus)
const MIME = { '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.ts': 'video/mp2t' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function collectStreams(type, id, o = {}) {
  const waitMs = o.ms || cfg.streamsTimeoutMs;
  const addons = await getAddons();
  let incomplete = false;
  const res = await Promise.all(addons.filter(a => supports(a, 'stream', type, id)).map(async a => {
    const p = cached(`${a.base}/stream/${type}/${id}`, 45 * 60000, () => getJson(`${a.base}/stream/${type}/${encodeURIComponent(id)}.json`, { signal: AbortSignal.timeout(40000), prio: o.prio }));
    try {
      const d = await Promise.race([p, sleep(waitMs).then(() => 'late')]);
      if (d === 'late') { incomplete = true; p.catch(() => {}); log('warn', `addon flux « ${a.manifest.name} » trop lent (> ${waitMs} ms), ignoré cette fois (le résultat sera prêt au prochain essai)`); return []; }
      return (d.streams || []).map(s => ({ ...s, _addon: a.manifest.name || a.base }));
    } catch (e) { incomplete = true; log('warn', `addon flux « ${a.manifest.name} » : ${e.message}`); return []; }
  }));
  const all = res.flat(); all.incomplete = incomplete; return all;
}

async function analyzeVideo(type, id, base, reqHost, opts = {}) {
  const platform = opts.platform || cfg.platform;
  const raw = await collectStreams(type, id, { ms: opts.streamsMs, prio: opts.prio });
  const title = (catalogMetas.get(id) || {}).name || '';
  const why = vrForce(catalogMetas.get(id) || { id, name: title }, '') || ((dlByFilm.get(id) || {}).vrWhy || '');   // le catalogue / la catégorie / le genre dit VR ?
  const cands = raw.map(s => {
    const text = [s.name, s.title, s.description, s.behaviorHints?.filename].filter(Boolean).join(' ');
    const play = toPlayable(s, base);
    // v8.2 : le flux ne dit souvent rien du format (VR/180/SBS, 8K) : on complète avec le titre du catalogue
    let f = detectFormat(text); if (!f.is3d && f.screenType === 'flat' && title) f = detectFormat(text + ' ' + title);
    const f0 = f; f = applyVR(f, why);   // film VR (par son catalogue) : jamais déclaré plat
    const fmtReason = f.forced ? `${why} -> déclaré VR ${f.screenType} ${f.stereoMode} (aucun format précis dans le titre)` : f0.screenType !== 'flat' ? `format lu dans le titre/flux : ${f0.screenType} ${f0.stereoMode}` : f0.is3d ? `format lu dans le titre/flux : 3D écran plat ${f0.stereoMode}` : 'aucun indice VR (ni catalogue, ni titre) -> écran plat';
    const res = detectRes(text) || detectRes(title);
    return { addon: s._addon, text, ...play, ...f, fmtReason, resolution: res, codec: detectCodec(text + ' ' + title), seeders: seedersOf(text), size: s.behaviorHints?.videoSize || 0, raw: s };
  });
  const usable = cands.filter(c => c.url);
  usable.sort((a, b) => (b.is3d - a.is3d) || (b.resolution - a.resolution));   // (les seeders réels sont ajoutés ensuite)
  const best = usable[0] || null;
  const chosen = best ? usable.filter(s => s.screenType === best.screenType && s.stereoMode === best.stereoMode) : [];
  await Promise.all(chosen.filter(c => c.kind === 'torrent').slice(0, 40).map(async c => {   // seeders réels annoncés par les trackers (une seule salve UDP)
    c.scrape = await (opts.scrapeMs ? Promise.race([seedInfo(c.raw.infoHash), sleep(opts.scrapeMs).then(() => null)]) : seedInfo(c.raw.infoHash)); if (c.scrape) c.seeders = c.scrape.seeders;
  }));
  // pré-sélection : les 2 mieux notés (seeders annoncés) par couple (codec, résolution), un flux HTTP passe devant un torrent
  const keyOf = c => `${c.codec}:${c.resolution}`;
  const groups = new Map();
  for (const c of [...chosen].sort((x, y) => ((y.kind !== 'torrent') - (x.kind !== 'torrent')) || (y.seeders - x.seeders))) {
    const k = keyOf(c), arr = groups.get(k) || []; if (arr.length < 2) arr.push(c); groups.set(k, arr);
  }
  const pool = [...[...groups.values()].map(g => g[0]), ...[...groups.values()].map(g => g[1]).filter(Boolean)].slice(0, opts.maxCand || 8);
  if (opts.measure) await healthCheck(pool, opts.ms);   // mesure réelle (démarre les torrents) : diagnostic seulement
  else for (const c of pool) applyKnownHealth(c);
  for (const c of pool) if (c.fmt) {   // corrige extension, codec réel ; écarte les fichiers qui ne sont pas des vidéos
    if (c.fmt.codec) c.codec = c.fmt.codec;
    if (c.fmt.ext && c.kind === 'torrent') c.url = c.url.replace(/video\.[a-z0-9]+(?=\?|$)/i, 'video' + c.fmt.ext);
    if (!c.fmt.playable) { c.health = -2; log('warn', `flux écarté : ${c.fmt.note}`); }
  }
  for (let i = pool.length - 1; i >= 0; i--) if (pool[i].health === -2) pool.splice(i, 1);
  for (const c of pool) {   // DeoVR Windows : pas de MKV/WebM ni AV1/VP9 (doc DeoVR) -> conversion HLS si ffmpeg, sinon en dernier recours
    const f = c.fmt || (/\.mkv$/i.test((c.raw.behaviorHints || {}).filename || '') ? { container: 'mkv' } : {}); c.platformOk = true;
    const cdc = f.codec || ((c.codec === 'av1' || c.codec === 'vp9') ? c.codec : '');   // codec réel mesuré, sinon indiqué par le titre/flux
    if (platform === 'windows' && (f.container === 'mkv' || cdc === 'av1' || cdc === 'vp9')) {
      if (f.container === 'mkv' && cdc !== 'av1' && cdc !== 'vp9' && c.kind === 'torrent' && ffmpegOk) { c.url = `${base}/hls/${c.raw.infoHash.toLowerCase()}/${Number.isInteger(c.raw.fileIdx) ? c.raw.fileIdx : -1}/index.m3u8`; c.remuxed = true; }
      else c.platformOk = false;
    }
  }
  pool.sort((a, b) => (b.platformOk - a.platformOk) || (eff(b.health) - eff(a.health)) || (b.seeders - a.seeders));
  const byKey = new Map();
  for (const c of pool) if (!byKey.has(keyOf(c))) byKey.set(keyOf(c), c);
  let meta = {};
  if (!opts.skipMeta && !(catalogMetas.get(id) || {}).name) try {
    const addons = await getAddons();
    for (const ma of addons.filter(x => supports(x, 'meta', type, id))) {
      try {
        meta = (await cached(`${ma.base}/meta/${type}/${id}`, 3600000, () => getJson(`${ma.base}/meta/${type}/${encodeURIComponent(id)}.json`, { signal: AbortSignal.timeout(3500), noQuarantine: true, prio: opts.prio }))).meta || {};
        if (meta.name) break;
      } catch (e) { log('warn', `meta ${id} via « ${ma.manifest.name} » : ${e.message}`); }
    }
  } catch (e) { log('warn', `meta ${id} : ${e.message}`); }
  if (!meta.name && catalogMetas.has(id)) meta = { ...catalogMetas.get(id), ...meta };   // repli : infos du catalogue
  return { candidates: cands, best, chosen: pool, sources: [...byKey.values()], meta, incomplete: !!raw.incomplete, vrWhy: why };
}



// ---------- Scrape des trackers UDP (BEP 15) : nombre de seeders SANS démarrer de torrent ----------
const { udpScrape, seedInfo, scrapeStats, seedMemo } = require('./scrape')({ cfg, log });   // seeders annoncés par les trackers UDP (scrape.js)
const levelFromSeeds = n => (n >= 10 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0);
const eff = h => (h < 0 ? 0.5 : h);   // niveau inconnu : classé entre noir et rouge pour le tri
function applyKnownHealth(c) {   // santé sans rien démarrer : mesure mémorisée + seeders des trackers
  if (c.kind !== 'torrent') { c.health = 4; return; }
  const h = c.raw.infoHash.toLowerCase(), idx = Number.isInteger(c.raw.fileIdx) ? c.raw.fileIdx : -1, memo = healthMemo.get(`${h}:${idx}`);
  const sl = c.scrape ? levelFromSeeds(c.scrape.seeders) : -1;
  if (memo && Date.now() - memo.t < 60 * 60000) {
    c.healthInfo = memo; c.fmt = memo.fmt || null;
    c.health = memo.dl > 0 ? memo.level : Math.min(memo.level, 1);
  } else c.health = sl;
}

// ---------- Santé des torrents ----------
// niveau : 3 vert (rapide) | 2 orange (quelques pairs / lent) | 1 rouge (presque rien) | 0 noir (aucun pair) | -1 inconnu | 4 flux HTTP (non mesuré)
const LEVELS = ['black', 'red', 'orange', 'green'], BADGES = ['⚫', '🔴', '🟠', '🟢'];
const seedersOf = t => { const m = /(?:👤|seeders?[:\s]*|seeds?[:\s]*|S:)\s*(\d+)/i.exec(t || ''); return m ? +m[1] : 0; };
async function torrentStats(hash, idx) {
  for (const u of [`${cfg.localStremio}/${hash}/${idx}/stats.json`, `${cfg.localStremio}/${hash}/stats.json`]) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(2500) }); if (r.ok) return await r.json(); } catch {}
  }
  return null;
}
const levelOf = st => {
  const peers = Math.max(st.peers || 0, st.unchoked || 0), sp = st.downloadSpeed || 0, conn = st.swarmConnections || 0;
  const flowing = (st.downloaded || 0) > 0 || sp > 0;   // des pairs connectés ne suffisent pas : il faut que des octets arrivent
  return (flowing && sp >= 1e6) ? 3 : flowing ? 2 : (peers >= 1 || conn >= 1) ? 1 : 0;   // v8.2 : sans octet reçu, jamais mieux que rouge
};
const healthMemo = new Map();
const relayState = new Map();    // hash -> { idx, lastStart, size, served, rate[], title, length }
const reqLog = [];
const LOGFILE = path.join(DATA_DIR, 'bridge-requests.log'), EVTFILE = path.join(DATA_DIR, 'bridge-events.log');
function evt(type, data = {}) {   // bridge-events.log : l'essentiel d'une session en une ligne JSON par fait (lecteur vidéo, sauts, relances de DeoVR, disque) ; lu en premier pour comprendre un incident
  try { fs.appendFileSync(EVTFILE, JSON.stringify({ t: new Date().toISOString(), type, ...data }) + '\n'); } catch {}
}
const relaunch = { lastHmd: 0, lastPlayer: null, list: [] };   // DeoVR relancé (2 demandes /deovr en < 3 s) : ce que le lecteur faisait juste avant
function recordReq(e) {
  if (/NSPlayer/.test(e.ua || '') && /\/(torrent|localfile)\//.test(e.path)) evt('lecteur', { film: e.film, chemin: e.path, range: e.range, statut: e.status, duree_ms: e.ms, octets: e.sent, fermeeParLeLecteur: !!e.clientClosedEarly });
  if (/NSPlayer/.test(e.ua || '')) relaunch.lastPlayer = { fin: Date.parse(e.t) + (e.ms || 0), path: e.path, range: e.range, status: e.status, ms: e.ms, fermeeParLeLecteur: !!e.clientClosedEarly };
  reqLog.push(e); if (reqLog.length > 300) reqLog.shift();
  try { fs.appendFileSync(LOGFILE, JSON.stringify(e) + '\n'); } catch {}
}   // hash -> dernier accès par DeoVR (ne pas supprimer ces torrents)
async function measureTorrent(c, ms) {
  const h = c.raw.infoHash.toLowerCase(), idx = Number.isInteger(c.raw.fileIdx) ? c.raw.fileIdx : -1, ck = `${h}:${idx}`;
  const hit = healthMemo.get(ck);
  if (hit && Date.now() - hit.t < (hit.level > 0 ? 10 : 3) * 60000) return hit;
  prewarm(c.origUrl, ms + 8000);
  const end = Date.now() + ms; let r = { level: -1, peers: 0, speed: 0, dl: 0, stats: false };
  while (Date.now() < end) {
    await sleep(1500);
    const st = await torrentStats(h, idx);
    if (!st) continue;
    const lv = levelOf(st);
    r = { level: Math.max(r.level, lv), peers: Math.max(r.peers, st.peers || 0), speed: Math.max(r.speed, st.downloadSpeed || 0), dl: Math.max(r.dl, st.downloaded || 0), stats: true };
    if (lv === 3) break;
  }
  if (r.dl > 0 || r.level >= 2) try {   // le début du fichier est-il réellement une vidéo lisible ?
    const rr = await fetch(c.origUrl, { headers: { range: 'bytes=0-131071' }, signal: AbortSignal.timeout(12000) });
    if (rr.ok || rr.status === 206) { const buf = Buffer.from(await rr.arrayBuffer()); if (buf.length >= 16) { r.level = Math.max(r.level, 2); r.fmt = probeContainer(buf); if (r.fmt.ext) sniffedExt.set(`${h}/${idx}`, r.fmt.ext); } }
  } catch (e) { log('debug', `lecture d'en-tête impossible : ${e.message}`); }
  r.t = Date.now(); r.hash = h;
  log('debug', `format ${h.slice(0, 8)}… ${r.fmt ? `${r.fmt.container}/${r.fmt.codec || '?'} ${r.fmt.note}` : 'non lu'}`);
  log('debug', `santé ${h.slice(0, 8)}… niveau=${r.level < 0 ? 'inconnu' : LEVELS[r.level]} pairs=${r.peers} vitesse=${(r.speed / 1e6).toFixed(2)} Mo/s reçu=${r.dl}`);
  if (r.level >= 0) healthMemo.set(ck, r);
  return r;
}
async function healthCheck(pool, ms = cfg.healthCheckMs) {
  for (const c of pool) c.health = c.kind === 'torrent' ? -1 : 4;
  const tors = pool.filter(c => c.kind === 'torrent');
  if (!tors.length || !ms) return;
  const seen = new Map();
  await Promise.all(tors.map(async c => {
    const h = c.raw.infoHash.toLowerCase();
    if (!seen.has(h)) seen.set(h, measureTorrent(c, ms));
    const r = await seen.get(h); c.health = r.level; c.healthInfo = r; c.fmt = r.fmt || null;
  }));
  const known = tors.filter(c => c.health >= 0);
  if (known.length && known.every(c => c.health === 0)) log('warn', `aucun pair trouvé pour ${seen.size} torrent(s) testé(s) (DHT/UDP bloqué ou sources mortes ?)`);
}

// ---------- Analyse légère en arrière-plan : pastille « seeders » par film ----------
// UNIQUEMENT les flux des addons (HTTP) + le nombre de seeders annoncé par les trackers UDP. AUCUN torrent n'est démarré, rien n'est téléchargé.
const filmHealth = new Map();   // id -> { level, t, info, seeders, res, phase, hidden, http }
const scanQ = [], scanSet = new Set(); let scanning = 0;
const scanStat = { phase1: 0, errors: 0 };
function enqueueScan(type, id, base) {
  if (!cfg.scanConcurrency || !id || scanSet.has(id) || scanQ.length > 500) return;
  const h = filmHealth.get(id); if (h && h.level >= 0 && Date.now() - h.t < 30 * 60000) return;
  if (h && h.level < 0 && Date.now() - h.t < 2 * 60000) return;
  scanSet.add(id); scanQ.push({ type, id, base }); pumpScan();
}
function pumpScan() {
  while (scanning < cfg.scanConcurrency && scanQ.length) {
    const job = scanQ.shift(); scanning++;
    scanOne(job).catch(e => { scanStat.errors++; log('warn', `analyse ${job.id} : ${e.message}`); }).finally(() => { scanSet.delete(job.id); scanning--; pumpScan(); });
  }
}
const setHealth = (id, o) => filmHealth.set(id, { t: Date.now(), ...o });
function recordHealth(id, a) {   // partagé par l'analyse de fond ET par la fiche vidéo : la pastille ne dépend jamais de qui l'a calculée
  const none = !a.best || !a.sources.length;
  if (none) { if (a.incomplete) return; setHealth(id, { level: 0, info: 'aucun flux exploitable', seeders: 0, res: 0, phase: 1, hidden: true }); return; }
  const tors = a.chosen.filter(c => c.kind === 'torrent');
  const lv = a.chosen.map(c => (c.health === 4 ? 3 : c.health)).filter(v => v >= 0);
  const level = lv.length ? Math.max(...lv) : -1;
  const seeders = tors.reduce((m, c) => Math.max(m, c.scrape ? c.scrape.seeders : 0), 0);
  const res = a.chosen.reduce((m, c) => Math.max(m, c.resolution || 0), 0);
  if (a.incomplete && level <= 0) { const cur = filmHealth.get(id); if (!cur) setHealth(id, { level: -1, info: 'addons incomplets', seeders, res, phase: 1 }); return; }
  const incompatible = a.chosen.length > 0 && a.chosen.every(c => c.platformOk === false);   // AV1/VP9 sur DeoVR PC : certain, donc seul cas de masquage « technique »
  const http = !tors.length && a.chosen.some(c => c.kind !== 'torrent');
  const info = incompatible ? 'codec non lu par DeoVR PC (AV1/VP9)' : level < 0 ? 'trackers muets (UDP bloqué ?)' : http ? 'flux HTTP' : `${seeders} seeders (trackers)`;
  setHealth(id, { level, info, seeders, res, phase: 1, sources: a.chosen.length, http, hidden: incompatible });
}
async function scanOne({ type, id, base }) {
  const a = await analyzeVideo(type, id, base, '', { skipMeta: true, maxCand: 6 });
  scanStat.phase1++; recordHealth(id, a);
  const h = filmHealth.get(id); if (h) log('debug', `film ${id} -> ${h.info}`);
}
function prewarm(url, ms = 120000) {   // diagnostic uniquement (measureTorrent)
  fetch(url, { headers: { range: 'bytes=0-1' }, signal: AbortSignal.timeout(ms) })
    .then(r => { log('debug', `prewarm torrent -> ${r.status}`); r.body && r.body.cancel().catch(() => {}); })
    .catch(e => log('warn', `prewarm torrent : ${e.message}`));
}
buildVideo.seen = new Map();
const v0title = (a, id) => (a.meta && a.meta.name) || id;
const hashFilm = new Map();   // hash -> id du film
async function buildVideo(type, id, base, reqHost, platform, ua) {
  // La fiche vidéo ne démarre RIEN : addons (HTTP) + scrape UDP des trackers seulement. Le téléchargement commence au clic (quand le lecteur demande le flux).
  const a = await analyzeVideo(type, id, base, reqHost, { platform, prio: true, streamsMs: Math.min(cfg.streamsTimeoutMs, cfg.jsonDeadlineMs - 1500), scrapeMs: 2500 });
  if (!a.best && a.incomplete) { const e = new Error('addons pas encore prêts'); e.incomplete = true; throw e; }
  recordHealth(id, a);
  if (!a.best || !a.sources.length) return null;
  const okFirst = a.sources.filter(s => s.health !== 0 && s.health !== 1).sort((x, y) => y.resolution - x.resolution);
  const weak = a.sources.filter(s => s.health === 0 || s.health === 1).sort((x, y) => y.resolution - x.resolution);
  const ordered = [...okFirst, ...weak];
  const name = a.meta.name || id, poster = a.meta.background || a.meta.poster || '', runtime = parseRuntime(a.meta.runtime);
  const liveOk = ffmpegOk && cfg.loadingScreen !== 'off';
  for (const o of ordered) if (o.kind === 'torrent') {
    const hh = o.raw.infoHash.toLowerCase(), ix = Number.isInteger(o.raw.fileIdx) ? o.raw.fileIdx : -1, key = `${hh}:${ix}`;
    hashFilm.set(hh, id);
    if (filmInfo.size > 5000) filmInfo.clear();
    const directOk = !o.remuxed && o.platformOk !== false;   // le fichier est lisible tel quel par DeoVR (ni MKV à convertir, ni codec refusé)
    filmInfo.set(key, { id, type, title: name, poster, runtime, screen: a.best.screenType, stereo: a.best.stereoMode, res: o.resolution, vrWhy: a.vrWhy, fmtReason: a.best.fmtReason, size: o.size || 0, need: o.size && runtime ? o.size / runtime : 0, directOk, mkv: !!o.remuxed });
    relayState.set(hh, { ...(relayState.get(hh) || {}), title: name, length: runtime });
    const D = dls.get(key); if (D) Object.assign(D, { title: name, poster: poster || D.poster, runtime: runtime || D.runtime, directOk, mkv: !!o.remuxed });
    // chaque clic sur un torrent passe par l'écran de chargement (sauf codec que DeoVR PC ne sait pas lire)
    const ready = D && D.live && !D.live.closed && D.live.realReady;
    if (ready && D.live.direct && (directOk || o.remuxed)) { o.live = false; o.direct = true; if (o.remuxed) o.url = `${base}/torrent/${hh}/${ix}/video.mkv`; }   // HEVC en MKV : lecture directe du MKV (Labo 9 : passe au casque ; le HEVC dans un flux HLS TS ne passe pas)   // film HEVC déjà en tampon : le lecteur lit le fichier directement (comme avant l'écran de chargement), il démarre aussitôt
    else if (liveOk && o.platformOk !== false && (cfg.loadingScreen === 'always' || o.remuxed || !ready)) {
      o.url = `${base}/live/${hh}/${ix}/index.m3u8`; o.live = true; o.platformOk = true;
    }
  }
  const byRes = new Map();   // une source par résolution (la plus saine d'abord) ; nom d'encodage "h264" : seule valeur documentée par DeoVR
  for (const o of ordered) { if (o.platformOk === false && ordered.some(x => x.platformOk !== false)) continue; const k = o.resolution || 1080; if (!byRes.has(k)) byRes.set(k, { resolution: k, url: o.url }); }
  const sources = [...byRes.values()].sort((x, y) => y.resolution - x.resolution);
  const hash = [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 1013);   // DeoVR mémorise les réglages d'une vidéo par son « id » : ce nouveau départ efface ceux gardés par d'anciens essais ratés (mode d'affichage)
  const metaObj = catalogMetas.get(id) || { id, name };
  const sureFmt = /^format lu/.test(a.best.fmtReason || ''), declare = cfg.formatMenu === 'declare' || (cfg.formatMenu === 'auto' && sureFmt);   // fiche qui déclare le format = pas de sélecteur de mode dans DeoVR (mesuré)
  const v = {
    id: Math.abs(hash),
    title: healthTag(metaObj) + name,
    videoLength: runtime,
    thumbnailUrl: thumbUrl(base, poster),
    ...(declare ? { screenType: a.best.screenType, stereoMode: a.best.stereoMode, is3d: a.best.is3d } : {}),
    encodings: [{ name: 'h264', videoSources: sources }],
  };
  Object.defineProperty(v, '_name', { value: name }); Object.defineProperty(v, '_meta', { value: metaObj });   // non énumérables : le titre est recalculé à chaque envoi (pastille toujours fraîche)
  const dk = 'd:' + id; if (Date.now() - (buildVideo.seen.get(dk) || 0) > 60000) try {   // journal des décisions (une fois par minute et par film)
    buildVideo.seen.set(dk, Date.now());
    log('info', `fiche envoyée « ${name.slice(0, 60)} » : ${a.best.screenType}/${a.best.stereoMode}${a.best.is3d ? ' 3D' : ''} ${declare ? '(déclaré)' : '(NON déclaré : sélecteur de mode DeoVR disponible)'} — ${a.best.fmtReason || '?'} — ${sources.length} source(s) [${sources.map(x => x.resolution + 'p ' + (/\/live\//.test(x.url) ? 'écran de chargement' : /\/hls\//.test(x.url) ? 'hls' : /\/torrent\//.test(x.url) ? 'torrent direct' : 'direct')).join(', ')}] seeders ${(filmHealth.get(id) || {}).seeders ?? '?'}`);
    fs.appendFileSync(path.join(DATA_DIR, 'bridge-decisions.log'), JSON.stringify({ t: new Date().toISOString(), id, title: v0title(a, id), platform: platform || cfg.platform, ua, vrWhy: a.vrWhy || null, formatRaison: a.best.fmtReason || null, screen: a.best.screenType + '/' + a.best.stereoMode, formatDeclare: declare, offered: sources.map(x => ({ res: x.resolution, kind: /\/live\//.test(x.url) ? 'ecran-chargement+hls' : /\/hls\//.test(x.url) ? 'hls' : /\/torrent\//.test(x.url) ? 'torrent' : 'autre' })),
      candidates: a.candidates.map(c => ({ text: c.text.replace(/\s+/g, ' ').slice(0, 140), srcs: (c.raw.sources || []).length, srcTypes: [...new Set((c.raw.sources || []).map(x => String(x).split(':')[0] + (/^tracker:(udp|https?)/.exec(x) || ['', ''])[1]))].join(','), fileIdx: c.raw.fileIdx, file: c.raw.behaviorHints && c.raw.behaviorHints.filename, size: c.size, kind: c.kind, res: c.resolution, codec: c.codec, seeders: c.seeders, scrape: c.scrape ? c.scrape.seeders : null, health: c.health, container: c.fmt && c.fmt.container, realCodec: c.fmt && c.fmt.codec, note: c.fmt && c.fmt.note, platformOk: c.platformOk, remux: !!c.remuxed, kept: a.chosen.includes(c), screen: c.screenType + '/' + c.stereoMode, formatRaison: c.fmtReason })) }) + '\n');
  } catch {}
  log('debug', `video ${id} -> ${a.sources.map(s => `${s.codec} ${s.resolution || '?'}p ${s.kind}${s.health >= 0 && s.health < 4 ? ' ' + LEVELS[s.health] : ''}`).join(' | ')}`);
  return v;
}

// ---------- MKV -> HLS à la volée (ffmpeg, copie des flux : très léger) ----------
const cp = require('child_process'), os = require('os');
let ffmpegOk = false;
try { const r = cp.spawnSync(cfg.ffmpeg, ['-version'], { timeout: 5000 }); ffmpegOk = cfg.remux && r.status === 0; } catch {}
const hlsSessions = new Map();   // "hash:idx" -> { dir, proc, last }
function hlsStart(key, src, label) {
  let s = hlsSessions.get(key);
  if (s && !s.dead) { s.last = Date.now(); return s; }
  const dir = path.join(cfg.tempDir, 'hls', `${key.replace(/[^\w-]/g, '').slice(0, 20)}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const args = ['-nostdin', '-loglevel', 'error', '-i', src, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0', '-hls_playlist_type', 'event', '-hls_segment_filename', path.join(dir, 'seg%05d.ts'), path.join(dir, 'index.m3u8')];
  const proc = cp.spawn(cfg.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  s = { dir, proc, last: Date.now(), dead: false, err: '' };
  proc.stderr.on('data', d => { s.err = (s.err + d).slice(-1500); });
  proc.on('error', e => { s.dead = true; log('warn', `ffmpeg impossible à lancer : ${e.message}`); });
  proc.on('exit', code => { s.dead = code !== 0 && code !== null; s.done = code === 0; log(code ? 'warn' : 'debug', `ffmpeg HLS ${label} terminé (code ${code}) ${s.err.trim().slice(-500)}`); });
  hlsSessions.set(key, s); log('info', `conversion HLS démarrée : ${label} (ffmpeg)`);
  return s;
}
setInterval(() => { for (const [k, s] of hlsSessions) if (Date.now() - s.last > 15 * 60000) { try { s.proc.kill(); fs.rmSync(s.dir, { recursive: true, force: true }); } catch {} hlsSessions.delete(k); } }, 60000).unref();
process.on('exit', () => { for (const s of hlsSessions.values()) try { s.proc.kill(); } catch {} });
function torrentSrc(hash, idx) { return `${cfg.localStremio}/${hash}/${idx}${torrentQ.get(hash) ? '?' + torrentQ.get(hash) : '?' + torrentQuery({ infoHash: hash })}`; }
async function serveHls(req, res, key, src, label, file) {
  const s = hlsStart(key, src, label); s.last = Date.now();
  const f = path.join(s.dir, path.basename(file));
  if (file === 'index.m3u8') {   // attend les premiers segments avant de répondre
    const end = Date.now() + 60000;
    while (Date.now() < end && !s.dead) {
      try { const txt = fs.readFileSync(f, 'utf8'); if ((txt.match(/#EXTINF/g) || []).length >= 2 || /#EXT-X-ENDLIST/.test(txt)) break; } catch {}
      await sleep(500);
    }
  }
  if (!fs.existsSync(f)) { res.writeHead(s.dead ? 502 : 404); return res.end(); }
  return serveLocal(req, res, f, file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
}

// ====================================================================================================
// Téléchargements « au clic » + écran de chargement HLS
//  - La fiche vidéo ne démarre rien. Le téléchargement commence quand le LECTEUR de DeoVR demande le flux (= le clic).
//  - Le film reste actif holdMinutes (30 min) après la dernière activité du lecteur, même si on quitte la lecture ; jusqu'à maxDownloads (3) en parallèle.
//  - Chaque clic sur un torrent passe par un écran de chargement (playlist HLS : images de progression, puis le vrai film dès que le tampon est suffisant).
// ====================================================================================================
const filmInfo = new Map();   // "hash:idx" -> infos du film (posées par la fiche vidéo, sans rien démarrer)
const dls = new Map();        // "hash:idx" -> film lancé par un clic (actif ou en pause)
const dlByFilm = new Map();   // id film -> entrée
const bilans = [];            // bilan par épisode de lecture (40 derniers)
const openTests = new Map();  // page de test des liens deovr:// : méthode -> { t, ua }
const STATE_FILE = path.join(DATA_DIR, 'bridge-state.json'), BILAN_FILE = path.join(DATA_DIR, 'bridge-bilans.log');
let selfPort = cfg.port;
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
const shortT = D => `« ${String(D.title).slice(0, 50)} »`;
function dlLog(D, level, msg) {
  D.timeline.push(`${new Date().toISOString().slice(11, 19)} ${msg}`); if (D.timeline.length > 150) D.timeline.shift();
  log(level, `[film ${shortT(D)}] ${msg}`);
}
const rateOf = (arr, winMs) => { if (arr.length < 2) return 0; const now = Date.now(), b = arr[arr.length - 1]; let a = arr[0]; for (const x of arr) if (now - x[0] <= winMs) { a = x; break; } return b[0] > a[0] ? Math.max(0, (b[1] - a[1]) / ((b[0] - a[0]) / 1000)) : 0; };
function addHave(D, a, b) {   // zones du fichier déjà reçues (fusionnées, trou toléré < 1 Mo) : dit ce qui se lit sans attente
  const h = D.have || (D.have = []), GAP = 1e6, last = h[h.length - 1];
  if (last && a >= last[0] - GAP && a <= last[1] + GAP) { last[0] = Math.min(last[0], a); last[1] = Math.max(last[1], b); return; }
  h.push([a, b]); h.sort((x, y) => x[0] - y[0]);
  for (let i = h.length - 1; i > 0; i--) if (h[i][0] <= h[i - 1][1] + GAP) { h[i - 1][1] = Math.max(h[i - 1][1], h[i][1]); h.splice(i, 1); }
}
const haveText = D => { if (!D.size || !D.have || !D.have.length) return ''; const p = x => Math.round(100 * x / D.size); return D.have.slice(0, 12).map(([a, b]) => (p(a) === p(b) ? p(a) + ' %' : p(a) + '-' + p(b) + ' %')).join(', '); };
function addRead(D, n, kind, pos) {   // octets réellement reçus du serveur Stremio (réseau OU cache) par le pont ; pos = position dans le fichier
  D.readBytes += n; if (kind === 'direct') D.directBytes += n; if (pos != null) addHave(D, pos, pos + n);
  const now = Date.now(), last = D.reads[D.reads.length - 1];
  if (last && now - last[0] < 250) { last[1] = D.readBytes; } else { D.reads.push([now, D.readBytes]); if (D.reads.length > 80) D.reads.shift(); }
  D.lastRead = now;
}
function newDl(key, hash, idx) {
  const fi = filmInfo.get(key) || {};
  return { key, hash, idx: +idx, id: fi.id || hashFilm.get(hash) || hash.slice(0, 8), type: fi.type || 'movie', title: fi.title || (relayState.get(hash) || {}).title || hash.slice(0, 8), poster: fi.poster || '', runtime: fi.runtime || 0,
    screen: fi.screen, stereo: fi.stereo, res: fi.res, vrWhy: fi.vrWhy, fmtReason: fi.fmtReason, size: fi.size || 0, need: fi.need || 0, directOk: fi.directOk, mkv: fi.mkv,
    created: Date.now(), lastPlayer: 0, active: false, clicks: 0, episodes: [], timeline: [], samples: [], reads: [], readBytes: 0, directBytes: 0, netBytes: 0, peers: 0, conns: 0, speed: 0, netSpeed: 0, readSpeed: 0, meta: false, progress: 0, maxPos: 0, bgPos: 0, bgBytes: 0 };
}
// appelé à CHAQUE demande du lecteur (playlist, segment, flux direct) : déclenche puis maintient le téléchargement
function dlTouch(hash, idx, what, req) {
  const key = `${hash}:${idx}`, now = Date.now();
  let D = dls.get(key);
  if (!D) { D = newDl(key, hash, idx); dls.set(key, D); dlByFilm.set(D.id, D); }
  else { const fi = filmInfo.get(key); if (fi) { D.mkv = fi.mkv; D.title = fi.title || D.title; D.poster = fi.poster || D.poster; D.runtime = fi.runtime || D.runtime; D.screen = fi.screen || D.screen; D.stereo = fi.stereo || D.stereo; D.res = fi.res || D.res; D.vrWhy = fi.vrWhy || D.vrWhy; D.fmtReason = fi.fmtReason || D.fmtReason; D.size = D.size || fi.size || 0; D.need = D.need || fi.need || 0; if (fi.directOk !== undefined) D.directOk = fi.directOk; } }
  const idle = now - D.lastPlayer;
  if (!D.cur || idle > 45000) dlEpisode(D, what, req);
  D.lastPlayer = now; D.cur.lastT = now;
  if (!D.active) dlActivate(D);
  return D;
}
function dlEpisode(D, what, req) {   // un « clic » = un nouvel épisode de lecture (le lecteur revient après ≥ 45 s de silence)
  if (D.cur) dlBilan(D, 'nouveau clic');
  const ua = req ? String(req.headers['user-agent'] || '?').slice(0, 40) : '?';
  D.cur = { n: D.episodes.length + 1, t0: Date.now(), lastT: Date.now(), loaderSegs: 0, realSegs: 0, direct: 0, first: what, ua, bilanDone: false, switched: false };
  D.episodes.push(D.cur); if (D.episodes.length > 12) D.episodes.shift();
  D.clicks++;
  dlLog(D, 'info', `CLIC n°${D.clicks} : le lecteur (${ua}) demande ${what} — ${D.active ? 'téléchargement déjà actif' : 'démarrage du téléchargement'} · format ${D.screen || '?'}/${D.stereo || '?'}${D.fmtReason ? ' (' + D.fmtReason + ')' : ''} · état ${dlState(D).label}`);
}
function dlActivate(D) {
  if (disk.critical) { if (!D.diskBlocked || Date.now() - D.diskBlocked > 60000) { D.diskBlocked = Date.now(); dlLog(D, 'warn', `disque presque plein (${disk.freeGB} Go libres sur le ${disk.where}) : téléchargement refusé tant que la place n'est pas libérée`); } return; }
  D.diskBlocked = 0;
  const act = [...dls.values()].filter(x => x.active && x !== D).sort((a, b) => a.lastPlayer - b.lastPlayer);
  while (act.length >= cfg.maxDownloads) dlPause(act.shift(), `limite de ${cfg.maxDownloads} téléchargements simultanés (le plus ancien est mis en pause)`);
  if (cacheInfo.sizeBytes && D.size) {   // cache Stremio petit : pas plus de films en parallèle que le cache ne peut en contenir (sinon Stremio efface ce qu'il vient de télécharger)
    const gb = Math.round(cacheInfo.sizeBytes / 1e9), others = [...dls.values()].filter(x => x.active && x !== D && x.size).sort((a, b) => a.lastPlayer - b.lastPlayer);
    while (others.length && others.reduce((t, x) => t + x.size, D.size) > cacheInfo.sizeBytes) dlPause(others.shift(), `cache Stremio de ${gb} Go trop petit pour garder plusieurs films à la fois (augmentez-le dans Stremio > Paramètres > Streaming)`);
  }
  D.active = true; D.activatedAt = Date.now(); D.samples = []; D.reads = []; D.bgStop = false; D.noDataLogged = false; D.firstData = 0; delete D.pausedWhy;
  dlLog(D, 'info', `téléchargement démarré (${[...dls.values()].filter(x => x.active).length}/${cfg.maxDownloads} actifs) — gardé ${cfg.holdMinutes} min après la dernière activité du lecteur`);
  torrentCreate(D.hash, 'clic').catch(() => {});
  libMemo.clear(); bgLoop(D); if (cfg.sampleMode) sampleLoop(D); dlSave();
}
function dlPause(D, why) {
  if (!D.active) return;
  dlBilan(D, why);
  libMemo.clear(); D.active = false; D.pausedWhy = why; D.pausedAt = Date.now(); D.bgStop = true;
  try { D.bgCtl && D.bgCtl.abort(); D.seekCtl && D.seekCtl.abort(); D.aheadCtl && D.aheadCtl.abort(); } catch {}
  liveClose(D);
  fetch(`${cfg.localStremio}/${D.hash}/remove`, { signal: AbortSignal.timeout(3000) }).catch(() => {});
  dlLog(D, 'info', `téléchargement arrêté : ${why} (la partie déjà reçue reste dans le cache Stremio : reprise au prochain clic)`);
  dlSave();
}
const dlSorted = () => [...dls.values()].sort((a, b) => (b.active - a.active) || (b.lastPlayer - a.lastPlayer)).slice(0, 30);
function dlState(D) {   // { code, label (court, ASCII+Latin-1 : affiché dans les titres DeoVR), cls }
  const now = Date.now(), age = now - (D.activatedAt || now), sp = D.speed || 0, s = D.live;
  if (!D.active && /^disque/.test(D.pausedWhy || '')) return { code: 'pause', label: 'ARRÊTÉ · disque plein', cls: 'r' };
  if (!D.active && isClickDead(D.id)) return { code: 'pause', label: 'ÉCHEC · aucune donnée', cls: 'k' };
  if (!D.active) return { code: 'pause', label: D.bgDone ? 'EN CACHE · COMPLET' : 'PAUSE · reprise au clic', cls: 'b' };
  if (cfg.sampleMode && D.sample && D.sample.plan.length) {
    const done = D.sample.plan.filter(r => r.done).length, n = D.sample.n, rdy = !!(s && !s.closed && s.realReady);
    return done >= n ? { code: 'ready', label: `ÉCHANTILLONS PRÊTS · ${n} × ${cfg.sampleMinutes} min`, cls: 'g' } : { code: 'sample', label: `ÉCHANTILLONS ${done}/${n}${rdy ? ' · PRÊT, relancez' : ''}${sp > 5e4 ? ' · ' + mbs(sp) : ''}`, cls: rdy ? 'g' : 'o' };
  }
  if (D.bgDone || (D.size && D.maxPos >= D.size - 1)) return { code: 'complete', label: 'PRÊT · COMPLET', cls: 'g' };
  if (s && !s.closed && s.realReady) return { code: 'ready', label: s.direct ? 'PRÊT · relancez le film' : `PRÊT · ${fmtDur(aheadSec(s))} en tampon`, cls: 'g' };
  const got = D.readBytes > 0 || D.netBytes > 0;
  if (!D.meta && !got) return (age > 60000 && D.peers === 0) ? { code: 'stuck', label: 'BLOQUÉ · 0 pair', cls: 'r' } : age > 90000 ? { code: 'stuck', label: 'BLOQUÉ · aucune donnée', cls: 'r' } : { code: 'search', label: `RECHERCHE · ${D.peers} pair${D.peers > 1 ? 's' : ''}`, cls: 'o' };
  if (!got) return age > 90000 ? { code: 'stuck', label: 'BLOQUÉ · 0 donnée', cls: 'r' } : { code: 'meta', label: 'MÉTADONNÉES OK · en attente', cls: 'o' };
  const pct = Math.round(100 * (D.progress || 0));
  const gb = x => (x / 1e9).toFixed(1).replace('.', ','), left = D.size && sp > 5e4 ? Math.max(0, 1 - (D.progress || 0)) * D.size / sp : 0;   // « 3,2/17,0 Go · 1,4 Mo/s · reste ~2,1 h »
  const eta = left > 0 ? ` · reste ~${left >= 5400 ? (left / 3600).toFixed(1).replace('.', ',') + ' h' : fmtDur(left)}` : '';
  return { code: 'dl', label: `EN COURS ${pct} %${D.size ? ` · ${gb((D.progress || 0) * D.size)}/${gb(D.size)} Go` : ''}${sp > 5e4 ? ' · ' + mbs(sp) + eta : ''}`, cls: D.need && sp && sp < D.need * 0.8 ? 'o' : 'g' };
}
async function dlTick(D) {
  const now = Date.now();
  if (now - D.lastPlayer > cfg.holdMinutes * 60000) return dlPause(D, `${cfg.holdMinutes} min sans activité du lecteur`);
  const st = await torrentStats(D.hash, D.idx).catch(() => null);
  if (!D.active) return;
  if (st) {
    D.st = st; D.stT = now;
    const files = Array.isArray(st.files) ? st.files : [];
    if (files.length && !D.meta) { D.meta = true; D.metaAfter = Math.round((now - D.activatedAt) / 1000); dlLog(D, 'info', `métadonnées obtenues après ${D.metaAfter} s (pairs ${st.peers || 0})`); }
    if (!D.size) { const f = D.idx >= 0 ? files[D.idx] : files.slice().sort((a, b) => (b.length || 0) - (a.length || 0))[0]; D.size = (f && f.length) || st.streamLen || 0; }
    D.peers = Math.max(st.peers || 0, st.unchoked || 0); D.conns = st.swarmConnections || 0; D.netBytes = st.downloaded || 0; D.swarm = st.swarmSize;
    D.samples.push([now, D.netBytes]); while (D.samples.length > 2 && now - D.samples[0][0] > 15000) D.samples.shift();
    D.netSpeed = Math.max(rateOf(D.samples, 10000), 0);
    if (D.netSpeed === 0 && st.downloadSpeed) D.netSpeed = st.downloadSpeed;
  }
  D.readSpeed = D.lastRead && now - D.lastRead < 4000 ? rateOf(D.reads, 6000) : 0;
  D.speed = Math.max(D.netSpeed, D.readSpeed);
  D.maxPos = Math.max(D.bgPos, D.live ? D.live.seqPos || 0 : 0);
  D.progress = Math.min(1, Math.max((st && st.streamProgress) || 0, D.size ? D.maxPos / D.size : 0));
  const got = D.readBytes > 0 || D.netBytes > 0;
  if (got && !D.firstData) { D.firstData = now; clickDead.delete(D.id); dlLog(D, 'info', `premières données reçues après ${Math.round((now - D.activatedAt) / 1000)} s (pairs ${D.peers})`); }
  if (!got && !D.noDataLogged && now - D.activatedAt > 90000) { D.noDataLogged = true; if (!D.meta) { clickDead.set(D.id, now); vidInvalidate(D.id); } dlLog(D, 'warn', `AUCUNE donnée après 90 s (pairs ${D.peers}, connexions ${D.conns}, métadonnées ${D.meta ? 'oui' : 'non'}) : sources mortes, pairs qui n'envoient rien ou torrent privé. À comparer avec la même vidéo dans l'appli Stremio.`); }
  const stt = dlState(D), lab = stt.label;
  if (stt.code !== D.lastCode || now - (D.lastLabT || 0) > 15000) {   // une ligne par changement d'état, sinon toutes les 15 s
    D.lastCode = stt.code; D.lastLab = lab; D.lastLabT = now;
    const srcs = st && Array.isArray(st.sources) ? st.sources.filter(x => x && x.numFound > 0).map(x => `${String(x.url).slice(0, 36)}=${x.numFound}`).join(' ') : '';
    dlLog(D, 'info', `état -> ${lab} | pairs ${D.peers} (connexions ${D.conns}, essaim ${D.swarm ?? '?'}) · reçu ${(Math.max(D.readBytes, D.netBytes) / 1e6).toFixed(1)} Mo · débit ${mbs(D.speed)}${D.need ? ' (nécessaire ' + mbs(D.need) + ')' : ''}${D.live ? ' · tampon ' + Math.round(D.live.producedSec || 0) + ' s' : ''}${srcs ? ' | pairs trouvés par : ' + srcs : ''}`);
  }
}
setInterval(() => {
  const now = Date.now();
  Promise.all([...dls.values()].filter(D => D.active && !D.ticking).map(D => { D.ticking = true; return dlTick(D).catch(e => log('warn', `suivi ${D.hash.slice(0, 8)} : ${e.message}`)).finally(() => { D.ticking = false; }); })).catch(() => {});
  for (const D of dls.values()) if (D.cur && !D.cur.bilanDone && now - D.cur.lastT > 45000) dlBilan(D, 'le lecteur ne demande plus rien depuis 45 s');
  for (const [k, D] of dls) if (!D.active && now - D.lastPlayer > 24 * 3600000) { dls.delete(k); if (dlByFilm.get(D.id) === D) dlByFilm.delete(D.id); }
}, 1500).unref();
function dlBilan(D, why) {   // une ligne de bilan par épisode : lu / quitté puis repris / abandonné par DeoVR après X s / aucune donnée
  const e = D.cur; if (!e || e.bilanDone) return; e.bilanDone = true;
  const dur = Math.max(0, Math.round((e.lastT - e.t0) / 1000)), got = D.readBytes > 0 || D.netBytes > 0, s = D.live;
  const played = e.realSegs > 0 || e.direct > 0, before = D.episodes.filter(x => x !== e && x.t0 < e.t0);
  let verdict;
  if (played) verdict = (before.length ? 'lu (quitté puis repris)' : 'lu') + (e.opens && e.opens.length > 1 ? ` — MAIS le lecteur a redémarré le flux ${e.opens.length - 1} fois (à +${e.opens.slice(1).join(' s, +')} s)` : '');
  else if (e.loaderSegs > 0) verdict = (e.opens && e.opens.length > 1 ? `flux redémarré ${e.opens.length - 1} fois par DeoVR (à +${e.opens.slice(1).join(' s, +')} s) : ` : '') + `abandonné par DeoVR après ${dur} s (${s && s.realReady ? 'film prêt mais la bascule n\'a pas été suivie' : 'film pas encore prêt'})`;
  else verdict = got ? 'rien lu (le lecteur a quitté avant toute donnée)' : 'aucune donnée';
  if (!played && !got) verdict = 'aucune donnée' + (e.loaderSegs ? ` (écran de chargement vu ${dur} s)` : '');
  const b = { t: new Date().toISOString(), film: D.title, id: D.id, clic: e.n, verdict, raison_fin: why, duree_s: dur, ecran_chargement_segments: e.loaderSegs, segments_film: e.realSegs, octets_directs: e.direct, bascule: e.switched, sauts: e.sauts || 0, ouvertures_du_flux_a_s: e.opens || [], pairs: D.peers, recu_Mo: +(Math.max(D.readBytes, D.netBytes) / 1e6).toFixed(1), debit_MoS: +(D.speed / 1e6).toFixed(2), necessaire_MoS: D.need ? +(D.need / 1e6).toFixed(2) : null, tampon_s: s ? Math.round(s.producedSec || 0) : null, format: `${D.screen || '?'}/${D.stereo || '?'}`, raison_format: D.fmtReason || null, etat: dlState(D).label };
  bilans.push(b); if (bilans.length > 40) bilans.shift();
  try { fs.appendFileSync(BILAN_FILE, JSON.stringify(b) + '\n'); } catch {}
  dlLog(D, 'info', `BILAN clic n°${e.n} : ${verdict} — ${dur} s, ${b.recu_Mo} Mo reçus, pairs ${b.pairs}, tampon ${b.tampon_s ?? '-'} s`);
}
let saveT = 0;
function dlSave() {
  if (Date.now() - saveT < 3000) return; saveT = Date.now();
  try { fs.writeFileSync(STATE_FILE, JSON.stringify([...dls.values()].map(D => ({ key: D.key, hash: D.hash, idx: D.idx, id: D.id, type: D.type, title: D.title, poster: D.poster, runtime: D.runtime, screen: D.screen, stereo: D.stereo, res: D.res, vrWhy: D.vrWhy, fmtReason: D.fmtReason, size: D.size, need: D.need, lastPlayer: D.lastPlayer, bgDone: D.bgDone })))); } catch {}
}
setInterval(() => { if (dls.size) { saveT = 0; dlSave(); } }, 30000).unref();
try {   // liste « En cours » retrouvée après un redémarrage du pont (films en pause, reprise au clic)
  for (const x of JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))) if (Date.now() - x.lastPlayer < 24 * 3600000) { const D = newDl(x.key, x.hash, x.idx); Object.assign(D, x, { active: false, timeline: [], samples: [], reads: [], episodes: [] }); dls.set(x.key, D); dlByFilm.set(D.id, D); }
} catch {}

// ----- téléchargement de fond : continue de lire le film (en jetant les octets) tant que le lecteur ne le fait pas -----
function bgWanted(D) {
  if (!D.active || D.bgDone || D.bgStop || cfg.sampleMode) return false;   // mode échantillon : pas de téléchargement séquentiel, sampleLoop() ne lit que des extraits
  if (Date.now() - (D.directT || 0) < 8000) return false;                 // lecture directe en cours : c'est elle qui télécharge
  const s = D.live;
  if (s && !s.closed && !s.realFail) return s.realDone || s.gated || (s.feedActive === 0 && Date.now() - s.t0 > 4000);   // ffmpeg est en pause (assez d'avance) ou inactif
  return true;
}
async function bgLoop(D) {
  if (D.bgRunning) return; D.bgRunning = true;
  try {
    while (D.active && !D.bgStop && !D.bgDone) {
      if (!bgWanted(D)) { await sleepMs(1500); continue; }
      const start = Math.max(D.bgPos, D.live ? D.live.seqPos || 0 : 0), ctl = D.bgCtl = new AbortController();
      let r;
      try { r = await fetch(torrentSrc(D.hash, D.idx), { headers: { range: `bytes=${start}-` }, signal: ctl.signal }); } catch (e) { await sleepMs(3000); continue; }
      if (r.status === 416) { D.bgDone = true; break; }
      if (r.status !== 206 && !(r.status === 200 && start === 0)) { try { ctl.abort(); } catch {} await sleepMs(4000); continue; }
      const cr = /\/(\d+)$/.exec(r.headers.get('content-range') || ''); if (cr && !D.size) D.size = +cr[1];
      if (!D.size && r.headers.get('content-length') && start === 0) D.size = +r.headers.get('content-length');
      let pos = start; const rd = r.body.getReader();
      try {
        for (;;) {
          if (!D.active || D.bgStop || !bgWanted(D)) { ctl.abort(); break; }
          const { value, done } = await rd.read();
          if (done) { if (D.size && pos >= D.size - 1) D.bgDone = true; break; }
          pos += value.length; D.bgPos = pos; D.bgBytes += value.length; addRead(D, value.length, 'bg', pos - value.length);
        }
      } catch {}
      if (D.size && D.bgPos >= D.size - 1) D.bgDone = true;
      if (D.bgDone) dlLog(D, 'info', 'fichier entièrement reçu par le serveur Stremio (en cache)');
      else await sleepMs(500);
    }
  } finally { D.bgRunning = false; }
}

// ----- mode échantillon : quelques extraits répartis dans le film (début, milieu, fin…) au lieu du film entier -----
function samplePlan(size, dur, n, minutes, pad) {   // [{ i, fromSec, toSec, from, to }] ; octets estimés avec un débit constant (marge pad de chaque côté)
  if (!(size > 0)) return [];
  const d = dur > 60 ? dur : 5400, win = Math.min(d, minutes * 60), bps = size / d, out = [];   // durée inconnue : 90 min supposées
  for (let i = 0; i < n; i++) {
    const start = n === 1 ? 0 : (d - win) * i / (n - 1);   // la fenêtre reste entièrement dans le film : la dernière finit avec lui (index MP4 / MKV compris)
    out.push({ i, fromSec: Math.round(start), toSec: Math.round(start + win), from: Math.max(0, Math.floor((start - pad) * bps)), to: Math.min(size - 1, Math.ceil((start + win + pad) * bps)), done: false });
  }
  return out;
}
async function readRange(D, from, to) {   // lit [from, to] chez Stremio ; les octets sont jetés, ils restent dans le cache de Stremio (lus ensuite instantanément par le lecteur)
  const ctl = D.bgCtl = new AbortController();
  try {
    const r = await fetch(torrentSrc(D.hash, D.idx), { headers: { range: `bytes=${from}-${to}` }, signal: ctl.signal });
    if (r.status !== 206) { ctl.abort(); return false; }
    let pos = from; const rd = r.body.getReader();
    for (;;) { if (!D.active || D.bgStop) { ctl.abort(); return false; } const { value, done } = await rd.read(); if (done) break; addRead(D, value.length, 'bg', pos); pos += value.length; D.bgBytes += value.length; D.sample.pos = pos; }
    return pos > to;
  } catch { return false; }
}
async function sampleLoop(D) {
  if (D.sampleRunning) return; D.sampleRunning = true;
  await sleepMs(300);   // dlActivate tourne AVANT liveStart (même requête) : laisser la session de chargement se créer, sinon on ne l'attend pas
  try {
    const t0 = Date.now();
    while (D.active && !D.bgStop && Date.now() - t0 < 90000 && !(D.size && (D.runtime || (D.live && D.live.durSec)))) await sleepMs(1000);   // taille et durée connues
    while (D.active && !D.bgStop && D.live && !D.live.closed && !D.live.realReady && !D.live.realFail && Date.now() - t0 < 180000) await sleepMs(1000);   // d'abord le début, que lit ffmpeg pour l'écran de chargement
    if (!D.active || D.bgStop || !D.size) return;
    if (!D.sample || D.sample.size !== D.size) {
      const plan = samplePlan(D.size, D.runtime || (D.live && D.live.durSec) || 0, cfg.sampleCount, cfg.sampleMinutes, cfg.samplePadSec);
      D.sample = { size: D.size, plan, n: plan.length, pos: 0 };
      dlLog(D, 'info', `mode échantillon : ${plan.length} extrait(s) de ${cfg.sampleMinutes} min — ${plan.map(r => `${fmtDur(r.fromSec)}-${fmtDur(r.toSec)} (${Math.round((r.to - r.from) / 1e6)} Mo)`).join(', ')}`);
    }
    const n = D.sample.n, order = [...new Set([0, n - 1, ...Array.from({ length: n }, (_, i) => i)])];   // début, fin (index du fichier), puis le milieu
    for (const k of order) {
      const r = D.sample.plan[k];
      for (let tries = 0; !r.done && tries < 20 && D.active && !D.bgStop; tries++) {
        while (D.active && !D.bgStop && Date.now() - (D.directT || 0) < 8000) await sleepMs(1000);   // le lecteur lit : il est prioritaire
        if (!D.active || D.bgStop) return;
        if (await readRange(D, r.from, r.to)) { r.done = true; dlLog(D, 'info', `extrait ${k + 1}/${n} reçu (${fmtDur(r.fromSec)}-${fmtDur(r.toSec)})`); } else await sleepMs(3000);
      }
    }
    if (D.sample.plan.every(r => r.done)) dlLog(D, 'info', `mode échantillon : les ${n} extraits sont reçus (zones lisibles : ${haveText(D)})`);
  } finally { D.sampleRunning = false; }
}

async function aheadLoop(D) {   // lecture directe : télécharge DEVANT le lecteur (octets jetés, ils restent dans le cache de Stremio) ; s'arrête quand le lecteur se tait, repart après un saut
  if (D.aheadRunning) return; D.aheadRunning = true;
  const win = cfg.readAheadMB * 1e6, idle = () => !D.active || Date.now() - (D.directT || 0) > 15000;
  try {
    while (!idle()) {
      const pos = D.directPos || 0, goal = Math.min((D.size || Infinity) - 1, pos + win);
      if (D.aheadPos == null || D.aheadPos < pos + 1e5 || D.aheadPos > goal + 1e6) D.aheadPos = pos + 262144;   // départ, rattrapage par le lecteur ou saut
      if (D.aheadPos >= goal - win * 0.2) { await sleepMs(2000); continue; }   // assez d'avance
      const from = D.aheadPos, ctl = D.aheadCtl = new AbortController();
      try {
        const r = await fetch(torrentSrc(D.hash, D.idx), { headers: { range: `bytes=${from}-${goal}` }, signal: ctl.signal });
        if (r.status !== 206) { ctl.abort(); await sleepMs(5000); continue; }
        const rd = r.body.getReader(); let p = from;
        for (;;) {
          const dp = D.directPos || 0;
          if (idle() || dp > p + 5e6 || dp < from - 5e6 || p >= dp + win) { ctl.abort(); break; }   // lecteur arrêté, dépassé, revenu en arrière, ou objectif atteint
          const { value, done } = await rd.read(); if (done) break;
          addRead(D, value.length, 'bg', p); p += value.length; D.aheadPos = p;
        }
      } catch {}
      await sleepMs(500);
    }
  } finally { D.aheadRunning = false; }
}
function seekPrefetch(D, from) {   // après un saut refusé : lit seekPrefetchMB à partir de la position demandée (les octets sont jetés, ils restent dans le cache de Stremio)
  try { D.seekCtl && D.seekCtl.abort(); } catch {}
  const ctl = D.seekCtl = new AbortController();
  (async () => {
    try {
      const r = await fetch(torrentSrc(D.hash, D.idx), { headers: { range: `bytes=${from}-${from + cfg.seekPrefetchMB * 1e6 - 1}` }, signal: ctl.signal });
      if (r.status !== 206) return; const rd = r.body.getReader(); let pos = from;
      for (;;) { if (!D.active) { ctl.abort(); return; } const { value, done } = await rd.read(); if (done) break; addRead(D, value.length, 'bg', pos); pos += value.length; }
      dlLog(D, 'info', `zone du saut préchargée (${Math.round((pos - from) / 1e6)} Mo à partir de ${D.size ? Math.round(100 * from / D.size) + ' %' : 'la position demandée'}) : le lecteur peut y retourner`);
    } catch {}
  })();
}

// ----- ffmpeg / police pour l'écran de chargement -----
// (dossiers live/ et hls/ laissés par une exécution interrompue : cleanTemp(), appelé par start() une fois le port obtenu)
const liveSessions = new Map();
const LOAD_SEG = 4;   // durée d'un segment de chargement (s)
let ffmpegMajor = 0, hevcEnc = '';
try {
  const v = cp.spawnSync(cfg.ffmpeg, ['-version'], { timeout: 5000, encoding: 'utf8' });
  ffmpegMajor = +((/ffmpeg version n?(\d+)/.exec(v.stdout || '') || [])[1] || 0);
  const e = cp.spawnSync(cfg.ffmpeg, ['-hide_banner', '-encoders'], { timeout: 5000, encoding: 'utf8' }).stdout || '';
  hevcEnc = /\blibx265\b/.test(e) ? 'libx265' : /\bhevc_nvenc\b/.test(e) ? 'hevc_nvenc' : '';
} catch {}
const FONT = ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf'].find(f => { try { return fs.existsSync(f); } catch { return false; } }) || '';
const escF = p => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
function liveGeom(screen, stereo) {   // image de chargement dans la même disposition que le film (sinon texte dédoublé/déformé dans le casque)
  if (stereo === 'sbs') return { eyeW: 1920, eyeH: 1920, stack: 'h' };
  if (stereo === 'tb') return { eyeW: 2880, eyeH: 1440, stack: 'v' };
  return { eyeW: 1920, eyeH: 1080, stack: '' };
}
// ----- tampon : combien de film faut-il avoir converti avant de basculer vers le vrai film ? -----
function bufferTarget(D) {
  // Avance (en secondes de film) nécessaire pour aller jusqu'au bout sans coupure : L = durée × (1 − débit/besoin), +10 % de marge.
  // Si le débit couvre le besoin, un petit tampon suffit. L'avance est plafonnée (patientMaxMin, et un peu sous maxAheadMin).
  const need = D.need || 0, sp = D.speed || 0, R = D.runtime || 0;
  if (!need || !sp || cfg.startMode === 'rapide') return cfg.minBufferSec;   // « rapide » (défaut depuis le 4e test : « au bout de 20-30 s on peut lancer, je zappe ») : pas d'attente de l'avance sans coupure
  const r = sp / need;
  if (r >= 1.3) return cfg.minBufferSec;
  if (r >= 1) return Math.max(60, cfg.minBufferSec);
  const lead = R ? R * (1 - r) * 1.1 : 120;
  return Math.round(Math.min(Math.max(120, cfg.minBufferSec, lead), Math.max(120, Math.min(cfg.patientMaxMin, cfg.maxAheadMin - 1) * 60)));
}
function waitPlan(D) {   // « lecture sans coupure possible ? » : durée de film à avoir d'avance, et si le plafond suffit
  const need = D.need || 0, sp = D.speed || 0, R = D.runtime || 0;
  if (!need || !sp || !R) return null;
  const r = sp / need, full = R * (1 - r) * 1.1, cap = Math.max(120, Math.min(cfg.patientMaxMin, cfg.maxAheadMin - 1) * 60);
  return { ratio: r, ok: r >= 1, leadSec: Math.max(0, Math.round(full)), capSec: cap, complete: full <= cap, waitSec: r >= 1 ? 0 : Math.round(full * need / sp) };
}
const aheadSec = s => Math.max(0, (s.producedSec || 0) - (s.playerSec || 0));
const maxAheadSec = D => Math.min(cfg.maxAheadMin * 60, Math.max(bufferTarget(D) + 30, D.need ? cfg.maxAheadMB * 1e6 / D.need : 300));
function liveStart(D) {
  let s = D.live;
  if (s && !s.closed && !s.realFail) return s;
  if (s) liveClose(D);
  const dir = path.join(cfg.tempDir, 'live', `${D.hash.slice(0, 10)}-${D.idx}-${Date.now()}`);
  fs.mkdirSync(path.join(dir, 'real'), { recursive: true });
  s = { D, dir, t0: Date.now(), epoch: 0, loaderT0: Date.now(), lastPl: 0, plCount: 0, shown: 0, skipWaits: false, realReady: false, realDone: false, realFail: false, realSegs: [], producedSec: 0, playerSec: 0, renders: new Map(), seen: {}, closed: false, err: '', codec: '', feedActive: 0, feedPos: 0, seqPos: 0, gated: false, durSec: 0 };
  D.live = s; liveSessions.set(D.key, s);
  dlLog(D, 'info', `écran de chargement : session démarrée (${D.screen || '?'}/${D.stereo || '?'}, ${D.res || '?'}p) — ffmpeg convertit le film dès que Stremio fournit des données`);
  s.base = []; s.baseSec = 0; s.run = 0; s.restarts = 0; s.discAt = []; s.trim = 0; s.curSegs = [];
  spawnReal(s);
  s.poll = setInterval(() => {
    try {
      const txt = fs.readFileSync(path.join(dir, 'real', `index${s.run}.m3u8`), 'utf8');
      const segs = []; let d = 0; for (const l of txt.split('\n')) { const m = /^#EXTINF:([\d.]+)/.exec(l); if (m) d = +m[1]; else if (/^seg\d+\.ts$/.test(l.trim())) segs.push([l.trim(), d]); }
      s.curSegs = segs; s.realSegs = s.base.concat(segs); s.producedSec = s.baseSec + segs.reduce((a, x) => a + x[1], 0);
      s.T = bufferTarget(D);
      // pas de « prêt » avant d'avoir MESURÉ le débit (≥ 12 s) : sinon la cible de tampon est calculée sans débit (20 s seulement) et la lecture cale dès que ces 20 s sont consommées
      const speedKnown = s.realDone || D.bgDone || (D.size && D.maxPos >= D.size - 1) || Date.now() - (D.activatedAt || s.t0) > 12000;
      if (!s.realReady && speedKnown && s.realSegs.length >= 2 && (s.producedSec >= s.T || s.realDone)) {
        s.realReady = true; s.readyAt = Date.now();
        vidInvalidate(D.id);
        s.direct = !!((cfg.sampleMode || (cfg.hevcDirect && s.codec && !/^h264\b/i.test(s.codec))) && (D.directOk !== false || D.mkv));   // mode échantillon : toujours la lecture directe du fichier (les extraits ne forment pas un flux HLS continu)   // seul le H.264 passe dans un flux HLS du lecteur DeoVR/Windows (HEVC : mesuré, redémarrage à 15 s)
        if (s.direct) { s.handover = true; try { s.proc.kill(); } catch {} setTimeout(() => { try { fs.rmSync(path.join(dir, 'real'), { recursive: true, force: true }); } catch {} }, 2000); dlLog(D, 'info', `film ${s.codec.split(' ')[0].toUpperCase()} : le lecteur DeoVR ne le lit pas dans un flux HLS -> l'écran de chargement affiche « PRÊT, relancez le film », puis lecture directe du fichier (déjà en tampon chez Stremio)`); }
        else if (/^(hevc|av1|vp9)/i.test(s.codec || '')) dlLog(D, 'warn', `film ${s.codec.split(' ')[0]} envoyé en HLS (fichier MKV à convertir ou hevcDirect désactivé) : le lecteur DeoVR risque de ne pas le démarrer`);
        dlLog(D, 'info', `VRAI FILM PRÊT après ${Math.round((Date.now() - s.t0) / 1000)} s : ${s.realSegs.length} segments, ${Math.round(s.producedSec)} s de tampon (cible ${s.T} s, débit ${mbs(D.speed)} pour ${D.need ? mbs(D.need) : '?'} nécessaires) -> ${s.direct ? 'lecture directe au prochain clic' : 'bascule au prochain rafraîchissement de la playlist'}`);
      }
    } catch {}
    liveDiskGuard(s);
  }, 1000);
  return s;
}
// ffmpeg (copie du film en segments HLS). Relancé jusqu'à 3 fois s'il plante : reprise à la position atteinte (-ss), numérotation et horloge continues.
function spawnReal(s) {
  const D = s.D, dir = s.dir, run = ++s.run, startSec = s.baseSec;
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'info', '-rw_timeout', String(3600e6), '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '20',
    ...(startSec > 0 ? ['-ss', String(startSec)] : []), '-i', `http://127.0.0.1:${selfPort}/feed/${D.hash}/${D.idx}`, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    ...(startSec > 0 ? ['-output_ts_offset', String(startSec)] : []),
    '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0', '-hls_playlist_type', 'event', '-start_number', String(s.base.length), '-hls_segment_filename', path.join(dir, 'real', 'seg%05d.ts'), path.join(dir, 'real', `index${run}.m3u8`)];
  if (run > 1) dlLog(D, 'warn', `conversion relancée (essai ${run}) à ${fmtDur(startSec)} de film, segment ${s.base.length}`);
  const proc = cp.spawn(cfg.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  s.proc = proc; s.exited = false;
  proc.stderr.on('data', d => {
    const t = String(d); s.err = (s.err + t).slice(-3000);
    const am = /Stream #0:\d+[^:]*: Audio: (\w+)/.exec(t); if (am && !s.audio) { s.audio = am[1].toLowerCase(); if (/^(dts|truehd|mlp|vorbis|opus)$/.test(s.audio)) dlLog(D, 'warn', `son ${s.audio.toUpperCase()} : DeoVR (Windows) peut le lire sans son ; en flux HLS le pont le convertit en AAC, en lecture directe (film HEVC) non`); }
    const vm = /Stream #0:\d+[^:]*: Video: ([^\n]+)/.exec(t); if (vm && !s.codec) { s.codec = vm[1].slice(0, 120); dlLog(D, 'info', `vrai film détecté : ${s.codec}`); }
    const dm = /Duration: (\d+):(\d+):([\d.]+)/.exec(t);   // MKV : « bitrate: N/A » est fréquent (cas Naruto : débit nécessaire inconnu -> tampon de 20 s seulement) -> repli : taille du fichier / durée
    if (dm && !s.durSec) {
      s.durSec = +dm[1] * 3600 + +dm[2] * 60 + +dm[3]; const bm = /bitrate: (\d+) kb\/s/.exec(t.slice(dm.index, dm.index + 240));
      if (bm) D.need = +bm[1] * 125; else if (D.size && s.durSec > 60) D.need = Math.round(D.size / s.durSec);
      if (!D.runtime) D.runtime = s.durSec;
      dlLog(D, 'info', `durée ${fmtDur(s.durSec)}, débit du film ${D.need ? (D.need * 8 / 1e6).toFixed(1) + ' Mbit/s (' + (bm ? 'lu dans le fichier' : 'calculé : taille / durée') + ') => il faut ' + mbs(D.need) + ' pour lire sans saccade' : 'inconnu'}`);
    }
    for (const line of t.split('\n')) if (/error|invalid|failed|refused|timed out|reconnect/i.test(line)) dlLog(D, 'warn', `ffmpeg : ${line.trim().slice(0, 200)}`); else if (cfg.dev && line.trim() && !/^\s*(frame|size)=/.test(line)) dlLog(D, 'debug', `ffmpeg : ${line.trim().slice(0, 200)}`);
  });
  proc.on('error', e => { s.err += e.message; dlLog(D, 'warn', `ffmpeg impossible à lancer : ${e.message}`); });
  proc.on('exit', (code, sig) => {
    if (s.proc !== proc) return;
    s.exited = true;
    if (s.closed || s.handover) return;
    if (code === 0) { s.realDone = true; dlLog(D, 'info', 'conversion du film terminée (code 0)'); return; }
    dlLog(D, 'warn', `conversion interrompue (code ${code}${sig ? ', signal ' + sig : ''})${s.err.trim() ? ' — ' + s.err.trim().split('\n').slice(-3).join(' | ').slice(0, 400) : ''}`);
    if (s.restarts < cfg.ffmpegRestarts && D.active) {
      s.restarts++;
      try {   // on garde les segments complets déjà produits par cette exécution, la suivante continue après
        const txt = fs.readFileSync(path.join(dir, 'real', `index${run}.m3u8`), 'utf8'), segs = []; let d = 0;
        for (const l of txt.split('\n')) { const m = /^#EXTINF:([\d.]+)/.exec(l); if (m) d = +m[1]; else if (/^seg\d+\.ts$/.test(l.trim())) segs.push([l.trim(), d]); }
        if (run > 1 || s.base.length || segs.length) s.discAt.push(s.base.length + segs.length);
        s.base = s.base.concat(segs); s.baseSec += segs.reduce((a, x) => a + x[1], 0); s.curSegs = [];
      } catch { s.discAt.push(s.base.length); }
      setTimeout(() => { if (!s.closed && D.active) spawnReal(s); }, 2000);
    } else { s.realFail = true; dlLog(D, 'warn', `conversion abandonnée après ${s.restarts} relance(s) : un nouveau clic recommencera depuis le cache`); }
  });
}
// disque presque plein : on supprime les segments déjà vus depuis longtemps (on ne pourra plus revenir si loin en arrière)
function liveDiskGuard(s) {
  if (!s.realReady || !s.playerSec || Date.now() - (s.lastDisk || 0) < cfg.diskCheckMs) return; s.lastDisk = Date.now();
  let free; try { const f = fs.statfsSync(s.dir); free = f.bavail * f.bsize; } catch { return; }
  s.freeGB = Math.round(free / 1e9);
  if (free >= cfg.minFreeGB * 1e9) return;
  let acc = 0, k = 0; for (const [, d] of s.realSegs) { if (acc + d > s.playerSec - cfg.trimKeepSec) break; acc += d; k++; }
  if (k <= s.trim) return;
  if (!s.trim) s.seqBase = s.waitsListed || 0;
  for (let i = s.trim; i < k; i++) try { fs.rmSync(path.join(s.dir, 'real', s.realSegs[i][0]), { force: true }); } catch {}
  dlLog(s.D, 'warn', `disque presque plein (${s.freeGB} Go libres < ${cfg.minFreeGB} Go) : ${k - s.trim} segment(s) déjà vus supprimé(s) ; retour en arrière limité à ${fmtDur(cfg.trimKeepSec)}`);
  s.trim = k;
}
function liveClose(D) {
  const s = D.live; if (!s) return;
  s.closed = true; clearInterval(s.poll); try { s.proc.kill(); } catch {}
  setTimeout(() => { try { fs.rmSync(s.dir, { recursive: true, force: true }); } catch {} }, 1500);
  liveSessions.delete(D.key); D.live = null;
}
// relais « feed » : ffmpeg lit le film ICI (et non directement chez Stremio) ; on peut donc le mettre en pause quand il a assez d'avance
async function serveFeed(req, res, hash, idx) {
  const D = dls.get(`${hash}:${idx}`), s = D && D.live;
  if (!D || !s || s.closed) { res.writeHead(404); return res.end(); }
  if (disk.critical) { res.writeHead(503); return res.end(); }
  const headers = {}; if (req.headers.range) headers.range = req.headers.range;
  const ac = new AbortController(); res.on('close', () => ac.abort());
  s.feedActive++; let started = 0;
  try {
    const r = await fetch(torrentSrc(hash, idx), { headers, signal: ac.signal });
    const out = {}; for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (r.headers.get(h)) out[h] = r.headers.get(h);
    if (!out['accept-ranges']) out['accept-ranges'] = 'bytes';
    const cr = /bytes (\d+)-\d+\/(\d+)/.exec(out['content-range'] || ''); started = cr ? +cr[1] : 0; if (cr && !D.size) D.size = +cr[2]; else if (!D.size && out['content-length'] && !req.headers.range) D.size = +out['content-length'];
    res.writeHead(r.status, out);
    if (req.method === 'HEAD' || !r.body) return res.end();
    let pos = started; s.feedPos = pos; const contiguous = started <= (s.seqPos || 0) + 2e6;   // une lecture de l'index en fin de fichier (MP4) ne compte pas comme progression
    for await (const chunk of Readable.fromWeb(r.body)) {
      if (!res.write(chunk)) await new Promise(ok => { res.once('drain', ok); res.once('close', ok); });
      if (res.destroyed || s.closed) break;
      pos += chunk.length; s.feedPos = pos; if (contiguous) s.seqPos = Math.max(s.seqPos || 0, pos); addRead(D, chunk.length, 'feed', pos - chunk.length); s.feedT = Date.now();
      if (Date.now() - (diskWatch.t || 0) > 1000) { diskWatch.t = Date.now(); diskWatch(); }   // disque presque plein : dlPause ferme la session (s.closed) et supprime ses segments
      while (!res.destroyed && !s.closed && aheadSec(s) > maxAheadSec(D)) { s.gated = true; await sleepMs(700); }   // assez d'avance : ffmpeg attend (le fond de tâche prend le relais)
      s.gated = false;
    }
    res.end();
  } catch (e) { if (e.name !== 'AbortError') { dlLog(D, 'warn', `relais ffmpeg->Stremio interrompu : ${e.message}${causeOf(e)}`); } try { res.destroy(); } catch {} }
  finally { s.feedActive--; s.gated = false; }
}

// ----- contrôle du cache de Stremio (lecture prudente de /settings ; champs non vérifiés sur le vrai serveur) -----
let cacheWarn = null, cacheRootFull = null; const cacheInfo = { lu: false };
async function checkCache() {
  try {
    const r = await fetch(cfg.localStremio + '/settings', { signal: AbortSignal.timeout(4000) }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), v = (j && (j.values || j)) || {};
    const size = typeof v.cacheSize === 'number' && isFinite(v.cacheSize) && v.cacheSize > 0 ? v.cacheSize : null, root = typeof v.cacheRoot === 'string' ? v.cacheRoot : null;
    cacheRootFull = root; let free = null; if (root && fs.statfsSync) try { const f = fs.statfsSync(root); free = f.bavail * f.bsize; } catch {}
    const msgs = [];
    if (size && size < 20e9) msgs.push(`cache Stremio = ${Math.round(size / 1e9)} Go (conseillé : illimité ou ≥ 20 Go : Paramètres > Streaming)`);
    if (free != null && free < 15e9) msgs.push(`disque du cache presque plein : ${Math.round(free / 1e9)} Go libres`);
    // profil torrent de Stremio (champs « bt… » de /settings, s'ils existent) : recopié dans /debug/perf et le rapport ; un plafond de débit bas est signalé
    const bt = {}; for (const [k, x] of Object.entries(v)) if (/^bt/i.test(k) && ['number', 'string', 'boolean'].includes(typeof x)) bt[k] = x;
    const hard = bt.btDownloadSpeedHardLimit;
    if (typeof hard === 'number' && hard > 0 && hard < 8e6) msgs.push(`Stremio limite le débit des torrents à ${mbs(hard)} (profil torrent) : Paramètres > Streaming > choisir un profil plus rapide`);
    Object.assign(cacheInfo, { lu: true, sizeBytes: size, cacheSizeGo: size ? Math.round(size / 1e9) : 'illimité/inconnu', cacheRoot: root ? root.replace(/^(.{3}).*([\\/][^\\/]*)$/, '$1…$2') : null, libreGo: free != null ? Math.round(free / 1e9) : null, torrent: Object.keys(bt).length ? bt : null, avertissements: msgs, t: new Date().toISOString() });
    const key = msgs.join('|'); if (key !== checkCache.last) { checkCache.last = key; log(msgs.length ? 'warn' : 'info', msgs.length ? 'cache Stremio : ' + msgs.join(' ; ') : 'cache Stremio : réglages corrects'); }
    cacheWarn = size && size < 20e9 ? { sizeBytes: size } : null;
  } catch (e) { cacheInfo.lu = false; cacheInfo.erreur = e.message; }
}
setInterval(checkCache, 5 * 60000).unref(); setTimeout(checkCache, 3000).unref();
// ----- disque : le 02/10 le disque est arrivé à 0 Go libre (cache Stremio + fichiers temporaires), Stremio a cessé de répondre et DeoVR a planté -----
const disk = { freeGB: null, low: false, critical: false, where: '' };
function cleanTemp() {   // une lecture ne survit pas au pont : ce qui reste dans live/ et hls/ vient d'un arrêt brutal (jusqu'à 1 Go par film) -> supprimé au démarrage, sans attendre
  let freed = 0;
  for (const d of ['live', 'hls']) try { const root = path.join(cfg.tempDir, d); for (const n of fs.readdirSync(root)) { const p = path.join(root, n); freed += dirSize(p); fs.rmSync(p, { recursive: true, force: true }); } } catch {}
  try { const td = path.join(cfg.tempDir, 'thumbs'); for (const n of fs.readdirSync(td)) { const p = path.join(td, n); if (Date.now() - fs.statSync(p).mtimeMs > 14 * 86400000) { freed += fs.statSync(p).size; fs.rmSync(p, { force: true }); } } } catch {}   // vignettes de plus de 14 jours
  if (freed > 1e6) log('info', `nettoyage : ${Math.round(freed / 1e6)} Mo de fichiers temporaires d'une exécution précédente supprimés`);
  return freed;
}
function dirSize(p, depth = 0) { let n = 0; try { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, e.name); if (e.isDirectory()) { if (depth < 6) n += dirSize(q, depth + 1); } else try { n += fs.statSync(q).size; } catch {} } } catch {} return n; }
const tmpUse = { t: 0, v: null };
function tmpUsage() {   // place prise par le pont dans son dossier temporaire (mise en cache 30 s)
  if (tmpUse.v && Date.now() - tmpUse.t < 30000) return tmpUse.v;
  const v = { dossier: cfg.tempDir }; let tot = 0;
  try { for (const e of fs.readdirSync(cfg.tempDir, { withFileTypes: true })) if (e.isDirectory()) { const n = dirSize(path.join(cfg.tempDir, e.name)); v[e.name + '_Mo'] = Math.round(n / 1e6); tot += n; } } catch {}
  v.total_Mo = Math.round(tot / 1e6); tmpUse.t = Date.now(); tmpUse.v = v; return v;
}
function diskWatch() {
  let free = null, where = '';
  for (const [p, w] of [[cfg.tempDir, 'dossier temporaire du pont'], [cacheRootFull, 'cache de Stremio']]) {
    if (!p || !fs.statfsSync) continue;
    try { const f = fs.statfsSync(p), x = f.bavail * f.bsize; if (free == null || x < free) { free = x; where = w; } } catch {}
  }
  if (free == null) return;
  disk.freeGB = +(free / 1e9).toFixed(1); disk.where = where; disk.low = free < cfg.minFreeGB * 1e9;
  const crit = free < cfg.minFreeCriticalGB * 1e9;
  if (crit && !disk.critical) {
    disk.critical = true; evt('disque-critique', { libreGo: disk.freeGB, ou: where, pont: tmpUsage() });
    log('warn', `DISQUE PRESQUE PLEIN : ${disk.freeGB} Go libres (${where}) < ${cfg.minFreeCriticalGB} Go -> téléchargements arrêtés et nouveaux films refusés tant que la place n'est pas libérée (supprimez des fichiers ou videz le cache de Stremio : Paramètres > Streaming)`);
    for (const D of [...dls.values()].filter(x => x.active)) dlPause(D, `disque presque plein (${disk.freeGB} Go libres sur le ${where})`);
  } else if (disk.critical && free > (cfg.minFreeCriticalGB + 2) * 1e9) { disk.critical = false; log('info', `disque : ${disk.freeGB} Go libres, les films peuvent être relancés`); }
  else if (disk.low && !diskWatch.warned) { diskWatch.warned = true; log('warn', `disque : ${disk.freeGB} Go libres (${where}) : en dessous de ${cfg.minFreeGB} Go, des films lourds risquent de ne pas tenir`); }
  if (!disk.low) diskWatch.warned = false;
}
setInterval(diskWatch, cfg.diskCheckMs).unref(); setTimeout(diskWatch, 4000).unref();
// ----- le serveur Stremio tourne-t-il ? (toute réponse HTTP, même une erreur, prouve qu'il est là) -----
let stremioDown = null;
async function stremioPing() {
  try { await fetch(cfg.localStremio + '/settings', { signal: AbortSignal.timeout(3000) }); if (stremioDown) { log('info', `Stremio répond de nouveau (arrêt de ${Math.round((Date.now() - stremioDown.since) / 1000)} s)`); stremioDown = null; checkCache(); } }
  catch (e) { if (!stremioDown) { stremioDown = { since: Date.now(), why: e.cause && e.cause.code || e.message }; log('warn', `Stremio n'est pas lancé (${cfg.localStremio} : ${stremioDown.why}). Ouvrez l'application Stremio : le pont repart tout seul dès qu'elle répond.`); } }
}
setInterval(stremioPing, cfg.stremioPingMs).unref(); setTimeout(stremioPing, 1500).unref();

// ----- état affiché sur l'écran de chargement -----
function loadStatus(s) {
  const D = s.D, need = D.need || 0, sp = D.speed || 0, T = s.T || bufferTarget(D), got = Math.max(D.readBytes || 0, D.netBytes || 0), age = (Date.now() - (D.activatedAt || s.t0)) / 1000;
  let step, stepTxt, prog;
  if (s.realReady) { step = 4; stepTxt = 'Lancement du film…'; prog = 1; }
  else if (!got) { step = D.peers > 0 ? 2 : 1; stepTxt = D.peers > 0 ? `${D.peers} pair(s) trouvé(s) : récupération des métadonnées…` : 'Recherche de pairs…'; prog = Math.min(0.25, age / 400); if (D.meta) { step = 2; stepTxt = 'Métadonnées obtenues : attente des premières données…'; prog = 0.28; } }
  else { step = 3; const f = Math.min(1, Math.max((s.producedSec || 0) / T, need ? got / ((T + 8) * need) : 0)); stepTxt = `Mise en tampon : ${Math.round(100 * f)} %`; prog = 0.3 + 0.7 * f; }
  let problem = '';
  if (disk.critical && !s.realReady) problem = `DISQUE PLEIN : ${disk.freeGB} Go libres sur le ${disk.where}. Libérez de la place (supprimez des fichiers, videz le cache de Stremio), puis relancez le film.`;
  else if (stremioDown && !s.realReady) problem = `Stremio ne répond pas : lancez l'application Stremio (son serveur fait le téléchargement), puis relancez le film.`;
  else if (!s.realReady) {
    if (age > 90 && !got) problem = D.peers > 0 ? `Aucune donnée reçue après ${Math.round(age)} s malgré ${D.peers} pair(s) : sources probablement mortes. Choisissez un autre film.` : `Aucune source trouvée après ${Math.round(age)} s (0 pair). Ce film ne démarrera sans doute pas : choisissez-en un autre.`;
    else if (need && sp > 0 && age > 12 && sp < need * 0.8) { const w = waitPlan(D); problem = `Débit insuffisant : ${mbs(sp)} sur ${mbs(need)} nécessaires. ` + (cfg.startMode === 'rapide' ? `Le film démarre dès ${cfg.minBufferSec} s de tampon, puis fera des pauses. ` : w && w.complete ? `Pour lire sans coupure il faut ${Math.round(w.leadSec / 60)} min de film d'avance (attente environ ${Math.max(1, Math.round(w.waitSec / 60))} min). ` : `Le film est trop lourd pour ce débit : des pauses sont probables. `) + `Le téléchargement continue si vous quittez.`; }
    else if (cacheWarn && D.size && cacheWarn.sizeBytes && D.size > cacheWarn.sizeBytes) problem = `Le cache de Stremio (${Math.round(cacheWarn.sizeBytes / 1e9)} Go) est plus petit que ce film (${Math.round(D.size / 1e9)} Go) : Stremio > Paramètres > Streaming > Cache.`;
  }
  let eta = null;
  if (!s.realReady && got > 0 && sp > 0) eta = Math.max(0, Math.round(Math.max(0, T - (s.producedSec || 0)) * (need || sp) / sp));
  return { step, stepTxt, prog, problem, eta, T, got, sp, need, age };
}
const VRW = 34;   // largeur max (caractères) du texte en VR
function liveProgressText(s, i = 0) {   // lignes COURTES (≤ 30 caractères) : en VR le texte occupe le centre de la vue, pas tout le dôme
  const ttl = String(s.D.title || '').replace(/[^\x20-\x7EÀ-ÿ]/g, '').replace(/^\s*\[[^\]]*\]\s*/, '').slice(0, 54);
  if (s.realReady && s.direct) return ['FILM PRÊT', ttl, '', `${Math.round(s.producedSec || 0)} s de film déjà reçus`, '', cfg.sampleMode ? 'Mode échantillons : appuyez sur RETOUR' : 'Film HEVC : appuyez sur RETOUR', 'puis relancez le film.', 'Il démarrera aussitôt.', ...(/^(dts|truehd|mlp|vorbis|opus)$/.test(s.audio || '') ? ['', `Son ${s.audio.toUpperCase()} : peut etre muet.`] : [])];
  const D = s.D, L = loadStatus(s), el = Math.max(Math.round((Date.now() - s.loaderT0) / 1000), i * LOAD_SEG), tot = Math.round((Date.now() - (D.activatedAt || s.t0)) / 1000);
  const lines = ['CHARGEMENT DU FILM', ttl, '', `Étape ${L.step}/4`, L.stepTxt, '', `Pairs ${D.peers} · Reçu ${(L.got / 1e6).toFixed(0)} Mo`, `Débit ${mbs(L.sp)}${L.need ? ' / besoin ' + mbs(L.need) : ''}`,
    `Tampon ${Math.round(s.producedSec || 0)} s sur ${L.T} s${L.eta != null ? ' · reste ~' + L.eta + ' s' : ''}`, ''];
  if (L.problem) lines.push(...wrapTxt(L.problem, VRW)); else lines.push(`Attente ${Math.max(el, tot)} s (30 à 60 s : normal)`);
  return lines;
}
function renderLoader(s, i) {   // un segment de 4 s (image fixe + barre de progression + texte), dans la disposition du film
  const rk = `${s.epoch}_${i}`;
  if (s.renders.has(rk)) return s.renders.get(rk);
  const out = path.join(s.dir, `w${rk}.ts`);
  const p = (async () => {
    const g = liveGeom(s.D.screen, s.D.stereo);
    const txtFile = path.join(s.dir, `w${rk}.txt`); const vr = !!((s.D.screen && s.D.screen !== 'flat') || g.stack);   // VR = écran non plat OU disposition 2 yeux
    fs.writeFileSync(txtFile, (s.fake ? s.fake.lines(s, i) : liveProgressText(s, i)).flatMap(l => l.length > (vr ? VRW : 64) ? wrapTxt(l, vr ? VRW : 64) : [l]).join('\n'), 'utf8');
    const W = g.eyeW, H = g.eyeH, bw = Math.round(W * (vr ? 0.2 : 0.6)), bx = Math.round((W - bw) / 2), by = Math.round(H * (vr ? 0.66 : 0.84)), fill = Math.max(4, Math.round(bw * (s.fake ? s.fake.prog(s, i) : loadStatus(s).prog)));
    const fs0 = Math.max(12, Math.round(H / (vr ? 62 : 28) * cfg.loaderTextScale));   // VR : bloc centré d'environ 35 % de la largeur d'un œil (un dôme de 180° étire tout ce qui est large)
    let eye = `drawbox=x=${bx}:y=${by}:w=${bw}:h=${Math.round(H / 40)}:color=0x334455:t=fill,drawbox=x=${bx}:y=${by}:w=${fill}:h=${Math.round(H / 40)}:color=0x33cc77:t=fill`;
    if (FONT) eye += `,drawtext=fontfile='${escF(FONT)}':textfile='${escF(txtFile)}':expansion=none:fontcolor=white:fontsize=${fs0}:line_spacing=${Math.round(fs0 / 3)}:x=(w-text_w)/2:y=h*${vr ? 0.3 : 0.2}`;
    const vf = g.stack === 'h' ? `[0:v]${eye},split[a][b];[a][b]hstack[v]` : g.stack === 'v' ? `[0:v]${eye},split[a][b];[a][b]vstack[v]` : `[0:v]${eye}[v]`;
    const useHevc = cfg.loadingCodec === 'hevc' && hevcEnc;
    const venc = useHevc && hevcEnc ? (hevcEnc === 'libx265' ? ['-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error:keyint=20'] : ['-c:v', 'hevc_nvenc', '-g', '20']) : ['-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-g', '20'];
    const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x101820:s=${W}x${H}:r=5:d=${LOAD_SEG}`, '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`,
      '-filter_complex', vf, '-map', '[v]', '-map', '1:a', '-t', String(LOAD_SEG), ...venc, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k',
      '-output_ts_offset', String(i * LOAD_SEG), '-f', 'mpegts', out];
    const t0 = Date.now();
    const run = a => new Promise(ok => { const pr = cp.spawn(cfg.ffmpeg, a, { stdio: ['ignore', 'ignore', 'pipe'] }); let e = ''; pr.stderr.on('data', d => e += d); pr.on('error', x => ok(x.message)); pr.on('exit', c => ok(c === 0 && !/drawtext/i.test(e) ? '' : e.trim().slice(-300))); });   // drawtext qui échoue (ex. « % » mal interprété) laisse ffmpeg sortir en code 0 : on le détecte quand même
    let err = await run(args);
    if (err && FONT) {   // repli sans texte (drawtext absent ?)
      log('warn', `écran de chargement : rendu avec texte impossible (${err.slice(0, 150)}) -> barre de progression seule`);
      const i2 = args.indexOf('-filter_complex'); args[i2 + 1] = args[i2 + 1].replace(/,drawtext=[^[]*?(?=,split|\[v\])/, ''); err = await run(args);
    }
    if (err) { log('warn', `écran de chargement : segment ${i} impossible (${err.slice(0, 200)})`); throw new Error(err); }
    if (i < 2 || i % 10 === 0) log('debug', `écran de chargement « ${s.D.title} » : segment ${i} rendu en ${Date.now() - t0} ms (${useHevc ? 'HEVC' : 'H.264'})`);
    return out;
  })();
  s.renders.set(rk, p); p.catch(() => s.renders.delete(rk));
  return p;
}
function livePlaylist(s) {
  const D = s.D, now = Date.now(), real = s.realReady && !s.direct;   // film HEVC prêt : on ne l'insère PAS dans le flux HLS (le lecteur ne le décode pas), l'écran de chargement continue avec le message « relancez »
  const fresh = !s.lastPl || now - s.lastPl > (s.playerSec > 0 ? 90000 : 20000);   // nouveau lecteur / nouveau clic : la playlist repart de zéro (pause du lecteur < 90 s : même playlist)
  if (fresh) {
    if (s.lastPl) s.epoch++;
    s.loaderT0 = now; s.shown = 0; s.skipWaits = real;
    if (real) dlLog(D, 'info', 'film déjà prêt : playlist envoyée SANS écran de chargement (lecture immédiate)');
  }
  s.lastPl = now; s.plCount++;
  const el = (now - s.loaderT0) / 1000;
  if (!s.skipWaits && !real) s.shown = Math.max(s.shown, Math.ceil(el / LOAD_SEG) + 3);
  const waits0 = s.skipWaits ? 0 : s.shown, trimmed = !!(real && s.trim > 0), waits = trimmed ? 0 : waits0, first = trimmed ? s.trim : 0;
  if (!trimmed) s.waitsListed = waits0;
  const dseq = trimmed ? ((s.seqBase > 0 ? 1 : 0) + (s.discAt || []).filter(i => i <= s.trim).length) : 0;   // élagage disque : les segments retirés du début sont comptés (spécification HLS)
  const L = ['#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${Math.max(10, Math.ceil(Math.max(0, ...s.realSegs.map(x => x[1]))))}`, `#EXT-X-MEDIA-SEQUENCE:${trimmed ? (s.seqBase || 0) + s.trim : 0}`, ...(dseq ? [`#EXT-X-DISCONTINUITY-SEQUENCE:${dseq}`] : []), '#EXT-X-PLAYLIST-TYPE:EVENT', `#EXT-X-START:TIME-OFFSET=${real && s.playerSec > 0 && waits ? waits * LOAD_SEG : 0}`];
  for (let i = 0; i < waits; i++) L.push(`#EXTINF:${LOAD_SEG}.000,`, `w${s.epoch}_${i}.ts`);
  if (real) {
    if (waits) L.push('#EXT-X-DISCONTINUITY');
    for (let i = first; i < s.realSegs.length; i++) { const [f, d] = s.realSegs[i]; if (i > first && s.discAt && s.discAt.includes(i)) L.push('#EXT-X-DISCONTINUITY'); L.push(`#EXTINF:${d.toFixed(3)},`, `real/${f}`); }
  }
  const hopeless = !real && now - (D.activatedAt || s.t0) > cfg.loaderMaxMin * 60000;
  if ((real && s.realDone) || hopeless) L.push('#EXT-X-ENDLIST');
  if (hopeless && !s.hopeless) { s.hopeless = true; dlLog(D, 'warn', `écran de chargement : arrêt après ${cfg.loaderMaxMin} min sans film exploitable`); }
  if (waits && !real) { const cur = Math.floor(el / LOAD_SEG); for (let i = cur; i <= Math.min(waits - 1, cur + 1); i++) renderLoader(s, i).catch(() => {}); }   // prépare les 2 prochains segments
  return L.join('\n') + '\n';
}
// ----- test de bascule HLS (sans torrent) : même playlist et même rendu que le vrai écran de chargement, mais avec un petit film de test -----
const switchTests = new Map();
async function switchSession(kind, film, screen, stereo) {
  const old = switchTests.get(kind);
  if (old && old.lastPl && Date.now() - old.lastPl < 25000) return old;   // même lancement (la playlist est rafraîchie en continu)
  const dir = old ? old.dir : path.join(cfg.tempDir, 'switch', kind);
  const D = { title: 'Test de bascule', screen, stereo, res: 1080, peers: 0, speed: 0, need: 0, readBytes: 0, netBytes: 0, runtime: 12, timeline: [], activatedAt: Date.now(), key: 'test:' + kind, active: true, lastPlayer: Date.now(), cur: {} };
  const s = { D, dir, t0: Date.now(), epoch: 0, loaderT0: Date.now(), lastPl: 0, plCount: 0, shown: 0, skipWaits: false, realReady: false, realDone: false, realFail: false, realSegs: [], producedSec: 0, playerSec: 0, renders: new Map(), seen: {}, closed: false, test: true,
    fake: { prog: (x) => Math.min(1, (Date.now() - x.loaderT0) / 10000), lines: (x, i) => ['TEST DE BASCULE (sans torrent)', 'Si vous voyez cet écran, le lecteur DeoVR accepte la playlist HLS.', `Dans quelques secondes la vidéo de test doit démarrer toute seule (${Math.max(0, 10 - Math.round((Date.now() - x.loaderT0) / 1000))} s).`, 'Si la vidéo ne démarre pas : notez-le, c\'est une information importante.'] } };
  switchTests.set(kind, s);
  if (!old || !old.ready) {
    fs.mkdirSync(path.join(dir, 'real'), { recursive: true });
    const idxf = path.join(dir, 'real', 'index.m3u8');
    try { fs.rmSync(idxf, { force: true }); } catch {}
    await new Promise(ok => { const pr = cp.spawn(cfg.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(RES_DIR, 'test', film), '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(dir, 'real', 'seg%05d.ts'), idxf], { stdio: 'ignore' }); pr.on('error', ok); pr.on('exit', ok); });
  } else s.dir = dir;
  try {
    const segs = []; let d = 0; for (const l of fs.readFileSync(path.join(dir, 'real', 'index.m3u8'), 'utf8').split('\n')) { const m = /^#EXTINF:([\d.]+)/.exec(l); if (m) d = +m[1]; else if (/^seg\d+\.ts$/.test(l.trim())) segs.push([l.trim(), d]); }
    s.film = segs; s.ready = true;
  } catch { s.film = []; }
  s.timer = setTimeout(() => { s.realSegs = s.film; s.producedSec = s.film.reduce((a, x) => a + x[1], 0); s.realReady = true; s.realDone = true; log('info', `test de bascule ${kind} : film de test prêt (la playlist contient maintenant la bascule)`); }, 10000); s.timer.unref();
  log('info', `test de bascule ${kind} : lecteur connecté (playlist demandée) — écran de chargement 10 s puis film de test`);
  return s;
}
async function serveSwitchTest(req, res, kind, file) {
  const cfgs = { flat: ['test-2d.mp4', 'flat', 'off'], sbs: ['test-3d-sbs.mp4', 'flat', 'sbs'] }[kind];
  if (!cfgs || !ffmpegOk) { res.writeHead(404); return res.end(); }
  const first = file === 'index.m3u8', s = first ? await switchSession(kind, cfgs[0], cfgs[1], cfgs[2]) : switchTests.get(kind);
  if (!s) { res.writeHead(404); return res.end(); }
  if (first) { const body = livePlaylist(s); res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-cache', 'access-control-allow-origin': '*', 'content-length': Buffer.byteLength(body) }); return res.end(req.method === 'HEAD' ? undefined : body); }
  let m = /^w(\d+)_(\d+)\.ts$/.exec(file);
  if (m) { try { const f = await renderLoader(s, +m[2]); if (req.method === 'GET' && +m[2] === 0) log('info', `test de bascule ${kind} : le lecteur a demandé le 1er segment de chargement`); return serveLocal(req, res, f, 'video/mp2t'); } catch { res.writeHead(500); return res.end(); } }
  m = /^real\/(seg\d+\.ts)$/.exec(file);
  if (m) { const f = path.join(s.dir, 'real', m[1]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } if (req.method === 'GET') { s.realSeen = (s.realSeen || 0) + 1; if (s.realSeen === 1) log('info', `test de bascule ${kind} : BASCULE RÉUSSIE — le lecteur a demandé le 1er segment du film de test`); } return serveLocal(req, res, f, 'video/mp2t'); }
  res.writeHead(404); res.end();
}
// le lecteur DeoVR redemande le tout premier segment : il recommence le flux depuis le début (échec de démarrage/décodage, ou nouvel essai)
function noteReopen(D, e, what) {
  e.opens = e.opens || []; const t = Math.round((Date.now() - e.t0) / 1000); e.opens.push(t);
  if (e.opens.length > 1) dlLog(D, 'warn', `+${t} s le lecteur DeoVR recommence le flux (${what}) depuis le début : ouverture n°${e.opens.length} — soit vous avez quitté puis relancé le film, soit le lecteur n'a pas réussi à le démarrer (codec/débit trop lourd ?)`);
}
async function serveLive(req, res, hash, idx, file) {
  if (req.method === 'HEAD') { res.writeHead(200, { 'content-type': file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' }); return res.end(); }   // une simple sonde HEAD ne démarre rien : le téléchargement commence au premier GET (le vrai clic)
  const D = dlTouch(hash, idx, `${req.method} /live/…/${file}`, req), s = liveStart(D);
  const e = D.cur, first = (k, msg) => { if (!e[k]) { e[k] = Date.now(); dlLog(D, 'info', `+${Math.round((Date.now() - e.t0) / 1000)} s ${msg}`); } };
  if (file === 'index.m3u8') {
    first('pl1', 'le lecteur demande la playlist (l\'écran de chargement va s\'afficher)');
    if (!s.realReady && (!s.lastPl || Date.now() - s.lastPl > 20000)) { const t1 = Date.now() + cfg.firstWaitMs; while (!s.realReady && !s.closed && Date.now() < t1) await sleepMs(250); if (s.realReady) dlLog(D, 'info', `film prêt en ${((Date.now() - e.t0) / 1000).toFixed(1)} s, avant même la 1re réponse : aucun écran de chargement nécessaire`); }
    const body = livePlaylist(s);
    res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-cache', 'access-control-allow-origin': '*', 'content-length': Buffer.byteLength(body) });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  let m = /^w(\d+)_(\d+)\.ts$/.exec(file);
  if (m) {
    first('wait1', 'premier segment de chargement demandé (écran de chargement visible dans le casque)');
    if (req.method === 'GET' && +m[2] === 0) noteReopen(D, e, 'écran de chargement');
    try { const f = await renderLoader(s, +m[2]); e.loaderSegs = Math.max(e.loaderSegs, +m[2] + 1); return serveLocal(req, res, f, 'video/mp2t'); } catch { res.writeHead(500); return res.end(); }
  }
  m = /^real\/(seg\d+\.ts)$/.exec(file);
  if (m) {
    const f = path.join(s.dir, 'real', m[1]);
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    if (req.method === 'GET') {
      if (/^seg0*0\.ts$/.test(m[1])) { if (e.filmSeg0) noteReopen(D, e, 'film'); e.filmSeg0 = true; }   // la 1re demande du segment 0 du film EST la bascule (normale) : seules les suivantes sont des redémarrages
      e.realSegs++; if (!e.switched) { e.switched = true; first('real1', `premier segment du VRAI FILM demandé -> la bascule a fonctionné (${e.loaderSegs} segment(s) de chargement vus avant)`); }
      const k = s.realSegs.findIndex(x => x[0] === m[1]); if (k >= 0) s.playerSec = Math.max(s.playerSec, s.realSegs.slice(0, k + 1).reduce((a, x) => a + x[1], 0));
    }
    return serveLocal(req, res, f, 'video/mp2t');
  }
  res.writeHead(404); res.end();
}
setInterval(() => {   // nettoyage : une session de chargement sans activité du lecteur depuis holdMinutes est fermée par dlPause (ci-dessus) ; ici seulement les orphelines
  for (const [k, s] of liveSessions) if (!s.D.active && Date.now() - s.D.lastPlayer > 5 * 60000) liveClose(s.D);
}, 30000).unref();
process.on('exit', () => { for (const s of liveSessions.values()) { try { s.proc.kill(); } catch {} try { fs.rmSync(s.dir, { recursive: true, force: true }); } catch {} } });
function liveData() { return [...liveSessions.values()].map(s => ({ film: s.D.title, ffmpegPid: s.proc && s.proc.pid || null, relances: s.restarts || 0, segmentsSupprimes: s.trim || 0, disqueLibreGo: s.freeGB ?? null, depuis_s: Math.round((Date.now() - s.t0) / 1000), filmPret: s.realReady, tampon_s: Math.round(s.producedSec || 0), cible_s: s.T, avance_s: Math.round(aheadSec(s)), ffmpegEnPause: s.gated, segmentsReels: s.realSegs.length, chargementAffiche: s.shown, playlists: s.plCount, codec: s.codec, pairs: s.D.peers, recu_Mo: +(Math.max(s.D.readBytes, s.D.netBytes) / 1e6).toFixed(1), debit_MoS: +(s.D.speed / 1e6).toFixed(2) })); }
function dlData(full) {
  return dlSorted().map(D => { const st = dlState(D); return { film: D.title, id: D.id, etat: st.label, actif: D.active, clics: D.clicks, format: `${D.screen || '?'}/${D.stereo || '?'}`, raisonVR: D.vrWhy || null, raisonFormat: D.fmtReason || null, pairs: D.peers, reçu_Mo: +(Math.max(D.readBytes, D.netBytes) / 1e6).toFixed(1), debit_MoS: +((D.speed || 0) / 1e6).toFixed(2), necessaire_MoS: D.need ? +(D.need / 1e6).toFixed(2) : null, progression: Math.round(100 * (D.progress || 0)) + ' %', tailleFichier_Mo: D.size ? Math.round(D.size / 1e6) : null, tampon_s: D.live ? Math.round(D.live.producedSec || 0) : null, dernierLecteur_ilYa_s: Math.round((Date.now() - D.lastPlayer) / 1000), disponible: haveText(D) || null, ...(D.sample ? { echantillons: `${D.sample.plan.filter(r => r.done).length}/${D.sample.n}` } : {}), arret: D.pausedWhy || null, ...(full ? { chronologie: D.timeline } : {}) }; });
}
// ----- Stremio : déclaration du torrent -----
async function torrentCreate(hash, why = 'clic') {   // comme l'appli Stremio : déclare le torrent avec une recherche de pairs large (sources addon + publiques + DHT)
  const q = new URLSearchParams(torrentQ.get(hash) || torrentQuery({ infoHash: hash }));
  const sources = q.getAll('tr');
  try {
    const r = await fetch(`${cfg.localStremio}/${hash}/create`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ peerSearch: { min: 40, max: 200, sources } }), signal: AbortSignal.timeout(20000) });
    const txt = await r.text().catch(() => '');
    log('info', `torrent ${hash.slice(0, 8)}… (${why}) : déclaré au serveur Stremio (/create -> HTTP ${r.status}) avec ${sources.length} sources (${sources.filter(x => /^tracker:/.test(x)).length} trackers, ${sources.some(x => /^dht:/.test(x)) ? 'DHT' : 'sans DHT'})${/files|name/.test(txt) ? ' : métadonnées obtenues' : ''}`);
  } catch (e) { log('warn', `torrent ${hash.slice(0, 8)}… : /create -> ${e.message}`); }
}
async function pipeUpstream(req, res, url, headers = {}, firstByteMs = 0, track = null) {
  if (track && req.method === 'HEAD') {   // sonde HEAD de DeoVR avant chaque lecture : taille connue -> réponse immédiate, sans demander la moindre donnée à Stremio
    const D0 = dls.get(`${track.hash}:${track.idx}`), ext0 = (/\.[a-z0-9]{2,4}$/i.exec(new URL(req.url, 'http://x').pathname) || [])[0];
    if (D0 && D0.size) { res.writeHead(200, { 'content-type': MIME[(ext0 || '').toLowerCase()] || 'video/mp4', 'content-length': D0.size, 'accept-ranges': 'bytes' }); return res.end(); }
  }
  headers = { ...headers };
  const tStart = Date.now();
  const Dl = track && req.method !== 'HEAD' ? dlTouch(track.hash, track.idx, `${req.method} flux direct`, req) : null;   // une sonde HEAD n'est pas un clic   // le clic démarre / maintient le téléchargement (registre « En cours »)
  if (Dl) Dl.directT = Date.now();
  if (track && req.method === 'GET') res.once('close', async () => {
    if (res.headersSent || timedOutRef.v) return;
    perfCount.clientGaveUp++;
    const st = await torrentStats(track.hash, track.idx).catch(() => null);
    log('warn', `le lecteur a abandonné après ${((Date.now() - tStart) / 1000).toFixed(1)} s sans recevoir de données (torrent ${track.hash.slice(0, 8)}… : ${st ? `pairs ${st.peers || 0}, reçu ${Math.round((st.downloaded || 0) / 1e3)} Ko, ${((st.downloadSpeed || 0) / 1e6).toFixed(2)} Mo/s` : 'stats indisponibles'}) ; le téléchargement continue, DeoVR réessaiera`);
  });
  const timedOutRef = { v: false };
  if (req.headers.range) headers.range = req.headers.range;
  const ac = new AbortController();
  res.on('close', () => ac.abort());
  let timedOut = false, guarded = false; const tm = firstByteMs ? setTimeout(() => { timedOut = timedOutRef.v = true; ac.abort(); }, firstByteMs) : null;
  try {
    const r = await fetch(url, { headers, redirect: 'follow', signal: ac.signal });
    if (tm) clearTimeout(tm);
    const out = {};
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (r.headers.get(h)) out[h] = r.headers.get(h);
    if (!out['accept-ranges']) out['accept-ranges'] = 'bytes';
    const wantExt = track && (/\.[a-z0-9]{2,4}$/i.exec(new URL(req.url, 'http://x').pathname) || [])[0];
    if (wantExt && MIME[wantExt.toLowerCase()]) out['content-type'] = MIME[wantExt.toLowerCase()];   // type cohérent avec l'extension annoncée à DeoVR
    let rs0 = null, first = null;
    if (track && req.method === 'GET' && r.body) {   // Stremio répond 200 tout de suite mais n'envoie rien tant qu'aucune pièce n'est arrivée : on attend le 1er octet avant de répondre
      rs0 = Readable.fromWeb(r.body);
      const sk = /bytes=(\d+)-/.exec(req.headers.range || ''), seekGuard = cfg.seekGuardSec > 0 && Dl && sk && +sk[1] > cfg.seekGuardMB * 250000 && Dl.directBytes > cfg.seekGuardMB * 1e6 ? cfg.seekGuardSec * 1000 : 0;   // saut en cours de lecture (pas l'ouverture du fichier)
      first = await new Promise((ok, no) => {
        const fbw = seekGuard || firstByteMs, t = fbw ? setTimeout(() => ok(null), Math.max(1000, fbw - (Date.now() - tStart))) : null;
        res.once('close', () => { if (t) clearTimeout(t); ok('closed'); });
        rs0.once('data', c => { if (t) clearTimeout(t); rs0.pause(); ok(c); });
        rs0.once('end', () => { if (t) clearTimeout(t); ok(Buffer.alloc(0)); }); rs0.once('error', no);
      });
      if (first === 'closed') return;   // le lecteur a abandonné (journalisé plus bas)
      if (first === null) { timedOut = timedOutRef.v = true; guarded = !!seekGuard; ac.abort(); throw new Error('aucune donnée'); }
    }
    res.writeHead(r.status, out);
    res.upstream = { status: r.status, type: out['content-type'] || '', len: out['content-length'] || '', crange: out['content-range'] || '' };
    if (Dl && req.method === 'GET' && req.headers.range) {   // le lecteur saute : zone déjà reçue (immédiat) ou non (attente des pairs, le lecteur paraît figé)
      const sm0 = /bytes=(\d+)-/.exec(req.headers.range), st0 = sm0 ? +sm0[1] : 0;
      if (st0 > 5e6 && Dl.size) { Dl.cur && (Dl.cur.sauts = (Dl.cur.sauts || 0) + 1); const inHave = (Dl.have || []).some(([a, b]) => st0 >= a && st0 < b); dlLog(Dl, 'info', `SAUT : le lecteur va à ${Math.round(100 * st0 / Dl.size)} % du fichier (zone ${inHave ? 'déjà reçue' : 'NON reçue'}) — premières données après ${((Date.now() - tStart) / 1000).toFixed(1)} s`); evt('saut', { film: Dl.title, pct: Math.round(100 * st0 / Dl.size), octet: st0, zoneRecue: inHave, premiersOctets_ms: Date.now() - tStart, disponible: haveText(Dl) }); }
    }
    log('debug', `relais ${redact(url)} range=${req.headers.range || '-'} -> ${r.status} ${out['content-type'] || ''} ${out['content-range'] || out['content-length'] || ''}`);
    if (track) {
      const st = relayState.get(track.hash) || {}; const cr = /bytes (\d+)-\d+\/(\d+)/.exec(out['content-range'] || '');
      st.idx = track.idx; st.lastStart = cr ? +cr[1] : 0; st.size = cr ? +cr[2] : (+out['content-length'] || st.size || 0); st.rate = st.rate || []; relayState.set(track.hash, st);
      let cpos = cr ? +cr[1] : 0; const w = res.write.bind(res);
      res.write = (c, ...a) => { if (Dl) { const n = c.length || 0; addRead(Dl, n, 'direct', cpos); cpos += n; Dl.directPos = cpos; if (cfg.readAheadMB > 0 && !cfg.sampleMode && !Dl.aheadRunning) aheadLoop(Dl); if (Dl.cur) { Dl.cur.direct += n; Dl.cur.lastT = Date.now(); } Dl.directT = Date.now(); Dl.lastPlayer = Date.now(); } st.served = (st.served || 0) + (c.length || 0); st.rate.push([Date.now(), c.length || 0]); if (st.rate.length > 400) st.rate.shift(); return w(c, ...a); };
    }
    if (req.method === 'HEAD' || !r.body) return res.end();
    const rs = rs0 || Readable.fromWeb(r.body);
    const sn = c => {   // identifie le vrai format sur les premiers octets
      const sig = sniff(c); res.upstream.sniff = sig.name;
      log('debug', `relais : premiers octets -> ${sig.name}${sig.ext && track ? ' (extension réelle ' + sig.ext + ')' : ''}`);
      if (track && sig.ext) sniffedExt.set(`${track.hash}/${track.idx}`, sig.ext);
    };
    if (!req.headers.range || /^bytes=0-/.test(req.headers.range)) { if (first && first.length) sn(first); else rs.once('data', sn); }
    if (first && first.length) res.write(first);
    rs.on('error', () => res.destroy()).pipe(res);
  } catch (e) {
    if (tm) clearTimeout(tm);
    if (timedOut && guarded) {   // saut dans une zone non reçue : refus rapide + préchargement de la zone (au lieu de geler le lecteur, qui abandonne vers 7 s puis DeoVR se relance : mesuré le 03/10)
      const g = /bytes=(\d+)-/.exec(req.headers.range || ''); perfCount.seekRefuse = (perfCount.seekRefuse || 0) + 1;
      if (Dl) dlLog(Dl, 'warn', `SAUT à ${Dl.size ? Math.round(100 * +g[1] / Dl.size) + ' % ' : ''}sans données en ${cfg.seekGuardSec} s : refus rapide (503) au lieu de geler le lecteur ; ${cfg.seekPrefetchMB} Mo préchargés à partir de là, réessayez dans quelques secondes`);
      if (Dl) { evt('saut-refuse', { film: Dl.title, pct: Dl.size ? Math.round(100 * +g[1] / Dl.size) : null, octet: +g[1], attente_s: cfg.seekGuardSec, disponible: haveText(Dl) }); seekPrefetch(Dl, +g[1]); }
    } else if (timedOut) { perfCount.relay504++; log('warn', `torrent : aucune donnée après ${firstByteMs / 1000} s (pas de pairs ?) -> 504`); }
    else if (e.name !== 'AbortError') log('warn', `relais erreur : ${e.message}${causeOf(e)}`);
    if (!res.headersSent) res.writeHead(guarded ? 503 : timedOut ? 504 : 502, guarded ? { 'retry-after': '8', 'cache-control': 'no-store' } : {}); res.end();
  }
}
function statusData() {   // page /status : films lancés par un clic (actifs et en pause)
  const now = Date.now();
  return Promise.resolve(dlSorted().map(D => { const st = dlState(D); return { film: D.title, etat: st.label, actif: D.active ? 'oui' : 'non', pairs: D.peers, debit_MoS: +((D.speed || 0) / 1e6).toFixed(2), necessaire_MoS: D.need ? +(D.need / 1e6).toFixed(2) : null, ratio: D.need && D.speed ? +(D.speed / D.need).toFixed(2) : null,
    recu_Mo: Math.round(Math.max(D.readBytes, D.netBytes) / 1e6), progression: Math.round(100 * (D.progress || 0)) + ' %', tailleFichier_Mo: D.size ? Math.round(D.size / 1e6) : null, tampon_s: D.live ? Math.round(D.live.producedSec || 0) : null, dernierLecteur_ilYa_s: Math.round((now - D.lastPlayer) / 1000), disponible: haveText(D) || null }; }));
}
const STATUS_HTML = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Pont DeoVR · suivi</title>
<style>body{font:15px system-ui;background:#111;color:#eee;margin:16px}.c{background:#1c1c1c;border-radius:10px;padding:12px;margin:10px 0}b{color:#8cf}.g{color:#6f6}.o{color:#fa4}.r{color:#f66}td{padding:2px 12px 2px 0}</style>
<h2>Suivi de lecture</h2><div id=o>chargement…</div><script>
async function t(){try{const d=await (await fetch('/status.json')).json();document.getElementById('o').innerHTML=d.length?d.map(x=>{const k=x.ratio==null?'':x.ratio>=1.5?'g':x.ratio>=1?'o':'r';return '<div class=c><b>'+x.film+'</b><table>'+Object.entries(x).slice(1).map(([a,b])=>'<tr><td>'+a+'</td><td'+(a=='ratio'?' class='+k:'')+'>'+b+'</td></tr>').join('')+'</table></div>'}).join(''):'Aucune lecture récente.'}catch(e){document.getElementById('o').textContent='erreur '+e}}
t();setInterval(t,2000)</script>
<p>ratio = débit reçu par DeoVR / débit nécessaire à la vidéo : ≥ 1,5 vert (marge), 1 à 1,5 juste, &lt; 1 saccades.</p>`;
function proxy(req, res, m) {
  let headers = {};
  try { headers = JSON.parse(unb64u(m[2])); } catch {}
  return pipeUpstream(req, res, unb64u(m[1]), headers);
}


// ---------- Page web /ui (style deovr.com) : HTML rendu serveur, sans JavaScript (le navigateur de DeoVR est un vieux Chromium) ----------
// Attention : dans le casque, taper l'adresse du pont affiche la bibliothèque NATIVE de DeoVR (il demande /deovr). Cette page est ouverte
// par une adresse avec chemin (…/ui) ou depuis un navigateur du PC. Les films s'ouvrent par un lien deovr://.
const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yearOf = m => { const y = m.year || m.releaseInfo || ''; const a = /(19|20)\d\d/.exec(String(y)) || /(?:^|[^0-9])((?:19|20)\d\d)(?:[^0-9]|$)/.exec(m.name || ''); return a ? a[0].replace(/\D/g, '').slice(0, 4) : ''; };
async function selectFilms(q, base) {   // filtres partagés par /ui et /deovr?cat=…&tab=…&q=…
  const go = q.has('go'), has = k => (go ? (q.has(k) ? '1' : '') : (q.get(k) || ''));
  const f = { tab: q.get('tab') || '', cat: q.get('cat') || '', q: (q.get('q') || '').trim(), f180: has('f180'), f360: has('f360'), vr: go ? (q.has('vr') ? '1' : '0') : (q.get('vr') != null ? q.get('vr') : (cfg.vrOnly ? '1' : '0')), page: Math.max(0, parseInt(q.get('page'), 10) || 0) };
  let sc = []; try { sc = await catalogScenes(null, 40); } catch (e) { log('warn', `/ui : catalogues indisponibles (${e.message})`); }
  const cats = sc.map(c => ({ name: c.name, n: c.metas.length }));
  let items = [];
  if (f.tab === 'cours') items = dlSorted().map(D => ({ m: { id: D.id, type: D.type, name: D.title, poster: D.poster, runtime: D.runtime }, cat: 'En cours', D }));
  else if (f.q) { try { for (const c of await catalogScenes(f.q)) for (const m of c.metas) items.push({ m, cat: c.name }); } catch (e) { log('warn', `/ui : recherche impossible (${e.message})`); } }
  else if (f.tab === 'seeds') items = seedMetas(400).map(m => ({ m, cat: '' }));
  else if (f.tab === 'new') items = newMetas(400).map(m => ({ m, cat: '' }));
  else if (f.tab === 'hq') items = hqMetas(400).map(m => ({ m, cat: '' }));
  else for (const c of sc) if (!f.cat || c.name === f.cat) for (const m of c.metas) items.push({ m, cat: c.name });
  const seen = new Set();
  items = items.filter(x => x.m.id && !seen.has(x.m.id) && seen.add(x.m.id) && (f.tab === 'cours' || !isHidden(x.m.id)));
  for (const x of items) { const h = filmHealth.get(x.m.id); x.h = h; x.fo = formatOf(x.m, x.cat); x.fmt = fmtLabel('', x.fo); x.res = (h && h.res) || detectRes(x.m.name); x.year = yearOf(x.m); x.vr = isVR(x.m, x.cat) || (x.D && !!x.D.vrWhy); x.tag = x.D ? { label: dlState(x.D).label, cls: dlState(x.D).cls } : tagInfo(x.m); }
  let list = items.filter(x => (f.tab === 'cours' || f.vr !== '1' || x.vr) && (!(f.f180 || f.f360) || (f.f180 && x.fmt === 'VR180') || (f.f360 && x.fmt === 'VR360')));
  if (!f.tab && !f.q && cfg.sortByHealth) list = list.map((x, i) => [x, i]).sort((a, b) => (sortKey(b[0].m.id) - sortKey(a[0].m.id)) || (a[1] - b[1])).map(x => x[0]);
  queueScans(list.slice(f.page * cfg.uiPageSize, (f.page + 2) * cfg.uiPageSize).map(x => x.m), 'VR', base);
  return { f, list, cats };
}
async function filteredLibrary(q, base) {   // une sélection de /ui ouverte comme bibliothèque DeoVR : En cours + la sélection + un onglet par catalogue
  const { f, list } = await selectFilms(q, base);
  const by = new Map(); for (const x of list) { if (!by.has(x.cat)) by.set(x.cat, []); by.get(x.cat).push(x.m); }
  const scenes = [dlScene(base)];
  const label = [f.tab, f.cat, f.q, f.f180 && '180', f.f360 && '360'].filter(Boolean).join(' · ');
  if (list.length) scenes.push({ name: ('Sélection ' + label).slice(0, 40).trim(), list: list.slice(0, 200).map(x => metaToItem(x.m, base)) });
  if (!f.cat && !f.tab) for (const [cat, ms] of by) if (cat) scenes.push({ name: cat.slice(0, 40), list: ms.slice(0, cfg.itemsPerTab).map(m => metaToItem(m, base)) });
  if (cfg.testScene) scenes.push(testScene(base));
  return { scenes, authorized: cfg.authorized };
}
const UI_CSS = `body{margin:0;font:15px Arial,sans-serif;background:#0e1116;color:#e6e6e6}a{color:#8cf;text-decoration:none}.lay{width:100%;border-collapse:collapse}
.side{width:236px;vertical-align:top;background:#151a22;padding:12px}.main{vertical-align:top;padding:14px}.logo{font-size:21px;font-weight:bold;color:#fff;margin-bottom:8px}
.side h4{margin:16px 0 6px;color:#9ab;font-size:12px;text-transform:uppercase;letter-spacing:1px}.side a.src{display:block;padding:6px 8px;border-radius:6px;color:#dde;font-size:14px}.side a.on{background:#2a5;color:#fff}.side small{color:#89a}
.side label{display:block;padding:4px 0;font-size:14px}.side button,.top button{font-size:15px;padding:7px 12px;background:#2a5;color:#fff;border:0;border-radius:6px;margin-top:6px}
.top{margin-bottom:12px}.top input[type=text]{width:340px;font-size:16px;padding:8px;background:#1c222c;color:#fff;border:1px solid #445;border-radius:6px}
.tabs{margin:10px 0 14px}.tabs a{display:inline-block;padding:8px 15px;margin:0 6px 6px 0;border-radius:18px;background:#1c222c;color:#dde}.tabs a.on{background:#2a5;color:#fff}
.c{display:inline-block;vertical-align:top;width:172px;margin:0 12px 16px 0}.im{position:relative;width:172px;height:230px;background:#222;border-radius:8px;overflow:hidden}.im img{width:172px;height:230px;border:0}
.bd{position:absolute;left:4px;top:4px;padding:2px 6px;border-radius:4px;font-size:12px;font-weight:bold;color:#fff;background:#456}.bd.g{background:#1d7a3a}.bd.o{background:#b36b00}.bd.r{background:#a02020}.bd.k{background:#333}.bd.b{background:#2b5fa0}.bd.u{background:#555}
.fm{position:absolute;right:4px;bottom:4px;padding:1px 6px;border-radius:4px;font-size:11px;background:rgba(0,0,0,.7);color:#fff}
.t{font-size:13px;height:3.6em;overflow:hidden;margin-top:5px}.pg{margin:14px 0}.pg a,.pg b{display:inline-block;min-width:26px;text-align:center;padding:6px;margin:2px;border-radius:5px;background:#1c222c}.pg b{background:#2a5;color:#fff}
.note{color:#789;font-size:12px;margin-top:14px}.warn{background:#2a2410;border:1px solid #6a5a20;padding:8px 10px;border-radius:6px;margin:8px 0;font-size:13px}`;
async function uiPage(u, host) {
  const q = u.searchParams, base = `http://${host}`;
  const { f, list, cats } = await selectFilms(q, base);
  const total = list.length, ps = cfg.uiPageSize, pages = Math.max(1, Math.ceil(total / ps)), page = Math.min(f.page, pages - 1), shown = list.slice(page * ps, (page + 1) * ps);
  const keep = { go: 1, vr: f.vr === '1' ? 1 : '', f180: f.f180, f360: f.f360 };
  const qs = extra => { const p = { ...keep, tab: f.tab, cat: f.cat, q: f.q, ...extra }; return '/ui?' + Object.keys(p).filter(k => p[k] !== '' && p[k] != null).map(k => k + '=' + encodeURIComponent(p[k])).join('&'); };
  const nCours = dlSorted().length;
  const tabs = [['', 'Catalogues'], ['cours', `En cours${nCours ? ' (' + nCours + ')' : ''}`], ['seeds', 'Plus de seeds'], ['new', 'Nouveautés'], ['hq', 'Haute qualité (titre)']];
  const card = x => { const vu = `${base}/video/${x.m.type || 'movie'}/${encodeURIComponent(x.m.id)}.json`; const t = x.tag; return `<div class=c><a href="deovr://${esc(vu)}"><div class=im><img src="${esc(x.m.poster || x.m.background || '')}" width=172 height=230>${t ? `<span class="bd ${t.cls}">${esc(t.label)}</span>` : ''}<span class=fm>${esc(x.fmt)}${x.res ? ' · ' + resLabel(x.res) : ''}</span></div><div class=t>${esc(x.m.name || x.m.id)}${x.year ? ' <small>(' + esc(x.year) + ')</small>' : ''}</div></a></div>`; };
  const pg = []; for (let i = 0; i < pages; i++) if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 2) pg.push(i); else if (pg[pg.length - 1] !== '…') pg.push('…');
  const pager = pages > 1 ? `<div class=pg>${page > 0 ? `<a href="${qs({ page: page - 1 })}">◀</a>` : ''}${pg.map(i => i === '…' ? ' … ' : i === page ? `<b>${i + 1}</b>` : `<a href="${qs({ page: i })}">${i + 1}</a>`).join('')}${page < pages - 1 ? `<a href="${qs({ page: page + 1 })}">▶</a>` : ''}</div>` : '';
  const hid = (k, v) => (v !== '' && v != null ? `<input type=hidden name=${k} value="${esc(v)}">` : '');
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Pont DeoVR · bibliothèque</title><style>${UI_CSS}</style>
<table class=lay><tr><td class=side>
<div class=logo>Pont DeoVR</div>
<h4>Sources Stremio</h4>
<a class="src${!f.cat && !f.tab && !f.q ? ' on' : ''}" href="${qs({ tab: '', cat: '', q: '', page: '' })}">Tous les catalogues</a>
${cats.map(c => `<a class="src${f.cat === c.name && !f.tab && !f.q ? ' on' : ''}" href="${qs({ tab: '', cat: c.name, q: '', page: '' })}">${esc(c.name)} <small>${c.n}</small></a>`).join('')}
<h4>Format</h4>
<form method=get action=/ui>${hid('tab', f.tab)}${hid('cat', f.cat)}${hid('q', f.q)}<input type=hidden name=go value=1>
<label><input type=checkbox name=f180 value=1${f.f180 ? ' checked' : ''}> VR 180°</label>
<label><input type=checkbox name=f360 value=1${f.f360 ? ' checked' : ''}> VR 360°</label>
<label><input type=checkbox name=vr value=1${f.vr === '1' ? ' checked' : ''}> VR / 3D seulement</label>
<button>Appliquer</button></form>
<p class=note>Dans le casque : tape simplement l'adresse du pont, DeoVR affiche sa bibliothèque (onglet « En cours » en premier). Recherche dans le casque : adresse <code>${esc(host)}/s/mot</code>.</p>
</td><td class=main>
<p class=note>Les liens <b>deovr://</b> de cette page lancent une NOUVELLE instance de DeoVR en mode bureau (mesuré le 03/10) : à utiliser depuis le navigateur du PC, pas dans le casque.</p>
<form class=top method=get action=/ui><input type=hidden name=go value=1>${hid('vr', f.vr === '1' ? 1 : '')}${hid('f180', f.f180)}${hid('f360', f.f360)}<input type=text name=q value="${esc(f.q)}" placeholder="Rechercher dans les catalogues Stremio…"> <button>Rechercher</button></form>
<div class=tabs>${tabs.map(t => `<a class="${(f.q ? '__' : f.tab) === t[0] ? 'on' : ''}" href="${qs({ tab: t[0], cat: '', q: '', page: '' })}">${esc(t[1])}</a>`).join('')} <a href="deovr://${esc(base + '/deovr')}">▶ Bibliothèque DeoVR</a> <a href="/settings">Réglages</a> <a href="/check">Vérifications</a> <a href="/status">Suivi</a></div>
<div>${f.q ? `Recherche « ${esc(f.q)} » : ` : ''}${total} film(s)${f.tab === 'hq' ? ' — « Haute qualité » = d\'après le titre ou la source, indicatif' : ''}</div>
${f.tab === 'cours' ? '<p class=note>[EN COURS 18 % · 1,4 Mo/s] = téléchargement en cours · [PRÊT · 8 min en tampon] = assez de film pour lire sans attendre · [BLOQUÉ · 0 pair] = personne n\'envoie rien · [PAUSE] = arrêté, reprise au clic. Un film lancé reste actif ' + cfg.holdMinutes + ' min après la fin de la lecture.</p>' : ''}
<div style="margin-top:10px">${shown.map(card).join('') || '<p>Aucun film (catalogues en chargement, ou filtres trop stricts : décochez « VR / 3D seulement »).</p>'}</div>
${pager}
<p class=note>Pastille : <b>S12</b> = 12 seeders annoncés par les trackers (aucun téléchargement n'est lancé pour l'afficher) · <b>S0</b> = personne n'annonce de source (film en fin de liste mais jamais masqué) · 8K/4K = d'après le titre ou la source. Cliquer une vignette ouvre le film dans DeoVR (lien deovr://) : le téléchargement ne démarre qu'à ce moment-là.</p>
</td></tr></table>`;
}
// ---------- Page de test des liens deovr:// (étape 0) : quelle méthode d'ouverture fonctionne dans le navigateur de DeoVR ? ----------
function testLinksPage(host) {
  const base = `http://${host}`, j = v => `${base}/video/test/mp4-2d.json?via=${v}`;
  const rows = [
    ['A', 'Lien deovr:// classique (documenté par DeoVR)', `<a href="deovr://${esc(j('A'))}">Ouvrir (A)</a>`],
    ['C', 'Lien vers le pont qui redirige vers deovr://', `<a href="/open/C">Ouvrir (C)</a>`],
    ['D', 'Lien deovr:// ouvert par un petit script', `<a href="#" onclick="window.location.href='deovr://${esc(j('D'))}';return false">Ouvrir (D)</a>`],
    ['E', 'Lien direct vers la fiche JSON (sans deovr://)', `<a href="${esc(j('E'))}">Ouvrir (E)</a>`],
    ['F', 'Lien direct vers la vidéo MP4 de test', `<a href="${esc(base)}/test/test-2d.mp4?via=F">Ouvrir (F)</a>`],
    ['G', 'Lien deovr:// vers la BIBLIOTHÈQUE (mesuré le 03/10 : lance une nouvelle instance de DeoVR en mode bureau — ne pas utiliser dans le casque)', `<a href="deovr://${esc(base)}/deovr?via=G">Ouvrir (G)</a>`],
  ];
  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Test des liens DeoVR</title>
<style>body{font:18px Arial,sans-serif;background:#111;color:#eee;margin:16px}td{padding:8px 14px;border-bottom:1px solid #333}a{color:#8cf;font-size:22px}.ok{color:#6f6}.no{color:#fa4}</style>
<h2>Test d'ouverture d'un film depuis cette page</h2>
<p>Clique chaque lien dans le navigateur de DeoVR (casque). La vidéo de test (12 s) doit s'ouvrir dans le lecteur. Le pont note automatiquement quelle méthode a fonctionné ; recharge cette page ensuite.</p>
<table>${rows.map(r => { const o = openTests.get(r[0]); return `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td class=${o ? 'ok' : 'no'}>${o ? 'OK : DeoVR a demandé la fiche à ' + esc(o.t.slice(11, 19)) : 'pas encore'}</td></tr>`; }).join('')}</table>
<p>Adresse de cette page à taper dans DeoVR : <b>${esc(host)}/t</b></p>`;
}
function noteOpen(via, what, req) {
  if (!/^[A-G]$/.test(via || '')) return;
  openTests.set(via, { t: new Date().toISOString(), ua: String(req.headers['user-agent'] || '').slice(0, 60), what });
  log('info', `TEST ouverture de film : méthode ${via} OK (${what} demandé par ${String(req.headers['user-agent'] || '?').slice(0, 50)})`);
}

// ---------- Observabilité ----------
// DeoVR (constaté le 02/10 sur un film) donne parfois l'adresse de la FICHE au lecteur vidéo comme si c'était le flux : « format non pris en charge ».
// Repli : si c'est le lecteur (NSPlayer) qui demande une fiche, on lui sert le flux qu'elle décrit.
//  - flux HLS : la playlist est servie TELLE QUELLE à cette adresse, avec des adresses de segments ABSOLUES (mesuré au Labo 6 : une redirection 302 ne suffit pas, le lecteur
//    résout les segments relatifs par rapport à l'adresse d'origine -> 404 en boucle) ;
//  - fichier : redirection 302.
async function mediaAsksJson(req, res, v, what) {
  if (!/NSPlayer|WMFSDK/i.test(String(req.headers['user-agent'] || ''))) return false;
  const t = v && (v.path || (v.encodings && v.encodings[0] && v.encodings[0].videoSources && v.encodings[0].videoSources[0] && v.encodings[0].videoSources[0].url)); if (!t) return false;
  log('warn', `le lecteur vidéo de DeoVR a demandé la fiche « ${String(what).slice(0, 50)} » comme si c'était le film (bug connu de DeoVR) : on lui sert directement le flux (repli, à confirmer dans le casque)`);
  let u; try { u = new URL(t); } catch { return false; }
  if (!/\.m3u8$/i.test(u.pathname)) { res.writeHead(302, { location: t, 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); res.end(); return true; }
  try {
    const r = await fetch(`http://127.0.0.1:${selfPort}${u.pathname}${u.search}`, { headers: { 'user-agent': req.headers['user-agent'] || 'NSPlayer', range: req.headers.range || 'bytes=0-' } });
    const body = (await r.text()).split('\n').map(l => { const x = l.trim(); if (!x) return l; if (!x.startsWith('#')) return new URL(x, u).href; return x.replace(/URI="([^"]+)"/, (m, p) => `URI="${new URL(p, u).href}"`); }).join('\n');
    res.writeHead(r.status === 206 ? 200 : r.status, { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'no-cache', 'access-control-allow-origin': '*', 'content-length': Buffer.byteLength(body) }); res.end(body);
  } catch (e) { res.writeHead(502); res.end(); }
  return true;
}
const vidHits = [];
function notePrefetch() {   // DeoVR demande la fiche de TOUS les films d'une liste au chargement
  const n = Date.now(); vidHits.push(n); while (vidHits.length && n - vidHits[0] > 10000) vidHits.shift();
  if (vidHits.length > 20 && n - (notePrefetch.w || 0) > 60000) { notePrefetch.w = n; log('warn', `DeoVR a demandé ${vidHits.length} fiches vidéo en 10 s (préchargement de la liste) : traitées ${cfg.jsonConcurrency} par ${cfg.jsonConcurrency}, résultats mis en cache`); }
}
const jsonLimit = makeLimiter(cfg.jsonConcurrency);
const perfCount = { ok: 0, noStream: 0, late: 0, clientGaveUp: 0, relay504: 0 };
const vidCache = new Map(), vidInflight = new Map();
function vidFor(key, fn) {   // fiche vidéo : cache 45 s des réponses valides uniquement (une réponse vide doit pouvoir se corriger au prochain essai)
  const h = vidCache.get(key); if (h && Date.now() - h.t < 45000) return Promise.resolve(h.v);
  if (vidInflight.has(key)) return vidInflight.get(key);
  const p = fn().then(v => { if (v) { vidCache.set(key, { t: Date.now(), v }); if (vidCache.size > 2000) vidCache.clear(); } return v; });
  vidInflight.set(key, p); p.then(() => vidInflight.delete(key), () => vidInflight.delete(key)); return p;
}
function vidInvalidate(id) { libMemo.clear(); for (const k of [...vidCache.keys()]) if (k.includes(`:${id}:`)) vidCache.delete(k); }   // l'état du film a changé (prêt...) : la prochaine fiche doit être recalculée, pas servie depuis le cache de 45 s
// ----- mémoire : le pont peut tourner des jours (démarrage automatique) : on oublie ce qui est périmé au lieu de tout garder -----
function pruneMemory(now = Date.now()) {
  const drop = (m, maxMs, t = v => v.t) => { for (const [k, v] of m) if (now - (t(v) || 0) > maxMs) m.delete(k); };
  drop(cache, 6 * 3600000); drop(failCache, 60000); drop(seedMemo, 10 * 60000); drop(healthMemo, 3600000); drop(buildVideo.seen, 60000, v => v);
  drop(dnsPub, 10 * 60000); drop(dnsForce, 30 * 60000, v => v); drop(dnsLocal, 30 * 60000, v => v); drop(clickDead, 2 * 3600000, v => v); drop(hostDown, 5 * 60000);
  if (Object.keys(dnsStats.hosts).length > 500) dnsStats.hosts = {};
  const keep = new Set([...dls.values()].map(D => D.hash));   // paramètres des torrents lancés : toujours gardés (sources de l'addon)
  for (const m of [torrentQ, relayState, hashFilm]) if (m.size > 3000) for (const k of m.keys()) if (!keep.has(k)) m.delete(k);
}
setInterval(pruneMemory, 10 * 60000).unref();
const seen = {};   // dernier contact de DeoVR (voyant « DeoVR a contacté le pont »)
async function textClip(lines) {   // petit clip 1080p qui affiche un texte (résultat d'un outil, lu dans le casque)
  const dir = path.join(cfg.tempDir, 'tools'); fs.mkdirSync(dir, { recursive: true });
  for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); try { if (Date.now() - fs.statSync(p).mtimeMs > 600000) fs.rmSync(p, { force: true }); } catch {} }
  const id = Date.now(), t = path.join(dir, `t${id}.txt`), out = path.join(dir, `clip${id}.mp4`);
  fs.writeFileSync(t, lines.flatMap(l => (l === '' ? [''] : wrapTxt(l, 56))).join('\n'), 'utf8');
  const vf = FONT ? `drawtext=fontfile='${escF(FONT)}':textfile='${escF(t)}':expansion=none:fontcolor=white:fontsize=44:line_spacing=16:x=(w-text_w)/2:y=(h-text_h)/2` : 'null';
  const err = await new Promise(ok => { const pr = cp.spawn(cfg.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x101820:s=1920x1080:r=5:d=8', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '8', '-vf', vf, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', out], { stdio: ['ignore', 'ignore', 'pipe'] }); let e = ''; pr.stderr.on('data', d => e += d); pr.on('error', x => ok(x.message)); pr.on('exit', c => ok(c === 0 ? '' : e.trim().slice(-200))); });
  if (err) throw new Error(err); return out;
}
function runReport() {   // le rapport d'assistance est un petit programme à part (--report) : on le lance comme à la main
  return new Promise(ok => {
    const args = PATHS.sea ? ['--report'] : [path.join(APP_DIR, 'server.js'), '--report']; if (PATHS.mode === 'impose') args.push('--data-dir', DATA_DIR);
    let pr; try { pr = cp.spawn(process.execPath, args, { env: { ...process.env, PORT: String(selfPort) }, windowsHide: true, stdio: 'ignore' }); } catch { return ok(false); }
    const t = setTimeout(() => { try { pr.kill(); } catch {} ok(false); }, 45000);
    pr.on('exit', c => { clearTimeout(t); ok(c === 0); }); pr.on('error', () => { clearTimeout(t); ok(false); });
  });
}
const toolActions = {
  etat: async () => {
    const act = [...dls.values()].filter(D => D.active), out = [`Pont ${VERSION_FULL}`, stremioDown ? 'Stremio : NE REPOND PAS' : 'Stremio : ok', `Disque : ${disk.freeGB ?? '?'} Go libres (${disk.where || '?'})`, `Fichiers du pont : ${(tmpUsage().total_Mo / 1000).toFixed(1).replace('.', ',')} Go`, `Telechargements actifs : ${act.length}/${cfg.maxDownloads}`];
    for (const D of act.slice(0, 4)) out.push(`${String(D.title).replace(/[^\x20-\x7EÀ-ÿ]/g, '').replace(/^\s*\[[^\]]*\]\s*/, '').slice(0, 34)} : ${dlState(D).label}`);
    out.push(cfg.sampleMode ? 'Mode echantillon : ACTIVE' : 'Mode echantillon : desactive'); return out;
  },
  rapport: async () => { const ok = await runReport(); return ok ? ['Rapport ecrit dans', path.join(DATA_DIR, 'rapport-support.txt'), '', 'Deposez ce fichier pour analyse.'] : ['Le rapport n\'a pas pu etre ecrit.', 'Utilisez RAPPORT-SUPPORT.bat sur le PC.']; },
  pause: async () => { const act = [...dls.values()].filter(D => D.active); for (const D of act) dlPause(D, 'pause demandée depuis l\'onglet Outils'); return [`${act.length} telechargement(s) mis en pause`, '', 'Relancez un film pour reprendre', '(la partie recue reste dans le cache).']; },
  nettoyer: async () => { for (const D of [...dls.values()].filter(x => x.active)) dlPause(D, 'nettoyage demandé depuis l\'onglet Outils'); await sleepMs(1500); let freed = cleanTemp(); try { const td = path.join(cfg.tempDir, 'thumbs'); freed += dirSize(td); fs.rmSync(td, { recursive: true, force: true }); } catch {} return [`${Math.round(freed / 1e6)} Mo supprimes`, 'Les films en cours sont en pause.']; },
  echantillon: async () => { const v = !cfg.sampleMode; cfg.sampleMode = v; libMemo.clear(); let kept = true; try { require('./configfile').save(PATHS.configFile, { sampleMode: v }); } catch { kept = false; } return [`Mode echantillon : ${v ? 'ACTIVE' : 'DESACTIVE'}`, v ? 'Les prochains films : extraits seulement.' : 'Les prochains films : telechargement complet.', kept ? '' : '(non enregistre dans config.json)']; },
};
let toolsInst = null, pagesInst = null;
const toolsMod = () => toolsInst || (toolsInst = require('./tools').create({ log, serveLocal, textClip, actions: toolActions, thumb: base => `${base}/test/thumb.jpg` }));
const pagesMod = () => pagesInst || (pagesInst = require('./pages').create({ cfg, configFile: PATHS.configFile, save: require('./configfile').save, log, applyHot: () => { libMemo.clear(); vidCache.clear(); }, checks: healthChecks }));
async function healthChecks() {   // voyants de /check : ce qu'il faut vérifier avant de chercher ailleurs
  const out = [], add = (id, label, status, detail, hint = '') => out.push({ id, label, status, detail, hint });
  add('version', 'Pont', 'info', `${VERSION_FULL} · stockage ${PATHS.mode} · données dans ${DATA_DIR}`);
  let sOk = false; try { await fetch(cfg.localStremio + '/settings', { signal: AbortSignal.timeout(2500) }); sOk = true; } catch {}
  add('stremio', 'Stremio (serveur de streaming)', sOk ? 'ok' : 'fail', sOk ? `répond sur ${cfg.localStremio}` : `ne répond pas sur ${cfg.localStremio}`, sOk ? '' : 'Lancez l\'application Stremio.');
  const st = auth.status(); add('compte', 'Compte Stremio', st.connecte ? 'ok' : 'fail', st.connecte ? `connecté (${st.source}${st.compte ? ', ' + st.compte : ''})` : 'non connecté', st.connecte ? '' : `Ouvrez http://localhost:${cfg.port}/setup`);
  if (st.connecte) { try { const addons = await getAddons(), cats = listCatalogs(addons); add('catalogues', 'Addons et catalogues', cats.length ? 'ok' : 'warn', `${addons.length} addon(s), ${cats.length} onglet(s) possible(s)`, cats.length ? '' : 'Installez un addon de catalogue dans Stremio (même compte) ou assouplissez les filtres de catalogues dans /settings.'); } catch (e) { add('catalogues', 'Addons et catalogues', 'warn', e.message); } }
  add('ffmpeg', 'ffmpeg', ffmpegOk ? (FONT ? 'ok' : 'warn') : 'fail', ffmpegOk ? `version ${ffmpegMajor || '?'}${hevcEnc ? ', encodeur HEVC ' + hevcEnc : ''}${FONT ? '' : ', police introuvable'}` : `introuvable (${cfg.ffmpeg})`, ffmpegOk ? (FONT ? '' : 'Sans police, l\'écran de chargement n\'affiche pas de texte.') : 'Sans ffmpeg : ni écran de chargement ni vignettes.');
  add('disque', 'Place disque', disk.freeGB == null ? 'info' : disk.critical ? 'fail' : disk.low ? 'warn' : 'ok', disk.freeGB == null ? 'pas encore mesurée' : `${disk.freeGB} Go libres (${disk.where})`, disk.critical ? 'Libérez de la place : les téléchargements sont arrêtés.' : disk.low ? `Moins de ${cfg.minFreeGB} Go : placez le dossier temporaire (/settings) sur un disque avec de la place.` : '');
  add('temp', 'Fichiers temporaires du pont', 'info', `${tmpUsage().total_Mo} Mo dans ${cfg.tempDir}`);
  if (cacheInfo.lu) add('cache', 'Cache de Stremio', cacheInfo.avertissements.length ? 'warn' : 'ok', `${cacheInfo.cacheSizeGo} Go · ${cacheInfo.cacheRoot || 'dossier inconnu'}${cacheInfo.libreGo != null ? ` · ${cacheInfo.libreGo} Go libres` : ''}`, cacheInfo.avertissements.join(' ; '));
  else add('cache', 'Cache de Stremio', 'info', 'réglages de Stremio pas encore lus');
  add('trackers', 'Trackers UDP (seeders annoncés)', scrapeStats.asked ? (scrapeStats.answered ? 'ok' : 'warn') : 'info', scrapeStats.asked ? `${scrapeStats.answered}/${scrapeStats.asked} réponses` : 'aucune mesure encore', scrapeStats.asked && !scrapeStats.answered ? 'UDP bloqué par le pare-feu ou le routeur ?' : '');
  add('reseau', 'Qui peut joindre le pont', cfg.bindHost === '0.0.0.0' ? 'warn' : 'ok', cfg.bindHost === '0.0.0.0' ? `tout le réseau local, port ${cfg.port}, sans authentification` : `ce PC seulement, port ${cfg.port}`, cfg.bindHost === '0.0.0.0' ? 'Nécessaire seulement pour un casque autonome.' : '');
  add('deovr', 'DeoVR', seen.deovr ? 'ok' : 'info', seen.deovr ? `a contacté le pont à ${seen.deovr.t}${seen.deovr.version ? ' (' + seen.deovr.version + ')' : ''}` : 'n\'a pas encore contacté le pont depuis son démarrage', seen.deovr ? '' : `Dans DeoVR, ouvrez le navigateur et tapez http://localhost:${cfg.port}`);
  add('local', 'Vidéos locales', 'info', `${cfg.localDirs.length ? scanLocal().length : 0} fichier(s) dans ${cfg.localDirs.length} dossier(s)`);
  if (relaunch.list.length) add('relances', 'Relances de DeoVR', 'warn', `${relaunch.list.length} relance(s) probable(s) depuis le démarrage`, 'Détails : data\\bridge-events.log (relance-deovr).');
  return out;
}
const rootHits = [];   // dernières demandes de la racine (/ et /deovr) : ce que DeoVR demande vraiment quand on tape l'adresse du pont
function perfData() {
  const lv = {}; for (const [, h] of filmHealth) { const k = h.hidden ? 'masqués(aucune source)' : (BADGES[h.level] || '⚪'); lv[k] = (lv[k] || 0) + 1; }
  return { uptimeS: Math.round(process.uptime()), version: VERSION, scan: { enFile: scanQ.length, enCours: scanning, ...scanStat }, films: { analyses: filmHealth.size, parNiveau: lv }, enCours: dlData(false), bilans: bilans.slice(-15), ouverturesTest: Object.fromEntries(openTests), racine: rootHits.slice(-8), relancesDeoVR: relaunch.list.slice(-10), memoire: { rssMo: Math.round(process.memoryUsage().rss / 1e6), heapMo: Math.round(process.memoryUsage().heapUsed / 1e6) },
    disque: { libreGo: disk.freeGB, ou: disk.where, bas: disk.low, critique: disk.critical, pont: tmpUsage() }, cacheStremio: cacheInfo, stremioArrete: stremioDown ? { depuis_s: Math.round((Date.now() - stremioDown.since) / 1000), cause: stremioDown.why } : null, ecranChargement: { actif: cfg.loadingScreen, ffmpeg: ffmpegOk, ffmpegVersion: ffmpegMajor, hevc: hevcEnc || 'non', police: FONT ? 'oui' : 'non', sessions: liveData() },
    fichesVideo: { enCours: jsonLimit.running(), enAttente: jsonLimit.waiting(), ...perfCount }, bibliotheque: libCount, dns: { mode: cfg.dnsMode, ...dnsStats },
    scrape: { ...scrapeStats, trackers: cfg.scrapeTrackers, memo: seedMemo.size }, hotesEnPanne: [...hostDown].filter(([, x]) => Date.now() - x.t < 120000).map(([h, x]) => ({ hote: h.replace(/^(.{3}).*(\..*)$/, '$1***$2'), code: x.code })) };
}
let lastState = '';
function stateLog() {
  const p = perfData(), act = [...dls.values()].filter(D => D.active).length, st = JSON.stringify([p.scan.enFile, p.films.analyses, p.scrape.answered, act]);
  if (st === lastState) return; lastState = st;
  const lv = {}; for (const [, h] of filmHealth) { const k = h.hidden ? 'sans source' : ({ 3: 'très bons', 2: 'corrects', 1: 'faibles', 0: 'sans seeder' }[h.level] || 'en attente'); lv[k] = (lv[k] || 0) + 1; }
  log('info', `analyse des films (trackers, sans rien télécharger) : ${p.films.analyses} classés [${Object.entries(lv).map(([k, v]) => `${v} ${k}`).join(', ')}] · ${p.scan.enFile} en attente · téléchargements actifs ${act}/${cfg.maxDownloads} · trackers qui répondent ${p.scrape.answered}/${p.scrape.asked}`);
}
setInterval(stateLog, 60000).unref();
async function warmup(port) {   // au démarrage puis toutes les 8 min : catalogues chargés et films classés AVANT que DeoVR ne demande la liste
  try { await buildLibrary(`http://127.0.0.1:${port}`); } catch (e) { log('warn', `préchauffage : ${e.message}`); }
}

// ---------- Serveur HTTP ----------
const platformOf = req => (/Android|Quest|Oculus|Pico/i.test(req.headers['user-agent'] || '') ? 'quest' : cfg.platform);
const send = (res, code, obj) => {   // pas d'en-tête CORS : DeoVR n'en a pas besoin, et une page web ouverte sur le PC ne doit pas pouvoir lire /debug, /status.json… (titres, chemins, journaux)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0', pragma: 'no-cache', expires: '0' });   // DeoVR garde la bibliothèque en mémoire : on lui interdit de réutiliser une ancienne réponse
  res.end(JSON.stringify(obj, null, cfg.debug ? 2 : 0));
};

// Anti « DNS rebinding » : un site web pourrait faire pointer son propre nom de domaine vers 127.0.0.1 pour lire le pont depuis le navigateur du PC.
// Seuls sont acceptés localhost, les adresses IP et les noms du réseau local (sans point, .local, .lan, .home, .internal, .home.arpa) : DeoVR utilise toujours l'un d'eux.
function hostAllowed(h) {
  if (!h) return true;
  const n = String(h).toLowerCase().replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '$1');
  return n === 'localhost' || /^[\d.]+$/.test(n) || n.includes(':') || !n.includes('.') || /\.(localhost|local|lan|home|internal|home\.arpa)$/.test(n);
}
function start(port = cfg.port) {
  const DECFILE = path.join(DATA_DIR, 'bridge-decisions.log');
  rotate(DEBUGFILE, 5e6); rotate(EVTFILE, 5e6); rotate(LOGFILE, 2e6); rotate(DECFILE, 5e6); rotate(BILAN_FILE, 1e6);
  setInterval(() => { rotate(DEBUGFILE, 20e6); rotate(LOGFILE, 10e6); rotate(DECFILE, 10e6); }, 30 * 60000).unref();   // longues sessions (mode dev : sortie d'ffmpeg) : le journal ne grossit pas sans fin
  process.on('exit', c => { try { fs.appendFileSync(DEBUGFILE, `${new Date().toISOString()} [info] arrêt du processus (code ${c})\n`); } catch {} });
  try { if (cfg.localFolder) fs.mkdirSync(cfg.videosDir, { recursive: true }); } catch {}
  evt('demarrage-pont', { version: VERSION_FULL, node: process.versions.node, os: `${process.platform} ${os.release()}`, ramTotale_Go: +(os.totalmem() / 1e9).toFixed(1), ramLibre_Go: +(os.freemem() / 1e9).toFixed(1), reglages: { sampleMode: cfg.sampleMode, seekGuardSec: cfg.seekGuardSec, formatMenu: cfg.formatMenu, maxDownloads: cfg.maxDownloads, startMode: cfg.startMode, tempDir: cfg.tempDir.replace(/^([A-Za-z]:[\\/]Users[\\/])[^\\/]+/, '$1<utilisateur>') } });
  log('info', `Configuration : Node ${process.versions.node} | ${process.platform} ${os.release()} | port ${port} | plateforme ${cfg.platform} | ffmpeg ${ffmpegOk ? 'oui' : 'non'} | DNS ${cfg.dnsMode} | vrOnly ${cfg.vrOnly} | maxDownloads ${cfg.maxDownloads} | garde ${cfg.holdMinutes} min | trackers ${cfg.scrapeTrackers.length} | dossiers locaux ${cfg.localDirs.length}`);
  const server = http.createServer(async (req, res) => {
    if (!hostAllowed(req.headers.host)) { log('warn', `requête refusée : en-tête Host « ${String(req.headers.host).slice(0, 60)} » (protection contre le DNS rebinding)`); res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(`Adresse refusée : utilisez http://localhost:${cfg.port} ou l'adresse IP de ce PC.`); }
    const u = new URL(req.url, `http://${req.headers.host}`);
    const base = `http://${req.headers.host}`;
    log('debug', `${req.method} ${u.pathname}${u.search} range=${req.headers.range || '-'} ua=${req.headers['user-agent'] || '-'}`);
    const rip = (req.socket.remoteAddress || '').replace('::ffff:', ''); const t0 = Date.now(); let sent = 0; const w0 = res.write.bind(res); res.write = (c, ...a) => { sent += c.length || 0; return w0(c, ...a); }; const e0 = res.end.bind(res); res.end = (c, ...a) => { if (c && typeof c !== 'function') sent += c.length || 0; return e0(c, ...a); };
    const safePath = u.pathname.replace(/[0-9a-f]{40}/gi, x => x.slice(0, 8) + '…').replace(/\/(proxy)\/[^/]+\/[^/]+\//, '/$1/…/…/').replace(/^(\/video\/[^/]+\/).+$/, '$1…');
    const hm0 = /\/(?:torrent|hls|live|feed)\/([0-9a-f]{40})/i.exec(u.pathname), lm0 = /\/(?:localfile|hls\/local)\/([\w-]+)/.exec(u.pathname);
    res.on('close', () => recordReq({ film: hm0 ? (relayState.get(hm0[1].toLowerCase()) || {}).title : lm0 ? localTitles.get(lm0[1]) : undefined, t: new Date(t0).toISOString(), ip: rip, method: req.method, path: safePath + (u.pathname.startsWith('/torrent') ? '' : ''), range: req.headers.range || null, ua: req.headers['user-agent'] || null, status: res.statusCode, sent, ms: Date.now() - t0, finished: res.writableFinished, clientClosedEarly: !res.writableFinished, upstream: res.upstream || undefined }));
    try {
      if (u.pathname === '/setup' || u.pathname === '/setup/logout') return auth.handle(req, res, u);
      if (u.pathname === '/settings') return pagesMod().handleSettings(req, res);
      if (u.pathname === '/check' || u.pathname === '/check.json') return pagesMod().handleCheck(req, res, u.pathname === '/check.json');
      const tlr = u.pathname.match(/^\/tool\/(\w+)\/run\.mp4$/); if (tlr) return toolsMod().run(req, res, tlr[1]);
      const tlv = u.pathname.match(/^\/video\/tool\/(\w+?)(\.json)?$/); if (tlv) { const v = toolsMod().video(tlv[1], base); return v ? send(res, 200, v) : send(res, 404, { error: 'outil inconnu' }); }
      if (u.pathname === '/dev' && cfg.dev) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(devPage(req.headers.host)); }
      if (u.pathname === '/ui' || u.pathname === '/u') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(await uiPage(u, req.headers.host)); }
      if (u.pathname === '/t') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(testLinksPage(req.headers.host)); }
      if (u.pathname === '/open/C') { noteOpen('C', 'redirection du pont', req); res.writeHead(302, { location: `deovr://${base}/video/test/mp4-2d.json?via=C` }); return res.end(); }
      const th = u.pathname.match(/^\/thumb\/([\w-]+)\.jpg$/);
      if (th) { let src = ''; try { src = Buffer.from(th[1], 'base64url').toString(); if (!/^https?:\/\//i.test(src)) throw new Error('url'); const f = await makeThumb(src, cleanOv(u.searchParams)); return serveLocal(req, res, f, 'image/jpeg'); } catch (e) { log('debug', `vignette impossible (${e.message}) -> image d'origine`); if (/^https?:\/\//i.test(src)) { res.writeHead(302, { location: src }); return res.end(); } res.writeHead(404); return res.end(); } }
      const sm = u.pathname.match(/^\/s\/(.+)$/);   // recherche depuis le casque : taper  adresse-du-pont/s/mot  dans le navigateur de DeoVR (DeoVR demande exactement ce lien)
      if (sm) { const term = decodeURIComponent(sm[1]).trim(); log('info', `recherche demandée depuis DeoVR : « ${term} »`); return send(res, 200, await buildLibrary(base, term)); }
      const fd = u.pathname.match(/^\/feed\/([0-9a-f]{40})\/(-?\d+)$/i);
      if (fd) return serveFeed(req, res, fd[1].toLowerCase(), fd[2]);
      if (u.pathname === '/debug/downloads') return send(res, 200, { enCours: dlData(true), bilans });
      if (u.pathname === '/debug/perf') return send(res, 200, perfData());
      if (u.pathname === '/status') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(STATUS_HTML); }
      if (u.pathname === '/status.json') return send(res, 200, await statusData());
      if (u.pathname === '/debug/requests') return send(res, 200, reqLog.slice(-100));
      if (u.pathname === '/debug/health') {
        const cnt = {}; for (const [, h] of filmHealth) cnt[LEVELS[h.level] || 'inconnu'] = (cnt[LEVELS[h.level] || 'inconnu'] || 0) + 1;
        return send(res, 200, { enFile: scanQ.length, enCours: scanning, analyses: filmHealth.size, parNiveau: cnt, films: [...filmHealth].slice(-100).map(([id, h]) => ({ id, niveau: LEVELS[h.level] || 'inconnu', seeders: h.seeders, phase: h.phase, info: h.info, titre: (catalogMetas.get(id) || {}).name })) });
      }
      const sw = u.pathname.match(/^\/test\/switch\/(flat|sbs)\/(index\.m3u8|w\d+_\d+\.ts|real\/seg\d+\.ts)$/);
      if (sw) { noteOpen(u.searchParams.get('via'), 'test de bascule HLS', req); return serveSwitchTest(req, res, sw[1], sw[2]); }
      const tf = u.pathname.match(/^\/test\/([\w.-]+)$/);
      if (tf) { if (req.method === 'GET') noteOpen(u.searchParams.get('via'), 'fichier vidéo de test', req); return serveTestFile(req, res, tf[1]); }
      const lbf = u.pathname.match(/^\/lab\/([\w-]+)\/([\w.-]+)$/);
      if (lbf) return lab().handle(req, res, lbf[1], lbf[2]);
      if (u.pathname === '/debug/labo') return send(res, 200, lab().data());
      const sl = u.pathname.match(/^\/video\/slot\/(\d+)(\.json)?$/);   // emplacement de l'onglet « En cours » -> le film qui l'occupe à cet instant
      if (sl) { const D = dls.get(slotSync()[+sl[1] - 1]); if (!D) { const v = testVideo('empty', base); return send(res, 200, v); } u.pathname = `/video/${D.type || 'movie'}/${encodeURIComponent(D.id)}.json`; }
      const lbv = u.pathname.match(/^\/video\/lab\/([\w-]+?)(\.json)?$/);
      if (lbv) { const v = lab().video(lbv[1], base); if (!v) return send(res, 404, { error: 'scène inconnue' }); if (await mediaAsksJson(req, res, v, 'banc de test ' + lbv[1])) return; return send(res, 200, v); }
      const tv = u.pathname.match(/^\/video\/test\/([\w-]+?)(\.json)?$/);
      if (tv) { noteOpen(u.searchParams.get('via'), 'fiche JSON de test', req); const v = testVideo(tv[1], base); return v ? send(res, 200, v) : send(res, 404, { error: 'test inconnu' }); }
      if (u.pathname === '/catalogs') return send(res, 200, await catalogList());
      if ((u.pathname === '/deovr' || u.pathname === '/') && u.searchParams.get('catalog')) return send(res, 200, await browse(base, u.searchParams.get('catalog'), u.searchParams.get('genre')));
      if ((u.pathname === '/deovr' || u.pathname === '/') && ['cat', 'tab', 'f180', 'f360', 'go'].some(k => u.searchParams.has(k))) return send(res, 200, await filteredLibrary(u.searchParams, base));
      if (u.pathname === '/' && /text\/html/.test(req.headers.accept || '')) { rootHits.push({ t: new Date().toISOString().slice(11, 19), chemin: '/', accept: String(req.headers.accept).slice(0, 60), ua: String(req.headers['user-agent'] || '').slice(0, 50), reponse: 'page web' }); if (rootHits.length > 30) rootHits.shift(); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(await uiPage(u, req.headers.host)); }
      if (u.pathname === '/deovr' || u.pathname === '/') {
        if (u.searchParams.get('via') === 'G') noteOpen('G', 'lien deovr:// vers la bibliothèque', req);
        if (/HMD/.test(req.headers['user-agent'] || '')) { seen.deovr = { t: new Date().toISOString().slice(11, 19), version: (/\[(DEO[^\]]+)\]/.exec(req.headers['user-agent'] || '') || [])[1] || '' }; const nw = Date.now(); if (nw - relaunch.lastHmd < 3000) { const lp = relaunch.lastPlayer, ago = lp ? Math.round((nw - lp.fin) / 1000) : null, ev = { t: new Date().toISOString().slice(11, 19), derniereRequeteLecteur_ilYa_s: ago, chemin: lp && lp.path, range: lp && lp.range, duree_ms: lp && lp.ms, fermeeParLeLecteur: lp && lp.fermeeParLeLecteur }; ev.systeme = { ramLibre_Go: +(os.freemem() / 1e9).toFixed(1), ramPont_Mo: Math.round(process.memoryUsage().rss / 1e6), disqueLibre_Go: disk.freeGB, filmsActifs: [...dls.values()].filter(x => x.active).length, deovr: (/\[(DEO[^\]]+)\]/.exec(req.headers['user-agent'] || '') || [])[1] || null }; relaunch.list.push(ev); evt('relance-deovr', ev); if (relaunch.list.length > 20) relaunch.list.shift(); log('warn', `${ago !== null && ago <= 20 ? 'DeoVR s\'est probablement relancé juste après une lecture' : 'DeoVR (re)démarré (ou lien deovr:// ouvert)'} (2 demandes /deovr en ${((nw - relaunch.lastHmd) / 1000).toFixed(1)} s) — dernière demande du lecteur vidéo il y a ${ago ?? '?'} s : ${lp ? `${lp.path} ${lp.range || ''} -> ${lp.status} après ${lp.ms} ms${lp.fermeeParLeLecteur ? ' (fermée par le lecteur)' : ''}` : 'aucune'}`); } relaunch.lastHmd = nw; }
        rootHits.push({ t: new Date().toISOString().slice(11, 19), chemin: u.pathname, accept: String(req.headers.accept || '-').slice(0, 60), ua: String(req.headers['user-agent'] || '').slice(0, 50), reponse: 'bibliothèque JSON' }); if (rootHits.length > 30) rootHits.shift(); log('info', `bibliothèque demandée (${u.pathname}) par ${String(req.headers['user-agent'] || '?').slice(0, 40)} Accept=${String(req.headers.accept || '-').slice(0, 40)}`); return send(res, 200, await libFor(base, u.searchParams.get('q'))); }
      const lvm = u.pathname.match(/^\/live\/([0-9a-f]{40})\/(-?\d+)\/((?:real\/)?[\w.-]+)$/i);
      if (lvm) { if (!ffmpegOk) { res.writeHead(501); return res.end(); } const hh = lvm[1].toLowerCase(); return serveLive(req, res, hh, lvm[2], lvm[3]); }
      if (u.pathname === '/debug/live') return send(res, 200, liveData());
      const hm = u.pathname.match(/^\/hls\/([0-9a-f]{40})\/(-?\d+)\/([\w.-]+)$/i);
      if (hm) { dlTouch(hm[1].toLowerCase(), hm[2], 'conversion HLS (sans écran de chargement)', req); } if (hm) return serveHls(req, res, `${hm[1].toLowerCase()}:${hm[2]}`, torrentSrc(hm[1].toLowerCase(), hm[2]), hm[1].slice(0, 8) + '…', hm[3]);
      const hl = u.pathname.match(/^\/hls\/local\/([\w-]+)\/([\w.-]+)$/);
      if (hl) { const f = localFile(hl[1]); if (!f) { res.writeHead(404); return res.end(); } return serveHls(req, res, 'local:' + hl[1], f.path, 'fichier local', hl[2]); }
      const tm = u.pathname.match(/^\/torrent\/([0-9a-f]{40})\/(-?\d+)\//i);
      if (tm) return pipeUpstream(req, res, `${cfg.localStremio}/${tm[1].toLowerCase()}/${tm[2]}${u.search || (torrentQ.get(tm[1].toLowerCase()) ? '?' + torrentQ.get(tm[1].toLowerCase()) : '?' + torrentQuery({ infoHash: tm[1] }))}`, {}, cfg.torrentStartMs, { hash: tm[1].toLowerCase(), idx: +tm[2] });
      const p = u.pathname.match(/^\/proxy\/([^/]+)\/([^/]+)\//);
      if (p) return proxy(req, res, p);
      const lf = u.pathname.match(/^\/localfile\/([\w-]+)\/video\.\w+$/);
      if (lf) { const f = localFile(lf[1]); if (!f) { res.writeHead(404); return res.end(); } const ex = path.extname(f.name).toLowerCase(); return serveLocal(req, res, f.path, { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.webm': 'video/webm', '.ts': 'video/mp2t', '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg' }[ex] || 'application/octet-stream'); }
      const lt = u.pathname.match(/^\/localthumb\/([\w-]+)\.jpg$/);
      if (lt) return localThumb(req, res, lt[1]);
      const lv = u.pathname.match(/^\/video\/local\/([\w-]+?)(\.json)?$/);
      if (lv) { const v = localVideo(lv[1], base, platformOf(req)); return v ? send(res, 200, v) : send(res, 404, { error: 'fichier local introuvable' }); }
      const m = u.pathname.match(/^\/video\/([^/]+)\/(.+?)(\.json)?$/);
      if (m) {
        const plat = platformOf(req); log('debug', `film demandé (${plat}) : ${decodeURIComponent(m[2])} — client : ${(req.headers['user-agent'] || '?').slice(0, 90)}`);
        notePrefetch();
        if (jsonLimit.waiting() > 500) return send(res, 503, { error: 'trop de requêtes simultanées, réessayez' });
        const mid = decodeURIComponent(m[2]), ua = req.headers['user-agent'];
        const work = vidFor(`vid:${plat}:${m[1]}:${mid}:${base}`, () => jsonLimit(() => buildVideo(m[1], mid, base, req.headers.host, plat, ua), true));
        const v = await Promise.race([work, sleep(cfg.jsonDeadlineMs).then(() => 'late')]).catch(e => (e.incomplete ? 'late' : Promise.reject(e)));
        if (v === 'late') { perfCount.late++; work.catch(() => {}); log('warn', `fiche ${mid} pas prête en ${cfg.jsonDeadlineMs / 1000} s (addons lents) : réponse 503, elle sera prête au prochain affichage`); return send(res, 503, { error: 'fiche en préparation, rouvrez la liste dans quelques secondes' }); }
        if (!v) perfCount.noStream++; else perfCount.ok++;
        if (!v) return send(res, 404, { error: 'aucun flux lisible trouvé' });
        if (await mediaAsksJson(req, res, v, v._name || mid)) return;
        const Dx = [...dls.values()].find(x => x.id === mid);   // film déjà lancé : l'état (EN COURS 40 %, PRÊT...) est dans le titre, DeoVR remplace le titre de la liste par celui de la fiche à chaque affichage
        return send(res, 200, v._meta ? { ...v, title: Dx ? '[' + dlState(Dx).label + '] ' + v._name : healthTag(v._meta) + v._name } : v);   // sinon : la MÊME pastille que la liste
      }
      if (u.pathname === '/debug') return send(res, 200, { version: VERSION_FULL, compte: auth.status(), chemins: { donnees: DATA_DIR, application: APP_DIR, reglages: PATHS.configFile, ressources: RES_DIR, temporaire: cfg.tempDir, mode: PATHS.mode, exe: PATHS.sea }, config: { ...cfg, email: cfg.email ? cfg.email.replace(/^(.).*(@.*)$/, '$1***$2') : '', password: cfg.password ? '***' : '', authKey: cfg.authKey ? '***' : '', addonUrls: cfg.addonUrls.map(redact) }, log: logBuf.slice(-100) });
      const d = u.pathname.match(/^\/debug\/video\/([^/]+)\/(.+)$/);
      if (d) {
        const a = await analyzeVideo(d[1], decodeURIComponent(d[2]), base, req.headers.host, { measure: u.searchParams.get('measure') === '1' });
        return send(res, 200, {
          meta: a.meta.name, chosen: a.best && { screenType: a.best.screenType, stereoMode: a.best.stereoMode },
          sources: a.sources.map(s => ({ resolution: s.resolution, kind: s.kind, url: redact(s.url) })),
          candidates: a.candidates.map(c => ({ addon: c.addon, kind: c.kind, text: c.text.slice(0, 160), url: redact(c.url), screenType: c.screenType, stereoMode: c.stereoMode, resolution: c.resolution, codec: c.codec, seeders: c.seeders, health: c.health, format: c.fmt, remuxHLS: !!c.remuxed, platformOk: c.platformOk, hints: c.raw.behaviorHints && Object.keys(c.raw.behaviorHints) })),
        });
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      log('error', `${req.url} : ${e.stack || e.message}`);
      send(res, 500, { error: e.message });
    }
  });
  // BRIDGE_LAB_PREPARE=0 : banc de test fabriqué au premier clic seulement (tests automatiques : pas d'encodage HEVC dans chaque pont lancé)
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, cfg.bindHost, () => { selfPort = server.address().port; cleanTemp(); if (cfg.testScene && ffmpegOk && env.BRIDGE_LAB_PREPARE !== '0') setTimeout(() => { try { lab().prepare(); } catch {} }, 8000).unref(); setTimeout(() => warmup(port), 2000); setInterval(() => warmup(port), 8 * 60000).unref(); resolve(server); }); });
}

function devPage(host) {   // /dev (mode --dev uniquement) : tous les points d'observation au même endroit
  const links = [['/status', 'Suivi des films lancés'], ['/status.json', 'idem (JSON)'], ['/debug', 'Configuration (secrets masqués), chemins, compte'], ['/debug/downloads', 'États et chronologie de chaque film cliqué'], ['/debug/perf', 'Performances, ouvertures de test, écran de chargement'], ['/debug/live', 'Sessions de lecture ffmpeg'], ['/debug/health', 'Santé des torrents (trackers)'], ['/debug/requests', 'Dernières requêtes reçues'], ['/catalogs', 'Catalogues Stremio'], ['/deovr', 'Bibliothèque DeoVR (JSON)'], ['/ui', 'Bibliothèque en page web'], ['/t', 'Test des liens deovr://'], ['/setup', 'Connexion Stremio']];
  return `<!doctype html><meta charset=utf-8><title>Pont DeoVR · dev</title><style>body{font:15px system-ui;background:#10151c;color:#e8eef5;max-width:760px;margin:30px auto;padding:0 16px}a{color:#8ab4ff}td{padding:3px 12px 3px 0;vertical-align:top}code{background:#1a222d;padding:1px 5px;border-radius:4px}</style><h1>Mode développeur</h1><p>Version <code>${VERSION_FULL}</code> · données <code>${DATA_DIR}</code> · mode <code>${PATHS.mode}</code></p><table>${links.map(([u, d]) => `<tr><td><a href="${u}">${u}</a></td><td>${d}</td></tr>`).join('')}</table><p>Journaux : <code>bridge-debug.log</code>, <code>bridge-requests.log</code>, <code>bridge-decisions.log</code>, <code>bridge-bilans.log</code> (dans le dossier de données).</p>`;
}
async function selfCheck() {
  { const st = auth.status(); if (st.connecte) log('info', `Compte Stremio : connecté (${st.source}${st.stockage === 'dpapi' ? ', clé chiffrée par Windows' : st.stockage ? ', clé non chiffrée (hors Windows)' : ''})`); else log('warn', `Compte Stremio : NON connecté. Ouvrez http://localhost:${cfg.port}/setup dans un navigateur sur ce PC.`); }
  try { const r = await fetch(`${cfg.localStremio}/settings`, { signal: AbortSignal.timeout(4000) }); log('info', `Serveur Stremio local : répond (HTTP ${r.status})`); }
  catch {}   // injoignable : stremioPing() le signale une seule fois (message « Stremio n'est pas lancé »)
  if (!fs.existsSync(path.join(RES_DIR, 'test', 'test-2d.mp4'))) log('warn', 'dossier resources/test incomplet : les vidéos de test ne seront pas lisibles');
}
module.exports = { healthChecks, toolActions, textClip, cleanOv, badgeText, makeThumb, samplePlan, addHave, haveText, localFormat, localDeclare, cleanTemp, tmpUsage, DATA_DIR, APP_DIR, RES_DIR, PATHS, configError, auth, VERSION_FULL, VERSION_INFO, parseRuntime, vrForce, vrWhy, applyVR, bufferTarget, waitPlan, liveGeom, tagInfo, healthTag, clickDead, seedMetas, pruneMemory, cache, hostAllowed, torrentQuery, thumbUrl, wrapTxt, b64u, filmCats, catalogMetas, VERSION, dls, bilans, dlData, dlState, dnsStats, seedInfo, udpScrape, scrapeStats, perfData, uiPage, catalogScenes, scanLocal, localVideo, probeContainer, selfCheck, reqLog, filmHealth, LEVELS, testVideo, statusData, torrentStats, healthMemo, sniff, nodeGet, causeOf, cfg, log, logBuf, redact, getAddons, listCatalogs, catalogExtra, fetchCatalog, buildLibrary, analyzeVideo, buildVideo, catalogList, supports, detectFormat, detectRes, VR_RE, start };
