# Points d'entrée HTTP

Pour DeoVR (JSON) :

| Chemin | Rôle |
|---|---|
| `GET /deovr` (ou `/` si l'en-tête `Accept` ne demande pas du HTML) | bibliothèque : `{ scenes: [{ name, list: [{ title, videoLength, thumbnailUrl, video_url }] }], authorized }` |
| `GET /s/<mot>` | même format, résultats d'une recherche |
| `GET /video/<type>/<id>.json` | fiche d'un film (encodings, projection, stéréo) ; ne démarre aucun téléchargement |
| `GET /video/slot/<n>.json` | onglet « En cours » : fiche du film qui occupe l'emplacement n à cet instant (emplacement libre : fiche de test vide) |
| `GET /video/local/<id>.json`, `/video/test/<clé>.json` | fiches locales / de test |
| `GET /deovr?cat=…&tab=…&f180=1&f360=1&go=1` | sélections filtrées (issues de `/ui`) |

Flux (le clic démarre le téléchargement) :

| Chemin | Rôle |
|---|---|
| `GET /live/<hash>/<idx>/index.m3u8` (+ `w<epoch>_<i>.ts`, `real/segNNNNN.ts`) | écran de chargement HLS puis film |
| `GET /feed/<hash>/<idx>` | relais Range vers Stremio pour ffmpeg (interne) |
| `GET /torrent/<hash>/<idx>/…` | lecture directe d'un torrent MP4 |
| `GET /hls/<hash>/<idx>/…` | MKV → HLS à la volée, sans écran de chargement (`loadingScreen: "off"`) |
| `GET /localfile/<id>/video.<ext>`, `/hls/local/<id>/…`, `/localthumb/<id>.jpg` | vidéos de « Mes vidéos » (`localDirs`) : fichier direct, MKV converti en HLS, vignette |
| `GET /proxy/<url>/<headers>/…` | proxy de flux HTTP |
| `GET /thumb/<base64url(url)>.jpg[?b=<badge>&p=<0-100>]` | vignette 16:9 composée, avec badge (texte restreint) et barre d'avancement optionnels (repli : redirection vers l'image d'origine) |
| `GET/POST /settings` | réglages (formulaire) ; **PC seulement**, jeton anti-CSRF |
| `GET/POST /queue` | file de téléchargement (ajouter par identifiant, retirer) ; **PC seulement**, jeton anti-CSRF |
| `GET /check`, `/check.json` | voyants de bon fonctionnement |
| `GET /video/tool/<outil>.json`, `GET /tool/<outil>/run.mp4` | onglet Outils : la fiche ne fait rien ; l'action est exécutée quand le lecteur vidéo de DeoVR (UA NSPlayer, ce PC) ouvre `run.mp4` (outils : `etat`, `rapport`, `pause`, `nettoyer`, `echantillon`) |
| `GET /test/<fichier>`, `/test/switch/{flat,sbs}/index.m3u8` | médias et test de bascule |

Pages et diagnostic :

| Chemin | Rôle |
|---|---|
| `/ui` (`/u`) | interface web façon deovr.com (HTML sans JavaScript) |
| `/t`, `/open/C` | page de test des liens `deovr://` |
| `/status`, `/status.json` | films en cours |
| `/debug/downloads` | état et chronologie de chaque clic, bilans |
| `/lab/<scène>/<fichier>`, `/video/lab/<scène>.json`, `/debug/labo` | banc de test casque (Labo 1 à 16, mode d'emploi) : médias synthétiques, fiches, verdict « flux avalé / recommencé » par scène |
| `/debug/perf`, `/debug/live`, `/debug/health`, `/debug/requests`, `/debug` | performances, sessions ffmpeg, santé des films, requêtes, configuration masquée, version, état du compte et chemins |
| `/catalogs` | catalogues Stremio vus par le pont |
| `/setup` (`POST /setup`, `POST /setup/logout`) | connexion au compte Stremio — **depuis le PC uniquement** (loopback, `Host` local, jeton de formulaire) ; voir [SECURITY.md](../SECURITY.md) |
| `/dev` | (mode `--dev` seulement) liste des points de diagnostic |

Aucun de ces points ne renvoie le mot de passe ni les URL d'addon en clair. Les réponses JSON n'ont pas d'en-tête CORS, et une requête dont l'en-tête `Host` est un nom de domaine extérieur reçoit 403 (anti *DNS rebinding*). Voir [SECURITY.md](../SECURITY.md) pour l'exposition réseau (`bindHost`).
