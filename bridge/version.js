'use strict';
// Source unique du numéro de version (mise à jour par `npm run bump`, doit égaler package.json : contrôlé par `npm run check`).
// `build` est renseigné uniquement dans l'exe fabriqué par scripts/build-exe.js (commit, date, suffixe de build de test).
module.exports = { version: '10.3.0', build: (typeof globalThis !== 'undefined' && globalThis.__BUILD__) || null };
