# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Les versions 1 à 9 étaient des itérations internes ; elles sont résumées dans la 10.0.

## [Non publié]

### Corrigé (test au casque du 02/10)
- **Écran de chargement toujours en H.264** (avant : HEVC pour les films 6K+). Les journaux montrent que le lecteur de DeoVR relance le flux depuis le début **exactement 15 s** après son démarrage quand il est en HEVC, alors qu'un écran de chargement en H.264 tourne sans problème. Même cause pour les films HEVC 8K envoyés en HLS (dont le film « prêt » qui chargeait à l'infini).
- **Films non H.264 (HEVC…)** : l'écran de chargement s'affiche tout de suite, pendant la mise en tampon ; quand le film est prêt il indique « PRÊT, appuyez sur RETOUR puis relancez le film » (le HEVC n'est plus jamais mis dans le flux HLS) ; au clic suivant la fiche propose le fichier direct (lecture immédiate, mode VR habituel). Option `hevcDirect` (vrai par défaut).
- L'écran de chargement n'attend plus 3 s avant d'apparaître (`firstWaitMs` = 0 par défaut).
- La fiche vidéo n'est plus servie depuis un cache périmé après un changement d'état (film prêt) ; réponses JSON avec `Cache-Control: no-store` (DeoVR gardait la bibliothèque en mémoire).
- Pastilles : seulement les seeders (`[S12]`), plus la qualité (déjà dans le titre).
- Nouvel `id` de fiche : DeoVR mémorise les réglages d'une vidéo (dont le mode d'affichage) par son `id` ; ceux d'anciens essais ratés sont ainsi oubliés.
- Journaux et bilans : détection d'un lecteur qui redémarre le flux (`ouvertures_du_flux_a_s`).

