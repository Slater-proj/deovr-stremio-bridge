# Tests

## Automatiques (CI)

```bash
npm run check          # syntaxe, JSON, secrets, fichiers locaux, doc de configuration à jour
npm run test:unit      # fonctions pures : formats, VR, tampon, états, scrape UDP, config
npm run test:integration   # le vrai pont + faux addon + faux Stremio + faux tracker (ffmpeg requis)
npm test               # tout
npm run build          # dist/deovr-stremio-bridge-vX.Y.Z.zip
```

Les tests d'intégration lancent `node bridge/server.js` dans un dossier temporaire (`BRIDGE_DATA_DIR`) avec des ports aléatoires, branché sur des simulations (`tests/helpers/mocks.js`) : addon avec 3 catalogues, serveur de streaming qui simule `create` / `stats.json` / `remove` / lecture Range à débit réglable (film rapide, lent ou « mort »), tracker UDP BEP 15. Ils vérifient notamment : ordre des onglets, déclaration VR, pastilles identiques liste/fiche, **aucun téléchargement avant le clic**, bascule écran de chargement → film (durée conservée), film sans source, texte de l'écran de chargement (régression `%`), tests 5/6, **reprise après plantage de ffmpeg**, **élagage disque**, **budget de cache**, **Stremio arrêté**, vignettes 16:9, absence de secrets dans les pages de diagnostic.

Sans ffmpeg, les tests qui en ont besoin sont ignorés (marqués *skipped*).

## Sur un vrai casque (ce que la CI ne peut pas prouver)

Faites-le après chaque mise à jour importante ; notez le résultat dans votre ticket.

1. **Bascule HLS** : onglet *Test pont* → *Test 5* puis *Test 6* (attendre 30 s entre les deux). Attendu : écran de chargement ~12 s, puis la vidéo de test démarre seule. Journal : « test de bascule … BASCULE RÉUSSIE ».
2. **Deeplinks** : ouvrez `http://localhost:8080/t` (en entier) dans le navigateur de DeoVR et cliquez les liens A, C, D, E, F ; `/debug/perf` → `ouverturesTest` indique ceux qui ont ouvert le lecteur.
3. **Adresse nue** : tapez `http://localhost:8080` ; `/debug/perf` → `racine` montre ce que DeoVR a demandé (`/deovr` attendu).
4. **Vrai film** : lancez un film avec des seeders, quittez avant la fin, rouvrez DeoVR : il doit être dans *En cours*. `RAPPORT.bat` pendant que le pont tourne.
5. **Vignettes et accents** : les affiches sont-elles en paysage ? Les accents et le « · » s'affichent-ils dans les titres ?

## Ajouter un test

Un test d'intégration = `tests/integration/*.test.js`, avec `startMocks` + `startBridge` (voir les existants). Les tests doivent être déterministes : attendre un état (`bridge.waitFor`) plutôt qu'un délai fixe.
