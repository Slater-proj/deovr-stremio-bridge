# Utilisation dans DeoVR

## Lancer le pont

Exe portable : double-clic sur `DeoVR-Stremio-Bridge.exe` (Stremio doit tourner). Réglages (port, `bindHost`, `platform`, `vrOnly`, `localDirs`…) dans `config.json` à côté de l'exe. La console affiche version, dossier de données et adresses. Au premier lancement, le navigateur s'ouvre sur la page de connexion `/setup`. Options utiles (`--help` les liste toutes) :

| Option | Effet |
|---|---|
| `--dev` (ou `utility\LANCER-MODE-DEV.bat`, ou `"dev": true` dans `config.json`) | mode développeur : journaux détaillés, sortie d'ffmpeg, page `http://localhost:4477/dev` qui liste tous les points de diagnostic |
| `--login` / `--logout` | rouvrir la page de connexion / oublier le compte |
| `--port N`, `--data-dir DIR` | port et dossier de données |
| `--no-browser` | ne jamais ouvrir le navigateur tout seul |
| `--report` (ou `utility\RAPPORT-SUPPORT.bat`) | écrit `data\rapport-support.txt` (secrets masqués) |
| `--diagnose` (ou `utility\DIAGNOSTIC.bat`) | diagnostic complet |

Changer de compte Stremio : `http://localhost:4477/setup` (sur le PC) → *Changer de compte*.

## Ouvrir la bibliothèque

Dans le navigateur de DeoVR, tapez l'adresse du pont **sans rien d'autre** (ex. `http://localhost:4477`). DeoVR demande alors `/deovr` et affiche la bibliothèque native avec ses onglets :

| Onglet | Contenu |
|---|---|
| **En cours** | 6 emplacements fixes : les films que vous avez lancés (actifs ou en pause) y prennent place, l'état est dans le titre (`[EN COURS 40 %]`, `[PRÊT]`). DeoVR ne redemande la bibliothèque qu'en revenant sur le site ; il relit en revanche les fiches à chaque affichage de la liste |
| **Plus de seeds** | classement d'après les seeders annoncés par les trackers (sans rien télécharger) |
| **Nouveautés** | année de sortie la plus récente |
| **Haute qualité (titre)** | d'après le **titre** uniquement (4K/6K/8K…), donc indicatif |
| **un onglet par catalogue Stremio** | vos catalogues, filtrés VR/3D (`vrOnly`) |
| **Mes vidéos** | vos dossiers locaux (`localDirs`) |
| **Test pont** | six vidéos de test, le mode d'emploi et le banc de test casque (Labos 1 à 16) : voir [TESTING.md](TESTING.md) |

## Lire un film

1. Ouvrez la fiche d'un film → lancez la lecture. **C'est ce clic qui démarre le téléchargement.**
2. Un **écran de chargement** s'affiche (dans la disposition du film : côte à côte, dessus-dessous ou plat) : étape 1/4 recherche de pairs → 2/4 métadonnées → 3/4 mise en tampon → 4/4 lancement. Il indique pairs, Mo reçus, débit réel et nécessaire, tampon et temps restant. 30 à 60 s au démarrage est normal.
3. Dès **20 s de film en tampon** (`minBufferSec`, réglage `startMode: "rapide"` par défaut) : film **H.264** → la lecture **bascule toute seule** ; film **HEVC** (la plupart des 6K/8K) → l'écran affiche « PRÊT, appuyez sur RETOUR puis relancez le film » (le lecteur de DeoVR ne sait pas enchaîner du HEVC dans cet écran) et le second clic démarre immédiatement.
4. Si le débit est insuffisant, l'écran le dit : en mode `rapide` le film démarre quand même et fera des pauses ; en mode `"startMode": "sans-coupure"` le pont attend assez d'avance pour aller au bout sans pause (l'écran dit combien de minutes). Si aucun pair n'est trouvé, il le dit aussi : choisissez un autre film.
5. **Zapper** : en lecture directe (films HEVC, après « relancez »), le lecteur demande l'endroit choisi et Stremio télécharge cette partie en priorité. Dans le flux HLS (films H.264), on ne peut sauter que dans la partie déjà convertie ; le Labo 16 mesure si un saut plus loin serait possible.
6. Vous pouvez **quitter** : le téléchargement continue `holdMinutes` (30 min) puis se met en pause (la partie reçue reste dans le cache Stremio). Relancer le film reprend où il en était.

Jusqu'à `maxDownloads` (3) films sont actifs en même temps ; au-delà, le plus ancien est mis en pause. Si votre cache Stremio est petit, le pont réduit ce nombre.

## Pastilles dans les titres

| Pastille | Sens |
|---|---|
| `[S12] Titre` | 12 seeders annoncés par les trackers (la qualité 8K/6K est déjà dans le titre, elle n'est pas répétée) |
| `[S0]` | 0 seeder : fin de liste, probablement impossible à lire |
| `[S?]` | pas encore analysé ; devient `[Sxx]` après analyse |
| `[HTTP]` | lien HTTP direct (pas de torrent) |
| `[EN COURS 18 % · 3,1/17,0 Go · 1,4 Mo/s · reste ~2,8 h]` | téléchargement actif : part reçue / taille du fichier, débit, temps restant estimé |
| `[PRÊT · 8 min en tampon]` | assez de film converti pour lire |
| `[PRÊT · COMPLET]` / `[EN CACHE · COMPLET]` | film entièrement reçu |
| `[PRÊT · relancez le film]` | film HEVC en tampon : Retour, puis relancer (lecture directe) |
| `[RECHERCHE · 3 pairs]`, `[BLOQUÉ · 0 pair]`, `[BLOQUÉ · aucune donnée]`, `[PAUSE · reprise au clic]` | recherche, source morte (ou pairs qui n'envoient rien après 90 s), arrêté |
| `[ÉCHEC · aucune donnée]` | au dernier clic, rien n'est arrivé en 90 s malgré les seeders annoncés : film placé en fin de liste et retiré de *Plus de seeds* pendant 2 h |
| `[ARRÊTÉ · disque plein]` | téléchargement arrêté faute de place (moins de 1 Go libre, `minFreeCriticalGB`) |

Sous 15 Go libres (`minFreeGB`), une ligne « Disque : N Go libres (fichiers du pont : M Go) » s'ajoute en bas de l'onglet *En cours*.

Les pastilles sont des seeders annoncés, pas une garantie de lecture : le téléchargement réel dépend du réseau.

## Rechercher

Taper dans un casque est pénible, mais possible : dans le navigateur de DeoVR, tapez `http://localhost:4477/s/mot` (ex. `/s/avatar`). Sur le PC, la page web `http://localhost:4477/ui` offre une interface façon deovr.com (sources à gauche, recherche, grille, filtres 180°/360°/VR). `/ui` et `/t` s'ouvrent depuis le navigateur du PC ou en les tapant en entier dans DeoVR.

## Suivi et dépannage rapide

- `http://localhost:4477/status` : films en cours, pairs, débit réel/nécessaire.
- `http://localhost:4477/debug/downloads` : chronologie complète de chaque clic ; `data\bridge-bilans.log` : un bilan par film (« lu », « quitté puis repris », « abandonné par DeoVR après N s », « aucune donnée »).
- Voir [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
