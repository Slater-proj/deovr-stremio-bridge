'use strict';
// Écrivain ZIP minimal sans dépendance (zlib). entries : [{ name, file | data, crlf?, store? }] -> écrit `out`.
// - crlf : convertit les fins de ligne en CRLF (.bat, .txt destinés à Windows)
// - store : stocke sans compresser (déjà compressé) ; les gros fichiers sont compressés au niveau 6 (le 9 est trop lent)
const fs = require('fs'), zlib = require('zlib');
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function writeZip(entries, out, { prefix = '', date } = {}) {
  const parts = [], central = []; let offset = 0;
  const now = date || new Date(process.env.SOURCE_DATE_EPOCH ? process.env.SOURCE_DATE_EPOCH * 1000 : Date.now());
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF, dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  for (const e of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    let data = e.data || fs.readFileSync(e.file);
    if (e.crlf) data = Buffer.from(data.toString('utf8').replace(/\r?\n/g, '\r\n'), 'utf8');
    const full = Buffer.from(prefix + e.name, 'utf8');
    const comp = e.store ? null : zlib.deflateRawSync(data, { level: data.length > 8e6 ? 6 : 9 }), useDeflate = !!comp && comp.length < data.length, body = useDeflate ? comp : data, crc = crc32(data);
    if (data.length >= 0xFFFFFFFF || body.length >= 0xFFFFFFFF) throw new Error(`${e.name} dépasse 4 Go (ZIP64 non géré)`);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(useDeflate ? 8 : 0, 8); lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(full.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, full, body);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x031e, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(useDeflate ? 8 : 0, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(full.length, 28); ch.writeUInt32LE(((e.exec ? 0o100755 : 0o100644) << 16) >>> 0, 38); ch.writeUInt32LE(offset, 42);
    central.push(ch, full); offset += lh.length + full.length + body.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  fs.mkdirSync(require('path').dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.concat([...parts, cd, end]));
}
module.exports = { writeZip };
