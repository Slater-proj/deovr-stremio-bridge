#!/usr/bin/env node
// Change de version en un seul geste : node scripts/bump.js 10.3.0   (ou : npm run bump -- 10.3.0)
//  - package.json "version", bridge/lib.js VERSION (« 10.3 »), CHANGELOG.md (la section [Non publié] devient [10.3.0] — date)
//  - ne fait AUCUNE commande git : relisez le diff, puis committez et posez le tag (voir docs/MAINTAINING.md)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('Usage : node scripts/bump.js X.Y.Z   (ex. 10.3.0)'); process.exit(1); }
const read = f => fs.readFileSync(path.join(root, f), 'utf8'), write = (f, t) => fs.writeFileSync(path.join(root, f), t, 'utf8');
const pkg = read('package.json'), old = JSON.parse(pkg).version;
if (old === v) { console.error(`La version est déjà ${v}.`); process.exit(1); }
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
if (cmp(v, old) < 0) { console.error(`${v} est plus ancienne que la version actuelle ${old}.`); process.exit(1); }
const chg = read('CHANGELOG.md');
if (!/^## \[Non publié\]\s*$/m.test(chg)) { console.error('CHANGELOG.md : section « ## [Non publié] » introuvable.'); process.exit(1); }
const body = chg.split(/^## \[Non publié\]\s*$/m)[1].split(/^## \[/m)[0].trim();
if (!body) { console.error('CHANGELOG.md : la section [Non publié] est vide. Décrivez d\'abord les changements (Ajouté / Changé / Corrigé).'); process.exit(1); }
const date = new Date().toISOString().slice(0, 10), [maj, min] = v.split('.');
write('package.json', pkg.replace(/("version":\s*")[^"]+(")/, `$1${v}$2`));
const lib = read('bridge/lib.js'); if (!/const VERSION = '[^']+'/.test(lib)) { console.error('VERSION introuvable dans bridge/lib.js'); process.exit(1); }
write('bridge/lib.js', lib.replace(/const VERSION = '[^']+'/, `const VERSION = '${maj}.${min}'`));
write('CHANGELOG.md', chg.replace(/^## \[Non publié\]\s*$/m, `## [Non publié]\n\n## [${v}] — ${date}`));
console.log(`${old} -> ${v}\n\nProchaines étapes :\n  npm run check && npm test\n  git add -A && git commit -m "v${v}"\n  git push        (attendre la CI verte)\n  git tag v${v} && git push origin v${v}   (publie la release)`);
