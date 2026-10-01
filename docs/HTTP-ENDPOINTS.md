# Points d'entrée HTTP

Pour DeoVR (JSON) :

| Chemin | Rôle |
|---|---|
| `GET /deovr` (ou `/` si l'en-tête `Accept` ne demande pas du HTML) | bibliothèque : `{ scenes: [{ name, list: [{ title, videoLength, thumbnailUrl, video_url }] }], authorized }` |
| `GET /s/<mot>` | même format, résultats d'une recherche |
| `GET /video/<type>/<id>.json` | fiche d'un film (encodings, projection, stéréo) ; ne démarre aucun téléchargement |
| `GET /video/local/<id>.json`, `/video/test/<clé>.json` | fiches locales / de test |
| `GET /deovr?cat=…&tab=…&f180=1&f360=1&go=1` | sélections filtrées (issues de `/ui`) |

Flux (le clic démarre le téléchargement) :

| Chemin | Rôle |
|---|---|
| `GET /live/<hash>/<idx>/index.m3u8` (+ `w<epoch>_<i>.ts`, `real/segNNNNN.ts`) | écran de chargement HLS puis film |
| `GET /feed/<hash>/<idx>` | relais Range vers Stremio pour ffmpeg (interne) |
| `GET /torrent/<hash>/<idx>/…` | lecture directe d'un torrent MP4 |
| `GET /hls/<hash>/<idx>/…` | MKV → HLS à la volée (ancien chemin) |
| `GET /proxy/<url>/<headers>/…` | proxy de flux HTTP |
| `GET /thumb/<base64url(url)>.jpg` | vignette 16:9 composée (repli : redirection vers l'image d'origine) |
| `GET /test/<fichier>`, `/test/switch/{flat,sbs}/index.m3u8` | médias et test de bascule |

Pages et diagnostic :

| Chemin | Rôle |
|---|---|
| `/ui` (`/u`) | interface web façon deovr.com (HTML sans JavaScript) |
| `/t`, `/open/C` | page de test des liens `deovr://` |
| `/status`, `/status.json` | films en cours |
| `/debug/downloads` | état et chronologie de chaque clic, bilans |
| `/debug/perf`, `/debug/live`, `/debug/health`, `/debug/requests`, `/debug` | performances, sessions ffmpeg, santé des films, requêtes, configuration masquée |
| `/catalogs` | catalogues Stremio vus par le pont |

Aucun de ces points ne renvoie le mot de passe ni les URL d'addon en clair. Voir [SECURITY.md](../SECURITY.md) pour l'exposition réseau (`bindHost`).
