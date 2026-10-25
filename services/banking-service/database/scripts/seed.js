#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const { createHash } = require('crypto');
const { withLockedClient } = require('./maintenance');
const BUSINESS_TABLES = ['users', 'customers', 'accounts', 'transactions', 'cards', 'transfers', 'fraud_alerts', 'disputes'];

async function runSeeds(options = {}) {
  if ((options.env || process.env).NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
  const directory = options.directory || path.join(__dirname, '../seeds');
  const files = (await fs.readdir(directory)).filter(file => file.endsWith('.sql')).sort();
  if (!files.length) throw new Error('The demo seed directory contains no SQL files.');
  const sources = await Promise.all(files.map(async file => ({ file, sql: await fs.readFile(path.join(directory, file), 'utf8') })));
  const checksum = createHash('sha256').update(JSON.stringify(sources)).digest('hex');
  return withLockedClient(options, async client => {
    await client.query('BEGIN');
    try {
      await client.query('CREATE TABLE IF NOT EXISTS banking_demo_seed_history (id INTEGER PRIMARY KEY CHECK (id = 1), checksum_sha256 TEXT NOT NULL, seeded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
      const previous = await client.query('SELECT checksum_sha256 FROM banking_demo_seed_history WHERE id = 1');
      if (previous.rowCount) {
        if (previous.rows[0].checksum_sha256 !== checksum) throw new Error('The demo seed bundle changed after this database was seeded. Use a new disposable database or an explicit data migration.');
        await client.query('COMMIT');
        return { applied: false, files: files.length };
      }
      for (const table of BUSINESS_TABLES) {
        if ((await client.query(`SELECT 1 FROM ${table} LIMIT 1`)).rowCount) throw new Error('Demo seeding requires an empty banking database. Existing data was preserved.');
      }
      for (const source of sources) await client.query(source.sql);
      await client.query('INSERT INTO banking_demo_seed_history (id, checksum_sha256) VALUES (1, $1)', [checksum]);
      await client.query('COMMIT');
      return { applied: true, files: files.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}
if (require.main === module) runSeeds().then(result => console.log(result.applied ? `Demo seeds applied atomically: ${result.files} files.` : 'Matching demo seed bundle already applied; no data changed.')).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { runSeeds };
