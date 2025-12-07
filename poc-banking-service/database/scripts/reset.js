#!/usr/bin/env node

const { Pool } = require('pg');
const config = require('../config');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function resetDatabase() {
  const pool = new Pool(config.database);

  try {
    console.log('\n⚠️  WARNING: This will DROP all tables and data!');
    console.log(`Database: ${config.database.database}`);
    console.log(`Host: ${config.database.host}`);
    
    const answer = await question('\nAre you sure you want to continue? (yes/no): ');
    
    if (answer.toLowerCase() !== 'yes') {
      console.log('Reset cancelled.');
      rl.close();
      await pool.end();
      process.exit(0);
    }

    console.log('\nDropping all tables...');

    // Drop tables in reverse order of dependencies
    const dropQueries = [
      'DROP TABLE IF EXISTS disputes CASCADE;',
      'DROP TABLE IF EXISTS fraud_alerts CASCADE;',
      'DROP TABLE IF EXISTS transfers CASCADE;',
      'DROP TABLE IF EXISTS cards CASCADE;',
      'DROP TABLE IF EXISTS transactions CASCADE;',
      'DROP TABLE IF EXISTS accounts CASCADE;',
      'DROP TABLE IF EXISTS users CASCADE;',
      'DROP TABLE IF EXISTS flyway_schema_history CASCADE;',
      'DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;',
      'DROP FUNCTION IF EXISTS generate_account_number CASCADE;',
      'DROP FUNCTION IF EXISTS generate_reference_number CASCADE;',
      'DROP FUNCTION IF EXISTS generate_case_number CASCADE;'
    ];

    for (const query of dropQueries) {
      await pool.query(query);
    }

    console.log('✓ All tables dropped successfully');
    console.log('\nYou can now run migrations and seeds again:');
    console.log('  npm run db:setup');

    rl.close();
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('✗ Reset failed:', error.message);
    console.error(error);
    rl.close();
    await pool.end();
    process.exit(1);
  }
}

resetDatabase();
