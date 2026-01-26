#!/usr/bin/env node

const { Pool } = require('pg');
const config = require('../config');

async function checkConnection() {
  const pool = new Pool(config.database);

  try {
    console.log('Checking database connection...');
    console.log(`Host: ${config.database.host}`);
    console.log(`Port: ${config.database.port}`);
    console.log(`Database: ${config.database.database}`);
    console.log(`User: ${config.database.user}`);

    const result = await pool.query('SELECT NOW() as current_time, version() as db_version');
    
    console.log('\n✓ Database connection successful!');
    console.log(`Current time: ${result.rows[0].current_time}`);
    console.log(`PostgreSQL version: ${result.rows[0].db_version.split(',')[0]}`);

    // Check if tables exist
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;
    const tablesResult = await pool.query(tablesQuery);
    
    console.log(`\nExisting tables: ${tablesResult.rows.length}`);
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Database connection failed:', error.message);
    console.error('\nPlease check:');
    console.error('  1. PostgreSQL is running');
    console.error('  2. Database credentials are correct in .env file');
    console.error('  3. Database exists and is accessible');
    await pool.end();
    process.exit(1);
  }
}

checkConnection();
