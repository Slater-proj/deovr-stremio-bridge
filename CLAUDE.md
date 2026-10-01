# Contexte du projet (pour les assistants IA et les nouveaux contributeurs)

Pont local **DeoVR ⇄ Stremio** : un serveur HTTP Node.js sans dépendance. Le navigateur de DeoVR (PC, Windows, casque PCVR) y affiche une bibliothèque native ; au clic, le pont fait télécharger le torrent par le serveur de streaming de Stremio et sert à DeoVR un flux HLS (écran de chargement généré par ffmpeg, puis le film).

## Règles du projet
- **Aucune dépendance** d'exécution ni de dev (`node:test`, ffmpeg en processus externe). Node ≥ 20, CI sur Node 24, cible : Windows.
- Interface, console, docs : **français** (README.md en anglais). Pas d'émoji dans ce que voit DeoVR.
- **Jamais de secret** dans le dépôt, les tickets ou les réponses : pas de `config.json`, e-mail/mot de passe Stremio, URL d'addon, journal, rapport. Le projet n'embarque et ne recommande aucune source ni addon.
- Ne jamais affirmer qu'une fonction « marche » sans preuve : distinguer **vérifié par les tests (simulations)** de **à confirmer sur un vrai casque** (voir `docs/TESTING.md`).
- Tout correctif = un test qui échoue avant et réussit après. Chaque évolution : `CHANGELOG.md` (section *Non publié*) + docs concernées.

## Où est quoi
- `bridge/lib.js` : tout le moteur (config `cfg`, bibliothèque DeoVR, registre « En cours », téléchargements, pipeline HLS/ffmpeg, diagnostic). `bridge/server.js` : démarrage. `bridge/*.bat` : scripts Windows (CRLF).
- `docs/ARCHITECTURE.md` : le fonctionnement détaillé. `docs/CONFIGURATION.md` est **généré** (`npm run docs`) depuis les commentaires de `cfg`.
- `tests/unit` (fonctions pures), `tests/integration` (vrai pont + faux addon / faux Stremio / faux tracker, ffmpeg requis). `tests/helpers/` : les simulations.
- `scripts/` : `check.js` (contrôles statiques), `run-tests.js`, `make-release.js` (zip), `bump.js` (changement de version), `gen-config-doc.js`.

## Commandes
`npm run check` · `npm test` (unit + intégration) · `npm run build` (zip dans `dist/`, ignoré par git) · `npm run bump -- X.Y.Z` · `npm run docs`.

## Cycle de travail
Modifier → `npm run check && npm test` → push → la CI teste sous Windows et publie le **build de test** (pré-release `dev-build`, plus l'archive de l'exécution) → essai sur le casque → release en posant un tag `vX.Y.Z`. Détails : `docs/MAINTAINING.md`.

## Pièges connus
- Les `.bat` doivent rester en CRLF (`.gitattributes`, `make-release.js`).
- Texte `drawtext` d'ffmpeg : le caractère `%` doit être neutralisé (`expansion=none`).
- DeoVR : adresse nue → `/deovr` ; vignettes en paysage ; codecs Windows HEVC/H.264 ; la bascule HLS écran de chargement → film n'est confirmée que par les tests 5 et 6 sur un vrai casque.
- Les fichiers `.git/index.lock` laissés par un outil externe bloquent git : les supprimer à la main.
