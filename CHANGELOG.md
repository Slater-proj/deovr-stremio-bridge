# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Les versions 1 à 9 étaient des itérations internes ; elles sont résumées dans la 10.0.

## [Non publié]

### Ajouté
- **Onglet « Prêts (complets) »** juste après « En cours » : les films entièrement dans le cache, lisibles aussitôt (lecture directe, sauts instantanés).
- **Priorité au film regardé** : quand le lecteur lit un film, les téléchargements en file qui ne sont pas regardés sont mis en attente (toute la bande passante au film regardé) et repartent d'eux-mêmes ensuite.
- **Plage horaire de la file** (`queueHours`, ex. `"01:00-08:00"`, minuit franchi accepté, aussi dans `/settings`) : la file de téléchargement ne tourne que la nuit ; un film regardé n'est pas concerné.
- **File de téléchargement** (`/queue`, bouton ⬇ sur les cartes de `/ui`, ajout par identifiant, outil « Télécharger en entier les films en cours » dans DeoVR) : un film mis en file est téléchargé **en entier par Stremio sans lecteur**, dans la limite de `maxDownloads`, derrière les films regardés. Il continue sans limite de temps, **reprend tout seul après un redémarrage du pont** et laisse sa place aux films que l'on regarde. Une fois complet, la fiche propose la **lecture directe** (ni écran de chargement ni « relancez le film », sauts instantanés). Enchaînement visé : aperçu (mode échantillon) -> décision -> téléchargement complet (la nuit) -> lecture sans accroc. Fonctionne aussi pour un film déjà entièrement reçu.
- **Page `/settings`** : tous les réglages courants dans un formulaire (interrupteurs, listes, validation), sans éditer `config.json` à la main. Réservée au PC lui-même (adresse loopback, `Host` localhost, `Origin`, jeton par lancement, limitation d'essais). Seules les valeurs changées sont écrites (`config.json` écrit de façon atomique, jamais écrasé s'il est illisible) ; la plupart des réglages jouent tout de suite, les autres (port, `bindHost`, dossiers) au redémarrage — la page le dit. Un envoi partiel ne décoche rien.
- **Page `/check`** (et `/check.json`) : voyants de bon fonctionnement — Stremio, compte, addons et catalogues, ffmpeg, place disque, fichiers du pont, cache de Stremio, trackers UDP, qui peut joindre le pont, DeoVR a-t-il contacté le pont, relances de DeoVR.
- **Onglet « Outils » dans DeoVR** (`toolsTab`) : état du pont, rapport d'assistance, mise en pause de tous les téléchargements, nettoyage des fichiers temporaires, mode échantillon on/off — depuis la VR, sans clavier. L'action n'est exécutée que quand le lecteur vidéo de DeoVR sur ce PC ouvre l'outil (DeoVR lit les fiches de toute une liste : la fiche ne fait rien) et le résultat s'affiche dans un petit clip.
- **Lecture d'avance** (`readAheadMB` = 300) : en lecture directe, le pont télécharge en plus jusqu'à 300 Mo devant la position du lecteur (octets jetés, ils restent dans le cache de Stremio) ; repart après un saut, s'arrête quand le lecteur se tait.
- **Vignettes avec badges** (`thumbBadges`) : résolution, VR180/VR360/3D et seeders dessinés sur l'image ; barre d'avancement dans « En cours ». L'affiche d'origine n'est téléchargée qu'une fois ; vignettes de plus de 14 jours supprimées au démarrage.
- **Tests de rejeu et d'endurance** (`tests/integration/replay.test.js`) : la séquence du 03/10 (lecture, saut sans réponse, relance de DeoVR) avec les vrais agents utilisateurs, puis 300 cycles d'affichages sans erreur 5xx ni fuite de mémoire (`/debug/perf` → `memoire`).
### Changé
- **`lib.js` allégé** (sans changement de comportement) : fonctions pures dans `format.js`, DNS de secours dans `dns.js`, scrape des trackers dans `scrape.js` ; `pages.js`, `tools.js` et `configfile.js` sont neufs.
### Corrigé
- Mode échantillon : la lecture des extraits pouvait démarrer avant la création de la session de chargement (la fiche proposait alors un flux HLS au lieu du fichier direct).

