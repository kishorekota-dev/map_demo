#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const { createHash } = require('crypto');
const { withLockedClient } = require('./maintenance');

async function runMigrations(options = {}) {
  const directory = options.directory || path.join(__dirname, '../migrations');
  const log = options.log || console.log;
  const files = (await fs.readdir(directory)).filter(file => /^V\d+__.+\.sql$/.test(file));
  if (!files.length) throw new Error('No versioned banking migrations were found.');
  const migrations = files.map(file => {
    const [, rawVersion, description] = file.match(/^V(\d+)__(.+)\.sql$/);
    return { file, version: BigInt(rawVersion).toString(), description: description.replace(/_/g, ' ') };
  }).sort((a, b) => BigInt(a.version) < BigInt(b.version) ? -1 : BigInt(a.version) > BigInt(b.version) ? 1 : 0);
  if (new Set(migrations.map(entry => entry.version)).size !== migrations.length) throw new Error('Duplicate banking migration versions are not allowed.');

  return withLockedClient(options, async client => {
    await client.query(`CREATE TABLE IF NOT EXISTS flyway_schema_history (
      installed_rank INT NOT NULL PRIMARY KEY, version VARCHAR(50), description VARCHAR(200) NOT NULL,
      type VARCHAR(20) NOT NULL, script VARCHAR(1000) NOT NULL, checksum INT, installed_by VARCHAR(100) NOT NULL,
      installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, execution_time INT NOT NULL, success BOOLEAN NOT NULL
    )`);
    await client.query('ALTER TABLE flyway_schema_history ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT');
    let applied = 0;
    for (const migration of migrations) {
      const sql = await fs.readFile(path.join(directory, migration.file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query('SELECT checksum_sha256 FROM flyway_schema_history WHERE version = $1 AND success = true', [migration.version]);
      if (previous.rowCount) {
        if (previous.rows.some(row => row.checksum_sha256 && row.checksum_sha256 !== checksum)) throw new Error(`Applied migration ${migration.file} has changed; restore the original file and add a new migration.`);
        log(`${migration.file}: already applied${previous.rows[0].checksum_sha256 ? '' : ' (legacy history has no source checksum)'}`);
        continue;
      }
      const started = Date.now();
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO flyway_schema_history
          (installed_rank, version, description, type, script, installed_by, execution_time, success, checksum_sha256)
          VALUES ((SELECT COALESCE(MAX(installed_rank), 0) + 1 FROM flyway_schema_history), $1, $2, 'SQL', $3, CURRENT_USER, $4, true, $5)`,
        [migration.version, migration.description, migration.file, Date.now() - started, checksum]);
        await client.query('COMMIT');
        applied++;
        log(`${migration.file}: applied`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`${migration.file} failed and was rolled back: ${error.message}`);
      }
    }
    return { applied, total: migrations.length };
  });
}

if (require.main === module) {
  if (process.argv.length > 2) {
    console.error('Migration arguments and rollback are not supported. Use a reviewed forward migration or restore a database backup.');
    process.exitCode = 1;
  } else runMigrations().then(result => console.log(`Banking migrations complete: ${result.applied} applied.`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { runMigrations };
