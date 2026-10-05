#!/usr/bin/env node
// Fabrique l'archive portable Windows : DeoVR-Stremio-Bridge.exe (Node intégré, « single executable application ») + ffmpeg + outils.
//   node scripts/build-exe.js [--profile release|debug|both] [--ffmpeg-dir <dossier avec ffmpeg(.exe) et ffprobe(.exe)>] [--no-ffmpeg] [--keep]
//   release : exe + resources\ (ffmpeg, vidéos de test) + docs\GUIDE-RAPIDE.txt + licences. Rien d'autre ; config.json est créé au 1er lancement.
//   debug   : release + utility\ (.bat d'outillage + descriptif) + docs\DEBUG.txt.      both (défaut) : les deux archives, un seul exe.
// Variables : BUILD_SUFFIX (ex. -dev.57.abc1234), GITHUB_SHA.  Sans dépendance du projet ; l'injection utilise `postject` (outil de build épinglé, via npx).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { writeZip } = require('./lib/zip');
const root = path.join(__dirname, '..'), bridge = path.join(root, 'bridge'), dist = path.join(root, 'dist');
const args = process.argv.slice(2), arg = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : ''; };
const work = arg('--work') ? path.resolve(arg('--work')) : path.join(dist, 'exe-build');   // --bundle-only [--work <dossier>] : s'arrête après bundle.js (tests)
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const suffix = (process.env.BUILD_SUFFIX || '').replace(/[^\w.+-]/g, '');
const isWin = process.platform === 'win32', exeName = isWin ? 'DeoVR-Stremio-Bridge.exe' : 'DeoVR-Stremio-Bridge';
const osName = isWin ? 'windows' : process.platform, tag = `${osName}-${process.arch}`;
const POSTJECT = 'postject@1.0.0-alpha.6', FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const run = (cmd, a, o = {}) => { const r = cp.spawnSync(cmd, a, { stdio: 'inherit', shell: isWin && /^npx/.test(cmd), ...o }); if (r.status !== 0) throw new Error(`${cmd} ${a.join(' ')} a échoué (code ${r.status})`); };

fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });

// 1. un seul fichier JavaScript : les modules de bridge/ sont emballés dans un registre (le require d'un exe ne lit que les modules natifs de Node)
const mods = fs.readdirSync(bridge).filter(f => /\.js$/.test(f)).map(f => f.replace(/\.js$/, ''));
const build = { version, suffix, commit: process.env.GITHUB_SHA || '', date: new Date().toISOString() };
let out = `'use strict';\nglobalThis.__BUILD__ = ${JSON.stringify(build)};\nconst __native = require, __defs = {}, __cache = {};\n`;
for (const m of mods) out += `__defs[${JSON.stringify(m)}] = function (module, exports, require, __filename, __dirname) {\n${fs.readFileSync(path.join(bridge, m + '.js'), 'utf8').replace(/^#!.*\n/, '')}\n};\n`;
out += `function __load(id) {
  const m = /^\\.\\/([\\w-]+)(?:\\.js)?$/.exec(id); if (!m) return __native(id);
  if (!__defs[m[1]]) throw new Error('module introuvable : ' + id);
  if (__cache[m[1]]) return __cache[m[1]].exports;
  const mod = __cache[m[1]] = { exports: {} }, dir = process.env.BRIDGE_APP_DIR || require('path').dirname(process.execPath);
  __defs[m[1]].call(mod.exports, mod, mod.exports, __load, require('path').join(dir, m[1] + '.js'), dir);
  return mod.exports;
}
__load('./server');
`;
const bundle = path.join(work, 'bundle.js'); fs.writeFileSync(bundle, out);
if (args.includes('--bundle-only')) { console.log(bundle); process.exit(0); }

