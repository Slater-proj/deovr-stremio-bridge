#!/usr/bin/env node
// Génère docs/CONFIGURATION.md à partir du bloc `cfg` de bridge/lib.js (les commentaires de ligne sont la source de vérité).
//   node scripts/gen-config-doc.js          -> écrit le fichier
//   node scripts/gen-config-doc.js --check  -> échoue si le fichier n'est pas à jour (utilisé par `npm run check` et la CI)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), src = fs.readFileSync(path.join(root, 'bridge', 'lib.js'), 'utf8');
const block = src.slice(src.indexOf('const cfg = {'), src.indexOf('const VERSION'));
const EXTRA = {   // clés sans commentaire dans lib.js
  port: 'port du pont (8080 par défaut ; c\'est l\'adresse à taper dans DeoVR)', email: 'e-mail du compte Stremio (pour lire la liste de vos addons)', password: 'mot de passe du compte Stremio', authKey: 'alternative à email/mot de passe : clé d\'authentification Stremio',
  localStremio: 'adresse du serveur de streaming de Stremio (lancé avec l\'application Stremio)', catalogInclude: 'ne garder que les catalogues dont le nom contient ce texte', catalogExclude: 'masquer les catalogues dont le nom contient ce texte',
  genreTabs: 'un onglet par genre pour les catalogues qui en proposent', maxTabs: 'nombre maximum d\'onglets dans DeoVR', itemsPerTab: 'films par onglet', types: 'types Stremio affichés', cacheMinutes: 'durée de mémorisation des catalogues (minutes)',
  remux: 'autorise la conversion avec ffmpeg (MKV, écran de chargement, vignettes) ; false = lecture directe uniquement',
  debug: 'journaux détaillés (aussi : variable d\'environnement DEBUG=1)' };
const DEF = { port: '8080', email: '""', password: '""', authKey: '""', localStremio: '"http://127.0.0.1:11470"', localStremioPublic: '"" (automatique)', debug: 'false', bindHost: '"0.0.0.0"' };
const rows = [];
for (const line of block.split('\n')) {
  const m = /^  (\w+):\s*(.*?),?\s+(?:\/\/\s*(.*))?$|^  (\w+):\s*(.*?),?\s*$/.exec(line); if (!m) continue;
  const key = m[1] || m[4], expr = m[2] ?? m[5], comment = m[3] || EXTRA[key] || '';
  const def = /(?:\?\?|\|\|)\s*(.+?)\s*$/.exec(expr.replace(/,\s*$/, '')); let d = def ? def[1] : expr;
  if (/^(env\.|file\.)/.test(d)) d = DEF[key] || '—';
  d = d.replace(/'\)$/, "'").replace(/\|/g, '\\|').replace(/\[.*\]/, m2 => m2.length > 40 ? '[…]' : m2);
  rows.push(`| \`${key}\` | \`${d}\` | ${(comment || '').replace(/\|/g, '\\|')} |`);
}
const out = `<!-- Fichier généré par scripts/gen-config-doc.js : ne pas modifier à la main (modifier les commentaires de bridge/lib.js puis \`npm run docs\`). -->
# Configuration (\`config.json\`)

Copiez \`config.example.json\` en \`config.json\` (le script \`INSTALL.bat\` le fait pour vous) et ne gardez que les clés que vous voulez changer.
Les valeurs par défaut conviennent à la plupart des installations. \`config.json\` contient vos identifiants Stremio : **ne le partagez jamais** (il est exclu du dépôt et des archives).

Certaines clés peuvent aussi venir de variables d'environnement : \`PORT\`, \`STREMIO_EMAIL\`, \`STREMIO_PASSWORD\`, \`STREMIO_AUTHKEY\`, \`LOCAL_STREMIO\`, \`ADDON_URLS\`, \`SCRAPE_TRACKERS\`, \`DNS_MODE\`, \`DEOVR_PLATFORM\`, \`FFMPEG\`, \`LOCAL_DIRS\`, \`DEBUG\`, \`BRIDGE_DATA_DIR\` (dossier des journaux/état/config).

| Clé | Valeur par défaut | Rôle |
|---|---|---|
${rows.join('\n')}
`;
const file = path.join(root, 'docs', 'CONFIGURATION.md');
if (process.argv.includes('--check')) { const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; if (cur !== out) { console.error('docs/CONFIGURATION.md n\'est pas à jour : lancez `npm run docs`'); process.exit(1); } console.log('✓ docs/CONFIGURATION.md à jour'); }
else { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, out); console.log(`docs/CONFIGURATION.md : ${rows.length} clés`); }
