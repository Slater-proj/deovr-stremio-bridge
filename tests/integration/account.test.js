'use strict';
// Compte Stremio : connexion par la page /setup, clé chiffrée, mot de passe jamais écrit, migration, déconnexion, clé périmée.
const { test, before, after, describe } = require('node:test'), assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const { startMocks } = require('../helpers/mocks'), { startBridge } = require('../helpers/bridge'), { makeFilm } = require('../helpers/media');
const secrets = require('../../bridge/secrets');

const tokenOf = html => (/name="t" value="([0-9a-f]+)"/.exec(html) || [])[1];
const post = (bridge, p, form, headers = {}) => new Promise((ok, no) => {
  const body = new URLSearchParams(form).toString();
  const r = http.request({ host: '127.0.0.1', port: bridge.port, path: p, method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(body), ...headers } }, res => { let t = ''; res.on('data', c => t += c); res.on('end', () => ok({ status: res.statusCode, location: res.headers.location, body: t })); });
  r.on('error', no); r.end(body);
});
const sceneNames = async b => (await b.json('/deovr')).scenes.map(s => s.name);
const enCours = async b => (await b.json('/deovr')).scenes.find(s => s.name === 'En cours').list.map(x => x.title).join(' | ');
const allText = dir => fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile()).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

describe('compte Stremio', () => {
  let mocks;
  before(async () => { mocks = await startMocks({ film: makeFilm(8).data }); });
  after(async () => { await mocks.close(); });

  test('connexion par /setup : refus sans jeton / hôte étranger / origine étrangère, mauvais mot de passe, puis succès ; le mot de passe n\'est écrit nulle part', { timeout: 60000 }, async () => {
    const b = await startBridge(mocks, {}, { login: true });
    try {
      assert.match(await enCours(b), /Connexion Stremio requise/);
      assert.ok(!(await sceneNames(b)).includes('Top VR'), 'aucun catalogue sans compte');
      const page = await b.get('/setup'); assert.equal(page.status, 200); const html = await page.text(), t = tokenOf(html);
      assert.ok(t && t.length >= 32, 'jeton de formulaire'); assert.match(html, /n'est pas enregistré/); assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
      const good = { t, email: mocks.api.email, password: mocks.api.password };
      assert.equal((await post(b, '/setup', { ...good, t: 'x' })).status, 403, 'jeton faux');
      assert.equal((await post(b, '/setup', good, { host: 'evil.example' })).status, 403, 'hôte étranger (DNS rebinding)');
      assert.equal((await post(b, '/setup', good, { origin: 'http://evil.example' })).status, 403, 'origine étrangère (CSRF)');
      assert.equal(mocks.api.logins.length, 0, 'aucune tentative de connexion déclenchée par les requêtes refusées');
      const bad = await post(b, '/setup', { ...good, password: 'faux' }); assert.equal(bad.status, 200); assert.match(bad.body, /refusé la connexion/);
      assert.ok(!fs.existsSync(path.join(b.dataDir, secrets.FILE)), 'rien d\'enregistré après un échec');
      const ok = await post(b, '/setup', good); assert.equal(ok.status, 303); assert.equal(ok.location, '/settings?bienvenue=1', 'après la connexion : directement les réglages (les liens utiles sont en haut)');
      assert.ok(fs.existsSync(path.join(b.dataDir, secrets.FILE)), 'clé enregistrée');
      assert.ok((await sceneNames(b)).includes('Top VR'), 'les catalogues du compte apparaissent');
      assert.match(await (await b.get('/setup')).text(), /Compte connecté/);
      // le mot de passe n'est dans AUCUN fichier du dossier de données, ni dans la sortie console
      const dump = allText(b.dataDir) + b.out(); assert.ok(!dump.includes(mocks.api.password), 'mot de passe absent des fichiers et de la console');
      const env = JSON.parse(fs.readFileSync(path.join(b.dataDir, secrets.FILE), 'utf8')); assert.ok(!JSON.stringify(env).includes(mocks.api.password));
      if (secrets.backend() === 'dpapi') assert.ok(!Buffer.from(env.data, 'base64').toString('latin1').includes(mocks.api.authKey), 'clé chiffrée (DPAPI)');
      assert.ok(!dump.includes(mocks.api.authKey), 'clé absente des journaux');
    } finally { await b.stop(); }
  });

  test('la clé survit au redémarrage (aucune nouvelle connexion) ; la déconnexion la supprime', { timeout: 60000 }, async () => {
    const b1 = await startBridge(mocks, {}, { login: true });
    const t = tokenOf(await (await b1.get('/setup')).text()); await post(b1, '/setup', { t, email: mocks.api.email, password: mocks.api.password });
    const dir = b1.dataDir, before = mocks.api.logins.length; await b1.stop({ keepData: true });
    const b2 = await startBridge(mocks, {}, { login: true, dataDir: dir, config: false });
    try {
      assert.ok((await sceneNames(b2)).includes('Top VR'), 'connecté sans repasser par /setup');
      assert.equal(mocks.api.logins.length, before, 'pas de nouvelle connexion avec mot de passe');
      const t2 = tokenOf(await (await b2.get('/setup?change=1')).text()), out = await post(b2, '/setup/logout', { t: t2 }); assert.equal(out.status, 200);
      assert.ok(!fs.existsSync(path.join(dir, secrets.FILE)), 'clé supprimée');
      await b2.waitFor(async () => !(await sceneNames(b2)).includes('Top VR'), 5000);
      assert.match(await enCours(b2), /Connexion Stremio requise/);
    } finally { await b2.stop(); }
  });

  test('ancienne configuration (e-mail + mot de passe dans config.json) : migrée, le mot de passe est retiré du fichier', { timeout: 60000 }, async () => {
    const b = await startBridge(mocks, { email: mocks.api.email, password: mocks.api.password, port: 1234 }, { login: true });
    try {
      assert.ok((await sceneNames(b)).includes('Top VR'));
      const cfgNow = JSON.parse(fs.readFileSync(path.join(b.dataDir, 'config.json'), 'utf8'));
      assert.ok(!('password' in cfgNow), 'mot de passe retiré de config.json'); assert.equal(cfgNow.email, mocks.api.email); assert.equal(cfgNow.port, 1234, 'le reste de la configuration est conservé');
      assert.ok(fs.existsSync(path.join(b.dataDir, secrets.FILE)));
      assert.ok(!(allText(b.dataDir) + b.out()).includes(mocks.api.password));
    } finally { await b.stop(); }
  });

  test('clé périmée côté Stremio : elle est oubliée et la connexion est redemandée', { timeout: 60000 }, async () => {
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bridge-old-')); secrets.save(dir, { authKey: 'CLE_PERIMEE', emailHint: 'u***@example.test' });
    const b = await startBridge(mocks, {}, { login: true, dataDir: dir });
    try {
      await b.waitFor(async () => /Connexion Stremio requise/.test(await enCours(b)), 8000);
      assert.ok(!fs.existsSync(path.join(dir, secrets.FILE)), 'clé périmée supprimée');
      assert.ok(mocks.api.collections.includes('CLE_PERIMEE'));
    } finally { await b.stop(); }
  });
});
