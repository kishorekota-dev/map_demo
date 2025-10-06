#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config');

async function runSeeds() {
  const pool = new Pool(config.database);

  try {
    console.log('Starting database seeding...');

    // Get all seed files
    const seedsDir = path.join(__dirname, '../seeds');
    const seedFiles = fs.readdirSync(seedsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensure they run in order

    console.log(`Found ${seedFiles.length} seed files`);

    for (const seedFile of seedFiles) {
      console.log(`\nRunning seed: ${seedFile}`);
      
      const seedPath = path.join(seedsDir, seedFile);
      const seedSQL = fs.readFileSync(seedPath, 'utf8');

      await pool.query(seedSQL);
      
      console.log(`✓ ${seedFile} completed`);
    }

    console.log('\n✓ Database seeding completed successfully');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Seeding failed:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

runSeeds();
