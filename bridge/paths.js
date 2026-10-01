'use strict';
// Où vivent les fichiers du pont. Règle : TOUT au même endroit, rien de dispersé sur le PC.
//   exe autonome  -> <dossier de l'exe>\data\   (config, clé Stremio chiffrée, journaux, état, temporaires) ; supprimer le dossier supprime tout
//   node server.js -> le dossier du code (comme avant)
//   BRIDGE_DATA_DIR / --data-dir <dossier> -> ce dossier (tests, installation séparée)
//   config.json à côté de l'exe (ancienne installation portable) -> ce dossier
//   dernier recours : dossier de l'exe non inscriptible (ex. Program Files) -> %APPDATA%\DeoVR-Stremio-Bridge
const fs = require('fs'), path = require('path'), os = require('os');

function isSea(env = process.env) { if (env.BRIDGE_APP_DIR) return true; try { return require('node:sea').isSea(); } catch { return false; } }
function userArgs() {
  const a = process.argv, self = p => path.resolve(String(p)).toLowerCase();
  if (!isSea()) return a.slice(2);
  return a.slice(1).filter(x => self(x) !== self(process.execPath));   // dans un exe, argv[1] est soit l'exe lui-même soit déjà le 1er argument
}   // argv de l'utilisateur (l'exe n'a pas de « script » en argv[1])
function argOf(name, argv) { const i = argv.indexOf(name); if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1]; const p = argv.find(a => a.startsWith(name + '=')); return p ? p.slice(name.length + 1) : ''; }
function writable(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, `.w${process.pid}`); fs.writeFileSync(f, ''); fs.rmSync(f, { force: true }); return true; } catch { return false; }
}
function fallbackDir() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'DeoVR-Stremio-Bridge');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'deovr-stremio-bridge');
}

let memo;
function resolve(argv, env = process.env) {
  const implicit = argv === undefined; if (implicit && memo) return memo; if (implicit) argv = userArgs();
  const sea = isSea(env), appDir = env.BRIDGE_APP_DIR ? path.resolve(env.BRIDGE_APP_DIR) : sea ? path.dirname(process.execPath) : __dirname;   // BRIDGE_APP_DIR : tests du paquet sans exe
  let dataDir, mode;
  const forced = env.BRIDGE_DATA_DIR || argOf('--data-dir', argv);
  if (forced) { dataDir = path.resolve(forced); mode = 'impose'; }
  else if (!sea) { dataDir = appDir; mode = 'dossier-du-code'; }
  else if (fs.existsSync(path.join(appDir, 'config.json'))) { dataDir = appDir; mode = 'portable-ancien'; }
  else if (writable(path.join(appDir, 'data'))) { dataDir = path.join(appDir, 'data'); mode = 'portable'; }
  else { dataDir = fallbackDir(); mode = 'appdata'; }
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
  const r = { sea, appDir, dataDir, tmpDir: path.join(dataDir, 'tmp'), mode }; if (implicit) memo = r; return r;
}
module.exports = { resolve, isSea, argOf, writable, userArgs };
