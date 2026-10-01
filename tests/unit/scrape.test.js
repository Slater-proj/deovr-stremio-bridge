'use strict';
const { test, after } = require('node:test'), assert = require('node:assert/strict');
const L = require('../helpers/env');
const { startMocks, hashOf } = require('../helpers/mocks');

test('udpScrape (BEP 15) : lit les seeders annoncés par un tracker', async () => {
  const m = await startMocks({ film: Buffer.alloc(16) });
  try {
    const res = await L.udpScrape(m.trackerHostPort, [hashOf(1), hashOf(3), hashOf(2)]);
    const get = h => (res.get ? res.get(h) : res[h]);
    assert.equal(get(hashOf(3)).seeders, 0, 'film « mort »');
    assert.ok(get(hashOf(1)).seeders >= 20, 'film rapide');
    assert.equal(get(hashOf(2)).seeders, 4, 'film lent');
  } finally { await m.close(); }
});
