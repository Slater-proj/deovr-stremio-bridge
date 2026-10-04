# Sécurité

## Compte Stremio : ce qui est stocké

- Le **mot de passe n'est jamais enregistré** (ni dans `config.json`, ni dans les journaux, ni dans les rapports). Vous le saisissez une fois sur la page locale `http://localhost:PORT/setup` ; le pont l'envoie à l'API de Stremio, reçoit une **clé de session** (`authKey`) et oublie le mot de passe.
- La clé est enregistrée dans **`secrets.dat`** (dossier `data\` à côté de l'exe), **chiffrée avec Windows DPAPI** (portée « utilisateur courant »). Le fichier n'est lisible que par **votre compte Windows sur ce PC** : copié ailleurs ou lu par un autre utilisateur, il est inutilisable et le pont redemande simplement la connexion.
- Hors Windows (tests, Linux/macOS), la clé est écrite **non chiffrée** (fichier en mode 0600) : c'est signalé dans `/debug` (`stockage`). Ne l'utilisez pas ainsi sur une machine partagée.
- La clé donne accès à votre compte Stremio comme une session ouverte : supprimez-la avec `--logout` (ou *Se déconnecter* sur `/setup`), et déconnectez les sessions depuis le site de Stremio si l'appareil est perdu.
- Anciennes installations : un `email`/`password` présent dans `config.json` est converti au premier lancement (clé enregistrée chiffrée, mot de passe effacé du fichier). Les variables d'environnement `STREMIO_EMAIL` / `STREMIO_PASSWORD` et `authKey` restent acceptées pour l'automatisation, mais préférez `/setup`.

### Protections de la page `/setup`

Accessible **uniquement depuis le PC lui-même** (adresse source loopback), même si le pont écoute sur le réseau ; l'en-tête `Host` doit être `localhost`/`127.0.0.1` (contre le *DNS rebinding*) ; l'en-tête `Origin` est vérifié (contre le CSRF) ; un jeton aléatoire par lancement est exigé dans le formulaire ; corps limité à 8 Ko ; 5 échecs par minute au maximum ; en-têtes `Content-Security-Policy`, `Cache-Control: no-store`, `X-Frame-Options`. Tests : `tests/integration/account.test.js`.

## Ce que le pont expose

- Le pont n'écoute par défaut que sur **ce PC** (`bindHost: "127.0.0.1"`). Si vous le mettez sur `"0.0.0.0"` pour un casque autonome, il n'a **pas d'authentification** : toute machine de votre réseau local peut lister votre bibliothèque, déclencher des téléchargements et faire télécharger une adresse arbitraire (`/proxy`, `/thumb`). N'exposez jamais le port sur Internet.
- Les pages de diagnostic (`/debug/*`, `/status`, `/dev`) ne renvoient ni mot de passe, ni clé, ni URL d'addon en clair (masqués), mais elles montrent les titres de vos films, vos chemins et vos adresses locales.
- **Pages web ouvertes sur le PC** : les réponses JSON n'ont pas d'en-tête CORS (un site ne peut pas lire `/debug` ou `/status.json` depuis votre navigateur), et toute requête dont l'en-tête `Host` est un nom de domaine extérieur est refusée (403, protection contre le *DNS rebinding*). Sont acceptés : `localhost`, les adresses IP et les noms du réseau local (sans point, `.local`, `.lan`, `.home`, `.internal`, `.home.arpa`). Tests : `tests/integration/library.test.js`.
- Les journaux masquent les URL d'addon et l'e-mail. `rapport-support.txt` masque en plus l'hôte **et le chemin** de toute URL distante (une URL d'addon peut contenir une clé dans son chemin) et le nom du compte Windows dans les chemins ; relisez-le quand même avant de le publier. Ne publiez jamais `config.json` ni `secrets.dat`.

## Exécutable et logiciels tiers

- L'exe n'est **pas signé** (pas de certificat de signature de code) : SmartScreen avertit au premier lancement. Vérifiez que vous l'avez téléchargé depuis la page *Releases* de ce dépôt ; il est fabriqué par GitHub Actions à partir du code public (`BUILD-INFO.txt` donne le commit).
- Le zip embarque **ffmpeg** (licence GPL v3) comme programme séparé : voir `docs\licences\THIRD-PARTY-NOTICES.txt` et `resources\ffmpeg\LICENSE.txt`.
- Aucune dépendance npm : rien d'autre que Node.js (embarqué dans l'exe) et ffmpeg.

## Signaler une vulnérabilité

Ouvrez un signalement privé via l'onglet *Security → Report a vulnerability* du dépôt (ou contactez les mainteneurs). N'incluez pas de secret réel dans le rapport.
