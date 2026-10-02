'use strict';
// Fichier de réglages de l'utilisateur (config.json) : créé à côté de l'exe au premier lancement, avec les réglages courants.
// Tout le reste garde sa valeur par défaut (liste complète : docs/CONFIGURATION.md du dépôt). Jamais d'identifiant dedans : la connexion Stremio passe par /setup.
const fs = require('fs');
const DEFAULTS = {
  _aide: 'Réglages du pont DeoVR-Stremio. Modifiez une valeur puis relancez le pont. Supprimez ce fichier pour revenir aux valeurs par défaut. Liste complète des options : docs/CONFIGURATION.md sur https://github.com/Slater-proj/deovr-stremio-bridge',
  port: 4477,                                   // adresse à taper dans DeoVR : http://localhost:<port>
  bindHost: '0.0.0.0',                          // "127.0.0.1" = uniquement ce PC (plus sûr) ; "0.0.0.0" = aussi le casque autonome / le réseau local
  platform: 'windows',                          // "windows" (DeoVR PC) ou "quest" (casque autonome : MKV/AV1/VP9 acceptés)
  vrOnly: true,                                 // true = seulement les films VR/3D ; false = tous les films des catalogues
  localDirs: [],                                // dossiers de vidéos locales, ex. ["D:\\VR"] (onglet « Mes vidéos »)
  localStremio: 'http://127.0.0.1:11470',       // serveur de streaming de l'application Stremio
  maxDownloads: 3,                              // films téléchargés en même temps
  holdMinutes: 30,                              // un film quitté reste actif (téléchargement) ce nombre de minutes
  dev: false,                                   // true = mode développeur (journaux détaillés) à chaque lancement
};
// _aide est le seul « commentaire » possible en JSON ; les explications par option sont dans docs/GUIDE-RAPIDE.txt
function ensure(file) {   // -> 'cree' | 'existe' | 'impossible'
  try {
    if (fs.existsSync(file)) return 'existe';
    fs.writeFileSync(file, JSON.stringify(DEFAULTS, null, 2) + '\n', { flag: 'wx' }); return 'cree';
  } catch { return 'impossible'; }
}
module.exports = { DEFAULTS, ensure };
