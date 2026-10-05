'use strict';
// Habillage de l'exe Windows après sa fabrication : icône, informations de version (propriétés du fichier), signature de code facultative.
// Aucune dépendance npm. rcedit (outil de build, jamais embarqué) est téléchargé une fois depuis la release officielle et vérifié par son empreinte SHA-256.
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');

const RCEDIT = { url: 'https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe', sha256: '3e7801db1a5edbec91b49a24a094aad776cb4515488ea5a4ca2289c400eade2a' };   // empreinte relevée au premier téléchargement de la release officielle v2.0.0

function ensureRcedit(cacheDir) {
  const f = path.join(cacheDir, 'rcedit-x64.exe'), sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  if (fs.existsSync(f) && sha(f) === RCEDIT.sha256) return f;
  fs.mkdirSync(cacheDir, { recursive: true });
  const r = cp.spawnSync('curl', ['-fsSL', '--retry', '3', '-o', f, RCEDIT.url], { stdio: 'inherit' });
  if (r.status !== 0 || !fs.existsSync(f)) throw new Error('téléchargement de rcedit impossible');
  if (sha(f) !== RCEDIT.sha256) { fs.rmSync(f, { force: true }); throw new Error('empreinte SHA-256 de rcedit inattendue : fichier supprimé'); }
  return f;
}

// Le node.exe officiel est déjà signé (OpenJS Foundation) : modifier ses ressources ou y injecter le blob laisse une table de certificats périmée, que Windows refuse ensuite
// de remplacer (« n'est pas une application Win32 valide » à la signature). On retire donc l'ancienne signature d'abord (équivalent de « signtool remove /s »).
function stripSignature(file) {
  const fd = fs.openSync(file, 'r+');
  try {
    const dos = Buffer.alloc(64); fs.readSync(fd, dos, 0, 64, 0); if (dos.readUInt16LE(0) !== 0x5a4d) return false;
    const pe = dos.readUInt32LE(0x3c), hdr = Buffer.alloc(24 + 240); fs.readSync(fd, hdr, 0, hdr.length, pe);
    if (hdr.toString('latin1', 0, 4) !== 'PE\0\0') return false;
    const magic = hdr.readUInt16LE(24), dirOff = 24 + (magic === 0x20b ? 112 : 96) + 4 * 8;   // entrée n° 4 du répertoire de données : table des certificats
    const va = hdr.readUInt32LE(dirOff), size = hdr.readUInt32LE(dirOff + 4);
    if (!va || !size) return false;
    const zero = Buffer.alloc(8); fs.writeSync(fd, zero, 0, 8, pe + dirOff);
    if (va + size >= fs.fstatSync(fd).size) fs.ftruncateSync(fd, va);   // la signature est en fin de fichier
    return true;
  } finally { fs.closeSync(fd); }
}
// -> { ok, why }
function brand(exe, { root, version, cacheDir, description = 'Pont DeoVR - Stremio (serveur local entre DeoVR et Stremio)' }) {
  const icon = path.join(root, 'packaging', 'windows', 'icon', 'app.ico');
  if (!fs.existsSync(icon)) return { ok: false, why: 'icône absente (packaging/windows/icon/app.ico)' };
  try {
    stripSignature(exe);
    const tool = ensureRcedit(cacheDir), v4 = `${version}.0`;
    const a = [exe, '--set-icon', icon, '--set-file-version', v4, '--set-product-version', v4,
      '--set-version-string', 'ProductName', 'DeoVR-Stremio Bridge', '--set-version-string', 'FileDescription', description,
      '--set-version-string', 'OriginalFilename', path.basename(exe), '--set-version-string', 'InternalName', 'DeoVR-Stremio-Bridge',
      '--set-version-string', 'LegalCopyright', 'MIT License - https://github.com/Slater-proj/deovr-stremio-bridge'];
    const r = cp.spawnSync(tool, a, { encoding: 'utf8' });
    return r.status === 0 ? { ok: true } : { ok: false, why: `rcedit a échoué (code ${r.status}) ${r.stderr || ''}`.trim() };
  } catch (e) { return { ok: false, why: e.message }; }
}

// Signature de code (Authenticode) : seulement si un certificat est fourni (SIGN_PFX_BASE64 ou SIGN_PFX_FILE, SIGN_PFX_PASSWORD) ; sinon rien, sans erreur.
// Horodatage (conseillé : la signature reste valable après l'expiration du certificat) : SIGN_NO_TIMESTAMP=1 pour s'en passer (essais hors ligne).
function sign(exe, env = process.env) {
  const b64 = env.SIGN_PFX_BASE64, file = env.SIGN_PFX_FILE;
  if (!b64 && !file) return { skipped: true };
  const tmp = b64 ? path.join(require('os').tmpdir(), `sign-${process.pid}.pfx`) : file;
  try {
    if (b64) fs.writeFileSync(tmp, Buffer.from(b64, 'base64'));
    const ts = env.SIGN_NO_TIMESTAMP === '1' ? '' : ` -TimestampServer '${env.SIGN_TIMESTAMP_URL || 'http://timestamp.digicert.com'}'`;
    const ps = `$ErrorActionPreference='Stop'; $c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 -ArgumentList $env:SIGN_PFX_PATH, $env:SIGN_PFX_PASSWORD; ` +
      `$r = Set-AuthenticodeSignature -FilePath $env:SIGN_EXE -Certificate $c -HashAlgorithm SHA256${ts}; ` +
      `$s = Get-AuthenticodeSignature -FilePath $env:SIGN_EXE; if (-not $s.SignerCertificate) { throw 'aucune signature écrite : ' + $r.StatusMessage }; Write-Output ('signé par ' + $s.SignerCertificate.Subject + ' (état : ' + $s.Status + ')')`;
    const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', env: { ...env, SIGN_PFX_PATH: tmp, SIGN_EXE: exe, SIGN_PFX_PASSWORD: env.SIGN_PFX_PASSWORD || '' } });
    return r.status === 0 ? { ok: true, info: (r.stdout || '').trim() } : { ok: false, why: ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 400) };
  } catch (e) { return { ok: false, why: e.message }; }
  finally { if (b64) try { fs.rmSync(tmp, { force: true }); } catch {} }
}

module.exports = { brand, sign, stripSignature, RCEDIT };
