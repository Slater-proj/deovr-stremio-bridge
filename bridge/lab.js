'use strict';
// Banc de test « casque » : de petites vidéos synthétiques (générées par ffmpeg au démarrage, sans torrent) dont chacune répond à UNE question
// sur ce que le lecteur de DeoVR (Windows) sait lire. Le journal des requêtes dit si le lecteur a avalé le flux ou s'il l'a relancé ;
// l'utilisateur ajoute ce qu'il voit dans le casque (image, texte lisible, mode VR proposé ou non).
// Constat à l'origine (journaux du 02/10) : un flux HLS en HEVC est relancé par le lecteur exactement 15 s après son début, un flux H.264 non.
const fs = require('fs'), path = require('path'), cp = require('child_process');

const DUR = 24, SEG = 4, EYE = 1920;   // 24 s, segments de 4 s, 3840×1920 côte à côte (comme un film VR180 « dome/sbs »)
// Chaque scène répond à UNE question. Les numéros sont ceux affichés dans DeoVR (onglet « Test pont »).
const SCENES = {
  'h264-ts':     { n: 1, title: 'Labo 1 · H.264 en HLS (TS) 3840×1920 — RÉFÉRENCE', what: 'H.264 dans un flux HLS (TS)', hint: 'Référence : doit passer.', first: 'seg000.ts', last: 'seg005.ts' },
  'hevc-ts':     { n: 2, title: 'Labo 2 · HEVC en HLS (TS) 3840×1920', what: 'HEVC dans un flux HLS (TS)', hint: 'Mesuré le 02/10 : relancé par le lecteur 15 s après le début.', first: 'seg000.ts', last: 'seg005.ts', hevc: true },
  'hevc-fmp4':   { n: 3, title: 'Labo 3 · HEVC en HLS (fMP4) 3840×1920', what: 'HEVC dans un flux HLS (fMP4)', hint: 'Mesuré (2e test du 02/10) : passe. Un film HEVC peut donc être lu en HLS fMP4.', first: 'init.mp4', last: 'seg005.m4s', hevc: true },
  'hevc-mp4':    { n: 4, title: 'Labo 4 · HEVC en MP4 direct 3840×1920', what: 'HEVC dans un MP4 lu directement', hint: 'Référence : lecture directe. Mesuré le 02/10 : passe.', first: 'video.mp4', last: 'video.mp4', hevc: true, file: 'video.mp4' },
  'loader-fmp4': { n: 5, title: 'Labo 5 · chargement H.264 puis film HEVC (fMP4) dans le même flux', what: 'chargement H.264 (12 s) puis film HEVC fMP4 (12 s)', hint: 'Mesuré (2e test du 02/10) : le lecteur se fige à la bascule H.264 TS -> HEVC fMP4.', first: 'a_000.ts', last: 'b_002.m4s', hevc: true, combo: { a: { hevc: false, fmp4: false }, b: { hevc: true } } },
  'h264-path':   { n: 6, title: 'Labo 6 · repli : la fiche demandée comme si c\'était le film', what: 'fiche décrite par « path » (forme que DeoVR lit mal)', hint: 'Le lecteur réclame la fiche JSON comme flux : le pont lui sert la playlist (segments en adresses absolues). Mesuré (3e test du 02/10) : passe (la redirection 302 du 2e test échouait).', first: 'seg000.ts', last: 'seg005.ts', same: 'h264-ts', usePath: true },
  'hevc-nofmt':  { n: 7, title: 'Labo 7 · HEVC direct, fiche SANS format déclaré', what: 'même MP4 que le Labo 4, mais la fiche ne dit ni 180° ni 3D', hint: 'Sélecteur de mode présent quand la fiche ne déclare aucun format (mesuré avec le Labo 8) ; image brute côte à côte.', first: 'video.mp4', last: 'video.mp4', same: 'hevc-mp4', noFormat: true },
  'hevc-name':   { n: 8, title: 'Labo 8 · HEVC direct, format dans le NOM du fichier', what: 'fiche sans format, fichier nommé video_180_LR.mp4', hint: 'Mesuré : DeoVR ne reconnaît PAS le format d\'après le nom ; sélecteur de mode présent, image brute côte à côte.', first: 'video_180_LR.mp4', last: 'video_180_LR.mp4', same: 'hevc-mp4', noFormat: true, alias: 'video_180_LR.mp4' },
  'fmt-stereo':  { n: 10, title: 'Labo 10 · HEVC direct, fiche avec stereoMode + is3d SEULEMENT', what: 'même MP4 ; la fiche déclare « sbs » et « 3D » mais pas le type d\'écran', hint: 'Mesuré (3e test du 02/10) : image juste, mais PAS de sélecteur de mode (déclarer stereoMode suffit à le supprimer).', first: 'video.mp4', last: 'video.mp4', same: 'hevc-mp4', partial: { stereoMode: 'sbs', is3d: true } },
  'fmt-screen':  { n: 11, title: 'Labo 11 · HEVC direct, fiche avec screenType SEULEMENT', what: 'même MP4 ; la fiche déclare « dome » mais pas stereoMode ni is3d', hint: 'Mesuré (3e test du 02/10) : sélecteur de mode présent, mais image doublée côte à côte jusqu\'au choix « SBS » (un screenType seul ne dit pas la stéréo).', first: 'video.mp4', last: 'video.mp4', same: 'hevc-mp4', partial: { screenType: 'dome' } },
  'loader-hevc': { n: 12, title: 'Labo 12 · chargement HEVC (fMP4) puis film HEVC (fMP4) dans le même flux', what: 'chargement HEVC fMP4 (12 s) puis film HEVC fMP4 (12 s)', hint: 'Mesuré (3e test du 02/10) : la bascule HEVC fMP4 -> HEVC fMP4 PASSE (même résolution, 8 bits). Le Labo 5 (H.264 puis HEVC) se fige à la bascule.', first: 'a_init.mp4', last: 'b_002.m4s', hevc: true, combo: { a: { hevc: true, fmp4: true }, b: { hevc: true } } },
  // Labos 13 à 15 : conditions de la bascule HEVC automatique (sans « Retour puis relancer »). 16 : zapper dans un film qui n'est pas encore téléchargé.
  'loader-8k':   { n: 13, title: 'Labo 13 · chargement HEVC (fMP4) puis film HEVC 10 bits 8192×4096 (vrai format)', what: 'chargement HEVC 8 bits 3840×1920 (12 s), puis film HEVC Main 10 8192×4096 copié depuis un MKV comme un vrai torrent (12 s)', hint: 'À mesurer : la bascule tient-elle quand la résolution et la profondeur de couleur changent (cas des vrais films 8K) ? Généré en dernier, environ 2 min après le démarrage du pont.', first: 'a_init.mp4', last: 'b_002.m4s', hevc: true, heavy: true, combo: { a: { hevc: true, fmp4: true }, b: { hevc: true, big: true } } },
  'loader-h264fmp4': { n: 14, title: 'Labo 14 · chargement H.264 (fMP4) puis film HEVC (fMP4)', what: 'chargement H.264 en fMP4 (12 s), puis film HEVC fMP4 (12 s)', hint: 'À mesurer : le Labo 5 (chargement H.264 en TS) se fige. Si celui-ci passe, c\'est le passage TS -> fMP4 qui bloquait : le pont n\'aurait pas besoin de deviner le codec du film avant de l\'avoir lu.', first: 'a_init.mp4', last: 'b_002.m4s', hevc: true, combo: { a: { hevc: false, fmp4: true }, b: { hevc: true } } },
  'loader-wrong': { n: 15, title: 'Labo 15 · chargement HEVC (fMP4) puis film H.264 (fMP4)', what: 'chargement HEVC fMP4 (12 s), puis film H.264 fMP4 (12 s)', hint: 'À mesurer : cas où le pont devinerait HEVC à tort pour un film H.264.', first: 'a_init.mp4', last: 'b_002.m4s', hevc: true, combo: { a: { hevc: true, fmp4: true }, b: { hevc: false } } },
  'zap-vod':     { n: 16, title: 'Labo 16 · zapper : sauter dans une vidéo de 90 s pas encore fabriquée', what: 'vidéo H.264 de 90 s dont toute la durée est annoncée ; chaque segment n\'est servi qu\'après 3 s (comme s\'il était converti à la demande)', hint: 'À mesurer : sautez vers 1:00 puis revenez vers 0:20 : la lecture reprend-elle à l\'endroit choisi après quelques secondes ? (condition pour zapper dans un film en cours de téléchargement)', first: 'seg000.ts', last: 'seg022.ts', dur: 90, zap: true, heavy: true },
  'hevc-mkv':    { n: 9, title: 'Labo 9 · HEVC en MKV direct 3840×1920', what: 'HEVC dans un MKV lu directement (comme la plupart des films torrent)', hint: 'Mesuré (2e test du 02/10) : passe. Les films HEVC en MKV sont lus directement.', first: 'video.mkv', last: 'video.mkv', hevc: true, file: 'video.mkv' },
};
const TYPES = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.m4s': 'video/iso.segment', '.mp4': 'video/mp4', '.mkv': 'video/x-matroska' };
const wrap = (t, n = 32) => { const out = []; for (const raw of String(t).split('\n')) { let l = ''; for (const w of raw.split(/\s+/)) { if ((l + ' ' + w).trim().length > n) { out.push(l); l = w; } else l = (l + ' ' + w).trim(); } out.push(l); } return out; };   // lignes courtes : en VR180 tout ce qui est large est étiré sur tout le dôme

