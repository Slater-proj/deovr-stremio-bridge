'use strict';
// Stockage de la clé d'authentification Stremio (jamais le mot de passe).
//   Windows : chiffrée avec DPAPI (liée au compte Windows de l'utilisateur) via PowerShell, aucune dépendance.
//   Autres systèmes (développement) : fichier en lecture seule pour l'utilisateur, NON chiffré (le dit clairement).
// Fichier : <dossier de données>/secrets.dat   { v:1, scheme:'dpapi'|'plain', data:<base64> }
const fs = require('fs'), path = require('path'), cp = require('child_process');
const FILE = 'secrets.dat', ENTROPY = Buffer.from('deovr-stremio-bridge:v1').toString('base64');

function backend() { return process.env.BRIDGE_SECRET_BACKEND || (process.platform === 'win32' ? 'dpapi' : 'plain'); }
function ps(script, input) {
  const exe = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell';
  const r = cp.spawnSync(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { input, encoding: 'utf8', timeout: 20000, windowsHide: true });
  if (r.error) throw new Error('PowerShell indisponible : ' + r.error.message);
  if (r.status !== 0) throw new Error('PowerShell a échoué : ' + String(r.stderr || '').trim().split('\n')[0]);
  return String(r.stdout).trim();
}
const HEAD = `Add-Type -AssemblyName System.Security; $e=[Convert]::FromBase64String('${ENTROPY}'); $in=[Console]::In.ReadToEnd().Trim(); $b=[Convert]::FromBase64String($in);`;
const dpapiProtect = b64 => ps(HEAD + `[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Protect($b,$e,'CurrentUser'))`, b64);
const dpapiUnprotect = b64 => ps(HEAD + `[Convert]::ToBase64String([System.Security.Cryptography.ProtectedData]::Unprotect($b,$e,'CurrentUser'))`, b64);

function save(dir, obj) {
  const raw = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64'), scheme = backend() === 'dpapi' ? 'dpapi' : 'plain';
  const data = scheme === 'dpapi' ? dpapiProtect(raw) : raw;
  if (!data) throw new Error('chiffrement vide');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, FILE), tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ v: 1, scheme, data }), { mode: 0o600 });
  fs.renameSync(tmp, f);
  return scheme;
}
function load(dir) {   // -> objet, ou null (absent / illisible / chiffré pour un autre compte Windows)
  let env; try { env = JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8')); } catch { return null; }
  try {
    const raw = env.scheme === 'dpapi' ? dpapiUnprotect(env.data) : env.data;
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch (e) { const err = new Error('secrets.dat illisible (copié depuis un autre PC ou un autre compte Windows ?) : ' + e.message); err.code = 'SECRET_UNREADABLE'; throw err; }
}
function clear(dir) { try { fs.rmSync(path.join(dir, FILE), { force: true }); return true; } catch { return false; } }
function exists(dir) { return fs.existsSync(path.join(dir, FILE)); }
module.exports = { save, load, clear, exists, backend, FILE };
