---
name: Retour de test au casque
about: Résultat d'un essai de DeoVR avec un build de test ou une release
labels: test-casque
---

**Archive testée** (nom du zip, ou contenu de `docs\BUILD-INFO.txt`) :

**Matériel** : casque · Windows · DeoVR (version) · Stremio (version) · espace libre sur le disque du cache Stremio

**Tests de l'onglet « Test pont »** (docs/TESTING.md) — OK / KO / non essayé :
- Test 5 (bascule 2D) :
- Test 6 (bascule 3D côte à côte) :
- Labos 1 à 16 (pour chacun : l'image apparaît ? le compteur jaune avance ? texte lisible ? menu FLAT/180/360/fisheye proposé ?) :
- Liens de la page `/t` (A, C, D, E, F) :
- Adresse nue `http://…:4477` ouvre la bibliothèque :

**Un vrai film** : titre ou type de film (sans nom d'addon ni de source) · H.264 ou HEVC · chargement jusqu'au film OK ? · débit affiché / débit nécessaire · présent dans *En cours* après avoir quitté ?

**Affichage** : vignettes en paysage ? accents et « · » lisibles ?

**Rapport** : joignez `rapport-support.txt` (`utility\RAPPORT-SUPPORT.bat` du zip debug, ou `DeoVR-Stremio-Bridge.exe --report`, pendant que le pont tourne) et `bridge-requests.log`. **Jamais `config.json` ni `secrets.dat`.** Relisez le rapport avant de le publier.
