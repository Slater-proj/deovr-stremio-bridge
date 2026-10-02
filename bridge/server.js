// Point d'entrée (node server.js  ou  DeoVR-Stremio-Bridge.exe). Options : --help
'use strict';
const cp = require('child_process');
const { isSea: sea, userArgs, argOf } = require('./paths'), isSea = sea();
const raw = userArgs();
const has = f => raw.includes(f) || (f === '--no-browser' && !!process.env.BRIDGE_NO_BROWSER), val = f => argOf(f, raw);
const HELP = `DeoVR-Stremio Bridge — relie Stremio à DeoVR (casque PC VR)

Utilisation :  DeoVR-Stremio-Bridge.exe [options]

  (aucune option)   démarre le pont (la fenêtre = la console des journaux ; la fermer arrête le pont)
  --dev             mode développeur : journaux détaillés dans la console, sortie ffmpeg, page http://localhost:PORT/dev
  --login           ouvre la page de connexion Stremio dans le navigateur (même si déjà connecté)
  --logout          supprime la clé Stremio enregistrée
  --no-browser      n'ouvre jamais le navigateur tout seul
  --port N          port du serveur (défaut 4477, ou "port" dans config.json)
  --data-dir DIR    dossier de données (clé chiffrée, journaux) au lieu de .\\data
  --report          fabrique rapport-support.txt (secrets masqués) ; lancez le pont avant pour inclure son état
  --diagnose        diagnostic complet (bridge-diagnostic)
  --version         affiche la version
  --help            cette aide
`;
if (has('--help') || has('-h')) { process.stdout.write(HELP); process.exit(0); }
if (has('--dev') || has('--debug')) { process.env.BRIDGE_DEV = '1'; process.env.DEBUG = '1'; }
if (val('--port')) process.env.PORT = val('--port');
if (has('--version')) { const v = require('./version'); console.log(v.version + (v.build && v.build.suffix ? v.build.suffix : '') + (v.build && v.build.commit ? ` (${String(v.build.commit).slice(0, 7)}, ${v.build.date})` : '')); process.exit(0); }
if (process.platform === 'win32' && process.stdout.isTTY) { try { cp.spawnSync('cmd', ['/c', 'chcp', '65001'], { stdio: 'ignore', windowsHide: true }); } catch {} }   // accents corrects dans la console

const waitKey = code => {   // l'exe lancé par double-clic : on garde la fenêtre ouverte pour lire le message
  if (isSea && process.stdin.isTTY && !has('--no-pause')) { console.log('\nAppuyez sur Entrée pour fermer cette fenêtre.'); process.stdin.resume(); process.stdin.once('data', () => process.exit(code)); } else process.exit(code);
};
const openUrl = url => {
  try {
    const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    cp.spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref();
  } catch {}
};

if (has('--logout')) {
  const P = require('./paths').resolve(), secrets = require('./secrets');
  console.log(secrets.clear(P.dataDir) ? 'Clé Stremio supprimée.' : 'Impossible de supprimer la clé.'); process.exit(0);
}
if (has('--report') || has('--diagnose')) {
  const rest = raw.filter((a, i) => !a.startsWith('--') && raw[i - 1] !== '--port' && raw[i - 1] !== '--data-dir');
  process.argv.length = 2; process.argv.push(...rest);
  require(has('--report') ? './report' : './diagnose');
  return;   // ces scripts terminent le processus eux-mêmes
}

const cfgState = isSea && !process.env.BRIDGE_CONFIG ? require('./settings').ensure(require('./paths').resolve().configFile) : 'existe';   // exe : crée config.json à côté de lui s'il n'existe pas (avant la lecture des réglages)
const L = require('./lib'), { start, cfg, log, selfCheck } = L;
const fs = require('fs');
start().then(() => {
  const nets = Object.values(require('os').networkInterfaces()).flat().filter(n => n.family === 'IPv4' && !n.internal);
  const b = L.VERSION_INFO.build;
  log('info', `===== DeoVR-Stremio Bridge ${L.VERSION_FULL}${b && b.commit ? ' (build ' + String(b.commit).slice(0, 7) + ')' : ''}${cfg.dev ? '  — MODE DÉVELOPPEUR' : ''} =====`);
  log('info', `Réglages : ${L.PATHS.configFile}${cfgState === 'cree' ? '  (créé au premier lancement : modifiez-le puis relancez, ex. "port")' : ''}`);
  log('info', `Données  : ${L.DATA_DIR}${L.PATHS.mode === 'appdata' ? '  (dossier de l\'exe en lecture seule : repli sur %APPDATA%)' : ''}`);
  if (L.configError) log('warn', `config.json illisible (${L.configError}) : valeurs par défaut utilisées. Corrigez le fichier (JSON valide) ou supprimez-le.`);
  log('info', `Bridge prêt. Dans DeoVR, entre l'une de ces adresses :`);
  log('info', `  http://localhost:${cfg.port}   (DeoVR sur ce PC)`);
  if (cfg.bindHost === '0.0.0.0') for (const n of nets) log('info', `  http://${n.address}:${cfg.port}   (casque autonome / autre appareil)`);
  log('info', `Dans le casque : tape l'adresse ci-dessus, DeoVR affiche sa bibliothèque (onglet « En cours » en premier, puis « Plus de seeds », « Nouveautés », un onglet par catalogue Stremio).`);
  log('info', `Recherche dans le casque : tape  <adresse>/s/mot  (ex. http://${(nets[0] || { address: 'localhost' }).address}:${cfg.port}/s/avatar). Page web façon deovr.com (PC) : http://localhost:${cfg.port}/ui`);
  log('info', `Test des liens deovr:// : http://localhost:${cfg.port}/t  |  Suivi : /status  |  États : /debug/downloads  |  Journaux : data\\bridge-debug.log`);
  if (cfg.dev) log('info', `Mode développeur : tous les points d'observation sur http://localhost:${cfg.port}/dev ; ffmpeg détaillé dans le journal.`);
  if (L.cfg.ffmpeg === 'ffmpeg') log('info', 'ffmpeg : celui du PATH (aucun ffmpeg fourni à côté de l\'application).');
  selfCheck();
  const setupUrl = `http://localhost:${cfg.port}/setup`, st = L.auth.status();
  if (has('--login') || (!st.connecte && !has('--no-browser'))) {
    log('info', `Connexion à Stremio : ouverture de ${setupUrl} dans votre navigateur (si rien ne s'ouvre, copiez cette adresse).`); openUrl(setupUrl);
  }
}).catch(e => {
  const msg = e.code === 'EADDRINUSE' ? `le port ${cfg.port} est déjà utilisé : le pont tourne sans doute déjà (autre fenêtre ouverte ?). Fermez-la ou changez le port (--port 4478 ou "port" dans config.json).`
    : e.code === 'EACCES' ? `accès refusé au port ${cfg.port} : choisissez un port au-dessus de 1024.` : e.stack || e.message;
  log('error', 'Impossible de démarrer : ' + msg); console.error('\nIMPOSSIBLE DE DÉMARRER : ' + msg);
  if (isSea) waitKey(2); else process.exit(2);   // code 2 : start.bat ne relance pas
});
