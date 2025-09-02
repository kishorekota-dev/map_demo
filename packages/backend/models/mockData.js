// Database Models - Replacing Mock Data
const UserModel = require('./User');
const AccountModel = require('./Account');
const TransactionModel = require('./Transaction');
const { testConnection } = require('../database');

// Initialize database connection
let dbConnected = false;

const initializeDatabase = async () => {
  if (!dbConnected) {
    dbConnected = await testConnection();
    if (!dbConnected) {
      console.warn('⚠️ Database not connected, falling back to mock data');
    }
  }
  return dbConnected;
};

// User operations
const getUsers = async () => {
  await initializeDatabase();
  if (dbConnected) {
    const result = await UserModel.findAll();
    return result.users;
  }
  return []; // Fallback to empty array if DB not available
};

const getUserById = async (id) => {
  await initializeDatabase();
  if (dbConnected) {
    return await UserModel.findById(id);
  }
  return null;
};

const getUserByEmail = async (email) => {
  await initializeDatabase();
  if (dbConnected) {
    return await UserModel.findByEmail(email);
  }
  return null;
};

const createUser = async (userData) => {
  await initializeDatabase();
  if (dbConnected) {
    return await UserModel.create(userData);
  }
  throw new Error('Database not available');
};

const updateUser = async (id, updateData) => {
  await initializeDatabase();
  if (dbConnected) {
    return await UserModel.update(id, updateData);
  }
  throw new Error('Database not available');
};

// Account operations
const getAccounts = async (filters = {}, page = 1, limit = 20) => {
  await initializeDatabase();
  if (dbConnected) {
    return await AccountModel.findAll(filters, page, limit);
  }
  return { accounts: [], total: 0, page: 1, limit: 20, totalPages: 0 };
};

const getAccountById = async (id) => {
  await initializeDatabase();
  if (dbConnected) {
    return await AccountModel.findById(id);
  }
  return null;
};

const getAccountsByUserId = async (userId) => {
  await initializeDatabase();
  if (dbConnected) {
    return await AccountModel.findByUserId(userId);
  }
  return [];
};

const createAccount = async (accountData) => {
  await initializeDatabase();
  if (dbConnected) {
    return await AccountModel.create(accountData);
  }
  throw new Error('Database not available');
};

const updateAccount = async (id, updateData) => {
  await initializeDatabase();
  if (dbConnected) {
    return await AccountModel.update(id, updateData);
  }
  throw new Error('Database not available');
};

// Transaction operations
const getTransactions = async (filters = {}, page = 1, limit = 20) => {
  await initializeDatabase();
  if (dbConnected) {
    return await TransactionModel.findAll(filters, page, limit);
  }
  return { transactions: [], total: 0, page: 1, limit: 20, totalPages: 0 };
};

const getTransactionById = async (id) => {
  await initializeDatabase();
  if (dbConnected) {
    return await TransactionModel.findById(id);
  }
  return null;
};

const getTransactionsByUserId = async (userId, page = 1, limit = 20) => {
  await initializeDatabase();
  if (dbConnected) {
    return await TransactionModel.findByUserId(userId, page, limit);
  }
  return { transactions: [], total: 0, page: 1, limit: 20, totalPages: 0 };
};

const getTransactionsByAccountId = async (accountId, page = 1, limit = 20) => {
  await initializeDatabase();
  if (dbConnected) {
    return await TransactionModel.findByAccountId(accountId, page, limit);
  }
  return { transactions: [], total: 0, page: 1, limit: 20, totalPages: 0 };
};

const createTransaction = async (transactionData) => {
  await initializeDatabase();
  if (dbConnected) {
    return await TransactionModel.create(transactionData);
  }
  throw new Error('Database not available');
};

const updateTransaction = async (id, updateData) => {
  await initializeDatabase();
  if (dbConnected) {
    return await TransactionModel.update(id, updateData);
  }
  throw new Error('Database not available');
};

// Statistics and analytics
const getUserStatistics = async () => {
  await initializeDatabase();
  if (dbConnected) {
    return await UserModel.getStatistics();
  }
  return {
    total_users: 0,
    active_users: 0,
    customers: 0,
    staff: 0,
    verified_emails: 0,
    new_this_month: 0
  };
};

const getAccountStatistics = async () => {
  await initializeDatabase();
  if (dbConnected) {
    return await AccountModel.getStatistics();
  }
  return {
    total_accounts: 0,
    active_accounts: 0,
    total_credit_limit: 0,
    total_balance: 0,
    total_available_credit: 0,
    avg_interest_rate: 0,
    high_utilization_accounts: 0
  };
};

const getTransactionStatistics = async (userId = null) => {
  await initializeDatabase();
  if (dbConnected) {
    return await TransactionModel.getStatistics(userId);
  }
  return {
    total_transactions: 0,
    completed_transactions: 0,
    pending_transactions: 0,
    failed_transactions: 0,
    total_spent: 0,
    total_payments: 0,
    avg_transaction_amount: 0,
    high_risk_transactions: 0,
    international_transactions: 0,
    online_transactions: 0
  };
};

// Export the new database-backed functions
module.exports = {
  // User operations
  getUsers,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  
  // Account operations
  getAccounts,
  getAccountById,
  getAccountsByUserId,
  createAccount,
  updateAccount,
  
  // Transaction operations
  getTransactions,
  getTransactionById,
  getTransactionsByUserId,
  getTransactionsByAccountId,
  createTransaction,
  updateTransaction,
  
  // Statistics
  getUserStatistics,
  getAccountStatistics,
  getTransactionStatistics,
  
  // Database status
  initializeDatabase,
  isDbConnected: () => dbConnected
};