// 2. exécutable : binaire Node + blob SEA. Node récent : `node --build-sea` (rien à télécharger) ; sinon `postject` (outil de build épinglé, via npx).
const exe = path.join(work, exeName), blob = path.join(work, 'sea-prep.blob'), cfgFile = path.join(work, 'sea-config.json');
const simulate = args.includes('--simulate');   // essai hors Windows : « exe » = petit lanceur sh + bundle.js (BRIDGE_APP_DIR), pour tester l'assemblage des archives et le test de fumée
const brandWanted = isWin && !simulate && !args.includes('--no-brand');   // icône + propriétés du fichier : exige la voie postject (habillage avant injection)
const hasBuildSea = !brandWanted && !args.includes('--postject') && /--build-sea/.test(cp.spawnSync(process.execPath, ['--help'], { encoding: 'utf8' }).stdout || '');
if (simulate) {
  fs.writeFileSync(exe, `#!/bin/sh\nD="$(cd "$(dirname "$0")" && pwd)"\nBRIDGE_APP_DIR="$D" exec node "$D/bundle.js" "$@"\n`); fs.chmodSync(exe, 0o755);
} else if (hasBuildSea) {
  fs.writeFileSync(cfgFile, JSON.stringify({ main: bundle, output: exe, disableExperimentalSEAWarning: true }));
  run(process.execPath, ['--build-sea', cfgFile]);
} else {
  fs.writeFileSync(cfgFile, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true }));
  run(process.execPath, ['--experimental-sea-config', cfgFile]);
  fs.copyFileSync(process.execPath, exe); if (!isWin) fs.chmodSync(exe, 0o755);
  if (brandWanted) { const b = require('./lib/winexe').brand(exe, { root, version, cacheDir: path.join(dist, 'tools') }); console.log(b.ok ? 'icône et informations de version : OK (posées avant l\'injection)' : `ATTENTION : exe SANS icône ni informations de version (${b.why})`); }
  run('npx', ['--yes', POSTJECT, exe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', FUSE, ...(process.platform === 'darwin' ? ['--macho-segment-name', 'NODE_SEA'] : [])]);
}
console.log(`méthode d'injection : ${simulate ? 'SIMULATION (lanceur sh)' : hasBuildSea ? 'node --build-sea' : 'postject'} (Node ${process.version})`);
// signature de code si un certificat est fourni (SIGN_PFX_BASE64 / SIGN_PFX_FILE) ; l'exe est ensuite relancé (--version) pour s'assurer que rien n'est cassé
if (isWin && !simulate) {
  const sg = require('./lib/winexe').sign(exe);
  console.log(sg.skipped ? 'signature de code : non demandée (aucun certificat fourni : SmartScreen avertira)' : sg.ok ? `signature de code : ${sg.info}` : `ATTENTION : signature échouée (${sg.why})`);
  if (process.env.REQUIRE_SIGNATURE === '1' && !sg.ok) throw new Error('signature exigée (REQUIRE_SIGNATURE=1) mais non réalisée');
}
const v = cp.spawnSync(exe, ['--version'], { encoding: 'utf8', timeout: 30000 });
if (v.status !== 0 || !v.stdout.includes(version)) throw new Error(`l'exécutable fabriqué ne démarre pas correctement (--version) : ${v.stdout} ${v.stderr}`);
console.log(`exécutable OK : ${path.basename(exe)} ${v.stdout.trim()} (${(fs.statSync(exe).size / 1e6).toFixed(0)} Mo)`);

// 3. contenu des archives (profils)
const pk = path.join(root, 'packaging', 'windows'), profile = arg('--profile') || 'both';
if (!['release', 'debug', 'both'].includes(profile)) throw new Error('--profile release|debug|both');
const list = d => fs.readdirSync(d, { withFileTypes: true });
const text = f => /\.(bat|txt)$/i.test(f);
const common = [{ name: exeName, file: exe, exec: true }];
if (simulate) common.push({ name: 'bundle.js', file: bundle });
for (const f of fs.readdirSync(path.join(bridge, 'test'))) common.push({ name: 'resources/test/' + f, file: path.join(bridge, 'test', f) });
common.push({ name: 'docs/GUIDE-RAPIDE.txt', file: path.join(pk, 'docs', 'GUIDE-RAPIDE.txt'), crlf: true });
common.push({ name: 'docs/licences/THIRD-PARTY-NOTICES.txt', file: path.join(pk, 'docs', 'licences', 'THIRD-PARTY-NOTICES.txt'), crlf: true });
common.push({ name: 'docs/licences/LICENSE-DeoVR-Stremio-Bridge.txt', file: path.join(root, 'LICENSE'), crlf: true });
common.push({ name: 'docs/BUILD-INFO.txt', crlf: true, data: Buffer.from([suffix ? 'BUILD DE TEST (non publié)' : 'Version stable', `Version : ${version}${suffix}`, `Commit  : ${build.commit || 'inconnu'}`, `Date    : ${build.date}`, `Cible   : ${tag}`, ''].join('\n')) });
if (!args.includes('--no-ffmpeg')) {
  const dir = arg('--ffmpeg-dir') || process.env.FFMPEG_DIR; if (!dir) throw new Error('--ffmpeg-dir <dossier> (ou FFMPEG_DIR) requis, ou --no-ffmpeg pour un essai sans ffmpeg');
  const bins = (isWin ? ['ffmpeg.exe', 'ffprobe.exe'] : ['ffmpeg', 'ffprobe']);
  for (const b of bins) { const f = path.join(dir, b); if (!fs.existsSync(f)) throw new Error(`${f} introuvable`); common.push({ name: 'resources/ffmpeg/' + b, file: f, exec: true }); }
  const lic = ['LICENSE.txt', 'LICENSE', 'COPYING.GPLv3', 'README.txt'].map(n => [path.join(dir, n), path.join(dir, '..', n)]).flat().find(f => fs.existsSync(f));
  common.push({ name: 'resources/ffmpeg/LICENSE.txt', ...(lic ? { file: lic } : { data: Buffer.from('FFmpeg est distribué sous licence GNU GPL v3 pour cette construction : voir docs/licences/THIRD-PARTY-NOTICES.txt et https://ffmpeg.org/legal.html\n') }) });
}
const debugOnly = [{ name: 'docs/DEBUG.txt', file: path.join(pk, 'docs', 'DEBUG.txt'), crlf: true }];
for (const n of list(path.join(pk, 'utility'))) debugOnly.push({ name: 'utility/' + n.name, file: path.join(pk, 'utility', n.name), crlf: text(n.name) });
for (const p of profile === 'both' ? ['release', 'debug'] : [profile]) {
  const entries = p === 'debug' ? [...common, ...debugOnly] : common;
  const zip = path.join(dist, `DeoVR-Stremio-Bridge-v${version}${suffix}-${tag}${p === 'debug' ? '-debug' : ''}.zip`);
  writeZip(entries, zip, { prefix: 'DeoVR-Stremio-Bridge/' });
  console.log(`${path.relative(root, zip)} [${p}] : ${entries.length} fichiers, ${(fs.statSync(zip).size / 1e6).toFixed(1)} Mo`);
}
if (!args.includes('--keep')) fs.rmSync(work, { recursive: true, force: true });