## [10.3.0] — 2026-10-04
### Changé (préparation de la version grand public)
- **`formatMenu` vaut `"free"` par défaut** : le menu FLAT / 180° / 360° / fisheye / SBS de DeoVR est toujours disponible pour chaque vidéo (films et onglet Local), même quand le titre ou le nom du fichier indique le format ; le choix est retenu par vidéo. Contrepartie mesurée : l'image arrive brute (côte à côte) jusqu'au choix. `"auto"` (image juste d'emblée, sans menu quand le format est lu) et `"declare"` restent disponibles.
- **`bindHost` vaut `"127.0.0.1"` par défaut** (avant : `"0.0.0.0"`) : le pont, sans authentification, n'est plus visible du réseau local sauf choix explicite (casque autonome : `"0.0.0.0"`). Un `config.json` existant garde sa valeur.
- **Onglet « Test pont » (Labos 1 à 16) seulement en mode développeur** (`--dev`, zip debug) ; `"testScene": true` le remet.

### Corrigé (6e test, nuit du 03 au 04/10 : analyse des journaux)
Constats : (1) chaque relance de DeoVR suit de 3 à 4 s la fermeture, par le lecteur vidéo, d'une requête `Range` de saut restée sans réponse utile pendant ~7 s (7 cas sur 7 ; les sauts dans une zone déjà reçue, et les vidéos locales, ne relancent rien) ; (2) les liens `deovr://` (page `/t`, bouton de `/ui`) lancent une NOUVELLE instance de DeoVR en mode bureau : jusqu'à 10 relances en 5 s en cliquant, et le menu VR ne revient pas ; (3) une vidéo locale sans indice VR dans son nom était déclarée « plate », donc sans menu de format.
- **Garde de saut** (`seekGuardSec` = 5, `seekGuardMB` = 20, `seekPrefetchMB` = 300) : un saut en cours de lecture dont Stremio n'envoie rien en 5 s reçoit tout de suite un **503** (au lieu de geler le lecteur jusqu'à sa renonciation à ~7 s, suivie de la relance de DeoVR) et la zone demandée est préchargée ; l'essai suivant trouve les données. Jamais appliqué à l'ouverture du fichier. `seekGuardSec: 0` le désactive. **À confirmer au casque** : on ignore comment DeoVR réagit à ce 503.
- **Vidéos locales** : même règle que `formatMenu` pour les films : format déclaré seulement s'il est lu dans le nom (ou imposé par `localDefaultFormat`) ; sinon le menu FLAT / 180 / 360 / fisheye de DeoVR est disponible (il retient le choix par vidéo).
- **Page `/ui`** : le gros bouton « Retour à la bibliothèque » (lien `deovr://`) est retiré, remplacé par un avertissement ; le lien G de `/t` est marqué « à ne pas utiliser dans le casque ».
- Message de relance plus juste (« relancé juste après une lecture » ou « (re)démarré, ou lien deovr:// ouvert »).
### Ajouté
- **`bridge-events.log`** (une ligne JSON par fait) : `demarrage-pont` (version, réglages clés, mémoire), `lecteur` (chaque requête du lecteur vidéo sur un film : plage demandée, durée, octets, fermée par le lecteur ou non), `saut` (pourcentage, zone reçue ou non, délai du 1er octet), `saut-refuse`, `relance-deovr` (dernière requête du lecteur + mémoire libre, mémoire du pont, disque, films actifs, version de DeoVR), `disque-critique`. Inclus en tête du rapport d'assistance.

### Ajouté (après le 5e test du 03/10)
- **Mode échantillon** (`sampleMode`, éteint par défaut ; `sampleCount` = 3 extraits, `sampleMinutes` = 2 min, `samplePadSec` = 15 s de marge) : au lieu de tout télécharger (4 h pour un film 8K à 1 Mo/s), le pont ne demande à Stremio que des tranches du fichier : début, milieu, fin (ou N extraits répartis), positions estimées d'après la durée et la taille. Le film est toujours lu en direct (écran de chargement puis « relancez le film »), les extraits sont instantanés ; sortir d'un extrait bloque la lecture (zone non téléchargée). État : `[ÉCHANTILLONS 2/3 · PRÊT, relancez]`, puis `[ÉCHANTILLONS PRÊTS · 3 × 2 min]`.
- **Dossier `videos` à côté de l'exe** (`localFolder`, vrai par défaut) : copiez-y des films téléchargés ailleurs, ils apparaissent dans l'onglet **Local** de DeoVR (avant : « Mes vidéos », seulement avec `localDirs`). `localDefaultFormat` (`flat` / `vr180` / `vr360`) pour les fichiers dont le nom n'indique pas le format. Les MKV HEVC locaux sont lus directement (convertis en HLS TS ils redémarraient à 15 s).
- **Zones reçues** par film (`disponible` dans `/status.json` et `/debug/downloads`, ex. `0-15 %, 50-52 %`) : ce qui se lit sans attente. DeoVR n'a aucun moyen d'afficher une zone « téléchargée » sur sa barre de lecture.
- **Diagnostic des sauts et des relances de DeoVR** : le journal note chaque saut du lecteur (« SAUT : va à 37 % (zone NON reçue) — premières données après 6,7 s ») et, quand DeoVR se relance (2 demandes `/deovr` en moins de 3 s), la dernière requête du lecteur vidéo (`/debug/perf` → `relancesDeoVR`).
- Page `/ui` : gros bouton « Retour à la bibliothèque DeoVR » (lien `deovr://…/deovr`), à confirmer au casque avec le lien G de la page `/t`.
### Corrigé
- Une sonde HEAD sur `/torrent/…` (DeoVR en envoie une avant chaque lecture) ne compte plus comme un clic et reçoit sa réponse sans rien demander à Stremio (taille connue).
- **Bibliothèque `/deovr` mise en cache 8 s** côté pont (DeoVR la redemande deux fois en 1 s à chaque relance), vidée dès qu'un film change d'état ou à la connexion ; compteurs dans `/debug/perf` → `bibliotheque`.

### Corrigé (5e test du 03/10 : disque C: plein, DeoVR relancé 5 fois en 10 min)
Constat (journaux) : le pont tournait sur un disque à 6,6 Go libres ; un film 8K déjà en cache a fait écrire à ffmpeg ~1 Go en quelques secondes, le disque est tombé à 2,5 Go, alors que le disque du cache Stremio n'était pas plein.
- **Disque** : les clics sont toujours acceptés ; le seuil critique passe de 3 Go à **1 Go** (`minFreeCriticalGB`) : à ce dernier moment, téléchargements arrêtés, segments temporaires supprimés, nouveaux clics refusés. Contrôle toutes les 5 s (`diskCheckMs`) et au plus 1 s pendant que ffmpeg écrit.
- **Moins de fichiers temporaires** : avance de ffmpeg plafonnée à 1 Go par film (`maxAheadMB`, avant 4 Go) et plancher d'avance réduit (30 s au lieu de 60 s au-delà du tampon).
- **Restes d'un arrêt brutal** : `live/` et `hls/` sont vidés au démarrage du pont (avant : seulement après 6 h). Ce nettoyage ne se fait plus au chargement du module (`--report` ne touche à rien).
### Ajouté
- **Avancement dans la VR** : `[EN COURS 18 % · 3,1/17,0 Go · 1,4 Mo/s · reste ~2,8 h]` (onglet *En cours* et titre de la fiche).
- **Place prise par le pont** : `/debug/perf` → `disque.pont` (par dossier), donc dans le rapport d'assistance ; ligne « Disque : N Go libres (fichiers du pont : M Go) » en bas de *En cours* sous `minFreeGB`.

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
