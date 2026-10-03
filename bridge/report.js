// Rassemble tous les journaux utiles dans UN fichier (rapport-support.txt), secrets masqués. Usage : RAPPORT.bat
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const L = require('./lib');
const dir = L.DATA_DIR;
const tail = (f, n) => { try { const l = fs.readFileSync(path.join(dir, f), 'utf8').split('\n'); return l.slice(-n).join('\n'); } catch { return '(absent)'; } };
const head = (f, n) => { try { return fs.readFileSync(path.join(dir, f), 'utf8').split('\n').slice(0, n).join('\n'); } catch { return '(absent)'; } };
const cfg = { ...L.cfg, email: L.cfg.email ? L.cfg.email.replace(/^(.).*(@.*)$/, '$1***$2') : '', password: L.cfg.password ? '***' : '', authKey: L.cfg.authKey ? '***' : '', addonUrls: L.cfg.addonUrls.map(L.redact), localDirs: (L.cfg.localDirs || []).map(() => '<dossier>') };
const ff = (() => { try { const r = cp.spawnSync(L.cfg.ffmpeg, ['-version'], { timeout: 5000, encoding: 'utf8' }); return r.status === 0 ? r.stdout.split('\n')[0] : 'absent'; } catch { return 'absent'; } })();
(async () => {
let live = '(pont non démarré : lance start.bat avant RAPPORT.bat pour inclure l\'état en direct)';
try {
  const g = async p => (await fetch(`http://127.0.0.1:${L.cfg.port}${p}`, { signal: AbortSignal.timeout(4000) })).text();
  live = ['--- /debug/downloads (onglet « En cours » : état + chronologie complète de chaque film cliqué, bilans) ---', await g('/debug/downloads'), '--- /debug/labo (banc de test casque : ce que le lecteur a demandé pour chaque scène de test) ---', await g('/debug/labo'), '--- /debug/perf (dont ouvertures de test deovr:// réussies, demandes de la racine par DeoVR) ---', await g('/debug/perf'), '--- /debug/health (seeders annoncés par film) ---', await g('/debug/health'), '--- /status.json ---', await g('/status.json'), '--- /debug/live (écrans de chargement) ---', await g('/debug/live')].join('\n');
} catch {}
let txt = [
  `RAPPORT DE SUPPORT — ${new Date().toISOString()}`,
  `Node ${process.versions.node} | ${process.platform} ${require('os').release()} | ffmpeg: ${ff}`,
  `Config : ${JSON.stringify(cfg)}`,
  `Version du pont : ${L.VERSION_FULL} (données : ${L.PATHS.mode})`,
  `Compte Stremio : ${JSON.stringify(L.auth.status())}`,
  '\n===== ÉTAT EN DIRECT DU PONT =====', live,
  '\n===== BILANS PAR CLIC (lu / quitté puis repris / abandonné par DeoVR après X s / aucune donnée) =====', tail('bridge-bilans.log', 60),
  '\n===== DÉCISIONS (format VR et raison, sources proposées/écartées, 40 dernières) =====', tail('bridge-decisions.log', 40),
  '\n===== ÉVÉNEMENTS (lecteur vidéo, sauts, relances de DeoVR, disque : à lire en premier, 300 derniers) =====', tail('bridge-events.log', 300),
  '\n===== REQUÊTES REÇUES (DeoVR et pont, 400 dernières) =====', tail('bridge-requests.log', 400),
  '\n===== JOURNAL DÉTAILLÉ (1500 dernières lignes) =====', tail('bridge-debug.log', 1500),
  '\n===== DIAGNOSTIC (résumé) =====', fs.existsSync(path.join(dir, 'diagnostic-report.txt')) ? (fs.statSync(path.join(dir, 'diagnostic-report.txt')).mtime.toISOString() + ' | ') + fs.readFileSync(path.join(dir, 'diagnostic-report.txt'), 'utf8').split('\n').filter(l => /^(===|\[(FAIL|WARN|PASS)\]|  ·|  torrent|  stats)/.test(l)).join('\n') : '(lance diagnose.bat pour l\'inclure)',
].join('\n');
// masquage : email, hôtes distants remplacés par un identifiant stable (on distingue les hôtes sans les révéler)
if (L.cfg.email) txt = txt.split(L.cfg.email).join('***@***');
// URL distante : hôte ET chemin masqués (le chemin d'une URL d'addon peut contenir une clé, ex. /realdebrid=CLE/manifest.json) ; les adresses locales (127.0.0.1, IP) restent lisibles
txt = txt.replace(/(https?):\/\/([a-z0-9.-]+\.[a-z]{2,})(:\d+)?(\/[^\s"'<>\\)]*)?/gi, (m, s, h, p, rest) => `${s.toLowerCase()}://hote-${crypto.createHash('sha1').update(h.toLowerCase()).digest('hex').slice(0, 5)}${rest && rest.length > 1 ? '/…' : ''}`);
txt = txt.replace(/([A-Za-z]:(?:\\\\|\\)Users(?:\\\\|\\))[^\\"\s]+/g, '$1<utilisateur>');   // nom du compte Windows dans les chemins
txt = txt.replace(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(pw|club|io|fun|com|net|org|tv|xyz)\b/gi, m => 'hote-' + crypto.createHash('sha1').update(m).digest('hex').slice(0, 5));
fs.writeFileSync(path.join(dir, 'rapport-support.txt'), txt);
console.log(`rapport-support.txt écrit (${Math.round(txt.length / 1024)} Ko) : ${path.join(dir, 'rapport-support.txt')}\nEnvoie-moi ce fichier.`);
process.exit(0);
})();
