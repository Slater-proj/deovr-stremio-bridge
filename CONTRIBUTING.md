# Contribuer

Merci ! Quelques règles simples :

- **Aucune dépendance d'exécution** : le pont doit rester un dossier de `.js` lançable avec Node seul. Les outils de dev sont aussi sans dépendance (`node:test`).
- Avant une PR : `npm run check && npm test`. Si vous changez les commentaires/valeurs de `cfg` dans `bridge/lib.js`, lancez `npm run docs` (régénère `docs/CONFIGURATION.md`).
- Tout correctif de bug s'accompagne d'un test qui échoue avant et réussit après.
- **Jamais de secret** : pas de `config.json`, d'e-mail, de mot de passe, d'URL d'addon, de journal ni de rapport dans le dépôt, les tickets ou les PR (`npm run check` le contrôle en partie).
- Le projet **n'embarque aucune source ni addon** et n'en recommande pas : n'en ajoutez pas dans le code, les tests ou la doc.
- Fichiers `.bat` : fins de ligne CRLF (géré par `.gitattributes` et par `scripts/make-release.js`).
- Messages de la console et de l'écran de chargement : en français pour l'instant ; une internationalisation serait bienvenue (ouvrez un ticket avant de commencer).

## Environnement de dev

```bash
node --version   # >= 20
ffmpeg -version  # pour les tests d'intégration et la fabrication de l'écran de chargement
npm test
```

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) pour s'y retrouver dans `bridge/lib.js`.

## Publier une version (mainteneurs)

1. Mettre à jour `version` dans `package.json`, `VERSION` dans `bridge/lib.js` (ex. `'10.3'`) et `CHANGELOG.md`.
2. `git tag vX.Y.Z && git push --tags` : le workflow *Release* teste, fabrique le zip et crée la release GitHub.
