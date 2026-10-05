'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { stripSignature, sign } = require('../../scripts/lib/winexe');

// PE minimal : en-tête DOS, signature PE, en-tête de fichier, en-tête optionnel PE32+ dont l'entrée n° 4 (certificats) pointe vers une signature en fin de fichier
function fakePe(certSize) {
  const b = Buffer.alloc(0x400 + certSize); b.write('MZ', 0, 'latin1'); b.writeUInt32LE(0x40, 0x3c); b.write('PE\0\0', 0x40, 'latin1');
  const opt = 0x40 + 24; b.writeUInt16LE(0x20b, opt);
  if (certSize) { b.writeUInt32LE(0x400, opt + 112 + 4 * 8); b.writeUInt32LE(certSize, opt + 112 + 4 * 8 + 4); b.fill(0xab, 0x400); }
  return b;
}

test('stripSignature : la signature existante (celle du node.exe officiel) est retirée, le reste du fichier est intact ; sans signature rien ne change', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pe-')), 'a.exe'), pe = fakePe(2048); fs.writeFileSync(f, pe);
  assert.equal(stripSignature(f), true);
  const after = fs.readFileSync(f); assert.equal(after.length, 0x400, 'fichier tronqué avant la signature'); assert.equal(after.readUInt32LE(0x40 + 24 + 112 + 32), 0); assert.equal(after.readUInt32LE(0x40 + 24 + 112 + 36), 0);
  assert.deepEqual(after.subarray(0, 0x400 - 0), Buffer.concat([pe.subarray(0, 0x40 + 24 + 112 + 32), Buffer.alloc(8), pe.subarray(0x40 + 24 + 112 + 40, 0x400)]), 'seule l\'entrée du répertoire est effacée');
  assert.equal(stripSignature(f), false, 'déjà sans signature');
  fs.writeFileSync(f, Buffer.from('pas un exe')); assert.equal(stripSignature(f), false, 'fichier non PE');
});

test('sign : sans certificat fourni, rien n\'est fait et ce n\'est pas une erreur', () => {
  assert.deepEqual(sign('nimporte.exe', {}), { skipped: true });
});
