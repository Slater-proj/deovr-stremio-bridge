# Notes sur DeoVR

Tiré de la [documentation officielle de DeoVR](https://deovr.com/app/doc) et des observations de terrain (Windows, DeoVR 15.9).

- **Adresse nue** (`http://hôte:port`) tapée dans le navigateur de DeoVR → DeoVR demande `/deovr`. Toute autre URL est demandée telle quelle.
- **Deeplink** : `deovr://https://…/fichier.json` depuis un bouton de page web ouvre la scène de sélection. Dans le navigateur de DeoVR lui-même, le comportement est à confirmer (page `/t` du pont).
- **Navigateur de DeoVR** : très ancien (Chromium 40) → pas de JavaScript moderne, pages rendues côté serveur.
- **JSON** : `scenes[].list[]` avec `title`, `videoLength`, `thumbnailUrl` (requis), `video_url`. Fiche : `encodings[].videoSources[].url`, `screenType` (`flat`, `dome`, `sphere`, `fisheye`, `mkx200`, `rf52`), `stereoMode` (`off`, `sbs`, `tb`), `is3d`.
- **HLS** : pris en charge sur Windows ; la doc le déclare avec un champ `path`. Le pont met l'URL `.m3u8` dans `encodings/videoSources/url` : l'écran de chargement s'affiche, la bascule vers le film est vérifiée par les tests 5 et 6 sur un vrai DeoVR.
- **Codecs Windows** : HEVC, H.264, WMV, MJPEG… (pas AV1 ni VP9) ; conteneurs MP4, MKV, WebM, MOV, AVI, MPEG, M4V (le pont convertit les MKV en HLS par prudence : le lecteur Windows réel abandonne vite).
- **Délais** : DeoVR ferme une requête de fiche après ~10 s ; son lecteur abandonne si aucune donnée n'arrive après ~5-15 s.
- **Titres** : pas d'emoji (ils ne s'affichent pas) → pastilles en ASCII.
- **Affiches** : DeoVR affiche des vignettes en paysage → le pont compose du 16:9.
- **HTTPS** : la doc le recommande pour Android ; sur DeoVR Windows en local, HTTP fonctionne (listes et vignettes vérifiées).
