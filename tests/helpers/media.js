'use strict';
// Génère (avec ffmpeg) un petit film H.264/AAC de test et une affiche portrait.
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
function makeFilm(seconds = 60, bitrate = '') {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-media-')), 'film.mp4');
  const r = cp.spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', String(seconds), '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '48', ...(bitrate ? ['-b:v', bitrate, '-minrate', bitrate, '-maxrate', bitrate, '-bufsize', bitrate] : []), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', f]);
  if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr);
  return { file: f, data: fs.readFileSync(f) };
}
function makePoster() {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-media-')), 'poster.jpg');
  const r = cp.spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=600x900:rate=1', '-frames:v', '1', f]);
  if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr);
  return fs.readFileSync(f);
}
module.exports = { makeFilm, makePoster };
