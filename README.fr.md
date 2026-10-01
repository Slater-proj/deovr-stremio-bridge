# Pont DeoVR ⇄ Stremio

Regardez votre bibliothèque **Stremio** dans **DeoVR** sur un casque PCVR Windows (cible de conception : Pimax Dream Air ; les autres casques PCVR utilisant DeoVR pour Windows devraient fonctionner).
Le pont est un petit serveur web local : le navigateur intégré de DeoVR lui parle, il lit vos addons Stremio et laisse le serveur de streaming de Stremio télécharger les torrents.

## Ce qu'il fait

- **Bibliothèque DeoVR native** : tapez l'adresse du pont dans le navigateur de DeoVR → onglets *En cours*, *Plus de seeds*, *Nouveautés*, un onglet par catalogue Stremio, un onglet de test.
- **Le téléchargement ne démarre que lorsque vous choisissez un film.** Rien n'est téléchargé pendant que vous naviguez. Après avoir quitté le lecteur, le téléchargement continue (30 min par défaut), plusieurs films en parallèle, et reprend sans repartir de zéro.
- **Écran de chargement** (HLS) à chaque clic : étape, pairs, Mo reçus, débit réel/nécessaire, tampon, temps restant, messages honnêtes (« débit insuffisant », « aucune source »). Il bascule tout seul sur le film quand assez est en mémoire tampon.
- **VR correctement déclarée** : un film dont le catalogue, le genre ou le titre dit VR est déclaré VR à DeoVR (dôme 180°, sphère 360°, fisheye, MKX200, côte à côte ou dessus-dessous lus dans le titre).
- **Pastilles stables** dans le titre : `[S12] Titre`, `[EN COURS 18 % · 1,4 Mo/s]`, `[PRÊT · 8 min en tampon]`, `[BLOQUÉ · 0 pair]`.
- **Fiabilité** : ffmpeg est relancé à la bonne position s'il plante, les segments déjà vus sont supprimés quand le disque est presque plein, la taille du cache Stremio est contrôlée, un message clair s'affiche si Stremio n'est pas lancé, `start.bat` relance le pont s'il s'arrête.
- **Diagnostic intégré** : `diagnose.bat`, `RAPPORT.bat` (rapport d'assistance sans secrets), journaux par clic et bilan par film, `/status`, `/debug/downloads`.
- **Aucune dépendance** (Node ≥ 20 + ffmpeg).

## Prérequis

Windows 10/11 · application Stremio lancée avec au moins un addon · DeoVR PC (Steam) · Node.js 20+ et ffmpeg (installés par `INSTALL.bat`) · cache Stremio (Paramètres → Streaming) **illimité ou ≥ 20 Go**.

## Démarrage rapide

1. Téléchargez le zip de la dernière [Release](../../releases) et décompressez-le.
2. Double-clic sur `INSTALL.bat` (installe Node/ffmpeg si besoin, demande votre e-mail/mot de passe Stremio → `config.json`, qui reste sur votre PC).
3. Lancez Stremio, puis double-clic sur `start.bat`.
4. Dans le navigateur de DeoVR, tapez `http://localhost:8080` (ou le port de votre `config.json`).

Détails : [docs/INSTALL.md](docs/INSTALL.md) · [docs/USAGE.md](docs/USAGE.md) · [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Ce qui est vérifié, ce qui ne l'est pas

Les tests automatiques (CI, simulations) couvrent la bibliothèque, la déclaration VR, les pastilles, la recherche, les vignettes, le flux clic → téléchargement → écran de chargement → film, la reprise après plantage de ffmpeg, l'élagage du disque, le budget de cache et le message « Stremio arrêté ». **Il faut un vrai casque** pour confirmer : la bascule HLS écran de chargement → film dans DeoVR (tests 5 et 6 de l'onglet « Test pont »), les liens `deovr://` depuis le navigateur de DeoVR (page `/t`), les champs réels de l'API de Stremio selon sa version, l'affichage des accents. Protocole : [docs/TESTING.md](docs/TESTING.md).

## Mentions légales

Outil local : il **n'héberge, n'indexe ni ne distribue aucun contenu** et n'embarque aucun addon ni source. Vous êtes responsable de ce que vous diffusez et du respect des lois et licences qui s'appliquent. Aucun lien avec Stremio, DeoVR ni les auteurs d'addons.

Licence [MIT](LICENSE).
