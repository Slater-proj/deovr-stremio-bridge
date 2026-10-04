'use strict';
// Onglet « Outils » de DeoVR : des actions déclenchées depuis la VR (pas de clavier là-bas).
// Piège : DeoVR demande la fiche de TOUTES les entrées d'une liste dès qu'elle s'affiche. La fiche ne fait donc RIEN ; l'action est exécutée quand le LECTEUR
// vidéo (NSPlayer, depuis ce PC) demande la vidéo de l'outil, et il reçoit en retour un petit clip qui affiche le résultat.
const TOOLS = [
  { key: 'etat', title: 'Outils · État du pont (disque, Stremio, téléchargements)' },
  { key: 'rapport', title: 'Outils · Générer le rapport d\'assistance' },
  { key: 'epingler', title: 'Outils · Télécharger en entier les films en cours' },
  { key: 'pause', title: 'Outils · Mettre tous les téléchargements en pause' },
  { key: 'nettoyer', title: 'Outils · Vider les fichiers temporaires' },
  { key: 'echantillon', title: 'Outils · Mode échantillon : activer / désactiver' },
];
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// actions : { clé: async () => [lignes de texte] } ; textClip(lignes) -> chemin d'un mp4 ; thumb(base) -> vignette
function create({ log, serveLocal, textClip, actions, thumb }) {
  const last = {};   // clé -> { t, file } : le lecteur redemande souvent la même vidéo (plages) -> une seule exécution par 8 s
  const items = base => TOOLS.map(t => ({ title: t.title, videoLength: 8, thumbnailUrl: thumb(base), video_url: `${base}/video/tool/${t.key}.json` }));
  const scene = base => ({ name: 'Outils', list: items(base) });
  function video(key, base) {
    const i = TOOLS.findIndex(t => t.key === key); if (i < 0) return null;
    return { id: 9300 + i, title: TOOLS[i].title, videoLength: 8, thumbnailUrl: thumb(base), screenType: 'flat', stereoMode: 'off', is3d: false, encodings: [{ name: 'h264', videoSources: [{ resolution: 1080, url: `${base}/tool/${key}/run.mp4` }] }] };
  }
  async function run(req, res, key) {
    const tool = TOOLS.find(t => t.key === key);
    if (!tool || !actions[key]) { res.writeHead(404); return res.end(); }
    // seul le lecteur vidéo de DeoVR, sur ce PC : une page web ne peut pas fixer l'en-tête User-Agent (et ne doit pas pouvoir mettre vos films en pause)
    if (!LOOPBACK.has(req.socket.remoteAddress || '') || !/NSPlayer|WMFSDK/i.test(String(req.headers['user-agent'] || ''))) { res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Outil réservé au lecteur vidéo de DeoVR sur ce PC.'); }
    if (req.method === 'HEAD') { res.writeHead(200, { 'content-type': 'video/mp4' }); return res.end(); }
    let file; const l = last[key];
    if (l && Date.now() - l.t < 8000) file = l.file;
    else {
      try { const lines = await actions[key](); log('info', `outil « ${tool.title} » exécuté`); file = await textClip([tool.title.replace(/^Outils · /, '').toUpperCase(), '', ...lines]); last[key] = { t: Date.now(), file }; }
      catch (e) { log('warn', `outil ${key} : ${e.message}`); file = await textClip(['ERREUR', '', String(e.message).slice(0, 120)]).catch(() => null); }
    }
    if (!file) { res.writeHead(500); return res.end(); }
    return serveLocal(req, res, file, 'video/mp4');
  }
  return { TOOLS, scene, video, run };
}

module.exports = { create, TOOLS };
