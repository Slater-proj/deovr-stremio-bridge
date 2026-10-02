# Notes sur DeoVR

Tiré de la [documentation officielle de DeoVR](https://deovr.com/app/doc) et des observations de terrain (Windows, DeoVR 15.9).

- **Adresse nue** (`http://hôte:port`) tapée dans le navigateur de DeoVR → DeoVR demande `/deovr`. Toute autre URL est demandée telle quelle.
- **Deeplink** : `deovr://https://…/fichier.json` depuis un bouton de page web ouvre la scène de sélection. Dans le navigateur de DeoVR lui-même, le comportement est à confirmer (page `/t` du pont).
- **Navigateur de DeoVR** : très ancien (Chromium 40) → pas de JavaScript moderne, pages rendues côté serveur.
- **JSON** : `scenes[].list[]` avec `title`, `videoLength`, `thumbnailUrl` (requis), `video_url`. Fiche : `encodings[].videoSources[].url`, `screenType` (`flat`, `dome`, `sphere`, `fisheye`, `mkx200`, `rf52`), `stereoMode` (`off`, `sbs`, `tb`), `is3d`.
- **HLS** : pris en charge sur Windows ; la doc le déclare avec un champ `path` (et réserve `encodings` aux téléchargements progressifs). Le pont met l'URL `.m3u8` dans `encodings/videoSources/url` : **mesuré au casque (02/10)** l'écran de chargement et la bascule vers un film **H.264** fonctionnent (tests 5 et 6 et un écran de chargement H.264 lu 40 s). Le Labo 6 a montré que la forme `path` ne convient pas (voir ci-dessous).
- **HLS + HEVC (mesuré, 02/10)** : le lecteur de Windows (`NSPlayer/12…`, Media Foundation) **relance un flux HLS en HEVC exactement 15 s après son début** (écran de chargement HEVC, film HEVC 8K en TS), alors qu'un flux H.264 identique est lu normalement. Le pont n'envoie donc plus jamais de HEVC dans un flux HLS : écran de chargement H.264, puis lecture directe du fichier au clic suivant. Les Labos 2, 3 et 5 testent si HEVC en fMP4 (hvc1) passerait, ce qui permettrait une bascule sans relancer.
- **Sélecteur de mode (mesuré, 3e test du 02/10)** : si la fiche déclare `screenType`/`stereoMode`/`is3d`, DeoVR ne propose **pas** FLAT/180/360/fisheye dans le lecteur ; sans déclaration il les propose (et montre l'image côte à côte brute). Le nom de fichier `_180_LR` n'est pas pris en compte pour un flux HTTP. Labos 10 et 11 : une déclaration partielle garde-t-elle le menu ? Réglage `formatMenu`.
- **Codecs dans HLS (mesuré)** : H.264 en TS passe ; HEVC en TS échoue (relancé à +15 s) ; **HEVC en fMP4 passe** (Labo 3) ; bascule H.264 TS → HEVC fMP4 : le lecteur se fige (Labo 5). Labo 12 (HEVC fMP4 → HEVC fMP4) à mesurer. **HEVC en MP4 et en MKV directs : passent** (Labos 4 et 9).
- **Fenêtre 2D de DeoVR** : le navigateur intégré de la fenêtre de bureau (UA `Windows NT … Chrome/111`) demande `/` et reçoit la page web `/ui` (normal) ; les liens `deovr://` de cette page lancent DeoVR.
- **Forme `path` d'une fiche vidéo (mesuré, 02/10, Labo 6)** : avec `path` à la place de `encodings`, le lecteur Windows demande l'adresse de la fiche JSON elle-même comme flux (« format non pris en charge »). Une fiche de film réelle (`encodings`) a subi la même chose une fois, sans cause identifiée → repli : le pont redirige NSPlayer vers le flux.
- **HEVC en MP4 direct (mesuré, 02/10)** : passe (Labo 4 et films réels).
- - **Taille en VR** : un dôme 180° étire le texte large sur toute la vue ; garder un bloc de texte de ≈ 35 % de la largeur d'un œil (lignes ≤ 30 caractères).
- **Mémoire de DeoVR** : la bibliothèque (`/deovr`) n'est redemandée que lorsqu'on revient sur le site (pas de rafraîchissement automatique) ; DeoVR demande toutes les fiches `video_url` de la liste affichée à chaque affichage ; la doc dit que l'`id` d'une fiche sert à *mémoriser ses réglages*.
- **Pas de menu ni de recherche dans la liste native** (aucun champ correspondant dans le format JSON) : ils n'existent que dans les pages web du pont (`/ui`, `/s/mot`) ouvertes dans le navigateur de DeoVR.
- **Codecs Windows** : HEVC, H.264, WMV, MJPEG… (pas AV1 ni VP9) ; conteneurs MP4, MKV, WebM, MOV, AVI, MPEG, M4V (le pont convertit les MKV en HLS par prudence : le lecteur Windows réel abandonne vite).
- **Délais** : DeoVR ferme une requête de fiche après ~10 s ; son lecteur abandonne si aucune donnée n'arrive après ~5-15 s.
- **Titres** : pas d'emoji (ils ne s'affichent pas) → pastilles en ASCII.
- **Affiches** : DeoVR affiche des vignettes en paysage → le pont compose du 16:9.
- **HTTPS** : la doc le recommande pour Android ; sur DeoVR Windows en local, HTTP fonctionne (listes et vignettes vérifiées).
