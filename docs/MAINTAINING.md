# Maintenance du dépôt

Ce guide décrit le cycle de travail normal et les réglages GitHub qui rendent le dépôt solide.

## Le cycle de travail

1. **Modifier** le code dans un dossier local. Décrire le changement dans `CHANGELOG.md`, section `## [Non publié]`.
2. **Vérifier en local** : `npm run check && npm test`.
3. **Pousser** sur `main` (ou ouvrir une pull request pour un changement risqué).
4. **La CI travaille** (environ 4 minutes) :
   - *Tests (Windows, Node 24)* : contrôles statiques + tests unitaires et d'intégration ;
   - *Archive de test* : fabrique le zip, contrôle son contenu et le publie comme **artefact** de l'exécution (14 jours) ;
   - *Pré-release dev-build* (sur `main` uniquement, si tout est vert) : met à jour la pré-release **dev-build**.
5. **Tester le build de test** sur le casque : GitHub → *Releases* → **Build de test (main, …)** → télécharger le zip. Il contient `BUILD-INFO.txt` (version, commit, date). Pour une branche ou une pull request, prenez l'artefact : onglet *Actions* → l'exécution → *Artifacts*.
6. **Publier une version stable** quand le casque a validé :
   ```
   npm run bump -- 10.3.0        # package.json, lib.js, CHANGELOG ([Non publié] devient [10.3.0])
   npm run check && npm test
   git add -A && git commit -m "v10.3.0" && git push
   git tag v10.3.0 && git push origin v10.3.0
   ```
   Le workflow *Release* vérifie que le tag correspond à `package.json`, relance les tests, fabrique le zip et crée la release avec les notes du changelog.

## Les trois sortes d'archives

| | Où | Quand | Pour qui |
|---|---|---|---|
| Release `vX.Y.Z` | *Releases* (marquée « Latest ») | quand vous posez un tag | tout le monde |
| Pré-release `dev-build` | *Releases* (marquée « Pre-release ») | à chaque push vert sur `main` | vos essais sur le casque |
| Artefact d'exécution | *Actions* → exécution → *Artifacts* | à chaque push et pull request | branches et pull requests |

## Réglages GitHub à activer (une fois, dans l'interface)

- **Settings → Rules → Rulesets** (ou *Branches*) : protéger `main` — exiger que la CI (*Tests (Windows, Node 24)*) soit verte avant fusion, interdire le `force push` et la suppression de la branche.
- **Settings → Code security** : activer *Dependabot alerts*, *Secret scanning* et *Push protection* (bloque un push contenant un jeton).
- **Settings → General** : *Automatically delete head branches* pour garder le dépôt propre ; décocher *Wikis* et *Projects* si inutiles.
- **Settings → Actions → General** : *Workflow permissions* peut rester en lecture seule ; le job `dev-release` et le workflow *Release* demandent eux-mêmes l'écriture.
- Dependabot ouvre **une seule pull request par mois** pour les actions GitHub : fusionnez-la quand la CI est verte.

## Quand la CI échoue

- Ouvrez l'exécution, puis le job rouge, puis l'étape en échec. Les tests d'intégration affichent le détail de l'assertion.
- Reproduire en local : `npm test` (ffmpeg requis). Le test peut être instable sur une machine lente : relancez le job une fois (*Re-run failed jobs*) ; s'il échoue deux fois, c'est un vrai défaut.
- Un test qui n'échoue qu'en CI doit être rendu déterministe (attendre un état plutôt qu'un délai), pas ignoré.
