'use strict';
// Fonctions pures du pont : durées, débits, résolution / codec / format VR lus dans un titre, reconnaissance d'un conteneur vidéo, retour à la ligne.
// Aucune dépendance au reste du pont : testable seule (tests/unit).

const parseRuntime = s => {
  if (!s) return 0;
  const str = String(s);
  const h = str.match(/(\d+)\s*h/i), m = str.match(/(\d+)\s*m/i);
  if (h || m) return ((h ? +h[1] : 0) * 60 + (m ? +m[1] : 0)) * 60;
  return (parseInt(str, 10) || 0) * 60;
};
const VR_RE = /(^|[^a-z0-9])(3d|vr|vr180|sbs|hsbs|h-sbs|half[-. ]?sbs|tab|h-?ou|over[-. ]?under|180|360)([^a-z0-9]|$)/i;
const resLabel = h => (h >= 3600 ? '8K' : h >= 2800 ? '6K' : h >= 2000 ? '4K' : h >= 1400 ? '2K' : h > 0 ? 'HD' : '');
const fmtLabel = (t, f) => { f = f || detectFormat(t || ''); return f.screenType === 'dome' || f.screenType === 'mkx200' || f.screenType === 'fisheye' || f.screenType === 'rf52' ? 'VR180' : f.screenType === 'sphere' ? 'VR360' : f.is3d ? '3D' : '2D'; };
const mbs = x => `${((x || 0) / 1e6).toFixed(1).replace('.', ',')} Mo/s`;
const fmtDur = s => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);
function detectRes(t) {   // hauteur de la vidéo (valeurs type DeoVR : 1080, 1440, 2160, 2880, 3360, 3840) ; 0 = inconnue
  t = String(t || '');
  let m = t.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})/i);
  if (m) return Math.min(+m[2], 8640);
  m = t.match(/(?:^|[^0-9])(\d{3,4})\s*p(?![a-z])/i);   // « 3840p », « 3072p », « 1080p »
  if (m && +m[1] >= 360 && +m[1] <= 6480) return +m[1];
  m = t.match(/(?:^|[^a-z0-9])(\d{1,2}(?:[.,]\d)?)\s*k(?:[^a-z0-9]|$)/i);
  if (m) { const k = parseFloat(m[1].replace(',', '.')); return ({ 4: 2160, 5: 2560, 6: 2880, 7: 3360, 8: 3840, 12: 5760 })[k] || Math.round(k * 480); }
  if (/uhd|ultra[-. ]?hd/i.test(t)) return 2160;
  if (/qhd/i.test(t)) return 1440;
  if (/(fhd|full[-. ]?hd)/i.test(t)) return 1080;
  if (/(^|[^a-z0-9])hd([^a-z0-9]|$)/i.test(t)) return 720;
  return 0;
}
const detectCodec = t => (/(hevc|h\.?265|x265)/i.test(t) ? 'hevc' : /(^|[^a-z0-9])av1([^a-z0-9]|$)/i.test(t) ? 'av1' : /(^|[^a-z0-9])vp9([^a-z0-9]|$)/i.test(t) ? 'vp9' : 'h264');
function detectFormat(t, opts = {}) {
  let stereo = /(h-?sbs|half[-. ]?sbs|(^|[^a-z0-9])sbs([^a-z0-9]|$)|side[-. ]by[-. ]side|3d[-. ]?lr)/i.test(t) ? 'sbs'
    : /(h-?ou|(^|[^a-z0-9])tab([^a-z0-9]|$)|top[-. ]bottom|over[-. ]under|3d[-. ]?tb)/i.test(t) ? 'tb' : 'off';
  if (stereo === 'off' && /(^|[^a-z0-9])(vr\d*|180|360|3d|fish[-. ]?eye|mkx[-. ]?200|rf[-. ]?52)([^a-z0-9]|$)/i.test(t)) {   // titre manifestement VR : « LR » = côte à côte, « TB » / « OU » = dessus-dessous
    if (/(^|[^a-z0-9])lr([^a-z0-9]|$)/i.test(t)) stereo = 'sbs';
    else if (/(^|[^a-z0-9])(tb|ou)([^a-z0-9]|$)/i.test(t)) stereo = 'tb';
  }
  if (opts.local && stereo === 'off') {   // conventions de nommage des fichiers VR : _LR, _3dh, _TB, _3dv, _mono
    if (/(^|[^a-z0-9])(lr|3dh)([^a-z0-9]|$)/i.test(t)) stereo = 'sbs';
    else if (/(^|[^a-z0-9])(tb|3dv|ou)([^a-z0-9]|$)/i.test(t)) stereo = 'tb';
  }
  if (/mkx[-. ]?200/i.test(t)) return { screenType: 'mkx200', stereoMode: stereo === 'off' ? 'sbs' : stereo, is3d: true };
  if (/rf[-. ]?52/i.test(t)) return { screenType: 'rf52', stereoMode: stereo === 'off' ? 'sbs' : stereo, is3d: true };
  if (/fish[-. ]?eye/i.test(t)) return { screenType: 'fisheye', stereoMode: stereo === 'off' ? 'sbs' : stereo, is3d: true };
  if (/(^|[^0-9])360([^0-9]|$)/.test(t)) return { screenType: 'sphere', stereoMode: stereo, is3d: stereo !== 'off' };
  if (/(^|[^0-9])180([^0-9]|$)|vr180/i.test(t)) return { screenType: 'dome', stereoMode: stereo === 'off' ? 'sbs' : stereo, is3d: true };
  if (stereo !== 'off') return { screenType: 'flat', stereoMode: stereo, is3d: true };
  return { screenType: 'flat', stereoMode: 'off', is3d: false };
}
function probeContainer(buf) {
  const t = (a, b) => buf.toString('latin1', a, b), has = x => buf.indexOf(x, 0, 'latin1') >= 0;
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1A45DFA3) {
    const codec = has('V_MPEGH/ISO/HEVC') ? 'hevc' : has('V_MPEG4/ISO/AVC') ? 'h264' : has('V_AV1') ? 'av1' : has('V_VP9') ? 'vp9' : null;
    return { container: 'mkv', ext: '.mkv', codec, playable: true, note: codec === 'av1' || codec === 'vp9' ? `codec ${codec} : support DeoVR incertain` : '' };
  }
  if (buf.length >= 12 && t(4, 8) === 'ftyp') {
    const moov = has('moov'), codec = !moov ? null : (has('hvc1') || has('hev1')) ? 'hevc' : has('avc1') ? 'h264' : has('av01') ? 'av1' : null;
    return { container: 'mp4', ext: '.mp4', codec, playable: true, moovAtStart: moov, note: moov ? (codec === 'av1' ? 'codec av1 : support DeoVR incertain' : '') : 'index (moov) absent du début : démarrage lent ou impossible tant que la fin du fichier n\'est pas reçue' };
  }
  if (t(0, 4) === 'Rar!' || t(0, 2) === 'PK' || t(0, 4) === '7z\xBC\xAF' || (buf.length > 0x8006 && t(0x8001, 0x8006) === 'CD001')) return { container: 'archive', playable: false, note: 'archive/ISO, pas une vidéo (mauvais fichier choisi dans le torrent)' };
  if (t(0, 4) === 'RIFF' && t(8, 12) === 'AVI ') return { container: 'avi', ext: '.avi', playable: true, note: 'AVI : ancien format, support DeoVR incertain' };
  if (buf[0] === 0x47 || (buf.length > 5 && buf[4] === 0x47)) return { container: 'ts', ext: '.ts', playable: true, note: '' };
  return { container: 'inconnu', playable: true, note: 'en-tête non reconnu : ' + buf.toString('hex', 0, 8) };
}
function sniff(c) {
  const b = Buffer.from(c.subarray(0, 16));
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') return { name: `MP4/MOV (marque ${b.toString('latin1', 8, 12)})`, ext: '.mp4' };
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1A45DFA3) return { name: 'Matroska/WebM (MKV)', ext: '.mkv' };
  if (b.toString('latin1', 0, 4) === 'RIFF') return { name: 'AVI', ext: '.avi' };
  if (b.length >= 8 && ['moov', 'mdat', 'free', 'wide'].includes(b.toString('latin1', 4, 8))) return { name: 'MP4 (atome ' + b.toString('latin1', 4, 8) + ')', ext: '.mp4' };
  if (b[0] === 0x47) return { name: 'MPEG-TS', ext: '.ts' };
  return { name: 'inconnu (' + b.toString('hex', 0, 8) + ')', ext: null };
}
const wrapTxt = (t, n = 64) => { const out = []; let line = ''; for (const w of String(t).split(/\s+/)) { if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); } if (line) out.push(line); return out; };

module.exports = { parseRuntime, VR_RE, resLabel, fmtLabel, mbs, fmtDur, detectRes, detectCodec, detectFormat, probeContainer, sniff, wrapTxt };
