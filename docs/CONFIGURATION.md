<!-- Fichier généré par scripts/gen-config-doc.js : ne pas modifier à la main (modifier les commentaires de bridge/lib.js puis `npm run docs`). -->
# Configuration (`config.json`)

`config.json` est créé au premier lancement (à côté de l'exe ; dans le dossier du code pour la variante Node) avec les réglages courants. Ajoutez-y seulement les clés que vous voulez changer, puis relancez le pont.
Les valeurs par défaut conviennent à la plupart des installations. `config.json` ne contient **aucun identifiant** : la connexion Stremio passe par la page `/setup` (voir [SECURITY.md](../SECURITY.md)).

Certaines clés peuvent aussi venir de variables d'environnement : `PORT`, `BIND_HOST`, `STREMIO_AUTHKEY`, `LOCAL_STREMIO`, `LOCAL_STREMIO_PUBLIC`, `ADDON_URLS`, `SCRAPE_TRACKERS`, `DNS_MODE`, `DEOVR_PLATFORM`, `FFMPEG`, `LOCAL_DIRS`, `TORRENT_START_MS`, `STREMIO_API`, `DEBUG`, `BRIDGE_DEV`, `BRIDGE_TMP` (fichiers temporaires), `BRIDGE_DATA_DIR` (dossier des journaux/état/config), `BRIDGE_CONFIG` (fichier de réglages). Anciennes : `STREMIO_EMAIL`, `STREMIO_PASSWORD`.

| Clé | Valeur par défaut | Rôle |
|---|---|---|
| `port` | `4477` | port du pont, 4477 par défaut (peu courant : 8080 est pris par beaucoup de logiciels) ; --port N ou la variable PORT l'emportent |
| `bindHost` | `"0.0.0.0"` | '127.0.0.1' (défaut) = accessible uniquement depuis ce PC (PCVR) ; '0.0.0.0' = aussi depuis le réseau local (casque autonome) : le pont n'a aucune authentification |
| `email` | `""` | ANCIEN réglage, inutile : la connexion se fait par la page /setup ; migré puis effacé s'il est présent avec password |
| `password` | `""` | ANCIEN réglage (voir email) : jamais réécrit par le pont |
| `authKey` | `""` | alternative à email/mot de passe : clé d'authentification Stremio |
| `addonUrls` | `(env.ADDON_URLS ? env.ADDON_URLS.split(',') : [])` | optionnel : manifests en dur (tests) |
| `localStremio` | `"http://127.0.0.1:11470"` | adresse du serveur de streaming de Stremio (lancé avec l'application Stremio) |
| `localStremioPublic` | `"" (automatique)` | URL vue par DeoVR ('' = auto) |
| `catalogInclude` | `''` | ne garder que les catalogues dont le nom contient ce texte |
| `catalogExclude` | `''` | masquer les catalogues dont le nom contient ce texte |
| `genreTabs` | `false` | un onglet par genre pour les catalogues qui en proposent |
| `maxGenresPerCatalog` | `6` | plafond d'onglets par catalogue à genres |
| `maxTabs` | `20` | nombre maximum d'onglets dans DeoVR |
| `itemsPerTab` | `150` | films par onglet |
| `pagesPerTab` | `2` | pages Stremio (skip) chargées par onglet |
| `streamsTimeoutMs` | `12000` | attente max des addons de flux avant de répondre à DeoVR |
| `types` | `['movie']` | types Stremio affichés |
| `vrOnly` | `true` | n'afficher que les films VR/3D (titre, catalogue ou genre marqués) : mettre false pour tout voir |
| `cacheMinutes` | `10` | durée de mémorisation des catalogues (minutes) |
| `catalogTimeoutMs` | `8000` | un addon lent ne doit pas bloquer tout /deovr |
| `authorized` | `'0'` | valeur du champ "authorized" (doc DeoVR : "0") |
| `forceProxy` | `false` | faire passer TOUS les flux par le proxy du bridge |
| `healthCheckMs` | `10000` | test de santé des torrents avant de les proposer (0 = désactivé) |
| `torrentStartMs` | `120000` | au-delà, le relais répond 504 au lieu de laisser DeoVR charger à l'infini |
| `platform` | `"windows"` | 'windows' (DeoVR PC : MP4/MOV/AVI, pas MKV/AV1/VP9) ou 'quest' (MKV/WebM/AV1 ok) |
| `ffmpeg` | `ffmpeg fourni avec l'exe, sinon celui du PATH` | pour convertir MKV -> HLS à la volée (DeoVR Windows ne lit pas MKV) |
| `remux` | `true` | autorise la conversion avec ffmpeg (MKV, écran de chargement, vignettes) ; false = lecture directe uniquement |
| `localDirs` | `(env.LOCAL_DIRS ? env.LOCAL_DIRS.split(';').filter(Boolean) : [])` | dossiers de vidéos supplémentaires sur ce PC (onglet « Local ») |
| `localFolder` | `true` | true = le dossier « videos » du pont (à côté de l'exe) est lu aussi : copiez-y des vidéos téléchargées ailleurs, elles apparaissent dans l'onglet « Local » |
| `videosDir` | `—` | emplacement du dossier « videos » (par défaut : à côté de l'exe) |
| `localDefaultFormat` | `['flat', 'vr180', 'vr360'].includes(file.localDefaultFormat) ? file.localDefaultFormat : 'flat'` | vidéo locale sans indice VR dans son nom (_180_LR, _360, _TB…) : "flat" = écran plat ; "vr180" = VR180 côte à côte ; "vr360" = sphère 360° mono |
| `sampleMode` | `false` | MODE ÉCHANTILLON : au lieu de tout télécharger, ne récupérer que des extraits (début, milieu, fin…) pour avoir un aperçu rapide du film ; le film est lu en direct (les zones non téléchargées bloquent la lecture) |
| `sampleCount` | `3))` | nombre d'extraits répartis du début à la fin du film (3 = début, milieu, fin) |
| `sampleMinutes` | `+file.sampleMinutes > 0 ? +file.sampleMinutes : 2` | durée de chaque extrait, en minutes |
| `seekGuardSec` | `5` | saut du lecteur dans une zone pas encore reçue : si Stremio n'envoie rien en N s, réponse immédiate 503 (le lecteur de DeoVR abandonne de toute façon vers 7 s et DeoVR se relance) et la zone est préchargée ; 0 = désactivé (le lecteur gèle jusqu'à 2 min) |
| `seekGuardMB` | `20` | le garde ne joue qu'après ce volume déjà lu en direct par le lecteur (jamais pendant l'ouverture du fichier) et pour un saut au-delà du quart de ce volume |
| `seekPrefetchMB` | `300` | après un saut refusé : Mo préchargés à partir de la position demandée (le prochain essai du lecteur trouve les données) |
| `samplePadSec` | `15` | marge ajoutée de chaque côté d'un extrait (le débit d'un film varie : sans marge, le bord de l'extrait manquerait) |
| `showHealth` | `true` | pastille de santé dans le titre |
| `scanAll` | `false` | analyser aussi les films sans marqueur VR/3D dans le titre |
| `scanConcurrency` | `6` | films classés en parallèle (phase rapide : addons + trackers, sans démarrer de torrent) |
| `hostConcurrency` | `4` | requêtes simultanées max vers un même addon |
| `jsonConcurrency` | `6` | fiches vidéo calculées en parallèle (DeoVR les demande toutes d'un coup) |
| `scrapeTrackers` | `(env.SCRAPE_TRACKERS ? env.SCRAPE_TRACKERS.split(',') : […])` | trackers UDP interrogés (nombre de seeders sans démarrer de torrent) |
| `sortByHealth` | `true` | films sains (vert/orange) en premier dans les listes |
| `uiPageSize` | `48` | cartes par page sur /ui |
| `scrapeMinSeeders` | `1` | seeders minimum annoncés par les trackers pour ne pas classer un film « noir » |
| `scanMax` | `100` | films analysés (addons + trackers UDP, sans torrent) par affichage de liste |
| `scanMs` | `25000` | diagnostic seulement (diagnose.bat / ?measure=1) |
| `testScene` | `!!(env.BRIDGE_DEV \|\| file.dev)` | onglet « Test pont » (vidéos de test et banc de test casque, Labos 1 à 16) : affiché par défaut seulement en mode développeur (--dev) |
| `extraTrackers` | `[]` | trackers ajoutés à TOUS les torrents (en plus de ceux de l'addon et des trackers publics) |
| `holdMinutes` | `30` | un film lancé reste actif (téléchargement continu) ce temps après la dernière activité du lecteur |
| `formatMenu` | `"auto"` | PAR DÉFAUT "free" (menu FLAT / 180 / 360 / fisheye / SBS toujours disponible, choix retenu par vidéo). Mesuré au casque : dès que la fiche déclare screenType/stereoMode, DeoVR cache son sélecteur de mode (FLAT/180/360/fisheye). "declare" = toujours déclarer (image juste d'emblée, pas de menu) ; "free" = ne jamais déclarer (menu présent, image côte à côte brute jusqu'à votre choix, DeoVR le retient par film) ; "auto" = déclarer seulement si le titre/flux dit le format |
| `loaderTextScale` | `1` | taille du texte de l'écran de chargement en VR (1 = défaut ; 0.7 plus petit, 1.3 plus grand) |
| `minFreeCriticalGB` | `1` | disque : les clics sont toujours acceptés ; sous ce seuil (dernier moment) les téléchargements sont arrêtés, les fichiers temporaires supprimés et les nouveaux clics refusés avec un message (Stremio plante sinon) |
| `coursSlots` | `6` | onglet « En cours » : nombre d'emplacements fixes (DeoVR ne redemande la bibliothèque qu'en entrant sur le site, mais il relit la fiche de chaque film à chaque affichage de la liste) |
| `maxDownloads` | `3` | films téléchargés en même temps (le plus ancien est mis en pause au-delà) |
| `minBufferSec` | `20` | tampon minimum (secondes de film converties) avant de passer de l'écran de chargement au film |
| `maxAheadMin` | `30` | ffmpeg ne prépare pas plus de N minutes de film d'avance sur le lecteur |
| `maxAheadMB` | `1000` | ... ni plus de N Mo de segments temporaires d'avance par film (films 8K très lourds : 14 Mo/s remplissent 4 Go en 5 min) |
| `firstWaitMs` | `0` | attente max avant de répondre à la 1re demande du lecteur (0 = l'écran de chargement apparaît tout de suite) |
| `startMode` | `"rapide"` | "rapide" : le film démarre dès minBufferSec de film en tampon, même si le débit est trop faible (pauses possibles ; pratique pour zapper) ; "sans-coupure" : attend l'avance nécessaire pour aller au bout sans pause (patientMaxMin) |
| `patientMaxMin` | `45` | startMode "sans-coupure", débit trop faible : le pont attend d'avoir assez d'avance pour finir le film sans coupure, au plus N min de film d'avance |
| `landscapeThumbs` | `true` | vignettes 16:9 composées (DeoVR affiche en paysage) ; false = affiche Stremio brute |
| `stremioPingMs` | `15000` | fréquence du test « Stremio répond-il ? » |
| `ffmpegRestarts` | `3` | relances de ffmpeg si la conversion plante en cours de film |
| `diskCheckMs` | `5000` | fréquence du contrôle d'espace disque (en plus : au plus 1 s pendant que ffmpeg écrit) |
| `minFreeGB` | `15` | en dessous, les segments déjà vus depuis longtemps sont supprimés (dossier temporaire) |
| `trimKeepSec` | `300` | ... en gardant ce nombre de secondes derrière le lecteur |
| `loaderMaxMin` | `30` | l'écran de chargement s'arrête après N min sans aucune donnée |
| `loadingScreen` | `'always'` | écran de chargement HLS à CHAQUE clic sur un torrent : 'always' \| 'auto' (seulement si pas déjà prêt) \| 'off' |
| `hevcDirect` | `true` | film non H.264 (HEVC...) : le lecteur DeoVR ne le décode pas dans un flux HLS -> écran de chargement, puis lecture directe au clic suivant (true) ou tentative HLS (false) |
| `loadingCodec` | `'h264'` | codec de l'écran d'attente : h264 (seul codec que le lecteur DeoVR/Windows décode dans un flux HLS : mesuré au casque) ; hevc seulement pour des essais |
| `asciiBadges` | `true` | DeoVR n'affiche pas les emoji dans ses listes : pastilles en texte [+++] [++] [+] [x] [?] |
| `jsonDeadlineMs` | `8000` | DeoVR abandonne une fiche vidéo après ~10 s : on répond toujours avant |
| `dnsMode` | `"auto"` | auto : DNS du PC puis DNS public si échec \| public : DNS public d'abord \| system : DNS du PC seulement |
| `publicDns` | `['1.1.1.1', '8.8.8.8', '9.9.9.9']` | DNS publics utilisés en secours (dnsMode « auto ») ou en premier (« public ») |
| `debug` | `false` | journaux détaillés (aussi : variable d'environnement DEBUG=1) |
| `dev` | `false` | mode développeur (--dev, ou "dev": true dans config.json) : journaux détaillés, ffmpeg bavard, page /dev |
| `stremioApi` | `"https://api.strem.io"` | API du compte Stremio (changer seulement pour les tests) |
| `tempDir` | `<dossier de données>/tmp` | vignettes et segments de lecture (peut être placé sur un autre disque) |
