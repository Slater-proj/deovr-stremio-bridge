'use strict';
// DNS de secours : un addon hébergé chez soi (nom qui pointe vers 192.168.x) ne doit pas échouer parce que le DNS public ne le connaît pas.
const { test } = require('node:test'), assert = require('node:assert/strict');
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const lib = path.join(__dirname, '..', '..', 'bridge', 'lib.js');

test('adresse locale donnée par le DNS du PC, DNS public muet : la réponse locale est gardée (régression : erreur EBOGON)', { timeout: 30000 }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dns-'));
  fs.writeFileSync(path.join(d, 'config.json'), JSON.stringify({ publicDns: ['127.0.0.1'] }));   // DNS public injoignable
  const script = `const dns = require('dns'), orig = dns.lookup;
dns.lookup = (h, o, cb) => { if (typeof o === 'function') { cb = o; o = {}; } if (h === 'addon.maison.test') return o && o.all ? cb(null, [{ address: '192.168.1.10', family: 4 }]) : cb(null, '192.168.1.10', 4); return orig(h, o, cb); };
require(${JSON.stringify(lib)});
require('dns').lookup('addon.maison.test', {}, (e, a) => { console.log(JSON.stringify({ e: e && e.code, a })); process.exit(0); });`;
  const env = { ...process.env, BRIDGE_DATA_DIR: d, LOCAL_STREMIO: 'http://127.0.0.1:9' }; delete env.DNS_MODE;
  const r = cp.spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 25000, env });
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.deepEqual(out, { e: null, a: '192.168.1.10' }, r.stdout + r.stderr);
});