### Ajouté
- **Banc de test casque** (onglet *Test pont* : Labo 1 à 6, générés au démarrage par ffmpeg, aucune dépendance) : H.264/HEVC × HLS TS/fMP4 × MP4 direct, bascule chargement → film HEVC, déclaration par `path` ; verdict automatique dans `/debug/labo` et dans le rapport d'assistance.
- Fiche « Mode d'emploi » dans l'onglet *Test pont* : où trouver le menu latéral et la recherche (`/ui`, `/s/mot`), absents de la liste native de DeoVR.
- **Exe portable** `DeoVR-Stremio-Bridge.exe` (Node.js embarqué, *Single Executable Application*) dans un zip avec ffmpeg, aucune installation. Fabriqué et testé par la CI Windows ; publié avec chaque release et dans la pré-release `dev-build`.
- **Tout au même endroit** : `config.json` (réglages) à côté de l'exe, créé au premier lancement ; clé, journaux, état et fichiers temporaires dans `data\` (`%APPDATA%` seulement si ce dossier est en lecture seule ; `--data-dir` / `BRIDGE_DATA_DIR` pour choisir).
- **Compte Stremio sécurisé** : page de connexion locale `/setup` (loopback uniquement, anti-CSRF et anti-*DNS rebinding*, jeton, limitation d'essais). Le mot de passe n'est plus enregistré : une clé de session est stockée chiffrée avec Windows DPAPI (`secrets.dat`). Migration automatique des anciens `email`/`password` de `config.json`. `--login`, `--logout`.
- **Mode développeur** `--dev` (journaux détaillés, sortie d'ffmpeg, page `/dev`), `--report` (rapport d'assistance), `--diagnose`, `--version`, `--help`, `--port`, `--no-browser`. Lanceurs `LANCER-MODE-DEV.bat`, `RAPPORT-SUPPORT.bat`, `DIAGNOSTIC.bat`.
- `/debug` indique version, état du compte (sans secret) et chemins ; le rapport d'assistance mentionne mode de stockage et compte.
- CI : fabrication de l'exe, décompression dans un dossier neuf et **test de fumée de l'exécutable réel** (`scripts/smoke-exe.js`) ; la pré-release `dev-build` et les releases contiennent exe portable et zip Node.js.
- Tests : `account`, `bundle`, `paths`, `secrets`, `cli`.

### Changé
- **Port par défaut 4477** au lieu de 8080 (très utilisé par d'autres logiciels). Réglable dans `config.json`, par `--port N` ou la variable `PORT`.
- **Zips minimaux** : *release* = exe + `resources\` (ffmpeg, vidéos de test) + `docs\GUIDE-RAPIDE.txt` + licences ; *debug* = release + `utility\` (outils `.bat` décrits dans `LISEZMOI-UTILITAIRES.txt`, dont `EDITER-REGLAGES.bat`) + `docs\DEBUG.txt`. Plus de README/CHANGELOG/docs du dépôt dans l'archive. Les releases ne publient plus le zip « version Node » (toujours fabriqué par `npm run build`).
- `"dev": true` dans `config.json` active le mode développeur sans option de ligne de commande.
- Console plus claire : une seule bannière, alerte « Stremio n'est pas lancé » émise une fois, catalogues d'addons trop lents regroupés en une alerte (et relancés en arrière-plan avec plus de patience), ligne d'état de l'analyse des films en clair (« 72 classés [14 très bons, 35 corrects…] »).
- `config.example.json` ne contient plus d'e-mail ni de mot de passe.
- Fichiers temporaires (vignettes, segments HLS) dans `data\tmp` au lieu de `%TEMP%`.
- `INSTALL.bat` (variante Node) n'interroge plus l'e-mail/mot de passe ; `bridge/setup.js` supprimé.
- Numéro de version dans `bridge/version.js` (source unique, contrôlée par `npm run check`).
- README, SECURITY et docs réécrits pour l'exe portable.

### Sécurité
- Le mot de passe Stremio ne touche plus le disque. Voir [SECURITY.md](SECURITY.md).

## [10.2.0] — 2026-10-01

### Ajouté
- Builds de test automatiques à chaque modification de `main` (pré-release GitHub `dev-build`) et archive téléchargeable à chaque exécution de la CI ; `scripts/bump.js` pour changer de version sans oublier un fichier.
- Dépôt public : tests unitaires et d'intégration (`node:test`), CI GitHub Actions (Windows, Node 24 ; un job parallèle contrôle le zip de release), fabrication de la release, documentation complète.
- Reprise automatique de ffmpeg après plantage (jusqu'à 3 fois), à la bonne position, avec discontinuité HLS signalée.
- Élagage des segments déjà vus quand le disque est presque plein (`minFreeGB`, `trimKeepSec`).
- Budget du cache Stremio : pas plus de films actifs que le cache ne peut en contenir.
- Détection de Stremio arrêté (message dans l'écran de chargement et l'onglet *En cours*).
- `start.bat` relance le pont s'il s'arrête ; `DEMARRAGE-AUTO.bat` / `DEMARRAGE-AUTO-RETIRER.bat`.
- Options `bindHost`, `BRIDGE_DATA_DIR`, `stremioPingMs`, `diskCheckMs`, `ffmpegRestarts`.
- Reconnaissance de `LR`, `TB` et `OU` dans les titres manifestement VR (ex. « 360 TB » → sphère dessus-dessous).

## [10.1.0] — 2026-10-01

### Ajouté
- Tests 5 et 6 (« Test pont ») : bascule écran de chargement → vidéo sans torrent.
- Vignettes 16:9 composées (`landscapeThumbs`).
- Attente honnête pour les torrents lents (`patientMaxMin`) et contrôle du cache Stremio.

### Corrigé
- Le texte de l'écran de chargement contenant `%` (« Mise en tampon : N % ») n'était pas dessiné (ffmpeg `drawtext`).

## [10.0.0] — 2026-10-01

### Changé
- Le téléchargement ne démarre qu'au clic ; plus de test de torrent en arrière-plan.
- Registre « En cours » (états, 30 min de maintien, plusieurs films, reprise, persistance).
- Écran de chargement HLS à chaque clic (étape, pairs, débit, tampon, ETA).
- Films dont le catalogue/genre/titre dit VR toujours déclarés VR.
- Pastilles stables (identiques liste/fiche) basées sur le scrape des trackers.
- Un onglet par catalogue Stremio, recherche `/s/mot`, « Plus de seeds », interface web `/ui`, page de test des deeplinks `/t`.
- Journaux complets par clic et bilan par film.