function create({ cfg, log, serveLocal, font, escF, ffmpegOk, hevcOk, thumb, runner, zapDelayMs = 3000 }) {   // runner : remplace ffmpeg (tests) ; zapDelayMs : attente simulée d'un segment « converti à la demande » (Labo 16)
  const root = path.join(cfg.tempDir, 'lab'), stats = {}, gen = {}; let started = false;
  const run = runner || ((args, cwd) => new Promise(ok => { let e = ''; const pr = cp.spawn(cfg.ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'], cwd: cwd || undefined }); pr.stderr.on('data', d => { e += d; }); pr.on('error', x => ok(x.message)); pr.on('exit', c => ok(c === 0 ? '' : e.trim().slice(-300) || 'code ' + c)); }));
  const dirOf = k => path.join(root, SCENES[k].same || k);

  // image d'un œil (1920×1920) : bloc de texte COURT au centre (≈ 35 % de la largeur : un dôme de 180° étire tout ce qui est large) + compteur jaune ; deux yeux identiques côte à côte
  const filter = (txtFile, eye = EYE) => {
    let f = font ? `drawtext=fontfile='${escF(font)}':textfile='${escF(txtFile)}':expansion=none:fontcolor=white:fontsize=${Math.round(eye / 58 * (cfg.loaderTextScale || 1))}:line_spacing=${Math.round(eye / 170)}:x=(w-text_w)/2:y=h*0.3,drawtext=fontfile='${escF(font)}':text='%{eif\\:trunc(t)\\:d} s':fontcolor=yellow:fontsize=${Math.round(eye / 22 * (cfg.loaderTextScale || 1))}:x=(w-text_w)/2:y=h*0.62` : `null`;
    return `[0:v]${f},drawbox=x=0:y=0:w=iw:h=ih/60:color=0x33cc77:t=fill,split[a][b];[a][b]hstack[v]`;
  };
  const src = (secs, txtFile, eye = EYE) => ['-f', 'lavfi', '-i', `color=c=0x1a2a3a:s=${eye}x${eye}:r=15:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=330:r=48000:d=${secs}`, '-filter_complex', filter(txtFile, eye) + `;[1:a]volume=0.05[au]`, '-map', '[v]', '-map', '[au]'];
  const venc = hevc => hevc ? ['-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error:keyint=30', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p'] : ['-c:v', 'libx264', '-preset', 'ultrafast', '-g', '30', '-pix_fmt', 'yuv420p'];
  const aenc = ['-c:a', 'aac', '-b:a', '96k'];
  const note = (k, s) => wrap((s.zap ? ['LABO ' + s.n + ' — ZAPPER', '', 'Le compteur jaune = la position dans la vidéo (90 s).', '', 'Sautez vers 1:00, puis revenez vers 0:20.', 'Notez : la lecture reprend-elle à l\'endroit choisi ? après combien de secondes ?']
    : ['LABO ' + s.n, s.what, '', 'Si vous lisez ceci et que le compteur jaune avance :', 'CE FORMAT PASSE.', '', 'Notez : texte net ? image devant vous ? options FLAT/180/360 proposées ?']).join('\n')).join('\n');
  // ffmpeg tourne DANS le dossier de sortie avec des noms RELATIFS : l'emplacement de init.mp4 / des segments ne dépend plus de la version de ffmpeg (sur Windows, init.mp4 atterrissait ailleurs -> 404 -> Labos 3 et 5 invalides)
  const hls = (outDir, prefix, hevc, fmp4, secs, txt, extra = []) => run([...src(secs, txt), ...venc(hevc), ...aenc, '-f', 'hls', '-hls_time', String(SEG), '-hls_list_size', '0', '-hls_playlist_type', 'vod',
    ...(fmp4 ? ['-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', prefix === 'seg' ? 'init.mp4' : prefix + 'init.mp4', '-hls_segment_filename', `${prefix}%03d.m4s`] : ['-hls_segment_filename', `${prefix}%03d.ts`]), ...extra, `${prefix}.m3u8`], outDir);
  const need = (d, files) => files.filter(f => !fs.existsSync(path.join(d, f))).join(', ');

  async function build(k) {
    const s = SCENES[k], d = dirOf(k); if (s.same) return gen[s.same] || build(s.same);
    fs.mkdirSync(d, { recursive: true }); const txt = path.join(d, 'texte.txt'); fs.writeFileSync(txt, note(k, s), 'utf8');
    const t0 = Date.now(); let err = '';
    if (s.hevc && !hevcOk) return 'encodeur HEVC (libx265) absent de ce ffmpeg';
    if (k === 'hevc-mp4') err = await run([...src(DUR, txt), ...venc(true), ...aenc, '-movflags', '+faststart', 'video.mp4'], d);
    else if (k === 'hevc-mkv') err = await run([...src(DUR, txt), ...venc(true), ...aenc, '-f', 'matroska', 'video.mkv'], d);
    else if (s.combo) {   // une playlist : chargement (a_) -> #EXT-X-DISCONTINUITY -> film (b_), comme l'écran de chargement du pont
      const A = s.combo.a, B = s.combo.b, ta = path.join(d, 'texte-a.txt'), tb = path.join(d, 'texte-b.txt');
      const la = `${A.hevc ? 'HEVC' : 'H.264'} ${A.fmp4 ? 'fMP4' : 'TS'}`, lb = B.big ? 'HEVC 10 bits 8K fMP4' : `${B.hevc ? 'HEVC' : 'H.264'} fMP4`;   // texte propre à chaque scène, titre sur une ligne courte
      fs.writeFileSync(ta, wrap([`LABO ${s.n} — CHARGEMENT`, la, '', `Dans 12 s le FILM (${lb}) doit prendre le relais sans que le lecteur redémarre.`, '', 'Notez ce qui se passe à la bascule.'].join('\n')).join('\n'), 'utf8');
      fs.writeFileSync(tb, wrap([`LABO ${s.n} — FILM`, lb, '', 'Si vous lisez ceci : la bascule FONCTIONNE dans un seul flux.', '', 'Notez : image devant vous ? texte net ?'].join('\n')).join('\n'), 'utf8');
      err = await hls(d, 'a_', A.hevc, A.fmp4, 12, ta);
      if (!err && B.big) {   // vrai format de film : HEVC Main 10 8192×4096 dans un MKV, puis copié tel quel en fMP4 (exactement ce que ferait le pont avec un torrent)
        err = await run([...src(12, tb, 4096), '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error:keyint=30', '-pix_fmt', 'yuv420p10le', ...aenc, '-f', 'matroska', 'b_src.mkv'], d)
          || await run(['-i', 'b_src.mkv', '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'copy', '-tag:v', 'hvc1', ...aenc, '-f', 'hls', '-hls_time', String(SEG), '-hls_list_size', '0', '-hls_playlist_type', 'vod', '-hls_segment_type', 'fmp4', '-hls_fmp4_init_filename', 'b_init.mp4', '-hls_segment_filename', 'b_%03d.m4s', 'b_.m3u8'], d);
        try { fs.rmSync(path.join(d, 'b_src.mkv'), { force: true }); } catch {}
      } else if (!err) err = await hls(d, 'b_', B.hevc, true, 12, tb);
      if (!err && (err = need(d, ['a_.m3u8', 'b_.m3u8', 'b_init.mp4', 'b_000.m4s', ...(A.fmp4 ? ['a_init.mp4'] : [])]))) err = 'fichiers absents après ffmpeg : ' + err;
      if (!err) {   // durées réelles des segments (un film copié est coupé sur ses images clés, pas exactement toutes les 4 s)
        const segs = f => { const out = []; let dur = SEG; for (const l of fs.readFileSync(path.join(d, f), 'utf8').split('\n').map(x => x.trim())) { const m = /^#EXTINF:([\d.]+)/.exec(l); if (m) dur = +m[1]; else if (/^[a-z]_\d+\.(ts|m4s)$/.test(l)) out.push([l, dur]); } return out; };
        const SA = segs('a_.m3u8'), SB = segs('b_.m3u8'), td = Math.ceil(Math.max(SEG, ...SA.concat(SB).map(x => x[1])));
        fs.writeFileSync(path.join(d, 'index.m3u8'), ['#EXTM3U', '#EXT-X-VERSION:7', `#EXT-X-TARGETDURATION:${td}`, '#EXT-X-MEDIA-SEQUENCE:0', '#EXT-X-PLAYLIST-TYPE:VOD', ...(A.fmp4 ? ['#EXT-X-MAP:URI="a_init.mp4"'] : []), ...SA.flatMap(([x, t]) => [`#EXTINF:${t.toFixed(3)},`, x]), '#EXT-X-DISCONTINUITY', '#EXT-X-MAP:URI="b_init.mp4"', ...SB.flatMap(([x, t]) => [`#EXTINF:${t.toFixed(3)},`, x]), '#EXT-X-ENDLIST', ''].join('\n'));
      }
    } else {
      err = await hls(d, 'seg', !!s.hevc, k === 'hevc-fmp4', s.dur || DUR, txt);
      if (!err && (err = need(d, k === 'hevc-fmp4' ? ['seg.m3u8', 'init.mp4', 'seg000.m4s'] : ['seg.m3u8', 'seg000.ts']))) err = 'fichiers absents après ffmpeg : ' + err;
      if (!err) { const idx = path.join(d, 'seg.m3u8'); try { fs.copyFileSync(idx, path.join(d, 'index.m3u8')); } catch {} }
    }
    if (err) log('warn', `banc de test ${k} : génération impossible (${err.slice(0, 200)})`); else log('debug', `banc de test ${k} : prêt en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return err;
  }
  const done = {};   // scène -> '' (prête) ou message d'erreur, une fois la génération terminée
  const ensure = k => { const j = SCENES[k].same || k; return gen[j] || (gen[j] = build(j).then(e => { done[j] = e ? 'échec : ' + String(e).slice(0, 120) : ''; return e; })); };

  // fiche « mode d'emploi » : où trouver le menu et la recherche (la bibliothèque native de DeoVR n'en a pas)
  async function guideFile(host) {
    const f = path.join(root, 'guide-' + require('crypto').createHash('sha1').update(host).digest('hex').slice(0, 8) + '.mp4');
    if (fs.existsSync(f)) return f;
    fs.mkdirSync(root, { recursive: true }); const t = f + '.txt';
    fs.writeFileSync(t, ['MENU LATÉRAL ET RECHERCHE', '', 'Cette bibliothèque (liste native de DeoVR) n\'a ni menu ni barre de recherche :', 'c\'est une limite de DeoVR.', '', 'Dans DeoVR, ouvrez le NAVIGATEUR (icône globe) et tapez :', '', `${host}/ui          -> menu, catégories, recherche`, `${host}/s/votre mot   -> recherche directe`].join('\n'), 'utf8');
    const err = await run(['-f', 'lavfi', '-i', 'color=c=0x101820:s=1920x1080:r=5:d=10', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '10', '-vf', font ? `drawtext=fontfile='${escF(font)}':textfile='${escF(t)}':expansion=none:fontcolor=white:fontsize=44:line_spacing=18:x=(w-text_w)/2:y=(h-text_h)/2` : 'null', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', f]);
    if (err) throw new Error(err); return f;
  }

  const items = base => [{ title: 'Mode d\'emploi · menu latéral et recherche (où les trouver)', videoLength: 10, thumbnailUrl: thumb(base), video_url: `${base}/video/lab/guide.json` },
    ...Object.entries(SCENES).sort((x, y) => x[1].n - y[1].n).map(([k, s]) => ({ title: s.title, videoLength: s.dur || DUR, thumbnailUrl: thumb(base), video_url: `${base}/video/lab/${k}.json` }))];
  function video(k, base) {
    if (k === 'guide') return { id: 9099, title: 'Mode d\'emploi · menu latéral et recherche', videoLength: 10, thumbnailUrl: thumb(base), screenType: 'flat', stereoMode: 'off', is3d: false, encodings: [{ name: 'h264', videoSources: [{ resolution: 1080, url: `${base}/lab/guide/video.mp4` }] }] };
    const s = SCENES[k]; if (!s) return null;
    const url = `${base}/lab/${k}/${s.alias || s.file || (s.same && SCENES[s.same].file) || 'index.m3u8'}`, common = { id: 9100 + s.n, title: s.title, videoLength: s.dur || DUR, thumbnailUrl: thumb(base), ...(s.partial ? s.partial : s.noFormat ? {} : { screenType: 'dome', stereoMode: 'sbs', is3d: true }) };
    return s.usePath ? { ...common, path: url } : { ...common, encodings: [{ name: 'h264', videoSources: [{ resolution: 1920, url }] }] };
  }
  const st = k => stats[k] || (stats[k] = { ouvertures: [], requetes: 0, fichiers: {}, fin: false });
  async function handle(req, res, k, file) {
    if (k === 'guide') { try { return serveLocal(req, res, await guideFile((req.headers.host || 'adresse-du-pont:4477')), 'video/mp4'); } catch (e) { res.writeHead(500); return res.end(); } }
    const s = SCENES[k]; if (!s || !ffmpegOk) { res.writeHead(404); return res.end(); }
    const err = await new Promise(ok => { const t = setTimeout(() => ok('délai de génération dépassé'), s.heavy ? 240000 : 60000); if (t.unref) t.unref(); ensure(k).then(e => { clearTimeout(t); ok(e); }, e => { clearTimeout(t); ok(String(e && e.message || e)); }); });
    if (s.alias && file === s.alias) file = SCENES[s.same].file;   // même fichier servi sous un autre nom
    const f = path.join(dirOf(k), path.basename(file));
    if (err || !fs.existsSync(f)) { res.writeHead(err ? 503 : 404); return res.end(); }
    if (s.alias) file = s.alias;
    if (req.method === 'GET') {
      const a = st(k); a.requetes++; a.fichiers[file] = (a.fichiers[file] || 0) + 1;
      const now = Date.now();
      if (file === s.first && a.ouvertures.length && now - a.ouvertures[a.ouvertures.length - 1] < 2000) a.sondes = (a.sondes || 0) + 1;   // lecture d'un MKV/MP4 : plusieurs demandes en rafale = une seule ouverture
      else if (file === s.first) {
        a.ouvertures.push(now); const n = a.ouvertures.length;
        if (n === 1) log('info', `[banc de test] ${s.title} : le lecteur ouvre le flux`);
        else { const dt = ((now - a.ouvertures[n - 2]) / 1000).toFixed(1); log(dt <= 30 ? 'warn' : 'info', `[banc de test] ${s.title} : le lecteur ${dt <= 30 ? 'RECOMMENCE le flux (ouverture n°' + n + ', ' + dt + ' s après la précédente) -> il n\'arrive pas à le démarrer' : 'rouvre le flux (nouvel essai, ' + dt + ' s après la précédente)'}`); }
      }
      if (file === s.last) { a.fin = true; log('info', `[banc de test] ${s.title} : dernier élément demandé (le lecteur est allé au bout)`); }
      const zm = s.zap && /^seg(\d+)\.ts$/.exec(file);
      if (zm) {   // zapping : ordre des segments demandés (un saut = segment demandé loin du précédent) ; 1er accès retardé comme une conversion à la demande
        const i = +zm[1], prev = a.segs && a.segs.length ? a.segs[a.segs.length - 1] : -1; (a.segs = a.segs || []).push(i); if (a.segs.length > 300) a.segs.shift();
        if (prev >= 0 && (i > prev + 2 || i < prev)) { a.sauts = (a.sauts || 0) + 1; log('info', `[banc de test] ${s.title} : SAUT du segment ${prev} au segment ${i} (vers ${i * SEG} s)`); }
        a.servis = a.servis || new Set(); if (!a.servis.has(i)) { a.servis.add(i); await new Promise(r => setTimeout(r, zapDelayMs)); }
      }
    }
    return serveLocal(req, res, f, TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream');
  }
  function verdict(k) {   // un « redémarrage » = le lecteur redemande le début moins de 30 s après (un nouvel essai de l'utilisateur, minutes plus tard, n'en est pas un)
    const a = stats[k]; if (!a || !a.ouvertures.length) return 'pas encore ouvert';
    const gaps = a.ouvertures.slice(1).map((t, i) => +((t - a.ouvertures[i]) / 1000).toFixed(1)), quick = gaps.filter(g => g <= 30);
    if (quick.length) return `ÉCHEC probable : flux recommencé ${quick.length} fois en moins de 30 s (écarts ${quick.join(' s, ')} s)`;
    const again = gaps.length ? ` (rouvert ${gaps.length} fois plus tard : nouveaux essais)` : '';
    if (SCENES[k].zap) return (a.sauts ? `${a.sauts} saut(s) suivi(s) par le lecteur (segments demandés : ${a.segs.slice(-40).join(' ')})` : 'aucun saut détecté (le lecteur a lu dans l\'ordre)') + again;
    return (a.fin ? 'OK probable : lu jusqu\'au bout sans redémarrage' : 'ouvert, pas jusqu\'au bout (quitté avant la fin ?)') + again;
  }
  const data = () => ({ aide: 'Pour chaque scène : ouvrez-la dans DeoVR (onglet Test pont), regardez, puis notez ce que vous avez vu. « verdict » ne dit que ce que le lecteur a demandé au pont.', hevc: !!hevcOk, scenes: Object.fromEntries(Object.entries(SCENES).map(([k, s]) => [k, { titre: s.title, question: s.hint, verdict: verdict(k), pret: gen[s.same || k] ? (done[s.same || k] === undefined ? 'en cours de génération' : done[s.same || k] || 'oui') : 'non généré', ouvertures: (stats[k] || { ouvertures: [] }).ouvertures.map(t => new Date(t).toISOString().slice(11, 23)), requetes: (stats[k] || {}).requetes || 0 }])) });
  // génération en arrière-plan, une scène à la fois (≈ 1 min, puis les scènes lourdes 13 et 16 : ≈ 2 min de plus) : les scènes sont prêtes avant le premier clic
  function prepare() { if (started || !ffmpegOk) return; started = true; const ks = Object.keys(SCENES).filter(k => !SCENES[k].same); (async () => { for (const k of [...ks.filter(k => !SCENES[k].heavy), ...ks.filter(k => SCENES[k].heavy)]) await ensure(k); })().catch(() => {}); }
  return { items, video, handle, data, prepare, SCENES };
}
module.exports = { create, SCENES };
