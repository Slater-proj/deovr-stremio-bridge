'use strict';
// Pages web locales du pont : /settings (réglages sans éditer le JSON à la main) et /check (voyants de bon fonctionnement).
// /settings modifie config.json : réservée au PC lui-même (même protections que /setup : adresse loopback, Host localhost, Origin, jeton, limitation d'essais).
const crypto = require('crypto');

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const hostOk = h => /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(String(h || '').replace(/:\d+$/, ''));
const isLocal = req => LOOPBACK.has(req.socket.remoteAddress || '') && hostOk(req.headers.host);

// hot : appliqué tout de suite ; sinon au prochain lancement du pont
const SCHEMA = [
  { g: 'Lecture et téléchargement', key: 'maxDownloads', type: 'int', min: 1, max: 6, hot: true, label: 'Films téléchargés en même temps', help: 'Au-delà, le plus ancien est mis en pause. 1 ménage le disque et le débit.' },
  { g: 'Lecture et téléchargement', key: 'holdMinutes', type: 'int', min: 1, max: 1440, hot: true, label: 'Minutes de téléchargement après avoir quitté un film', help: 'Passé ce délai sans lecteur, le film est mis en pause (la partie reçue reste dans le cache de Stremio).' },
  { g: 'Lecture et téléchargement', key: 'startMode', type: 'enum', options: ['rapide', 'sans-coupure'], hot: true, label: 'Démarrage du film', help: 'rapide : dès 20 s de tampon (pauses possibles si le débit manque). sans-coupure : attend assez d\'avance pour ne jamais s\'arrêter.' },
  { g: 'Lecture et téléchargement', key: 'readAheadMB', type: 'int', min: 0, max: 5000, hot: true, label: 'Avance de téléchargement en lecture directe (Mo)', help: 'Le pont télécharge en plus devant la position du lecteur. 0 = désactivé.' },
  { g: 'Lecture et téléchargement', key: 'seekGuardSec', type: 'int', min: 0, max: 60, hot: true, label: 'Garde de saut (secondes)', help: 'Un saut dans une zone pas encore reçue est refusé au bout de ce délai (au lieu de figer le lecteur) et la zone est préchargée. 0 = désactivé.' },
  { g: 'Lecture et téléchargement', key: 'minFreeCriticalGB', type: 'num', min: 0.5, max: 100, hot: true, label: 'Arrêt des téléchargements sous (Go libres)', help: 'Les clics sont toujours acceptés ; sous ce seuil tout est arrêté et les fichiers temporaires supprimés.' },
  { g: 'Lecture et téléchargement', key: 'tempDir', type: 'text', dir: true, hot: false, label: 'Dossier des fichiers temporaires', help: 'Segments de lecture et vignettes (plusieurs Go). Vide = data\\tmp à côté de l\'exe. Mettez-le sur un disque avec de la place.' },
  { g: 'Format et affichage', key: 'formatMenu', type: 'enum', options: ['free', 'auto', 'declare'], hot: true, label: 'Format VR (menu de DeoVR)', help: 'free : le menu FLAT / 180 / 360 / fisheye / SBS de DeoVR est toujours là (image brute jusqu\'à votre choix, retenu par vidéo). auto : format déclaré quand le titre l\'indique (pas de menu). declare : toujours déclaré.' },
  { g: 'Format et affichage', key: 'platform', type: 'enum', options: ['windows', 'quest'], hot: true, label: 'Appareil', help: 'windows : DeoVR PC (pas de MKV direct ni AV1/VP9). quest : casque autonome.' },
  { g: 'Format et affichage', key: 'loaderTextScale', type: 'num', min: 0.5, max: 2, hot: true, label: 'Taille du texte de l\'écran de chargement', help: '1 = normal, 0,7 plus petit, 1,3 plus grand.' },
  { g: 'Format et affichage', key: 'thumbBadges', type: 'bool', hot: true, label: 'Badges sur les vignettes', help: 'Résolution, VR180/VR360/3D et seeders dessinés sur l\'image ; barre d\'avancement dans « En cours ».' },
  { g: 'Format et affichage', key: 'vrOnly', type: 'bool', hot: true, label: 'Seulement les films VR / 3D', help: 'Décoché : tous les films des catalogues.' },
  { g: 'Catalogues', key: 'types', type: 'multi', options: ['movie', 'series'], hot: true, label: 'Types de contenu lus', help: 'Les catalogues viennent des addons de votre compte Stremio.' },
  { g: 'Catalogues', key: 'maxTabs', type: 'int', min: 1, max: 60, hot: true, label: 'Nombre maximum d\'onglets', help: 'Un onglet par catalogue.' },
  { g: 'Catalogues', key: 'catalogInclude', type: 'text', regex: true, hot: true, label: 'Catalogues à garder (expression)', help: 'Vide = tous. Exemple : VR|180' },
  { g: 'Catalogues', key: 'catalogExclude', type: 'text', regex: true, hot: true, label: 'Catalogues à ignorer (expression)', help: 'Exemple : TMDB|Séries' },
  { g: 'Catalogues', key: 'genreTabs', type: 'bool', hot: true, label: 'Un onglet par genre', help: 'Pour les catalogues qui proposent des genres.' },
  { g: 'Onglet Local', key: 'localFolder', type: 'bool', hot: false, label: 'Lire le dossier « videos » à côté de l\'exe', help: 'Copiez-y vos films téléchargés ailleurs : onglet « Local » de DeoVR.' },
  { g: 'Onglet Local', key: 'videosDir', type: 'text', dir: true, hot: false, label: 'Emplacement du dossier « videos »', help: 'Vide = à côté de l\'exe.' },
  { g: 'Onglet Local', key: 'localDirs', type: 'lines', hot: false, label: 'Autres dossiers de vidéos (un par ligne)', help: 'Exemple : D:\\VR' },
  { g: 'Onglet Local', key: 'localDefaultFormat', type: 'enum', options: ['flat', 'vr180', 'vr360'], hot: true, label: 'Format par défaut des vidéos locales sans indice dans le nom', help: 'flat : le menu de DeoVR est proposé. vr180 / vr360 : imposé.' },
  { g: 'Mode échantillon', key: 'sampleMode', type: 'bool', hot: true, label: 'Mode échantillon (aperçu)', help: 'Ne télécharger que des extraits (début, milieu, fin) au lieu du film entier.' },
  { g: 'Mode échantillon', key: 'sampleCount', type: 'int', min: 1, max: 12, hot: true, label: 'Nombre d\'extraits', help: '3 = début, milieu, fin.' },
  { g: 'Mode échantillon', key: 'sampleMinutes', type: 'num', min: 0.5, max: 30, hot: true, label: 'Durée de chaque extrait (minutes)', help: '' },
  { g: 'Mode échantillon', key: 'samplePadSec', type: 'int', min: 0, max: 120, hot: true, label: 'Marge autour de chaque extrait (secondes)', help: '' },
  { g: 'Avancé', key: 'bindHost', type: 'enum', options: ['127.0.0.1', '0.0.0.0'], hot: false, label: 'Qui peut joindre le pont', help: '127.0.0.1 : ce PC seulement (conseillé). 0.0.0.0 : tout le réseau local (casque autonome) ; le pont n\'a aucune authentification.' },
  { g: 'Avancé', key: 'port', type: 'int', min: 1024, max: 65535, hot: false, label: 'Port', help: 'Adresse à taper dans DeoVR : http://localhost:<port>' },
  { g: 'Avancé', key: 'toolsTab', type: 'bool', hot: true, label: 'Onglet « Outils » dans DeoVR', help: 'Rapport, pause, nettoyage, état : actions depuis la VR.' },
  { g: 'Avancé', key: 'testScene', type: 'bool', hot: true, label: 'Onglet « Test pont » (Labos)', help: 'Vidéos de test et banc de test casque.' },
  { g: 'Avancé', key: 'dev', type: 'bool', hot: false, label: 'Mode développeur', help: 'Journaux détaillés et page /dev.' },
];

