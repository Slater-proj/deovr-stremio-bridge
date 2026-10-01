'use strict';
const { test, describe } = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const S = require('../../bridge/secrets');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sec-'));
const win = process.platform === 'win32';

describe('stockage de la clé Stremio', () => {
  test('aller-retour, effacement', () => {
    const d = tmp(); assert.equal(S.load(d), null);
    const scheme = S.save(d, { authKey: 'CLE-1', emailHint: 'a***@b.c' }); assert.equal(scheme, win ? 'dpapi' : 'plain');
    assert.deepEqual({ ...S.load(d), savedAt: undefined }, { authKey: 'CLE-1', emailHint: 'a***@b.c', savedAt: undefined }); assert.ok(S.exists(d));
    assert.ok(S.clear(d)); assert.equal(S.load(d), null); assert.ok(!S.exists(d));
  });
  test('sous Windows la clé est chiffrée (DPAPI) : absente du fichier, même décodé', { skip: !win && 'DPAPI : Windows seulement' }, () => {
    const d = tmp(); S.save(d, { authKey: 'CLE-SECRETE-XYZ' }); const raw = fs.readFileSync(path.join(d, S.FILE), 'utf8'), env = JSON.parse(raw);
    assert.equal(env.scheme, 'dpapi'); assert.ok(!raw.includes('CLE-SECRETE-XYZ')); assert.ok(!Buffer.from(env.data, 'base64').toString('latin1').includes('CLE-SECRETE-XYZ'));
    assert.equal(S.load(d).authKey, 'CLE-SECRETE-XYZ');
  });
  test('hors Windows : fichier réservé à l\'utilisateur', { skip: win && 'permissions POSIX' }, () => {
    const d = tmp(); S.save(d, { authKey: 'k' }); assert.equal(fs.statSync(path.join(d, S.FILE)).mode & 0o077, 0);
  });
  test('fichier chiffré pour un autre compte / illisible : erreur explicite, jamais de plantage', { skip: win && 'ce cas se teste hors Windows' }, () => {
    const d = tmp(); fs.writeFileSync(path.join(d, S.FILE), JSON.stringify({ v: 1, scheme: 'dpapi', data: 'AAAA' }));
    assert.throws(() => S.load(d), e => e.code === 'SECRET_UNREADABLE');
    fs.writeFileSync(path.join(d, S.FILE), 'pas du json'); assert.equal(S.load(d), null);
  });
});
