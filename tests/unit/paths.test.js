'use strict';
const { test, describe } = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const P = require('../../bridge/paths');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paths-'));

describe('dossiers de données', () => {
  test('exe portable : tout dans <dossier de l\'exe>/data, rien d\'autre', () => {
    const app = tmp(), r = P.resolve([], { BRIDGE_APP_DIR: app });
    assert.equal(r.mode, 'portable'); assert.equal(r.dataDir, path.join(app, 'data')); assert.equal(r.appDir, app); assert.equal(r.tmpDir, path.join(app, 'data', 'tmp')); assert.ok(fs.existsSync(r.dataDir));
    assert.deepEqual(fs.readdirSync(app), ['data']);
  });
  test('réglages : config.json à côté de l\'exe ; ressources dans resources/', () => {
    const app = tmp(), r = P.resolve([], { BRIDGE_APP_DIR: app });
    assert.equal(r.configFile, path.join(app, 'config.json')); assert.equal(r.resDir, path.join(app, 'resources'));
  });
  test('ancienne installation : data/config.json lu tant qu\'il n\'y a pas de config.json à côté de l\'exe', () => {
    const app = tmp(); fs.mkdirSync(path.join(app, 'data')); fs.writeFileSync(path.join(app, 'data', 'config.json'), '{}');
    assert.equal(P.resolve([], { BRIDGE_APP_DIR: app }).configFile, path.join(app, 'data', 'config.json'));
    fs.writeFileSync(path.join(app, 'config.json'), '{}'); assert.equal(P.resolve([], { BRIDGE_APP_DIR: app }).configFile, path.join(app, 'config.json'));
  });
  test('BRIDGE_CONFIG impose le fichier de réglages', () => {
    const app = tmp(), f = path.join(tmp(), 'autre.json'); assert.equal(P.resolve([], { BRIDGE_APP_DIR: app, BRIDGE_CONFIG: f }).configFile, f);
  });
  test('BRIDGE_DATA_DIR et --data-dir l\'emportent', () => {
    const a = tmp(), b = tmp(), app = tmp();
    assert.equal(P.resolve([], { BRIDGE_APP_DIR: app, BRIDGE_DATA_DIR: a }).dataDir, a); assert.equal(P.resolve([], { BRIDGE_APP_DIR: app, BRIDGE_DATA_DIR: a }).configFile, path.join(a, 'config.json'));
    assert.equal(P.resolve(['--data-dir', b], { BRIDGE_APP_DIR: app }).dataDir, b);
    assert.equal(P.resolve([`--data-dir=${b}`], { BRIDGE_APP_DIR: app }).mode, 'impose');
  });
  test('node server.js : dossier du code (comme avant)', () => {
    const r = P.resolve([], {}); assert.equal(r.mode, 'dossier-du-code'); assert.equal(r.dataDir, r.appDir); assert.equal(r.resDir, r.appDir);
  });
  test('argOf', () => { assert.equal(P.argOf('--port', ['--dev', '--port', '8081']), '8081'); assert.equal(P.argOf('--port', ['--port=9']), '9'); assert.equal(P.argOf('--port', ['--port', '--dev']), ''); });
});
