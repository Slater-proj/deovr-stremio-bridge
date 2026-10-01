// Assistant de configuration : crée config.json
const fs = require('fs'), path = require('path'), rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));
(async () => {
  const f = path.join(__dirname, 'config.json');
  let cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.example.json'), 'utf8'));
  if (fs.existsSync(f) && (await ask('config.json existe déjà. Le refaire ? (o/N) ')).toLowerCase() !== 'o') { rl.close(); return; }
  console.log('\nConfiguration (ton mot de passe reste uniquement dans config.json sur ce PC)\n');
  cfg.email = (await ask('Email du compte Stremio : ')).trim();
  cfg.password = (await ask('Mot de passe Stremio : ')).trim();
  const p = (await ask('Port du serveur [8080] : ')).trim(); if (p) cfg.port = +p;
  const ld = (await ask('Dossier de videos VR sur ce PC (optionnel, ex. D:\\VR ; laisse vide pour passer) : ')).trim().replace(/^"|"$/g, '');
  if (ld) cfg.localDirs = [ld];
  fs.writeFileSync(f, JSON.stringify(cfg, null, 2));
  console.log('\nconfig.json créé.'); rl.close();
})();
