# Maintenance du dépôt

Ce guide décrit le cycle de travail normal et les réglages GitHub qui rendent le dépôt solide.

## Le cycle de travail

1. **Modifier** le code dans un dossier local. Décrire le changement dans `CHANGELOG.md`, section `## [Non publié]`.
2. **Vérifier en local** : `npm run check && npm test`.
3. **Pousser** sur `main` (ou ouvrir une pull request pour un changement risqué).
4. **La CI travaille** (quelques minutes) :
   - *Tests + exe portable (Windows, Node 24)* : contrôles statiques, tests unitaires et d'intégration, puis **fabrication de l'exe** (ffmpeg pris sur l'image Windows), décompression dans un dossier neuf et **test de fumée de l'exe réel** (`scripts/smoke-exe.js`), enfin dépôt du zip comme **artefact** (14 jours) ;
   - *Archive Node* (Ubuntu, en parallèle) : fabrique le zip « version Node » et contrôle son contenu ;
   - *Pré-release dev-build* (sur `main` uniquement, si tout est vert) : met à jour la pré-release **dev-build** avec **les deux zips de l'exe** (release et debug).
5. **Tester le build de test** sur le casque : GitHub → *Releases* → **Build de test (main, …)** → télécharger `DeoVR-Stremio-Bridge-…-windows-x64-debug.zip` (exe + `utility\`) et lancer `utility\LANCER-MODE-DEV.bat`. Il contient `BUILD-INFO.txt` (version, commit, date). Pour une branche ou une pull request, prenez l'artefact : onglet *Actions* → l'exécution → *Artifacts*.
6. **Publier une version stable** quand le casque a validé :
   ```
   npm run bump -- 10.3.0        # package.json, bridge/version.js, CHANGELOG ([Non publié] devient [10.3.0])
   npm run check && npm test
   git add -A && git commit -m "v10.3.0" && git push
   git tag v10.3.0 && git push origin v10.3.0
   ```
   Le workflow *Release* vérifie que le tag correspond à `package.json`, relance les tests, fabrique l'exe et ses deux zips (**release** minimal, **debug** avec `utility\`), fait le test de fumée des deux et crée la release avec les notes du changelog. Le zip « version Node » n'est plus publié (il reste fabriqué et contrôlé par la CI, `npm run build`). Tout tourne sur Windows.

## Fabriquer l'exe soi-même (Windows)

```
npm run build:exe -- --ffmpeg-dir "C:\chemin\vers\ffmpeg\bin"   # ffmpeg.exe + ffprobe.exe ; --no-ffmpeg pour s'en passer
```

Prérequis : Node 24 (le *Single Executable Application* de Node ; sinon `postject` via `npx`, option `--postject`). Résultat dans `dist/` (ignoré par git). `--bundle-only --work <dossier>` produit seulement le script assemblé (utile pour le déboguer ; sous Linux avec `BRIDGE_APP_DIR` on peut simuler l'exe, c'est ce que font `bundle.test.js` et la simulation de `smoke-exe.js`).

## Mode développeur et paquet d'assistance

- Lancer `DeoVR-Stremio-Bridge.exe --dev` (ou `utility\LANCER-MODE-DEV.bat`, ou `"dev": true` dans `config.json`) : journaux détaillés + sortie d'ffmpeg + page `/dev`.
- `utility\RAPPORT-SUPPORT.bat` (`--report`) écrit `data\rapport-support.txt` : version, mode de stockage, état du compte (sans clé), configuration masquée, journaux récents, état des téléchargements. C'est ce fichier qu'on demande pour comprendre un problème sur un vrai casque.

## Les trois sortes d'archives

| | Où | Quand | Pour qui |
|---|---|---|---|
| Release `vX.Y.Z` | *Releases* (marquée « Latest ») | quand vous posez un tag | tout le monde (zips release et debug de l'exe) |
| Pré-release `dev-build` | *Releases* (marquée « Pre-release ») | à chaque push vert sur `main` | vos essais sur le casque (les deux zips) |
| Artefact d'exécution | *Actions* → exécution → *Artifacts* | à chaque push et pull request | branches et pull requests |

## Réglages GitHub à activer (une fois, dans l'interface)

- **Settings → Rules → Rulesets** (ou *Branches*) : protéger `main` — exiger que la CI (*Tests + exe portable (Windows, Node 24)*) soit verte avant fusion, interdire le `force push` et la suppression de la branche.
- **Settings → Code security** : activer *Dependabot alerts*, *Secret scanning* et *Push protection* (bloque un push contenant un jeton).
- **Settings → General** : *Automatically delete head branches* pour garder le dépôt propre ; décocher *Wikis* et *Projects* si inutiles.
- **Settings → Actions → General** : *Workflow permissions* peut rester en lecture seule ; le job `dev-release` et le workflow *Release* demandent eux-mêmes l'écriture.
- Dependabot ouvre **une seule pull request par mois** pour les actions GitHub : fusionnez-la quand la CI est verte.

## Quand la CI échoue

- Ouvrez l'exécution, puis le job rouge, puis l'étape en échec. Les tests d'intégration affichent le détail de l'assertion.
- Reproduire en local : `npm test` (ffmpeg requis). Le test peut être instable sur une machine lente : relancez le job une fois (*Re-run failed jobs*) ; s'il échoue deux fois, c'est un vrai défaut.
- Un test qui n'échoue qu'en CI doit être rendu déterministe (attendre un état plutôt qu'un délai), pas ignoré.
