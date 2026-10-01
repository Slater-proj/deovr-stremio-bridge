# Sécurité

## Ce que le pont stocke et expose

- `config.json` contient votre **e-mail et mot de passe Stremio en clair** (nécessaires pour lire la liste de vos addons). Il reste sur votre PC, est exclu du dépôt (`.gitignore`) et des archives de release. Protégez le dossier du pont comme vous protégez le mot de passe lui-même. Alternative : `authKey` (clé d'authentification Stremio) ou variables d'environnement.
- Le pont écoute par défaut sur **toutes les interfaces** (`bindHost: "0.0.0.0"`) pour que d'autres appareils du réseau local (casque autonome) puissent l'utiliser. Il n'a **pas d'authentification** : toute machine de votre réseau local peut lister votre bibliothèque et déclencher des téléchargements. Sur un PC VR seul, mettez `"bindHost": "127.0.0.1"`. N'exposez jamais le port sur Internet.
- Les pages de diagnostic (`/debug/*`, `/status`) ne renvoient ni mot de passe ni URL d'addon en clair (masqués), mais elles montrent les titres de vos films et vos adresses locales.
- Les journaux et `rapport-support.txt` masquent adresses et e-mail ; relisez-les avant de les publier.

## Signaler une vulnérabilité

Ouvrez un signalement privé via l'onglet *Security → Report a vulnerability* du dépôt (ou contactez les mainteneurs). N'incluez pas de secret réel dans le rapport.
