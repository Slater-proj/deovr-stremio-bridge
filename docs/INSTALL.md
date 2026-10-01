# Installation (Windows 10/11)

## 1. Prérequis

1. **Stremio** (application de bureau) installé, connecté à votre compte, avec **au moins un addon** qui propose des films VR. Le pont n'en fournit aucun.
2. **Cache Stremio** : *Paramètres → Streaming → Cache* sur **illimité** ou **≥ 20 Go**. Les films VR font 5 à 60 Go ; un petit cache oblige Stremio à effacer ce qu'il vient de télécharger. Le pont lit ce réglage, vous avertit s'il est trop petit et limite alors le nombre de films téléchargés en parallèle.
3. **DeoVR** (version PC, Steam).
4. **Node.js 20 ou plus** et **ffmpeg** : `INSTALL.bat` les installe avec *winget* s'ils manquent (fermez puis relancez `INSTALL.bat` après l'installation de Node).

## 2. Installer le pont

1. Téléchargez `deovr-stremio-bridge-vX.Y.Z.zip` depuis la page [Releases](../../../releases), décompressez-le dans un dossier de votre choix (pas dans `Program Files`).
2. Double-clic sur **`INSTALL.bat`**. L'assistant demande :
   - votre e-mail et mot de passe **Stremio** (utilisés uniquement pour lire la liste de vos addons ; ils restent dans `config.json`, en clair, sur votre PC) ;
   - le port du pont (8080 par défaut) ;
   - un dossier de vidéos VR locales (facultatif → onglet « Mes vidéos »).
3. Le script propose de lancer le diagnostic (`diagnose.bat`) : acceptez, il vérifie Node, ffmpeg, Stremio, vos addons et l'accès aux trackers.

## 3. Lancer

1. Démarrez **Stremio** (son serveur de streaming démarre avec lui).
2. Double-clic sur **`start.bat`** : la fenêtre affiche les adresses à utiliser. Si le pont s'arrête, `start.bat` le relance après 5 s ; fermez la fenêtre pour l'arrêter.
3. Facultatif : **`DEMARRAGE-AUTO.bat`** ajoute un raccourci dans le dossier *Démarrage* de Windows (le pont se lance à l'ouverture de session) ; `DEMARRAGE-AUTO-RETIRER.bat` l'enlève.
4. Dans DeoVR, ouvrez le navigateur intégré et tapez `http://localhost:8080` (votre port).

## 4. Casque autonome (Quest sans PC…)

`localhost` ne fonctionne que pour DeoVR sur le même PC. Pour un autre appareil : utilisez l'adresse IP du PC affichée au démarrage, lancez une fois `PARE-FEU.bat` en administrateur (ouvre le port en réseau privé), et mettez `"platform": "quest"` dans `config.json` si vous voulez que MKV/AV1/VP9 soient proposés directement. Le chemin « casque autonome » n'est pas couvert par les tests : les retours sont bienvenus.

Pour n'autoriser que le PC local (plus sûr), mettez `"bindHost": "127.0.0.1"`.

## 5. Mise à jour

Décompressez la nouvelle version dans un **nouveau dossier**, copiez-y votre `config.json`, lancez `start.bat`. Vos journaux et l'état (`bridge-*.log`, `bridge-state.json`) peuvent être supprimés sans risque.

## 6. Désinstallation

Supprimez le dossier, lancez `DEMARRAGE-AUTO-RETIRER.bat` avant si vous aviez le démarrage automatique, et supprimez la règle de pare-feu « DeoVR Stremio Bridge » si vous aviez lancé `PARE-FEU.bat`. Les dossiers temporaires `deovr-bridge-*` de `%TEMP%` peuvent être effacés.
