<!-- Fichier généré par scripts/gen-config-doc.js : ne pas modifier à la main (modifier les commentaires de bridge/lib.js puis `npm run docs`). -->
# Configuration (`config.json`)

Copiez `config.example.json` en `config.json` (le script `INSTALL.bat` le fait pour vous) et ne gardez que les clés que vous voulez changer.
Les valeurs par défaut conviennent à la plupart des installations. `config.json` contient vos identifiants Stremio : **ne le partagez jamais** (il est exclu du dépôt et des archives).

Certaines clés peuvent aussi venir de variables d'environnement : `PORT`, `STREMIO_EMAIL`, `STREMIO_PASSWORD`, `STREMIO_AUTHKEY`, `LOCAL_STREMIO`, `ADDON_URLS`, `SCRAPE_TRACKERS`, `DNS_MODE`, `DEOVR_PLATFORM`, `FFMPEG`, `LOCAL_DIRS`, `DEBUG`, `BRIDGE_DATA_DIR` (dossier des journaux/état/config).

| Clé | Valeur par défaut | Rôle |
|---|---|---|
| `port` | `4477` | port du pont, 4477 par défaut (peu courant : 8080 est pris par beaucoup de logiciels) ; --port N ou la variable PORT l'emportent |
| `bindHost` | `"0.0.0.0"` | '127.0.0.1' = accessible uniquement depuis ce PC (PCVR) ; '0.0.0.0' = aussi depuis le réseau local (casque autonome) |
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
| `torrentStartMs` | `—` | au-delà, le relais répond 504 au lieu de laisser DeoVR charger à l'infini |
| `platform` | `—` | 'windows' (DeoVR PC : MP4/MOV/AVI, pas MKV/AV1/VP9) ou 'quest' (MKV/WebM/AV1 ok) |
| `ffmpeg` | `—` | pour convertir MKV -> HLS à la volée (DeoVR Windows ne lit pas MKV) |
| `remux` | `true` | autorise la conversion avec ffmpeg (MKV, écran de chargement, vignettes) ; false = lecture directe uniquement |
| `localDirs` | `(env.LOCAL_DIRS ? env.LOCAL_DIRS.split(';').filter(Boolean) : [])` | dossiers de vidéos sur ce PC (onglet « Mes vidéos ») |
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
| `testScene` | `true` | onglet « Test » avec de petites vidéos embarquées |
| `extraTrackers` | `[]` | trackers ajoutés à TOUS les torrents (en plus de ceux de l'addon et des trackers publics) |
| `holdMinutes` | `30` | un film lancé reste actif (téléchargement continu) ce temps après la dernière activité du lecteur |
| `maxDownloads` | `3` | films téléchargés en même temps (le plus ancien est mis en pause au-delà) |
| `minBufferSec` | `20` | tampon minimum (secondes de film converties) avant de passer de l'écran de chargement au film |
| `maxAheadMin` | `30` | ffmpeg ne prépare pas plus de N minutes de film d'avance sur le lecteur |
| `maxAheadMB` | `4000` | ... ni plus de N Mo de segments temporaires d'avance (films 8K très lourds) |
| `firstWaitMs` | `0` | attente max avant de répondre à la 1re demande du lecteur (0 = l'écran de chargement apparaît tout de suite) |
| `patientMaxMin` | `45` | débit trop faible : le pont attend d'avoir assez d'avance pour finir le film sans coupure, au plus N min de film d'avance |
| `landscapeThumbs` | `true` | vignettes 16:9 composées (DeoVR affiche en paysage) ; false = affiche Stremio brute |
| `stremioPingMs` | `15000` | fréquence du test « Stremio répond-il ? » |
| `ffmpegRestarts` | `3` | relances de ffmpeg si la conversion plante en cours de film |
| `diskCheckMs` | `20000` | fréquence du contrôle d'espace disque pendant une lecture |
| `minFreeGB` | `15` | en dessous, les segments déjà vus depuis longtemps sont supprimés (dossier temporaire) |
| `trimKeepSec` | `300` | ... en gardant ce nombre de secondes derrière le lecteur |
| `loaderMaxMin` | `30` | l'écran de chargement s'arrête après N min sans aucune donnée |
| `loadingScreen` | `'always'` | écran de chargement HLS à CHAQUE clic sur un torrent : 'always' \| 'auto' (seulement si pas déjà prêt) \| 'off' |
| `hevcDirect` | `true` | film non H.264 (HEVC...) : le lecteur DeoVR ne le décode pas dans un flux HLS -> écran de chargement, puis lecture directe au clic suivant (true) ou tentative HLS (false) |
| `loadingCodec` | `'h264'` | codec de l'écran d'attente : h264 (seul codec que le lecteur DeoVR/Windows décode dans un flux HLS : mesuré au casque) ; hevc seulement pour des essais |
| `asciiBadges` | `true` | DeoVR n'affiche pas les emoji dans ses listes : pastilles en texte [+++] [++] [+] [x] [?] |
| `jsonDeadlineMs` | `8000` | DeoVR abandonne une fiche vidéo après ~10 s : on répond toujours avant |
| `dnsMode` | `—` | auto : DNS du PC puis DNS public si échec \| public : DNS public d'abord \| system : DNS du PC seulement |
| `publicDns` | `['1.1.1.1', '8.8.8.8', '9.9.9.9']` |  |
| `debug` | `false` | journaux détaillés (aussi : variable d'environnement DEBUG=1) |
| `dev` | `—` | mode développeur (--dev, ou "dev": true dans config.json) : journaux détaillés, ffmpeg bavard, page /dev |
| `stremioApi` | `—` | API du compte Stremio (changer seulement pour les tests) |
| `tempDir` | `—` | vignettes et segments de lecture (peut être placé sur un autre disque) |
