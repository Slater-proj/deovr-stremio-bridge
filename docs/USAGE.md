# Utilisation dans DeoVR

## Ouvrir la bibliothèque

Dans le navigateur de DeoVR, tapez l'adresse du pont **sans rien d'autre** (ex. `http://localhost:8080`). DeoVR demande alors `/deovr` et affiche la bibliothèque native avec ses onglets :

| Onglet | Contenu |
|---|---|
| **En cours** | les films que vous avez lancés (actifs ou en pause), toujours en premier |
| **Plus de seeds** | classement d'après les seeders annoncés par les trackers (sans rien télécharger) |
| **Nouveautés** | année de sortie la plus récente |
| **Haute qualité (titre)** | d'après le **titre** uniquement (4K/6K/8K…), donc indicatif |
| **un onglet par catalogue Stremio** | vos catalogues, filtrés VR/3D (`vrOnly`) |
| **Mes vidéos** | vos dossiers locaux (`localDirs`) |
| **Test pont** | six vidéos de test (voir [TESTING.md](TESTING.md)) |

## Lire un film

1. Ouvrez la fiche d'un film → lancez la lecture. **C'est ce clic qui démarre le téléchargement.**
2. Un **écran de chargement** s'affiche (dans la disposition du film : côte à côte, dessus-dessous ou plat) : étape 1/4 recherche de pairs → 2/4 métadonnées → 3/4 mise en tampon → 4/4 lancement. Il indique pairs, Mo reçus, débit réel et nécessaire, tampon et temps restant. 30 à 60 s au démarrage est normal.
3. Quand assez de film est converti, la lecture **bascule toute seule** sur le film.
4. Si le débit est insuffisant, l'écran dit combien de minutes d'avance sont nécessaires pour lire sans coupure (ou que le film est trop lourd pour ce débit). Si aucun pair n'est trouvé, il le dit aussi : choisissez un autre film.
5. Vous pouvez **quitter** : le téléchargement continue `holdMinutes` (30 min) puis se met en pause (la partie reçue reste dans le cache Stremio). Relancer le film reprend où il en était.

Jusqu'à `maxDownloads` (3) films sont actifs en même temps ; au-delà, le plus ancien est mis en pause. Si votre cache Stremio est petit, le pont réduit ce nombre.

## Pastilles dans les titres

| Pastille | Sens |
|---|---|
| `[S12] Titre`, `[8K S12] Titre` | 12 seeders annoncés par les trackers ; `8K` = qualité lue dans le titre |
| `[S0]` | 0 seeder : fin de liste, probablement impossible à lire |
| `[S?]` | pas encore analysé ; devient `[Sxx]` après analyse |
| `[HTTP]` | lien HTTP direct (pas de torrent) |
| `[EN COURS 18 % · 1,4 Mo/s]` | téléchargement actif |
| `[PRÊT · 8 min en tampon]` | assez de film converti pour lire |
| `[PRÊT · COMPLET]` / `[EN CACHE · COMPLET]` | film entièrement reçu |
| `[RECHERCHE · 3 pairs]`, `[BLOQUÉ · 0 pair]`, `[PAUSE · reprise au clic]` | recherche, source morte, arrêté |

Les pastilles sont des seeders annoncés, pas une garantie de lecture : le téléchargement réel dépend du réseau.

## Rechercher

Taper dans un casque est pénible, mais possible : dans le navigateur de DeoVR, tapez `http://localhost:8080/s/mot` (ex. `/s/avatar`). Sur le PC, la page web `http://localhost:8080/ui` offre une interface façon deovr.com (sources à gauche, recherche, grille, filtres 180°/360°/VR). `/ui` et `/t` s'ouvrent depuis le navigateur du PC ou en les tapant en entier dans DeoVR.

## Suivi et dépannage rapide

- `http://localhost:8080/status` : films en cours, pairs, débit réel/nécessaire.
- `http://localhost:8080/debug/downloads` : chronologie complète de chaque clic ; `bridge-bilans.log` : un bilan par film (« lu », « quitté puis repris », « abandonné par DeoVR après N s », « aucune donnée »).
- Voir [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
