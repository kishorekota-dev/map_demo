const { Sequelize } = require('sequelize');
const config = require('../../config');
const { databaseTls } = require('./tls');

// Initialize Sequelize
const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging,
    pool: config.database.pool,
    dialectOptions: { ssl: databaseTls() }
  }
);

module.exports = sequelize;
