// Point d'entrée : node server.js   (DEBUG=1 pour les logs détaillés)
const { start, cfg, log, selfCheck } = require('./lib');
start().then(() => {
  const nets = Object.values(require('os').networkInterfaces()).flat().filter(n => n.family === 'IPv4' && !n.internal);
  log('info', `Bridge prêt. Dans DeoVR, entre l'une de ces adresses :`);
  log('info', `  http://localhost:${cfg.port}   (DeoVR sur ce PC)`);
  if (cfg.bindHost === '0.0.0.0') for (const n of nets) log('info', `  http://${n.address}:${cfg.port}   (casque autonome / autre appareil)`);
  log('info', `Dans le casque : tape l'adresse ci-dessus, DeoVR affiche sa bibliothèque (onglet « En cours » en premier, puis « Plus de seeds », « Nouveautés », un onglet par catalogue Stremio).`);
  log('info', `Recherche dans le casque : tape  <adresse>/s/mot  (ex. http://${(nets[0] || { address: 'localhost' }).address}:${cfg.port}/s/avatar). Page web façon deovr.com (PC) : http://localhost:${cfg.port}/ui`);
  log('info', `Test des liens deovr:// : http://localhost:${cfg.port}/t  |  Suivi : /status  |  États : /debug/downloads  |  Journaux : bridge-debug.log, bridge-bilans.log`);
  selfCheck();
}).catch(e => {
  const msg = e.code === 'EADDRINUSE' ? `le port ${cfg.port} est déjà utilisé : le pont tourne sans doute déjà (autre fenêtre start.bat ouverte ?). Ferme-la ou change "port" dans config.json.`
    : e.code === 'EACCES' ? `accès refusé au port ${cfg.port} : choisis un port au-dessus de 1024 dans config.json.` : e.stack || e.message;
  log('error', 'Impossible de démarrer : ' + msg); console.error('\nIMPOSSIBLE DE DÉMARRER : ' + msg); process.exit(2);   // code 2 : start.bat ne relance pas
});
