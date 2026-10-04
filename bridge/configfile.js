'use strict';
// Lecture / écriture prudente de config.json (réglages de l'utilisateur) : fusion clé par clé, écriture atomique, jamais d'écrasement d'un fichier illisible.
const fs = require('fs');

function read(file) {
  try { return { data: JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch (e) { return e.code === 'ENOENT' ? { data: {} } : { error: e.message }; }
}

// changes : { clé: valeur } ; une valeur `undefined` supprime la clé (retour à la valeur par défaut)
function save(file, changes) {
  const r = read(file);
  if (r.error) throw new Error(`config.json illisible (${r.error}) : corrigez-le ou supprimez-le avant d'enregistrer`);
  const data = { ...r.data };
  for (const [k, v] of Object.entries(changes)) { if (v === undefined) delete data[k]; else data[k] = v; }
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return data;
}

module.exports = { read, save };
