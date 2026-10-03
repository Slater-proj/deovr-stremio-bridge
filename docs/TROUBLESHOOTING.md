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
| La vidéo ne démarre pas seule après l'écran de chargement | DeoVR refuse la bascule HLS | essayer les tests 5 et 6 et le banc de test (Labo 1 à 16, `/debug/labo`) ; si KO : `"loadingScreen": "off"` dans `config.json`, et envoyer le rapport |
| Le lecteur tourne sans fin / « recommence » à 15 s | flux que le décodeur du lecteur ne démarre pas (HEVC dans du HLS) | voir le bilan du film (`ouvertures_du_flux_a_s`) et `/debug/labo` ; ne pas forcer `hevcDirect: false` |
| Pas de choix FLAT / 180 / 360 / fisheye dans le lecteur | la fiche déclare le format : DeoVR cache alors son sélecteur (mesuré) | `"formatMenu": "free"` dans `config.json` (menu toujours là, image côte à côte brute jusqu'à votre choix, retenu par film) ; `"auto"` (défaut) ne déclare que si le titre dit le format |
| « DISQUE PLEIN » sur l'écran de chargement ou dans *En cours* | moins de 1 Go libre (`minFreeCriticalGB`) sur le disque du cache Stremio ou du dossier temporaire (les clics sont acceptés jusque-là ; à ce seuil le pont arrête les téléchargements et supprime ses fichiers temporaires) | libérer de la place, vider le cache de Stremio ; les téléchargements reprennent au clic suivant. `/debug/perf` → `disque.pont` donne la place prise par le pont |
| Texte de l'écran de chargement trop grand ou trop petit en VR | taille par défaut | `"loaderTextScale"` dans `config.json` (0.7 plus petit, 1.3 plus grand) |
| La liste ne se met pas à jour dans DeoVR | DeoVR garde la bibliothèque en mémoire | revenir à la page des sites puis rouvrir le pont |
| Pas de menu latéral ni de barre de recherche | la liste native de DeoVR n'en a pas | navigateur de DeoVR : `http://localhost:4477/ui` ou `/s/mot` (fiche « Mode d'emploi » dans l'onglet Test pont) |
| Lecture qui saccade | débit < débit nécessaire | voir le message de l'écran de chargement ; film plus léger ; cache Stremio ; disque lent |
| Téléchargement très lent malgré la fibre (« tampon 90 s » mais pas de lecture) | le torrent a peu de pairs qui envoient : un film 8K de 64 Go à 118 Mbit/s demande ~15 Mo/s ; avec 1,5 Mo/s le pont attend jusqu'à `min(patientMaxMin, maxAheadMin − 1)` minutes d'avance pour éviter les coupures | un seul film à la fois ; préférer un fichier plus léger (6K de quelques Go) ; comparer avec la même vidéo dans l'appli Stremio ; un VPN sans port ouvert donne peu de pairs. Lancer plus tôt ne servirait à rien : au-delà du tampon, la lecture gèlerait aussitôt |
| `[ÉCHEC · aucune donnée]` sur un film annoncé avec des seeders | au dernier clic, ni métadonnée ni octet en 90 s : seeders comptés par les trackers publics mais injoignables (souvent un torrent d'un tracker privé, sans tracker fourni par l'addon) | choisir un autre film ; il revient dans *Plus de seeds* après 2 h |
| « Adresse refusée » (403) dans le navigateur | l'adresse tapée est un nom de domaine extérieur (protection contre le *DNS rebinding*) | utiliser `http://localhost:4477` ou l'adresse IP du PC |
| Message « cache Stremio » | cache < 20 Go | Stremio → Paramètres → Streaming → Cache |
| Texte absent de l'écran de chargement | police introuvable ou ffmpeg sans `drawtext` | `diagnose.bat` ; installer un ffmpeg complet (`winget install Gyan.FFmpeg`) |
| Accents bizarres dans les titres | rendu de DeoVR | signaler avec une capture |
| Port déjà utilisé (le pont s'arrête) | une autre instance tourne | fermer l'autre fenêtre ou `--port 4478` / `port` dans `config.json` |
| Windows SmartScreen bloque l'exe | exe non signé | *Informations complémentaires → Exécuter quand même* |
| Le pont redemande la connexion après avoir déplacé le dossier | `secrets.dat` est chiffrée pour un compte Windows sur un PC | normal : la page `/setup` s'ouvre au démarrage, se reconnecter une fois |
| Console : « dossier de l'exe en lecture seule : repli sur %APPDATA% » | exe placé dans un dossier protégé | déplacer le dossier (ex. `D:\Outils`) ou accepter le repli |
| Disque qui se remplit | copie temporaire des segments HLS dans `data\tmp\live` (au plus `maxAheadMB` = 1 Go d'avance par film, supprimée à la pause du film et, après un arrêt brutal, au prochain démarrage du pont) | automatique sous `minFreeGB` (15 Go) ; supprimer `data\tmp` quand le pont est arrêté ; placer le dossier du pont (ou `tempDir`) et le cache de Stremio sur un disque qui a de la place |
| Catalogues d'un addon lents (« trop lent(s) ou en panne ») | addon externe lent | le pont les recharge tout seul en arrière-plan : ils apparaissent au prochain affichage (« chargé (addon lent) » dans le journal) |

## Fichiers de journal (dossier `data\` ; à côté du code en version Node)

`bridge-debug.log` (tout), `bridge-requests.log` (requêtes de DeoVR), `bridge-decisions.log` (pourquoi tel format/tel flux), `bridge-bilans.log` (un bilan par film). Les URL d'addon y sont masquées et aucun mot de passe n'y est écrit. Relisez quand même un journal avant de le publier.

## Ouvrir un ticket

Joignez : version du pont (affichée au démarrage et dans `rapport-support.txt`), version de Windows/DeoVR/Stremio, `rapport-support.txt`, et décrivez ce que vous avez cliqué. Ne publiez jamais `config.json` ni `secrets.dat`.
