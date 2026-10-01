#!/usr/bin/env node
// Fabrique dist/deovr-stremio-bridge-vX.Y.Z.zip (sans dépendance : écrivain ZIP minimal basé sur zlib).
// Contenu : le dossier bridge/ + docs. JAMAIS config.json, journaux ni rapports. Les .bat sont convertis en CRLF (obligatoire pour cmd.exe).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const prefix = 'deovr-stremio-bridge/';
const exclude = [/(^|\/)config\.json$/, /(^|\/)bridge-[\w-]+\.(log|json)$/, /(^|\/)debug\.log$/, /diagnostic-report/, /rapport-support/, /(^|\/)node_modules\//];
const entries = [];   // [nom dans le zip, chemin disque]
(function walk(dir, base) {
  for (const n of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, n.name), name = base + n.name;
    if (n.isDirectory()) walk(p, name + '/'); else if (!exclude.some(re => re.test(name))) entries.push([name, p]);
  }
})(path.join(root, 'bridge'), '');
for (const f of ['README.md', 'README.fr.md', 'LICENSE', 'CHANGELOG.md']) if (fs.existsSync(path.join(root, f))) entries.push([f, path.join(root, f)]);
if (fs.existsSync(path.join(root, 'docs'))) (function walk(dir, base) { for (const n of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, n.name); n.isDirectory() ? walk(p, base + n.name + '/') : entries.push([base + n.name, p]); } })(path.join(root, 'docs'), 'docs/');

const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const parts = [], central = []; let offset = 0;
const dosTime = d => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF, dosDate = d => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
const now = new Date(process.env.SOURCE_DATE_EPOCH ? process.env.SOURCE_DATE_EPOCH * 1000 : Date.now());
for (const [name, file] of entries.sort((a, b) => a[0].localeCompare(b[0]))) {
  let data = fs.readFileSync(file);
  if (/\.bat$/i.test(name)) data = Buffer.from(data.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
  const full = Buffer.from(prefix + name, 'utf8'), comp = zlib.deflateRawSync(data, { level: 9 }), useDeflate = comp.length < data.length, body = useDeflate ? comp : data, crc = crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(useDeflate ? 8 : 0, 8); lh.writeUInt16LE(dosTime(now), 10); lh.writeUInt16LE(dosDate(now), 12);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(full.length, 26); lh.writeUInt16LE(0, 28);
  parts.push(lh, full, body);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x031e, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(useDeflate ? 8 : 0, 10); ch.writeUInt16LE(dosTime(now), 12); ch.writeUInt16LE(dosDate(now), 14);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(full.length, 28); ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42);
  central.push(ch, full); offset += lh.length + full.length + body.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', `deovr-stremio-bridge-v${version}.zip`);
fs.writeFileSync(out, Buffer.concat([...parts, cd, end]));
console.log(`${path.relative(root, out)} : ${entries.length} fichiers, ${(fs.statSync(out).size / 1e6).toFixed(2)} Mo`);
