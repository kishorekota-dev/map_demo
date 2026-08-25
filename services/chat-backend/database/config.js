require('dotenv').config();

const sslOptions = process.env.DB_SSL === 'true' ? {
  ssl: {
    require: true,
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  }
} : {};

module.exports = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'poc_chat',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 10,
      min: parseInt(process.env.DB_POOL_MIN) || 2,
      acquire: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
      idle: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000
    },
    dialectOptions: sslOptions
  },
  test: {
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'poc_chat_test',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 2,
      min: 0,
      acquire: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
      idle: 1000
    },
    dialectOptions: sslOptions
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      min: parseInt(process.env.DB_POOL_MIN) || 5,
      acquire: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
      idle: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000
    },
    dialectOptions: sslOptions
  }
};
