# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Les versions 1 à 9 étaient des itérations internes ; elles sont résumées dans la 10.0.

## [10.2.0] — 2026-10-01

### Ajouté
- Dépôt public : tests unitaires et d'intégration (`node:test`), CI GitHub Actions (Windows, Node 24 ; un job parallèle contrôle le zip de release), fabrication de la release, documentation complète.
- Reprise automatique de ffmpeg après plantage (jusqu'à 3 fois), à la bonne position, avec discontinuité HLS signalée.
- Élagage des segments déjà vus quand le disque est presque plein (`minFreeGB`, `trimKeepSec`).
- Budget du cache Stremio : pas plus de films actifs que le cache ne peut en contenir.
- Détection de Stremio arrêté (message dans l'écran de chargement et l'onglet *En cours*).
- `start.bat` relance le pont s'il s'arrête ; `DEMARRAGE-AUTO.bat` / `DEMARRAGE-AUTO-RETIRER.bat`.
- Options `bindHost`, `BRIDGE_DATA_DIR`, `stremioPingMs`, `diskCheckMs`, `ffmpegRestarts`.
- Reconnaissance de `LR`, `TB` et `OU` dans les titres manifestement VR (ex. « 360 TB » → sphère dessus-dessous).

## [10.1.0] — 2026-10-01

### Ajouté
- Tests 5 et 6 (« Test pont ») : bascule écran de chargement → vidéo sans torrent.
- Vignettes 16:9 composées (`landscapeThumbs`).
- Attente honnête pour les torrents lents (`patientMaxMin`) et contrôle du cache Stremio.

### Corrigé
- Le texte de l'écran de chargement contenant `%` (« Mise en tampon : N % ») n'était pas dessiné (ffmpeg `drawtext`).

## [10.0.0] — 2026-10-01

### Changé
- Le téléchargement ne démarre qu'au clic ; plus de test de torrent en arrière-plan.
- Registre « En cours » (états, 30 min de maintien, plusieurs films, reprise, persistance).
- Écran de chargement HLS à chaque clic (étape, pairs, débit, tampon, ETA).
- Films dont le catalogue/genre/titre dit VR toujours déclarés VR.
- Pastilles stables (identiques liste/fiche) basées sur le scrape des trackers.
- Un onglet par catalogue Stremio, recherche `/s/mot`, « Plus de seeds », interface web `/ui`, page de test des deeplinks `/t`.
- Journaux complets par clic et bilan par film.
