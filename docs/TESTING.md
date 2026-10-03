# Tests

## Automatiques (CI)

```bash
npm run check          # syntaxe, JSON, secrets, fichiers locaux, doc de configuration à jour
npm run test:unit      # fonctions pures : formats, VR, tampon, états, scrape UDP, config
npm run test:integration   # le vrai pont + faux addon + faux Stremio + faux tracker (ffmpeg requis)
npm test               # tout
npm run build          # dist/deovr-stremio-bridge-vX.Y.Z.zip (version Node)
npm run build:exe      # dist/DeoVR-Stremio-Bridge-vX.Y.Z-windows-x64.zip (exe portable ; Windows, ffmpeg via --ffmpeg-dir)
npm run smoke -- <dossier décompressé>   # lance l'exe fabriqué et vérifie le parcours
```

Les tests d'intégration lancent `node bridge/server.js` dans un dossier temporaire (`BRIDGE_DATA_DIR`) avec des ports aléatoires, branché sur des simulations (`tests/helpers/mocks.js`) : addon avec 3 catalogues, serveur de streaming qui simule `create` / `stats.json` / `remove` / lecture Range à débit réglable (film rapide, lent ou « mort »), tracker UDP BEP 15. Ils vérifient notamment : ordre des onglets, déclaration VR, pastilles identiques liste/fiche, **aucun téléchargement avant le clic**, bascule écran de chargement → film (durée conservée), film sans source, texte de l'écran de chargement (régression `%`), tests 5/6, **reprise après plantage de ffmpeg**, **élagage disque**, **budget de cache**, **Stremio arrêté**, vignettes 16:9, absence de secrets dans les pages de diagnostic.

**Compte et exe** : `account.test.js` (page `/setup` et ses protections, absence de mot de passe dans tous les fichiers, persistance de la clé après redémarrage, déconnexion, migration d'un ancien `config.json`, clé périmée) ; `bundle.test.js` (le script assemblé se comporte comme le source) ; tests unitaires de `paths`, `secrets` (le chiffrement DPAPI n'est testé que sous Windows, donc en CI ; un `secrets.dat` illisible compte comme « non connecté ») et de la ligne de commande (dont `--report`, qui ne doit pas toucher aux journaux du pont en marche et masque l'hôte et le chemin des URL ainsi que le nom du compte Windows).

**Robustesse** : `catalogs.test.js` (catalogue d'addon lent rechargé en arrière-plan), `dns.test.js` (addon hébergé sur le réseau local), films « morts au clic » (`state.test.js`), oubli des données périmées (`util.test.js`), en-tête `Host` extérieur refusé et absence de CORS (`library.test.js`).

**Dans la CI Windows** le job fabrique réellement l'exe, le décompresse dans un dossier neuf, puis `scripts/smoke-exe.js` le lance : fichiers présents, `--version`/`--help`, ffmpeg embarqué, aucun dossier `data` avant le premier lancement, démarrage en `--dev`, `/status.json`, chemins (`data` à côté de l'exe), formulaire `/setup`, bibliothèque, bascule écran de chargement → film, `--report`, rien écrit dans `%APPDATA%`, `--logout`. L'exe testé est exactement celui qui est publié.

Sans ffmpeg, les tests qui en ont besoin sont ignorés (marqués *skipped*).

## Sur un vrai casque (ce que la CI ne peut pas prouver)

Faites-le après chaque mise à jour importante ; notez le résultat dans votre ticket.

1. **Bascule HLS** : onglet *Test pont* → *Test 5* puis *Test 6* (attendre 30 s entre les deux). Attendu : écran de chargement ~12 s, puis la vidéo de test démarre seule (confirmé au casque pour le H.264). Journal : « test de bascule … BASCULE RÉUSSIE ». Les *Labos 1 à 16* (même onglet) répondent à des questions précises sur le lecteur (HEVC, fMP4, MKV, déclaration du format, bascule HEVC, zapping) ; `/debug/labo` donne leur verdict et dit si chaque scène est prête (13 et 16 sont fabriquées en dernier, environ 3 min après le démarrage).

Les tests automatiques fixent `BRIDGE_LAB_PREPARE=0` : le banc de test n'est alors fabriqué qu'au premier clic, ce qui évite d'encoder du HEVC dans chaque pont lancé par les tests.
2. **Deeplinks** : ouvrez `http://localhost:4477/t` (en entier) dans le navigateur de DeoVR et cliquez les liens A, C, D, E, F, **G** (lien `deovr://` vers la bibliothèque : doit afficher la liste native de DeoVR) ; `/debug/perf` → `ouverturesTest` indique ceux qui ont ouvert le lecteur.
3. **Adresse nue** : tapez `http://localhost:4477` ; `/debug/perf` → `racine` montre ce que DeoVR a demandé (`/deovr` attendu).
4. **Vrai film** : lancez un film avec des seeders, quittez avant la fin, rouvrez DeoVR : il doit être dans *En cours*. `utility\RAPPORT-SUPPORT.bat` (zip debug ; ou `DeoVR-Stremio-Bridge.exe --report`) pendant que le pont tourne.
5. **Vignettes et accents** : les affiches sont-elles en paysage ? Les accents et le « · » s'affichent-ils dans les titres ?

## Procédure idéale pour remonter un problème (ce qui permet de corriger vite)

1. **Utiliser le zip *debug*** (outils dans `utility\`) ; lancer le pont normalement (ou `LANCER-MODE-DEV.bat` pour les journaux détaillés). Ne pas le fermer avant l'étape 4.
2. **Faire un scénario court et noter l'heure** : ouvrir la bibliothèque dans DeoVR, lancer *un film à la fois* (un H.264, un HEVC si possible), quitter, revenir, ouvrir *En cours*. Si un film pose problème, le relancer une fois (le bilan distingue clic n°1 et n°2).
3. **Noter, pour chaque film**, en une ligne : le titre (ou le début), ce qui est visible (écran de chargement lisible ? la vidéo démarre seule ? message « relancez » ? image juste, taille, relief ? menu FLAT/180/360 présent ?), l'heure approximative, et l'espace disque libre si Stremio ou le pont semblent bloqués.
4. **Tout de suite après, pont toujours lancé** : `utility\RAPPORT-SUPPORT.bat` (ou `DeoVR-Stremio-Bridge.exe --report`). Il écrit `data\rapport-support.txt` : version, réglages (secrets masqués), état de chaque film cliqué avec sa chronologie, bilans, banc de test, disque.
5. **M'envoyer** : `data\rapport-support.txt` (le plus important) + `data\bridge-requests.log` (ce que DeoVR a demandé, à la milliseconde) + vos notes de l'étape 3. En cas de plantage ou de comportement bizarre du pont lui-même : aussi `data\bridge-debug.log` (mode développeur). Jamais `config.json` ni `secrets.dat`.
6. **Si un Labo est en cause** : indiquer son numéro et ce que vous voyez ; son verdict est dans le rapport (`/debug/labo`).

## Ajouter un test

Un test d'intégration = `tests/integration/*.test.js`, avec `startMocks` + `startBridge` (voir les existants). Les tests doivent être déterministes : attendre un état (`bridge.waitFor`) plutôt qu'un délai fixe.
