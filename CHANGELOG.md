# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Les versions 1 à 9 étaient des itérations internes ; elles sont résumées dans la 10.0.

## [Non publié]

### Ajouté (après le 4e test du 02/10)
- **Démarrage rapide** (`startMode`, `"rapide"` par défaut) : le film démarre dès `minBufferSec` (20 s) de film en tampon, même quand le débit est trop faible (l'écran prévient que des pauses suivront). Avant, un film 8K à 1,5 Mo/s pour 14,8 Mo/s nécessaires attendait 29 min de tampon. `"sans-coupure"` garde l'ancien comportement.
- **Banc de test, Labos 13 à 16**, pour décider de la bascule HEVC automatique (sans « Retour puis relancer ») et du zapping : 13 = chargement HEVC fMP4 → vrai format de film (HEVC Main 10 8192×4096, MKV copié en fMP4) ; 14 = chargement H.264 **fMP4** → film HEVC fMP4 (le Labo 5 en TS se figeait) ; 15 = chargement HEVC → film H.264 (mauvaise devinette du codec) ; 16 = saut dans une vidéo de 90 s dont les segments arrivent « à la demande » (journal des sauts dans `/debug/labo`). Les scènes lourdes (13, 16) sont fabriquées en dernier ; `/debug/labo` indique si chaque scène est prête.
- **Profil torrent de Stremio** : les réglages `bt…` de `/settings` (s'ils existent) sont recopiés dans `/debug/perf` et le rapport ; un plafond de débit bas est signalé.
- Tests : `BRIDGE_LAB_PREPARE=0` (variable d'environnement) évite d'encoder le banc de test dans chaque pont lancé par les tests.

### Corrigé (4e test au casque du 02/10)
Mesures : Labo 12 (chargement HEVC fMP4 → film HEVC fMP4) **passe** ; Labo 10 (`stereoMode` + `is3d` seuls) : image juste, pas de sélecteur de mode ; Labo 11 (`screenType` seul) : sélecteur présent, image doublée jusqu'au choix « SBS » ; Labo 6 (repli « fiche demandée comme flux ») **passe** ; Labos 2 et 5 échouent toujours.
- **Films « morts au clic »** : un film annoncé avec des seeders par les trackers mais qui ne reçoit ni métadonnée ni octet en 90 s affichait « RECHERCHE · 2 pairs » sans fin et restait en tête de *Plus de seeds*. Il passe à « BLOQUÉ · aucune donnée », puis « ÉCHEC · aucune donnée » une fois arrêté, est classé en fin de liste et retiré de *Plus de seeds* pendant 2 h.
- **Catalogues d'addon lents** : la relance en arrière-plan « avec plus de patience » ne réessayait jamais (elle réutilisait l'échec mémorisé et la quarantaine de l'hôte : « toujours en échec » dans les journaux). Elle refait maintenant une vraie requête.
- **`--report` / `--diagnose`** pendant que le pont tourne : ils renommaient `bridge-debug.log` (> 5 Mo) et `bridge-requests.log` (> 2 Mo) du pont, et le rapport sortait sans journal détaillé ; ils écrivaient aussi un faux « arrêt du processus » dans son journal. La rotation se fait désormais au démarrage du pont seulement.
- **Labo 12** : il affichait le texte du Labo 5 (« LABO 5 — CHARGEMENT (H.264) »).
- **Sécurité** : les réponses JSON (`/deovr`, `/debug`, `/status.json`…) n'ont plus l'en-tête `Access-Control-Allow-Origin: *` : une page web ouverte sur le PC ne peut plus lire les titres, chemins et journaux du pont. Une requête dont l'en-tête `Host` est un nom de domaine extérieur est refusée (anti *DNS rebinding*) ; `localhost`, les adresses IP et les noms du réseau local restent acceptés.
- **Rapport d'assistance** : l'hôte **et le chemin** des URL distantes sont masqués (un chemin d'URL d'addon peut contenir une clé), ainsi que le nom du compte Windows dans les chemins.
- **DNS** : un addon hébergé chez soi (nom qui pointe vers 192.168.x) échouait quand le DNS public ne le connaissait pas ; la réponse du DNS du PC est gardée (30 min).
- **`secrets.dat` illisible** (dossier copié d'un autre PC / autre compte Windows) : compté comme « non connecté », la page `/setup` s'ouvre au démarrage ; PowerShell/DPAPI n'est plus relancé à chaque requête.
- **Longues sessions** : les données périmées (réponses d'addons, mesures, DNS) sont oubliées toutes les 10 min ; `bridge-decisions.log` et `bridge-bilans.log` tournent aussi, et les journaux tournent pendant la session au-delà d'une taille limite.
- `config.example.json` : `itemsPerTab` = 150 comme le pont.
- Docs : `CONFIGURATION.md` (plus d'« identifiants dans config.json », valeurs par défaut lisibles, variables d'environnement complètes), README (contenu de la pré-release `dev-build`), INSTALL (variante Node), HTTP-ENDPOINTS, SECURITY, TROUBLESHOOTING, USAGE (pastilles), DEOVR-NOTES (mesures des Labos), modèles de ticket.

### Corrigé (3e test au casque du 02/10 : résultats des Labos)
Mesures : Labo 3 (HEVC en HLS fMP4) **passe** ; Labo 9 (HEVC en MKV direct) **passe** ; Labo 4 passe ; Labos 2 (HEVC en HLS TS) et 5 (bascule H.264 TS → HEVC fMP4) échouent ; Labo 8 : le nom `_180_LR` n'est pas reconnu ; les fiches qui **déclarent** le format (Labos 1, 3, 4, 5, 9) n'ont **pas** le sélecteur FLAT/180/360/fisheye, celles qui ne le déclarent pas (Labos 7, 8) l'ont.
- **Sélecteur de mode de DeoVR** : nouveau réglage `formatMenu` (`auto` par défaut) : le format n'est déclaré dans la fiche que s'il est lu dans le titre/flux ; sinon la fiche ne déclare rien → le menu de DeoVR est présent (image côte à côte brute, DeoVR retient votre choix par film). `declare` = toujours déclaré (image juste d'emblée, pas de menu), `free` = jamais déclaré. Les journaux de décisions indiquent « déclaré » ou « NON déclaré ».
- **Texte de l'écran de chargement deux fois plus petit en VR** (lignes de 34 caractères, ≈ 15 % de la largeur d'un œil) et réglable : `loaderTextScale` (0.7 plus petit, 1.3 plus grand). Même taille pour les Labos.
- **Repli « fiche demandée comme flux »** : la redirection 302 échouait (le lecteur résout les segments relatifs par rapport à l'adresse de la fiche → 404 en boucle). La playlist est maintenant servie directement à l'adresse de la fiche, avec des adresses de segments absolues ; un fichier direct reste redirigé.
- **Disque presque plein** (le disque a atteint 0 Go libre : Stremio ne répondait plus, DeoVR a planté) : surveillance toutes les 20 s du disque du cache Stremio et du dossier temporaire ; sous `minFreeCriticalGB` (3 Go) les téléchargements sont arrêtés, les nouveaux films refusés avec le message « DISQUE PLEIN » sur l'écran de chargement et en tête de « En cours ». Avant, la protection ne jouait que pendant la lecture d'un film.
- **Films HEVC en MKV** : lecture directe du MKV après « relancez » (Labo 9 : passe). Avant, ils partaient dans un flux HLS TS HEVC, qui échoue. Le codec audio est relevé : DTS/TrueHD/Opus/Vorbis → avertissement (peut être muet en lecture directe).
- **Banc de test** : Labo 7 pointait vers un fichier inexistant (corrigé) ; plusieurs demandes en rafale (< 2 s) sur un même fichier = une seule ouverture (le Labo 9 était un faux « ÉCHEC ») ; Labos 10 et 11 (déclaration partielle du format) et 12 (bascule HEVC fMP4 → HEVC fMP4).

### Corrigé (2e test au casque du 02/10)
- **Écran de chargement et Labos lisibles en VR** : le texte tenait sur tout le dôme 180° (lignes de 64 caractères) donc « étiré » et trop grand. Désormais lignes de 30 caractères maximum, bloc centré (≈ 35 % de la largeur d'un œil), barre plus courte ; les écrans plats gardent la mise en page large.
- **Faux avertissement « le lecteur recommence le flux »** : la première demande du segment 0 du film est la bascule normale (elle comptait comme un redémarrage). Seules les demandes suivantes comptent ; le bilan n'écrit plus « MAIS redémarré » à tort.
- **Débit nécessaire inconnu (MKV sans débit annoncé)** : la durée est lue séparément et le débit calculé par taille / durée. Avant, le tampon restait à 20 s pour un film 8K à 0,6 Mo/s (Naruto) ; il tient maintenant compte du débit réel.
- **Banc de test** : `init.mp4` / `b_init.mp4` introuvables sous Windows (Labos 3 et 5 invalides) → ffmpeg tourne dans le dossier de sortie avec des noms relatifs et les fichiers sont vérifiés ; verdict : un redémarrage = flux redemandé en moins de 30 s (un nouvel essai minutes plus tard n'est plus un « ÉCHEC » : Labo 1 était un faux négatif) ; texte plus court et plus petit ; compteur lisible.
- **Repli « fiche demandée comme flux »** : DeoVR a donné une fois l'adresse de la fiche d'un film au lecteur vidéo (« format non pris en charge »). Si c'est NSPlayer qui réclame une fiche, le pont le redirige (302) vers le vrai flux. Non vérifié au casque : le Labo 6 sert à le confirmer.
- **« En cours » : emplacements fixes** (`coursSlots`, 6 par défaut) : DeoVR ne redemande la bibliothèque qu'en entrant sur le site, mais il relit la fiche de chaque film à chaque affichage de la liste. Chaque emplacement pointe vers `/video/slot/<n>.json`, résolu au moment de la lecture, et l'état (`[EN COURS 40 %]`, `[PRÊT]`…) est dans le titre de la fiche. À confirmer au casque : que DeoVR remplace bien le titre de la liste par celui de la fiche.

### Corrigé (test au casque du 02/10)
- **Écran de chargement toujours en H.264** (avant : HEVC pour les films 6K+). Les journaux montrent que le lecteur de DeoVR relance le flux depuis le début **exactement 15 s** après son démarrage quand il est en HEVC, alors qu'un écran de chargement en H.264 tourne sans problème. Même cause pour les films HEVC 8K envoyés en HLS (dont le film « prêt » qui chargeait à l'infini).
- **Films non H.264 (HEVC…)** : l'écran de chargement s'affiche tout de suite, pendant la mise en tampon ; quand le film est prêt il indique « PRÊT, appuyez sur RETOUR puis relancez le film » (le HEVC n'est plus jamais mis dans le flux HLS) ; au clic suivant la fiche propose le fichier direct (lecture immédiate, mode VR habituel). Option `hevcDirect` (vrai par défaut).
- L'écran de chargement n'attend plus 3 s avant d'apparaître (`firstWaitMs` = 0 par défaut).
- La fiche vidéo n'est plus servie depuis un cache périmé après un changement d'état (film prêt) ; réponses JSON avec `Cache-Control: no-store` (DeoVR gardait la bibliothèque en mémoire).
- Pastilles : seulement les seeders (`[S12]`), plus la qualité (déjà dans le titre).
- Nouvel `id` de fiche : DeoVR mémorise les réglages d'une vidéo (dont le mode d'affichage) par son `id` ; ceux d'anciens essais ratés sont ainsi oubliés.
- Journaux et bilans : détection d'un lecteur qui redémarre le flux (`ouvertures_du_flux_a_s`).

### Ajouté
- **Banc de test casque** (onglet *Test pont* : Labo 1 à 9, générés au démarrage par ffmpeg, aucune dépendance) : H.264/HEVC × HLS TS/fMP4 × MP4 × MKV direct, bascule chargement → film HEVC, repli « fiche demandée comme flux », fiche sans format déclaré et format dans le nom du fichier (pourquoi le sélecteur FLAT/180/360 manque-t-il ?) ; verdict automatique dans `/debug/labo` et dans le rapport d'assistance.
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
