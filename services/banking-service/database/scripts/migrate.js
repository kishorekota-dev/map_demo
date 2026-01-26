#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function runMigrations() {
  const pool = new Pool(config.database);

  try {
    console.log('Starting database migrations...');
    console.log(`Database: ${config.database.database}`);

    // Create flyway_schema_history table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS flyway_schema_history (
        installed_rank INT NOT NULL PRIMARY KEY,
        version VARCHAR(50),
        description VARCHAR(200) NOT NULL,
        type VARCHAR(20) NOT NULL,
        script VARCHAR(1000) NOT NULL,
        checksum INT,
        installed_by VARCHAR(100) NOT NULL,
        installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        execution_time INT NOT NULL,
        success BOOLEAN NOT NULL
      )
    `);

    // Get all migration files
    const migrationsDir = path.join(__dirname, '../migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql') && file.match(/^V\d+__/))
      .sort();

    console.log(`Found ${migrationFiles.length} migration files`);

    let appliedCount = 0;
    
    for (const migrationFile of migrationFiles) {
      // Parse version and description from filename (e.g., V1__create_users_table.sql)
      const match = migrationFile.match(/^V(\d+)__(.+)\.sql$/);
      if (!match) continue;
      
      const version = match[1];
      const description = match[2].replace(/_/g, ' ');
      
      // Check if migration already applied
      const result = await pool.query(
        'SELECT 1 FROM flyway_schema_history WHERE version = $1 AND success = true',
        [version]
      );
      
      if (result.rowCount > 0) {
        console.log(`  ⊘ V${version}: ${description} (already applied)`);
        continue;
      }
      
      console.log(`  ▶ V${version}: ${description}`);
      
      const migrationPath = path.join(migrationsDir, migrationFile);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      const startTime = Date.now();
      
      try {
        await pool.query(migrationSQL);
        const executionTime = Date.now() - startTime;
        
        // Record successful migration
        await pool.query(`
          INSERT INTO flyway_schema_history 
          (installed_rank, version, description, type, script, installed_by, execution_time, success)
          VALUES ((SELECT COALESCE(MAX(installed_rank), 0) + 1 FROM flyway_schema_history), $1, $2, 'SQL', $3, $4, $5, true)
        `, [version, description, migrationFile, process.env.USER || 'migration-script', executionTime]);
        
        console.log(`    ✓ Completed in ${executionTime}ms`);
        appliedCount++;
      } catch (error) {
        console.error(`    ✗ Failed: ${error.message}`);
        
        // Record failed migration
        await pool.query(`
          INSERT INTO flyway_schema_history 
          (installed_rank, version, description, type, script, installed_by, execution_time, success)
          VALUES ((SELECT COALESCE(MAX(installed_rank), 0) + 1 FROM flyway_schema_history), $1, $2, 'SQL', $3, $4, 0, false)
        `, [version, description, migrationFile, process.env.USER || 'migration-script']);
        
        throw error;
      }
    }

    console.log('\n✓ Migrations completed successfully');
    console.log(`✓ Total migrations applied: ${appliedCount}`);
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

runMigrations();
