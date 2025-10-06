#!/usr/bin/env node

const { Flyway } = require('node-flywaydb');
const config = require('../config');
const path = require('path');

async function runMigrations() {
  try {
    console.log('Starting database migrations...');

    const flyway = new Flyway({
      defaultSchema: 'public',
      schemas: ['public'],
      locations: [`filesystem:${path.join(__dirname, '../migrations')}`],
      baselineOnMigrate: true,
      baselineVersion: '0',
      validateOnMigrate: true,
      outOfOrder: false,
      cleanDisabled: process.env.NODE_ENV === 'production',
      url: config.flyway.url || process.env.DATABASE_URL,
      user: config.flyway.user || process.env.DB_USER,
      password: config.flyway.password || process.env.DB_PASSWORD,
      table: 'flyway_schema_history'
    });

    // Run migrations
    const result = await flyway.migrate();
    
    console.log('✓ Migrations completed successfully');
    console.log(`✓ Migrations applied: ${result.migrationsExecuted}`);
    console.log(`✓ Target schema version: ${result.targetSchemaVersion}`);

    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('undo') || process.argv.includes('--undo')) {
  console.error('Flyway undo is not available in the community edition');
  process.exit(1);
} else {
  runMigrations();
}
