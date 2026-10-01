# Architecture

```
DeoVR (PC)                    Pont (Node, ce dépôt)                       Stremio (même PC)
 navigateur ──GET /deovr──▶  bibliothèque JSON  ◀──catalogues/flux──   addons HTTP (via votre compte)
 lecteur  ──GET /live/…──▶  registre « En cours » ──POST /create──▶   serveur de streaming :11470
                             │  ▲                     GET stats.json ◀── (torrents, cache disque)
                             │  └─ /feed/<hash>/<i> (relais Range) ◀──── lecture du fichier en cours de téléchargement
                             ▼
                          ffmpeg : -c:v copy → segments HLS ; écran de chargement rendu par lavfi+drawtext
```

## Principes

1. **La fiche vidéo ne démarre rien.** Elle ne fait que des requêtes HTTP aux addons et un *scrape* UDP (BEP 15) des trackers pour afficher les seeders. Le **clic** = premier `GET /live/<hash>/<idx>/index.m3u8` (ou `/torrent/…`, `/hls/…`) → `dlTouch` → création/activation de l'entrée du registre.
2. **Registre `dls`** (clé `hash:idx`) : état, débit, pairs, octets, chronologie, épisodes (un « clic » = un épisode). `dlTick` (1,5 s) interroge `stats.json`. `dlActivate` plafonne à `maxDownloads` et au budget du cache Stremio ; `dlPause` après `holdMinutes` sans activité du lecteur. État persisté dans `bridge-state.json` (24 h, restauré en pause).
3. **Pipeline de lecture** : ffmpeg lit le film via le relais interne `/feed/<hash>/<idx>` (Range, contre-pression : `gated` quand l'avance dépasse `maxAheadMin`/`maxAheadMB`), copie la vidéo, recode l'audio en AAC stéréo, écrit des segments `real/segNNNNN.ts`. Un téléchargeur de fond lit en séquence quand ffmpeg est en pause, pour que Stremio continue de télécharger.
4. **Playlist HLS** (`livePlaylist`) : segments de chargement `w<epoch>_<i>.ts` (rendus à la demande, 4 s chacun, dans la disposition du film) → `#EXT-X-DISCONTINUITY` → segments réels, dès que `producedSec ≥ bufferTarget`. `bufferTarget` = 20/60 s, ou l'avance nécessaire `durée × (1 − débit/besoin)` si le débit est insuffisant. Un nouveau lecteur (trou de playlist > 20 s) repart d'un nouvel *epoch* et saute l'écran de chargement si le film est déjà prêt.
5. **Fiabilité** : si ffmpeg meurt, `spawnReal` le relance (jusqu'à `ffmpegRestarts` fois) avec `-ss`, `-output_ts_offset` et `-start_number` pour continuer la numérotation ; une discontinuité est signalée. `liveDiskGuard` supprime les segments vus depuis longtemps sous `minFreeGB` et ajuste `MEDIA-SEQUENCE` / `DISCONTINUITY-SEQUENCE`. `checkCache` lit `/settings` de Stremio ; `stremioPing` détecte son arrêt.
6. **Déclaration VR** : `filmCats` (identifiant → noms de catalogues/genres), `vrForce` (« VR » dans catalogue, genre ou titre), `detectFormat` (projection/stéréo lues dans le titre), `applyVR` (plat → dôme 180° côte à côte). La raison est journalisée (`bridge-decisions.log`).
7. **Pastilles** : `tagInfo` = état de téléchargement si le film est dans le registre, sinon seeders des trackers. Le titre de fiche est recalculé à l'envoi, d'où la même pastille que dans la liste.
8. **Santé** : `recordHealth` (partagé entre l'analyse de fond et la fiche) ; un film n'est masqué que sans aucune source utilisable ou avec un codec certainement illisible (AV1/VP9 sous Windows).

## Fichiers

| Fichier | Rôle |
|---|---|
| `bridge/lib.js` | tout le serveur (HTTP, addons, DNS, scrape, registre, HLS, interface) |
| `bridge/server.js` | point d'entrée, bannière, code de sortie 2 si le port est pris |
| `bridge/diagnose.js` | diagnostic complet → `diagnostic-report.txt/json` |
| `bridge/report.js` | rapport d'assistance (secrets masqués) |
| `bridge/setup.js` | assistant `config.json` |
| `bridge/test/` | petites vidéos de test (MP4 2D, MP4 3D SBS, MKV) et vignette |
| `tests/` | tests unitaires et d'intégration (`node:test`) |
| `scripts/` | tests, vérifications, génération de la doc de configuration, fabrication de la release |

## Choix de conception

- **Zéro dépendance** : un seul `lib.js`, installable sans `npm install`.
- **DeoVR prefetch les fiches** (≈ 12 par page) et remplace le titre de la liste par celui de la fiche après 2-3 s : d'où le calcul identique des pastilles.
- **Pourquoi du HLS** : le lecteur de DeoVR abandonne si aucune donnée n'arrive après ~5-15 s ; un flux HLS qui répond tout de suite (écran de chargement) évite l'abandon pendant que Stremio démarre.
- **Pas de téléchargement en tâche de fond** pour « tester » les films : trop lourd et inutile, les trackers donnent déjà une bonne indication.
