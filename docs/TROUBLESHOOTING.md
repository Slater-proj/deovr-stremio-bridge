# Dépannage

Commencez par `utility\DIAGNOSTIC.bat` (zip debug ; ou `DeoVR-Stremio-Bridge.exe --diagnose` ; `diagnose.bat` dans la version Node) : il vérifie tout et écrit `diagnostic-report.txt`. Puis `utility\RAPPORT-SUPPORT.bat` (ou `--report` ; `RAPPORT.bat` en version Node) **pendant que le pont tourne** : il écrit `rapport-support.txt` avec adresses et e-mail masqués ; relisez-le avant de le partager.

**Pour une enquête (ou pour m'aider à corriger) : lancez en mode développeur** (`utility\LANCER-MODE-DEV.bat`, ou `DeoVR-Stremio-Bridge.exe --dev`, ou `"dev": true` dans `config.json`), refaites le geste qui pose problème, puis le rapport d'assistance. Le mode dev ajoute la sortie d'ffmpeg et la page `http://localhost:4477/dev`.

| Symptôme | Cause probable | Quoi faire |
|---|---|---|
| DeoVR n'affiche rien / erreur à l'ouverture | pont non lancé, mauvais port, ou DeoVR sur un autre appareil | vérifier la fenêtre `start.bat` ; tester `http://localhost:4477/deovr` dans un navigateur du PC ; casque autonome : voir INSTALL §4 |
| Bibliothèque vide / « Connexion Stremio requise » | pas connecté, session expirée, Stremio sans addon VR, `vrOnly` trop strict | ouvrir `http://localhost:4477/setup` sur le PC et se reconnecter ; diagnostic section 2 ; `"vrOnly": false` pour tout voir |
| « Stremio ne répond pas » | l'application Stremio n'est pas lancée | lancer Stremio ; le message disparaît tout seul |
| L'écran de chargement reste au-delà de 90 s sans donnée | aucune source vivante | choisir un film avec plus de seeders (`Plus de seeds`) ; l'écran le dit lui-même |
| « Débit insuffisant… » | le torrent est plus lent que le film | laisser charger (le téléchargement continue si vous quittez), ou choisir un autre film |
| L'écran de chargement dit « PRÊT, appuyez sur RETOUR puis relancez le film » | film HEVC : le lecteur de DeoVR ne le lit pas dans un flux HLS | normal : Retour, puis relancer le film (lecture directe immédiate) |
| La vidéo ne démarre pas seule après l'écran de chargement | DeoVR refuse la bascule HLS | essayer les tests 5 et 6 et le banc de test (Labo 1 à 6, `/debug/labo`) ; si KO : `"loadingScreen": "off"` dans `config.json`, et envoyer le rapport |
| Le lecteur tourne sans fin / « recommence » à 15 s | flux que le décodeur du lecteur ne démarre pas (HEVC dans du HLS) | voir le bilan du film (`ouvertures_du_flux_a_s`) et `/debug/labo` ; ne pas forcer `hevcDirect: false` |
| La liste ne se met pas à jour dans DeoVR | DeoVR garde la bibliothèque en mémoire | revenir à la page des sites puis rouvrir le pont |
| Pas de menu latéral ni de barre de recherche | la liste native de DeoVR n'en a pas | navigateur de DeoVR : `http://localhost:4477/ui` ou `/s/mot` (fiche « Mode d'emploi » dans l'onglet Test pont) |
| Lecture qui saccade | débit < débit nécessaire | voir le message de l'écran de chargement ; film plus léger ; cache Stremio ; disque lent |
| Message « cache Stremio » | cache < 20 Go | Stremio → Paramètres → Streaming → Cache |
| Texte absent de l'écran de chargement | police introuvable ou ffmpeg sans `drawtext` | `diagnose.bat` ; installer un ffmpeg complet (`winget install Gyan.FFmpeg`) |
| Accents bizarres dans les titres | rendu de DeoVR | signaler avec une capture |
| Port déjà utilisé (le pont s'arrête) | une autre instance tourne | fermer l'autre fenêtre ou `--port 4478` / `port` dans `config.json` |
| Windows SmartScreen bloque l'exe | exe non signé | *Informations complémentaires → Exécuter quand même* |
| Le pont redemande la connexion après avoir déplacé le dossier | `secrets.dat` est chiffrée pour un compte Windows sur un PC | normal : se reconnecter une fois sur `/setup` |
| Console : « dossier de l'exe en lecture seule : repli sur %APPDATA% » | exe placé dans un dossier protégé | déplacer le dossier (ex. `D:\Outils`) ou accepter le repli |
| Disque qui se remplit | copie temporaire des segments HLS dans `data\tmp\live` | automatique sous `minFreeGB` (15 Go) ; supprimer `data\tmp` quand le pont est arrêté |

## Fichiers de journal (dossier `data\` ; à côté du code en version Node)

`bridge-debug.log` (tout), `bridge-requests.log` (requêtes de DeoVR), `bridge-decisions.log` (pourquoi tel format/tel flux), `bridge-bilans.log` (un bilan par film). Les URL d'addon y sont masquées et aucun mot de passe n'y est écrit. Relisez quand même un journal avant de le publier.

## Ouvrir un ticket

Joignez : version du pont (affichée au démarrage et dans `rapport-support.txt`), version de Windows/DeoVR/Stremio, `rapport-support.txt`, et décrivez ce que vous avez cliqué. Ne publiez jamais `config.json` ni `secrets.dat`.
