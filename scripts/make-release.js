#!/usr/bin/env node
// Fabrique dist/deovr-stremio-bridge-vX.Y.Z[suffixe].zip (sans dépendance : écrivain ZIP minimal basé sur zlib).
// BUILD_SUFFIX (ex. « -dev.57.abc1234 ») : build de test ; le zip contient alors un BUILD-INFO.txt (version, commit, date).
// Contenu : le dossier bridge/ + docs. JAMAIS config.json, journaux ni rapports. Les .bat sont convertis en CRLF (obligatoire pour cmd.exe).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const suffix = (process.env.BUILD_SUFFIX || '').replace(/[^\w.+-]/g, '');
const prefix = 'deovr-stremio-bridge/';
const exclude = [/(^|\/)config\.json$/, /(^|\/)bridge-[\w-]+\.(log|json)$/, /(^|\/)debug\.log$/, /diagnostic-report/, /rapport-support/, /(^|\/)node_modules\//];
const entries = [];   // [nom dans le zip, chemin disque, contenu (fichier virtuel)]
(function walk(dir, base) {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, n.name), name = base + n.name;
    if (n.isDirectory()) walk(p, name + '/'); else if (!exclude.some(re => re.test(name))) entries.push([name, p]);
  }
})(path.join(root, 'bridge'), '');
for (const f of ['README.md', 'README.fr.md', 'LICENSE', 'CHANGELOG.md']) if (fs.existsSync(path.join(root, f))) entries.push([f, path.join(root, f)]);
if (fs.existsSync(path.join(root, 'docs'))) (function walk(dir, base) { for (const n of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, n.name); n.isDirectory() ? walk(p, base + n.name + '/') : entries.push([base + n.name, p]); } })(path.join(root, 'docs'), 'docs/');

if (suffix) entries.push(['BUILD-INFO.txt', null, Buffer.from(['BUILD DE TEST (non publié)', `Version : ${version}${suffix}`, `Commit  : ${process.env.GITHUB_SHA || 'inconnu'}`, `Date    : ${new Date().toISOString()}`, '', 'Cette archive est fabriquée automatiquement à chaque modification du dépôt.', 'Elle n\'a pas été validée sur un vrai casque : voir docs/TESTING.md.', ''].join('\r\n'), 'utf8')]);

const { writeZip } = require('./lib/zip');
const out = path.join(root, 'dist', `deovr-stremio-bridge-v${version}${suffix}.zip`);
writeZip(entries.map(([name, file, extra]) => ({ name, file, data: extra, crlf: /\.bat$/i.test(name) })), out, { prefix });
console.log(`${path.relative(root, out)} : ${entries.length} fichiers, ${(fs.statSync(out).size / 1e6).toFixed(2)} Mo`);
