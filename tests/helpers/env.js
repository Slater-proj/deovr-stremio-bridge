'use strict';
// À charger AVANT bridge/lib.js dans les tests unitaires : journaux et état dans un dossier temporaire (pas dans le dépôt).
const fs = require('fs'), os = require('os'), path = require('path');
if (!process.env.BRIDGE_DATA_DIR) process.env.BRIDGE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-unit-'));
process.env.LOCAL_STREMIO = process.env.LOCAL_STREMIO || 'http://127.0.0.1:9';   // port fermé : jamais de vrai Stremio
module.exports = require('../../bridge/lib');
