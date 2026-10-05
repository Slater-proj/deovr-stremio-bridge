#!/usr/bin/env node
// Fabrique le logo (packaging/windows/icon/logo.png) et l'icône de l'exe (app.ico, 7 tailles) avec ffmpeg, sans aucune dépendance.
//   node scripts/make-icon.js [--ffmpeg <chemin>]      (les fichiers produits sont versionnés : à relancer seulement pour changer le dessin)
// Dessin : un casque VR blanc aux deux verres sombres sur un dégradé bleu-violet, avec une barre de progression verte dessous (le téléchargement).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const out = path.join(__dirname, '..', 'packaging', 'windows', 'icon'); fs.mkdirSync(out, { recursive: true });
const ffArg = process.argv.indexOf('--ffmpeg'), ffmpeg = ffArg > 0 ? process.argv[ffArg + 1] : (process.env.FFMPEG || 'ffmpeg');
const run = args => { const r = cp.spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('ffmpeg : ' + (r.stderr || r.error)); };

// rectangle arrondi (centre cx,cy ; demi-côtés w,h ; rayon r) : vrai si le pixel (X,Y) est dedans
const rrect = (cx, cy, w, h, r) => `lte(hypot(max(abs(X-${cx})-${w - r},0),max(abs(Y-${cy})-${h - r},0)),${r})`;
const circle = (cx, cy, r) => `lte(hypot(X-${cx},Y-${cy}),${r})`;
const t = '(X+Y)/510';
const chan = (lens, visor, fill, track, grad) =>   // un canal : lentilles > visière > remplissage de la barre > piste de la barre > fond dégradé ; 0 hors du carré arrondi
  `if(${rrect(128, 128, 128, 128, 52)},if(${circle(92, 112, 25)}+${circle(164, 112, 25)},${lens},if(${rrect(128, 112, 88, 44, 30)},${visor},if(between(Y,178,194)*between(X,52,52+152*0.62),${fill},if(between(Y,178,194)*between(X,52,204),${track},${grad})))),0)`;
const r = chan(14, 244, 51, 207, `27+79*${t}`), g = chan(19, 246, 204, 216, `42+19*${t}`), b = chan(26, 255, 113, 255, `107+133*${t}`);
const png = path.join(out, 'logo.png');
run(['-f', 'lavfi', '-i', 'color=c=black:s=256x256,format=gbrap', '-vf', `geq=r='${r}':g='${g}':b='${b}':a='if(${rrect(128, 128, 128, 128, 52)},255,0)',format=rgba`, '-frames:v', '1', png]);

// ICO : sept images PNG (16 à 256 px) dans un conteneur .ico (Windows ≥ Vista)
const sizes = [16, 24, 32, 48, 64, 128, 256], imgs = sizes.map(s => { const f = path.join(out, `_${s}.png`); run(['-i', png, '-vf', `scale=${s}:${s}:flags=lanczos,format=rgba`, '-frames:v', '1', f]); const d = fs.readFileSync(f); fs.rmSync(f); return d; });
const head = Buffer.alloc(6 + 16 * sizes.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length; sizes.forEach((s, i) => { const o = 6 + 16 * i; head[o] = s === 256 ? 0 : s; head[o + 1] = s === 256 ? 0 : s; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(imgs[i].length, o + 8); head.writeUInt32LE(off, o + 12); off += imgs[i].length; });
fs.writeFileSync(path.join(out, 'app.ico'), Buffer.concat([head, ...imgs]));
console.log(`logo.png et app.ico écrits dans ${out} (${sizes.join(', ')} px)`);

// version 64 px intégrée au code (favicon des pages du pont) : bridge/logo.js
const small = path.join(out, '_64.png'); run(['-i', png, '-vf', 'scale=64:64:flags=lanczos,format=rgba', '-frames:v', '1', small]);
fs.writeFileSync(path.join(__dirname, '..', 'bridge', 'logo.js'), `'use strict';\n// Logo 64 px (PNG) : favicon des pages web du pont. Fichier généré par scripts/make-icon.js.\nmodule.exports = Buffer.from('${fs.readFileSync(small).toString('base64')}', 'base64');\n`); fs.rmSync(small);
console.log('bridge/logo.js écrit');
