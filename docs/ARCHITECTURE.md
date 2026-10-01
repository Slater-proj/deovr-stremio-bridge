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
| `bridge/lib.js` | le serveur (HTTP, addons, DNS, scrape, registre, HLS, interface) |
| `bridge/server.js` | point d'entrée : options de ligne de commande, bannière, ouverture du navigateur, code de sortie 2 si le port est pris |
| `bridge/paths.js` | où vivent les données : exe portable (`<exe>\data`), code (`dossier du code`), repli `%APPDATA%` |
| `bridge/auth.js` | compte Stremio : page `/setup`, connexion, clé de session, déconnexion, migration des anciens `config.json` |
| `bridge/secrets.js` | stockage de la clé : DPAPI via PowerShell sous Windows, fichier 0600 ailleurs |
| `bridge/version.js` | numéro de version (source unique avec `package.json`, contrôlé par `npm run check`) |
| `bridge/diagnose.js`, `bridge/report.js` | diagnostic complet ; rapport d'assistance (secrets masqués) |
| `bridge/test/` | petites vidéos de test (MP4 2D, MP4 3D SBS, MKV) et vignette |
| `scripts/build-exe.js` | assemble `bridge/*.js` en un script, fabrique l'exe (Node SEA) et le zip portable |
| `scripts/smoke-exe.js` | lance l'exe réellement fabriqué et vérifie le parcours complet |
| `packaging/windows/` | fichiers livrés avec l'exe (LISEZMOI, `.bat`, notices tierces) |
| `tests/`, `scripts/` | tests (`node:test`), vérifications, génération de la doc, fabrication des archives |

## Exécutable portable

`build-exe.js` concatène les modules de `bridge/` dans un seul script (petit registre de modules : `require('./x')` y est résolu en interne), produit un *blob* Node SEA et l'injecte dans une copie de `node.exe` (`node --build-sea`, ou `postject` à défaut). L'exe est donc le runtime Node complet + le code ; seuls `ffmpeg\` et `bridge/test/` restent à côté. `paths.js` repère l'exe (`node:sea`) et choisit le dossier de données ; `lib.js` cherche `ffmpeg\ffmpeg.exe` à côté de l'exe avant le `PATH`.

## Mode développeur

`--dev` (ou `BRIDGE_DEV=1`) : `cfg.dev` et `cfg.debug` à vrai ; la sortie d'ffmpeg est journalisée ligne à ligne ; `/dev` liste les points de diagnostic ; `/debug` indique version, état du compte (sans secret) et chemins. Le mode dev ne change aucun comportement fonctionnel, il ajoute seulement des informations.

## Choix de conception

- **Zéro dépendance** : aucun `npm install` ; l'exe est Node + ce code, sans autre paquet.
- **Pas d'OAuth chez Stremio** : le seul moyen d'obtenir une clé est l'e-mail + mot de passe (API `/api/login`). Le pont les demande donc sur une page locale, garde la clé chiffrée et jette le mot de passe.
- **Tout au même endroit** : un exe portable ne doit pas disséminer de fichiers ; `data\` à côté de l'exe, `%APPDATA%` seulement si ce dossier est en lecture seule.
- **DeoVR prefetch les fiches** (≈ 12 par page) et remplace le titre de la liste par celui de la fiche après 2-3 s : d'où le calcul identique des pastilles.
- **Pourquoi du HLS** : le lecteur de DeoVR abandonne si aucune donnée n'arrive après ~5-15 s ; un flux HLS qui répond tout de suite (écran de chargement) évite l'abandon pendant que Stremio démarre.
- **Pas de téléchargement en tâche de fond** pour « tester » les films : trop lourd et inutile, les trackers donnent déjà une bonne indication.