// form : URLSearchParams ; cur : réglages actuels. -> { values (tous les champs saisis), errors }
function parse(form, cur) {
  const values = {}, errors = [];
  for (const f of SCHEMA) {
    const name = 'f_' + f.key;
    if ((f.type === 'bool' || f.type === 'multi') && !form.has('p_' + f.key)) { values[f.key] = cur[f.key]; continue; }
    if (f.type === 'bool') { values[f.key] = form.has(name); continue; }
    if (f.type === 'multi') { const v = f.options.filter(o => form.has(`${name}_${o}`)); if (!v.length) errors.push(`${f.label} : cochez au moins une case`); else values[f.key] = v; continue; }
    if (!form.has(name)) { values[f.key] = cur[f.key]; continue; }   // champ absent du formulaire : inchangé
    const raw = String(form.get(name) || '');
    if (f.type === 'int' || f.type === 'num') {
      const t = raw.trim().replace(',', '.'), n = Number(t);
      if (!t || !isFinite(n) || (f.type === 'int' && !Number.isInteger(n)) || n < f.min || n > f.max) { errors.push(`${f.label} : un nombre${f.type === 'int' ? ' entier' : ''} entre ${f.min} et ${f.max} est attendu`); continue; }
      values[f.key] = n;
    } else if (f.type === 'enum') {
      if (!f.options.includes(raw)) errors.push(`${f.label} : valeur non reconnue`); else values[f.key] = raw;
    } else if (f.type === 'text') {
      const t = raw.trim();
      if (t.length > 300) { errors.push(`${f.label} : trop long`); continue; }
      if (f.regex && t) { try { new RegExp(t, 'i'); } catch (e) { errors.push(`${f.label} : expression invalide (${e.message})`); continue; } }
      values[f.key] = f.dir && !t ? undefined : t;   // dossier vide = valeur par défaut (clé supprimée)
    } else if (f.type === 'lines') {
      const v = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      if (v.length > 20 || v.some(x => x.length > 300)) { errors.push(`${f.label} : 20 dossiers au plus`); continue; }
      values[f.key] = v;
    }
  }
  return { values, errors };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const CSS = `body{font:16px/1.5 system-ui,Segoe UI,sans-serif;background:#10151c;color:#e8eef5;margin:0}main{max-width:820px;margin:0 auto;padding:24px 16px 60px}h1{font-size:1.4rem;margin:0 0 4px}h2{font-size:1.05rem;margin:28px 0 8px;color:#8ab4ff;border-bottom:1px solid #2b3747;padding-bottom:4px}p{color:#aebccd;margin:.4em 0}
.f{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:4px 16px;padding:10px 0;border-bottom:1px solid #1b2430}.f label{font-weight:600}.f small{display:block;color:#7f90a5;font-weight:400}.r{color:#fa4;font-size:.8rem}
input[type=text],input[type=number],select,textarea{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid #38485c;background:#0e131a;color:#fff;font-size:1rem}textarea{min-height:70px}
button{margin-top:22px;padding:11px 22px;border:0;border-radius:8px;background:#3b82f6;color:#fff;font-size:1rem;cursor:pointer}a{color:#8ab4ff}.ok{color:#5fd38d}.err{color:#ff8a80}.warn{color:#ffd166}
table{border-collapse:collapse;width:100%}td{padding:8px 10px;border-bottom:1px solid #1b2430;vertical-align:top}.dot{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px}.d-ok{background:#2fbf71}.d-warn{background:#f5a623}.d-fail{background:#e5484d}.d-info{background:#5b8def}
@media(max-width:640px){.f{grid-template-columns:1fr}}`;
const shell = (title, body) => `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Pont DeoVR</title><style>${CSS}</style><main>${body}</main></html>`;

function create({ cfg, configFile, save, log, applyHot, checks, queue }) {
  const token = crypto.randomBytes(24).toString('hex'), fails = [];
  const page = (res, code, body, title = 'Réglages') => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" }); res.end(shell(title, body)); };
  const nav = '<p><a href="/ui">Bibliothèque web</a> · <a href="/check">Vérifications</a> · <a href="/status">Suivi</a> · <a href="/setup">Compte Stremio</a></p>';

  function field(f) {
    const v = cfg[f.key], name = 'f_' + f.key, restart = f.hot ? '' : ' <span class="r">(après redémarrage)</span>';
    let input;
    if (f.type === 'bool') input = `<input type="hidden" name="p_${f.key}" value="1"><label><input type="checkbox" name="${name}" value="1"${v ? ' checked' : ''}> activé</label>`;
    else if (f.type === 'multi') input = `<input type="hidden" name="p_${f.key}" value="1">` + f.options.map(o => `<label><input type="checkbox" name="${name}_${o}" value="1"${(v || []).includes(o) ? ' checked' : ''}> ${esc(o)}</label>`).join(' ');
    else if (f.type === 'enum') input = `<select name="${name}">${f.options.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    else if (f.type === 'lines') input = `<textarea name="${name}" spellcheck="false">${esc((v || []).join('\n'))}</textarea>`;
    else if (f.type === 'int' || f.type === 'num') input = `<input type="text" inputmode="decimal" name="${name}" value="${esc(v)}">`;
    else input = `<input type="text" name="${name}" value="${esc(v)}" spellcheck="false">`;
    return `<div class="f"><div><label>${esc(f.label)}${restart}</label><small>${esc(f.help)}</small></div><div>${input}</div></div>`;
  }
  function form(msg = '') {
    let h = '', g = '';
    for (const f of SCHEMA) { if (f.g !== g) { g = f.g; h += `<h2>${esc(g)}</h2>`; } h += field(f); }
    return `<h1>Réglages du pont</h1>${nav}<p>Les réglages sont écrits dans <b>${esc(configFile)}</b>. Ceux marqués « après redémarrage » ne jouent qu'au prochain lancement du pont ; les autres sont appliqués tout de suite.</p>${msg}<form method="post" action="/settings" autocomplete="off"><input type="hidden" name="t" value="${token}">${h}<button>Enregistrer</button></form>`;
  }
  async function handleSettings(req, res) {
    if (!isLocal(req)) return page(res, 403, `<h1>Accès réservé à ce PC</h1><p>Ouvrez <b>http://localhost:${cfg.port}/settings</b> dans un navigateur sur le PC où tourne le pont.</p>`);
    if (req.method === 'GET') return page(res, 200, form());
    if (req.method !== 'POST') return page(res, 405, '<h1>Méthode non autorisée</h1>');
    const origin = req.headers.origin; if (origin && origin !== 'null') { let ok = false; try { ok = hostOk(new URL(origin).host); } catch {} if (!ok) return page(res, 403, '<h1>Origine refusée</h1>'); }
    let body; try { body = await new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 65536) { no(new Error('trop gros')); req.destroy(); } }); req.on('end', () => ok(b)); req.on('error', no); }); } catch { return page(res, 400, '<h1>Requête invalide</h1>'); }
    const f = new URLSearchParams(body);
    if (f.get('t') !== token) return page(res, 403, form('<p class="err">Page expirée : rechargez-la et réessayez.</p>'));
    const now = Date.now(); while (fails.length && fails[0] < now - 60000) fails.shift(); if (fails.length >= 10) return page(res, 429, form('<p class="err">Trop d\'essais : patientez une minute.</p>'));
    const { values, errors } = parse(f, cfg);
    if (errors.length) { fails.push(now); return page(res, 200, form(`<p class="err">Rien n'a été enregistré :</p><ul class="err">${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`)); }
    const changes = {}, hot = [], later = [];
    for (const s of SCHEMA) {
      const nv = values[s.key];
      if (nv === undefined ? !fileHas(s.key) : same(nv, cfg[s.key])) continue;   // inchangé (dossier laissé vide et absent du fichier, ou valeur identique)
      changes[s.key] = nv; (s.hot ? hot : later).push(s.label);
    }
    if (!Object.keys(changes).length) return page(res, 200, form('<p class="ok">Aucun changement.</p>'));
    try { save(configFile, changes); } catch (e) { return page(res, 500, form(`<p class="err">Enregistrement impossible : ${esc(e.message)}</p>`)); }
    for (const s of SCHEMA) if (s.hot && s.key in changes && changes[s.key] !== undefined) cfg[s.key] = changes[s.key];
    try { applyHot(); } catch {}
    log('info', `réglages enregistrés depuis /settings : ${Object.keys(changes).join(', ')}`);
    return page(res, 200, form(`<p class="ok">Enregistré.</p>${hot.length ? `<p class="ok">Appliqué tout de suite : ${esc(hot.join(', '))}.</p>` : ''}${later.length ? `<p class="warn">Après redémarrage du pont : ${esc(later.join(', '))}.</p>` : ''}`));
  }
  const fileHas = k => { try { return k in (JSON.parse(require('fs').readFileSync(configFile, 'utf8'))); } catch { return false; } };

  const readBody = req => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 65536) { no(new Error('trop gros')); req.destroy(); } }); req.on('end', () => ok(b)); req.on('error', no); });
  function queuePage(msg = '') {
    const rows = queue.list().map(q => `<tr><td><b>${esc(q.titre)}</b></td><td>${esc(q.etat)}</td><td>${q.enFile ? `<form method="post" action="/queue"><input type="hidden" name="t" value="${token}"><input type="hidden" name="act" value="remove"><input type="hidden" name="key" value="${esc(q.key)}"><button style="margin:0;padding:4px 10px">Retirer</button></form>` : ''}</td></tr>`).join('');
    return `<h1>File de téléchargement</h1>${nav}<p>Les films ajoutés ici (bouton ⬇ de la <a href="/ui">bibliothèque web</a>, ou l'outil « Télécharger en entier » de DeoVR) sont téléchargés <b>en entier</b> par Stremio sans lecteur, dans la limite de ${cfg.maxDownloads} à la fois. Une fois complets, ils se lisent directement : pas d'écran de chargement, sauts instantanés.</p>${msg}<form method="post" action="/queue"><input type="hidden" name="t" value="${token}"><input type="hidden" name="act" value="add"><p>Ajouter par identifiant (ex. tt1234567) : <input type="text" name="id" style="width:220px;display:inline" spellcheck="false"> <select name="type" style="width:110px;display:inline"><option>movie</option><option>series</option></select> <button style="margin:0;padding:6px 14px">Ajouter</button></p></form>${rows ? `<table>${rows}</table>` : '<p>Aucun film en file.</p>'}`;
  }
  async function handleQueue(req, res) {
    if (!isLocal(req)) return page(res, 403, `<h1>Accès réservé à ce PC</h1><p>Ouvrez <b>http://localhost:${cfg.port}/queue</b> dans un navigateur sur le PC où tourne le pont.</p>`, 'File');
    if (req.method === 'GET') return page(res, 200, queuePage(), 'File');
    if (req.method !== 'POST') return page(res, 405, '<h1>Méthode non autorisée</h1>');
    const origin = req.headers.origin; if (origin && origin !== 'null') { let ok = false; try { ok = hostOk(new URL(origin).host); } catch {} if (!ok) return page(res, 403, '<h1>Origine refusée</h1>'); }
    let f; try { f = new URLSearchParams(await readBody(req)); } catch { return page(res, 400, '<h1>Requête invalide</h1>'); }
    if (f.get('t') !== token) return page(res, 403, queuePage('<p class="err">Page expirée : rechargez-la et réessayez.</p>'), 'File');
    const act = f.get('act'), id = String(f.get('id') || ''), type = String(f.get('type') || 'movie');
    if (act === 'add') {
      if (!/^[\w:.%~-]{1,120}$/.test(id) || !/^(movie|series)$/.test(type)) return page(res, 400, queuePage('<p class="err">Film non reconnu.</p>'), 'File');
      try { const r = await queue.add(type, id); return page(res, 200, queuePage(r.deja ? '<p class="ok">Ce film est déjà entièrement téléchargé.</p>' : '<p class="ok">Ajouté à la file.</p>'), 'File'); }
      catch (e) { return page(res, 200, queuePage(`<p class="err">Impossible d'ajouter ce film : ${esc(e.message)}</p>`), 'File'); }
    }
    if (act === 'remove') { queue.remove(String(f.get('key') || '')); return page(res, 200, queuePage('<p class="ok">Retiré de la file.</p>'), 'File'); }
    return page(res, 400, queuePage('<p class="err">Action inconnue.</p>'), 'File');
  }
  async function handleCheck(req, res, json) {
    const list = await checks();
    if (json) { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); return res.end(JSON.stringify(list, null, 2)); }
    const worst = list.some(c => c.status === 'fail') ? 'fail' : list.some(c => c.status === 'warn') ? 'warn' : 'ok';
    const head = { ok: '<p class="ok">Tout est en ordre.</p>', warn: '<p class="warn">Quelques points à regarder (en orange).</p>', fail: '<p class="err">Au moins un point bloquant (en rouge).</p>' }[worst];
    const rows = list.map(c => `<tr><td><span class="dot d-${esc(c.status)}"></span><b>${esc(c.label)}</b></td><td>${esc(c.detail)}${c.hint ? `<br><small class="warn">${esc(c.hint)}</small>` : ''}</td></tr>`).join('');
    return page(res, 200, `<h1>Vérifications</h1><p><a href="/ui">Bibliothèque web</a> · <a href="/settings">Réglages</a> · <a href="/check">Actualiser</a></p>${head}<table>${rows}</table><p>Cette page ne vérifie pas l'ouverture de port de votre routeur (le principal levier de vitesse des torrents) : voir docs/TROUBLESHOOTING.md.</p>`, 'Vérifications');
  }
  return { handleSettings, handleCheck, handleQueue, token, SCHEMA };
}

module.exports = { create, parse, SCHEMA, isLocal };
