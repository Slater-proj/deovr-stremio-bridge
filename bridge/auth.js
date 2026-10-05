'use strict';
// Connexion au compte Stremio : le mot de passe n'est JAMAIS enregistré. On ne garde que la clé d'authentification
// (chiffrée par Windows, voir secrets.js). La connexion se fait dans le navigateur sur http://localhost:PORT/setup.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const secrets = require('./secrets');

const maskEmail = e => String(e || '').replace(/^(.).*(@.*)$/, '$1***$2');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const needLoginError = () => Object.assign(new Error('Connexion Stremio requise : ouvrez la page /setup du pont dans un navigateur sur ce PC'), { code: 'NEED_LOGIN' });

module.exports = function createAuth({ cfg, log, post, dataDir, configFile, onChange = () => {} }) {
  let session = null;   // { authKey, emailHint, source: 'config' | 'store' | 'session', scheme }
  let storeError = '', unreadable = 0;   // unreadable : date du secrets.dat illisible (copié d'un autre PC / autre compte Windows)
  const mtimeOf = () => { try { return fs.statSync(path.join(dataDir, secrets.FILE)).mtimeMs; } catch { return 0; } };
  const storeOk = () => secrets.exists(dataDir) && !(unreadable && unreadable === mtimeOf());   // une clé enregistrée ET lisible
  const token = crypto.randomBytes(24).toString('hex'), fails = [];

  async function login(email, password) {
    const r = await post(`${cfg.stremioApi}/api/login`, { type: 'Login', email, password, facebook: false });
    const authKey = r && r.result && r.result.authKey;
    if (!authKey) { const msg = r && r.error && (r.error.message || r.error) || 'réponse inattendue'; throw Object.assign(new Error('Stremio a refusé la connexion : ' + String(msg).slice(0, 120)), { code: 'LOGIN_REFUSED' }); }
    return { authKey, emailHint: maskEmail(email) };
  }
  function persist(s) {
    try { s.scheme = secrets.save(dataDir, { authKey: s.authKey, emailHint: s.emailHint, savedAt: new Date().toISOString() }); storeError = ''; return true; }
    catch (e) { storeError = e.message; log('warn', `clé Stremio non enregistrée (${e.message}) : elle reste en mémoire jusqu'à l'arrêt du pont`); return false; }
  }
  function stripLegacyPassword() {   // retire le mot de passe de config.json une fois la clé enregistrée
    const f = configFile || path.join(dataDir, 'config.json');
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (!('password' in j) || !j.password) return false;
      delete j.password; fs.writeFileSync(f, JSON.stringify(j, null, 2)); return true;
    } catch { return false; }
  }
  async function key() {   // -> { authKey, source } ou lève NEED_LOGIN
    if (cfg.authKey) return { authKey: cfg.authKey, source: 'config' };
    if (session) return session;
    if (!unreadable || unreadable !== mtimeOf()) try { const st = secrets.load(dataDir); if (st && st.authKey) return (session = { authKey: st.authKey, emailHint: st.emailHint || '', source: 'store', scheme: secrets.backend() === 'dpapi' ? 'dpapi' : 'plain' }); }
    catch (e) { storeError = e.message; if (e.code === 'SECRET_UNREADABLE') unreadable = mtimeOf(); log('warn', e.message); }   // illisible : on ne relance pas PowerShell/DPAPI à chaque requête tant que le fichier ne change pas
    if (cfg.email && cfg.password) {   // ancienne configuration : on se connecte une fois, on garde la clé, on retire le mot de passe
      const s = await login(cfg.email, cfg.password); session = { ...s, source: 'session' };
      if (persist(session)) { session.source = 'store'; log('info', `Connexion Stremio migrée : clé enregistrée (${session.scheme === 'dpapi' ? 'chiffrée par Windows' : 'non chiffrée, hors Windows'})${stripLegacyPassword() ? ', mot de passe retiré de config.json' : ''}`); }
      return session;
    }
    throw needLoginError();
  }
  function invalid() {   // Stremio a rejeté la clé : on l'oublie pour redemander la connexion
    if (session && session.source === 'config') return;
    session = null; secrets.clear(dataDir); log('warn', 'la clé Stremio n\'est plus valide : reconnexion nécessaire (http://localhost:' + cfg.port + '/setup)'); onChange();
  }
  async function signIn(email, password) {
    const s = await login(email, password); session = { ...s, source: 'session' };
    const stored = persist(session); if (stored) session.source = 'store';
    log('info', `Connexion Stremio réussie (${s.emailHint}) : clé ${stored ? (session.scheme === 'dpapi' ? 'chiffrée par Windows' : 'enregistrée sans chiffrement (hors Windows)') : 'gardée en mémoire seulement'}`);
    onChange(); return { stored };
  }
  function signOut() { session = null; secrets.clear(dataDir); log('info', 'Déconnexion Stremio : clé supprimée'); onChange(); }
  function status() {
    const connected = !!(cfg.addonUrls.length || cfg.authKey || session || storeOk() || (cfg.email && cfg.password));
    return { connecte: connected, source: cfg.addonUrls.length ? 'addons fixes (config)' : cfg.authKey ? 'config.json / variable' : session ? session.source : storeOk() ? 'store' : (cfg.email ? 'config.json (ancien)' : 'aucune'), compte: session ? session.emailHint : '', stockage: secrets.exists(dataDir) ? secrets.backend() : null, erreurStockage: storeError || undefined };
  }
  async function check() { if (!cfg.addonUrls.length) try { await key(); } catch {} return status(); }   // au démarrage : lit la clé une fois (un secrets.dat illisible = non connecté -> la page /setup s'ouvre)

  // ----- page /setup -----
  const hostOk = h => /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(String(h || '').replace(/:\d+$/, ''));
  const isLocal = req => LOOPBACK.has(req.socket.remoteAddress || '') && hostOk(req.headers.host);
  const page = (res, code, body, extra = {}) => {
    res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'", ...extra });
    res.end(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/favicon.ico"><title>Connexion Stremio · Pont DeoVR</title>
<style>body{font:16px/1.5 system-ui,Segoe UI,sans-serif;background:#10151c;color:#e8eef5;margin:0;display:grid;place-items:center;min-height:100vh}main{width:min(440px,92vw);background:#1a222d;border:1px solid #2b3747;border-radius:14px;padding:28px}h1{font-size:1.25rem;margin:0 0 6px}p{color:#aebccd;margin:.4em 0}label{display:block;margin:14px 0 4px;font-size:.9rem;color:#aebccd}input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #38485c;background:#0e131a;color:#fff;font-size:1rem}button{margin-top:18px;width:100%;padding:11px;border:0;border-radius:8px;background:#3b82f6;color:#fff;font-size:1rem;cursor:pointer}button.sec{background:#2b3747}.ok{color:#5fd38d}.err{color:#ff8a80}small{color:#7f90a5;display:block;margin-top:14px}</style><main>${body}</main></html>`);
  };
  const form = (msg = '') => `<h1>Connexion à Stremio</h1><p>À faire une seule fois. Le mot de passe sert uniquement à obtenir une clé de session ; <b>il n'est pas enregistré</b>. La clé est ${secrets.backend() === 'dpapi' ? 'chiffrée avec votre compte Windows' : 'enregistrée sans chiffrement (système hors Windows)'}.</p>${msg}
<form method="post" action="/setup" autocomplete="off"><input type="hidden" name="t" value="${token}"><label for="e">E-mail Stremio</label><input id="e" name="email" type="email" required autofocus><label for="p">Mot de passe</label><input id="p" name="password" type="password" required><button>Se connecter</button></form><small>Compte créé avec Facebook ou Apple ? Créez d'abord un mot de passe dans Stremio (Paramètres du compte).</small>`;
  async function readForm(req) {
    return new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 8192) { no(new Error('trop gros')); req.destroy(); } }); req.on('end', () => ok(new URLSearchParams(b))); req.on('error', no); });
  }
  async function handle(req, res, u) {   // /setup (GET, POST) et /setup/logout (POST)
    if (!isLocal(req)) return page(res, 403, `<h1>Accès réservé à ce PC</h1><p>Ouvrez <b>http://localhost:${cfg.port}/setup</b> dans un navigateur sur le PC où tourne le pont.</p>`);
    if (req.method === 'GET') {
      const st = status();
      if (st.connecte && !u.searchParams.has('change')) return page(res, 200, `<h1>Stremio</h1><p class="ok">${u.searchParams.has('ok') ? 'Connexion réussie. ' : ''}Compte connecté${st.compte ? ' (' + esc(st.compte) + ')' : ''}.</p><p>Vous pouvez fermer cette page et ouvrir DeoVR.</p><form method="post" action="/setup/logout"><input type="hidden" name="t" value="${token}"><button class="sec">Se déconnecter (supprime la clé)</button></form><p><a style="color:#8ab4ff" href="/setup?change=1">Changer de compte</a></p>`);
      return page(res, 200, form());
    }
    if (req.method !== 'POST') return page(res, 405, '<h1>Méthode non autorisée</h1>');
    const origin = req.headers.origin; if (origin && origin !== 'null' && !hostOk(new URL(origin).host)) return page(res, 403, '<h1>Origine refusée</h1>');
    let f; try { f = await readForm(req); } catch { return page(res, 400, '<h1>Requête invalide</h1>'); }
    if (f.get('t') !== token) return page(res, 403, form('<p class="err">Page expirée : rechargez-la et réessayez.</p>'));
    if (u.pathname === '/setup/logout') { signOut(); return page(res, 200, form('<p class="ok">Déconnecté.</p>')); }
    const now = Date.now(); while (fails.length && fails[0] < now - 60000) fails.shift();
    if (fails.length >= 5) return page(res, 429, form('<p class="err">Trop d\'essais : patientez une minute.</p>'));
    try { await signIn(String(f.get('email') || '').trim(), String(f.get('password') || '')); }
    catch (e) { fails.push(now); log('warn', 'connexion Stremio échouée : ' + e.message); return page(res, 200, form(`<p class="err">${esc(e.code === 'LOGIN_REFUSED' ? e.message : 'Connexion impossible (' + e.message + ')')}</p>`)); }
    res.writeHead(303, { location: '/settings?bienvenue=1', 'cache-control': 'no-store' }); res.end();
  }
  return { key, invalid, signIn, signOut, status, check, handle, needLoginError, setupToken: token, maskEmail };
};
module.exports.maskEmail = maskEmail;
