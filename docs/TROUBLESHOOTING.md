# Dépannage

Commencez par `diagnose.bat` (vérifie tout et écrit `diagnostic-report.txt`), puis `RAPPORT.bat` **pendant que le pont tourne** (écrit `rapport-support.txt` avec adresses et e-mail masqués ; relisez-le avant de le partager).

| Symptôme | Cause probable | Quoi faire |
|---|---|---|
| DeoVR n'affiche rien / erreur à l'ouverture | pont non lancé, mauvais port, ou DeoVR sur un autre appareil | vérifier la fenêtre `start.bat` ; tester `http://localhost:8080/deovr` dans un navigateur du PC ; casque autonome : voir INSTALL §4 |
| Bibliothèque vide | Stremio sans addon VR, e-mail/mot de passe faux, `vrOnly` trop strict | `diagnose.bat` section 2 ; `"vrOnly": false` pour tout voir |
| « Stremio ne répond pas » | l'application Stremio n'est pas lancée | lancer Stremio ; le message disparaît tout seul |
| L'écran de chargement reste au-delà de 90 s sans donnée | aucune source vivante | choisir un film avec plus de seeders (`Plus de seeds`) ; l'écran le dit lui-même |
| « Débit insuffisant… » | le torrent est plus lent que le film | laisser charger (le téléchargement continue si vous quittez), ou choisir un autre film |
| La vidéo ne démarre pas seule après l'écran de chargement | DeoVR refuse la bascule HLS | essayer les tests 5 et 6 ; si KO : `"loadingScreen": "off"` dans `config.json`, et envoyer le rapport |
| Lecture qui saccade | débit < débit nécessaire | voir le message de l'écran de chargement ; film plus léger ; cache Stremio ; disque lent |
| Message « cache Stremio » | cache < 20 Go | Stremio → Paramètres → Streaming → Cache |
| Texte absent de l'écran de chargement | police introuvable ou ffmpeg sans `drawtext` | `diagnose.bat` ; installer un ffmpeg complet (`winget install Gyan.FFmpeg`) |
| Accents bizarres dans les titres | rendu de DeoVR | signaler avec une capture |
| Port déjà utilisé (`start.bat` s'arrête) | une autre instance tourne | fermer l'autre fenêtre ou changer `port` |
| Disque qui se remplit | copie temporaire des segments HLS dans `%TEMP%\deovr-bridge-live` | automatique sous `minFreeGB` (15 Go) ; supprimer le dossier quand le pont est arrêté |

## Fichiers de journal (dans le dossier du pont)

`bridge-debug.log` (tout), `bridge-requests.log` (requêtes de DeoVR), `bridge-decisions.log` (pourquoi tel format/tel flux), `bridge-bilans.log` (un bilan par film). Les URL d'addon y sont masquées et aucun mot de passe n'y est écrit. Relisez quand même un journal avant de le publier.

## Ouvrir un ticket

Joignez : version du pont (première ligne de `bridge-debug.log`), version de Windows/DeoVR/Stremio, `rapport-support.txt`, et décrivez ce que vous avez cliqué. Ne publiez jamais `config.json`.
