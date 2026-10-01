#!/usr/bin/env node
// Vérifications statiques sans dépendance : syntaxe de tous les .js, JSON valides, pas de secret ni de fichier local versionné, .bat en CRLF à la livraison.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
let bad = 0; const fail = m => { console.error('✗ ' + m); bad++; }, ok = m => console.log('✓ ' + m);
const skip = new Set(['node_modules', '.git', 'dist']);
const all = []; (function walk(d) { for (const n of fs.readdirSync(d, { withFileTypes: true })) { if (skip.has(n.name)) continue; const p = path.join(d, n.name); n.isDirectory() ? walk(p) : all.push(p); } })(root);
const rel = f => path.relative(root, f).split(path.sep).join('/');
for (const f of all.filter(f => f.endsWith('.js'))) { const r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' }); r.status ? fail(`syntaxe ${rel(f)} : ${r.stderr.split('\n')[0]}`) : 0; }
ok(`${all.filter(f => f.endsWith('.js')).length} fichiers .js : syntaxe correcte`);
for (const f of all.filter(f => f.endsWith('.json'))) { try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { fail(`JSON invalide ${rel(f)} : ${e.message}`); } }
ok('fichiers .json valides');
const forbidden = [/(^|\/)config\.json$/, /(^|\/)bridge-[\w-]+\.(log|json)$/, /(^|\/)debug\.log$/, /diagnostic-report/, /rapport-support/];
for (const f of all) if (forbidden.some(re => re.test(rel(f)))) fail(`fichier local à ne pas versionner : ${rel(f)}`);
ok('aucun fichier local (config.json, journaux, rapports)');
const ex = JSON.parse(fs.readFileSync(path.join(root, 'bridge', 'config.example.json'), 'utf8'));
if (!/exemple|example/i.test(ex.email || '') || !/mot-de-passe|password/i.test(ex.password || '')) fail('config.example.json doit contenir des valeurs factices pour email/password');
ok('config.example.json : valeurs factices');
for (const f of all.filter(f => /\.(js|md|json|yml|bat)$/.test(f) && !/package-lock/.test(f))) {
  const t = fs.readFileSync(f, 'utf8');
  if (/ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) fail(`secret probable dans ${rel(f)}`);
}
ok('aucun jeton / clé privée détecté');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')), lib = fs.readFileSync(path.join(root, 'bridge', 'lib.js'), 'utf8');
const libV = (/const VERSION = '([^']+)'/.exec(lib) || [])[1], [maj, min] = pkg.version.split('.');
if (libV !== `${maj}.${min}`) fail(`VERSION de bridge/lib.js (${libV}) ≠ package.json (${pkg.version}) : lancez « npm run bump -- X.Y.Z »`);
const chg = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
if (!chg.includes(`## [${pkg.version}]`)) fail(`CHANGELOG.md n'a pas de section [${pkg.version}]`);
ok(`version ${pkg.version} : package.json, lib.js et CHANGELOG.md cohérents`);
for (const f of all.filter(f => /\.(md|json|yml)$/.test(f) && !/package-lock/.test(f))) if (/\bOWNER\b/.test(fs.readFileSync(f, 'utf8'))) fail(`marque de remplacement « OWNER » oubliée dans ${rel(f)}`);
ok('aucune marque de remplacement oubliée');
process.exit(bad ? 1 : 0);
