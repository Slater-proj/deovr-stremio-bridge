# Installation (Windows 10/11)

Deux façons de l'obtenir. **Prenez l'exe portable** sauf si vous voulez lire ou modifier le code.

| | Exe portable (recommandé) | Version Node.js (développeurs) |
|---|---|---|
| Obtenir | zip `DeoVR-Stremio-Bridge-vX.Y.Z-windows-x64.zip` de la page *Releases* | `git clone` + `npm run build`, ou `node bridge/server.js` |
| Node.js / ffmpeg à installer | **non** (embarqués) | oui (`INSTALL.bat` s'en charge avec winget) |
| Lancement | `DeoVR-Stremio-Bridge.exe` | `start.bat` |
| Réglages | `config.json` à côté de l'exe (créé au 1er lancement) | `config.json` dans le dossier du code |

## 1. Prérequis (les deux versions)

1. **Stremio** (application de bureau) installé et connecté, avec **au moins un addon** qui propose des films VR. Le pont n'en fournit aucun.
2. **Cache Stremio** : *Paramètres → Streaming → Cache* sur **illimité** ou **≥ 20 Go**. Les films VR font 5 à 60 Go ; un petit cache oblige Stremio à effacer ce qu'il vient de télécharger. Le pont lit ce réglage, vous avertit s'il est trop petit et limite alors le nombre de films téléchargés en parallèle.
3. **DeoVR** (version PC, Steam).

## 2. Exe portable

1. Téléchargez `DeoVR-Stremio-Bridge-vX.Y.Z-windows-x64.zip` depuis la page [Releases](../../../releases) et décompressez-le où vous voulez (pas dans `Program Files`, le pont écrit dans son dossier).
2. Lancez **Stremio**, puis double-clic sur **`DeoVR-Stremio-Bridge.exe`**.
   - Windows SmartScreen peut afficher « Windows a protégé votre ordinateur » : l'exe n'est pas signé. *Informations complémentaires → Exécuter quand même*.
   - La fenêtre noire est la console du pont (adresses, journaux). La fermer arrête le pont.
3. **Première fois** : un fichier `config.json` apparaît à côté de l'exe (vos réglages) et votre navigateur s'ouvre sur `http://localhost:4477/setup`. Saisissez e-mail et mot de passe Stremio **une fois**. Le mot de passe sert à obtenir une clé de session puis est oublié ; la clé est enregistrée chiffrée par Windows (voir [SECURITY.md](../SECURITY.md)).
4. Dans le navigateur de DeoVR, tapez `http://localhost:4477` (ou le port de votre `config.json`).

### Le contenu du zip

```
DeoVR-Stremio-Bridge\
  DeoVR-Stremio-Bridge.exe
  config.json               apparaît au premier lancement : port, bindHost, platform, vrOnly, dossiers locaux…
  docs\                     GUIDE-RAPIDE.txt, licences (+ DEBUG.txt dans le zip « debug »)
  resources\                ffmpeg et vidéos de test, fournis avec l'exe
  utility\                  (zip « debug » seulement) outils : mode développeur, rapport d'assistance, diagnostic, pare-feu…
  data\                     apparaît au premier lancement : clé Stremio chiffrée, journaux, état, temporaires
```

Deux zips existent : **release** (exe + `resources` + `docs`, le strict nécessaire) et **debug** (le même plus `utility\` et `docs\DEBUG.txt`, pour les essais et le dépannage). L'exe est identique ; le mode développeur s'obtient aussi sans le zip debug avec `DeoVR-Stremio-Bridge.exe --dev` ou `"dev": true` dans `config.json`.

### Changer le port

Par défaut **4477** (8080 est utilisé par beaucoup de logiciels). Pour le changer : éditez `"port"` dans `config.json` puis relancez ; ou ponctuellement `DeoVR-Stremio-Bridge.exe --port 4600`. Mettez à jour l'adresse tapée dans DeoVR.

### Où sont les fichiers ?

Tout est dans le dossier de l'exe : `config.json` (réglages, à éditer), `data\` (ce que le pont écrit, supprimable), `resources\` (fourni). Si le dossier n'est pas inscriptible (ex. `Program Files`), le pont se rabat sur `%APPDATA%\DeoVR-Stremio-Bridge` pour les données et l'écrit dans la console. Pour imposer un autre dossier de données : `--data-dir D:\mon\dossier` ou la variable `BRIDGE_DATA_DIR`.

**Désinstaller = supprimer le dossier.** Rien n'est écrit ailleurs (hors raccourci de démarrage automatique et règle de pare-feu si vous les avez créés avec `utility\`).

## 3. Version Node.js

1. Fabriquez le zip avec `npm run build` (il n'est plus publié dans les releases) et décompressez `dist/deovr-stremio-bridge-vX.Y.Z.zip`, ou lancez directement `node bridge/server.js` depuis le dépôt.
2. Double-clic sur **`INSTALL.bat`** : installe Node.js 20+ et ffmpeg avec *winget* s'ils manquent (fermez puis relancez après l'installation de Node), propose le diagnostic.
3. Lancez Stremio, puis **`start.bat`** : la fenêtre affiche les adresses ; si le pont s'arrête, il est relancé après 5 s. Au premier lancement le navigateur s'ouvre sur la page de connexion.
4. Dans DeoVR : `http://localhost:4477`.

## 4. Casque autonome (Quest sans PC…)

`localhost` ne fonctionne que pour DeoVR sur le même PC. Pour un autre appareil : utilisez l'adresse IP du PC affichée au démarrage, lancez une fois `utility\PARE-FEU.bat` (zip debug) en administrateur (ouvre le port en réseau privé), ou autorisez l'exe dans le pare-feu Windows, et mettez `"platform": "quest"` dans `config.json` si vous voulez que MKV/AV1/VP9 soient proposés directement. Le chemin « casque autonome » n'est pas couvert par les tests : les retours sont bienvenus.

Pour n'autoriser que le PC local (plus sûr), mettez `"bindHost": "127.0.0.1"`. La page de connexion `/setup` n'est de toute façon accessible que depuis le PC lui-même.

## 5. Mise à jour

Exe portable : décompressez la nouvelle version, **copiez-y votre `config.json` et le dossier `data\`** (la clé chiffrée est relue telle quelle tant que c'est le même compte Windows sur le même PC), lancez l'exe. Un ancien `data\config.json` est encore lu s'il n'y a pas de `config.json` à côté de l'exe. Version Node : même principe avec `config.json` et `secrets.dat`. Journaux et état (`bridge-*.log`, `bridge-state.json`, `tmp\`) peuvent être supprimés sans risque.

Une ancienne installation avec e-mail/mot de passe dans `config.json` est migrée au premier lancement : une clé est obtenue, enregistrée chiffrée, et le mot de passe est effacé du fichier.

## 6. Désinstallation

Lancez `utility\DEMARRAGE-AUTO-RETIRER.bat` si vous aviez le démarrage automatique, supprimez la règle de pare-feu « DeoVR Stremio Bridge » si vous aviez lancé `PARE-FEU.bat`, puis supprimez le dossier. Pour seulement oublier votre compte : `DeoVR-Stremio-Bridge.exe --logout`.
