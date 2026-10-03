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
  localDirs: [],                                // dossiers de vidéos supplémentaires, ex. ["D:\\VR"] (onglet « Local ») ; le dossier « videos » à côté de l'exe est lu d'office
  localDefaultFormat: 'flat',                   // vidéo locale sans indice VR dans son nom (_180_LR, _360…) : "flat" (écran plat), "vr180" (VR180 côte à côte) ou "vr360" (sphère)
  sampleMode: false,                            // true = MODE ÉCHANTILLON : seulement des extraits du film (début, milieu, fin…) pour un aperçu rapide
  sampleCount: 3,                               // mode échantillon : nombre d'extraits répartis dans le film
  sampleMinutes: 2,                             // mode échantillon : durée de chaque extrait (minutes)
  localStremio: 'http://127.0.0.1:11470',       // serveur de streaming de l'application Stremio
  maxDownloads: 3,                              // films téléchargés en même temps
  formatMenu: 'auto',                           // "auto" : format déclaré seulement s'il est lu dans le titre (sinon le menu FLAT/180/360 de DeoVR reste disponible) ; "declare" : toujours déclaré (pas de menu) ; "free" : jamais déclaré (menu toujours là)
  startMode: 'rapide',                          // "rapide" : le film démarre dès 20 s de tampon (pauses possibles si le débit manque) ; "sans-coupure" : attend assez d'avance pour ne jamais s'arrêter
  loaderTextScale: 1,                           // taille du texte de l'écran de chargement en VR (0.7 = plus petit, 1.3 = plus grand)
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
