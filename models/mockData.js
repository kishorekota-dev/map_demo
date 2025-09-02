const { v4: uuidv4 } = require('uuid');

// Mock Data Storage
const mockData = {
  users: new Map(),
  accounts: new Map(),
  cards: new Map(),
  transactions: new Map(),
  balanceTransfers: new Map(),
  disputes: new Map(),
  fraudCases: new Map(),
  fraudSettings: new Map()
};

// Generate sample data
const generateSampleData = () => {
  // Sample Users
  const sampleUsers = [
    {
      id: uuidv4(),
      email: 'john.doe@example.com',
      password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewvMB0K5mYT7yDG.', // password123
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1-555-0123',
      createdAt: new Date('2023-01-15'),
      lastLogin: new Date()
    },
    {
      id: uuidv4(),
      email: 'jane.smith@example.com',
      password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewvMB0K5mYT7yDG.', // password123
      firstName: 'Jane',
      lastName: 'Smith',
      phone: '+1-555-0124',
      createdAt: new Date('2023-02-20'),
      lastLogin: new Date()
    }
  ];

  sampleUsers.forEach(user => {
    mockData.users.set(user.id, user);
  });

  // Sample Accounts
  sampleUsers.forEach((user, index) => {
    const account = {
      id: uuidv4(),
      userId: user.id,
      accountNumber: `4532${String(1000 + index).padStart(4, '0')}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      accountType: 'CREDIT',
      status: 'ACTIVE',
      creditLimit: 5000.00 + (index * 1000),
      currentBalance: 1250.50 + (index * 200),
      availableCredit: 3749.50 + (index * 800),
      paymentDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      minimumPayment: 125.00 + (index * 20),
      interestRate: 18.99,
      rewardsPoints: 1500 + (index * 300),
      createdAt: new Date('2023-01-15'),
      lastModified: new Date()
    };
    mockData.accounts.set(account.id, account);

    // Sample Cards for each account
    const card = {
      id: uuidv4(),
      accountId: account.id,
      userId: user.id,
      cardNumber: `4532****${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
      fullCardNumber: account.accountNumber, // In real system, this would be encrypted
      cardType: 'VISA',
      expiryDate: '12/27',
      cvv: '***',
      fullCvv: String(Math.floor(Math.random() * 900) + 100), // In real system, this would be encrypted
      status: 'ACTIVE',
      isBlocked: false,
      blockedTransactions: false,
      fraudProtectionEnabled: true,
      issuedDate: new Date('2023-01-15'),
      lastUsed: new Date(),
      dailyLimit: 2000.00,
      monthlyLimit: 10000.00
    };
    mockData.cards.set(card.id, card);

    // Sample Transactions
    for (let i = 0; i < 5; i++) {
      const transaction = {
        id: uuidv4(),
        accountId: account.id,
        cardId: card.id,
        userId: user.id,
        amount: Math.floor(Math.random() * 500) + 10,
        currency: 'USD',
        type: Math.random() > 0.8 ? 'REFUND' : 'PURCHASE',
        status: Math.random() > 0.95 ? 'PENDING' : 'COMPLETED',
        merchantName: ['Amazon', 'Walmart', 'Target', 'Starbucks', 'Shell'][Math.floor(Math.random() * 5)],
        merchantCategory: 'RETAIL',
        description: `Purchase at ${['Amazon', 'Walmart', 'Target', 'Starbucks', 'Shell'][Math.floor(Math.random() * 5)]}`,
        transactionDate: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000),
        authorizationCode: `AUTH${Math.floor(Math.random() * 1000000)}`,
        location: {
          city: 'New York',
          state: 'NY',
          country: 'USA',
          zipCode: '10001'
        },
        isDisputed: false,
        isFraudulent: Math.random() > 0.95,
        createdAt: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000)
      };
      mockData.transactions.set(transaction.id, transaction);
    }

    // Sample Fraud Settings
    const fraudSettings = {
      id: uuidv4(),
      accountId: account.id,
      userId: user.id,
      blockIncomingTransactions: false,
      dailyTransactionLimit: 2000.00,
      internationalTransactionsBlocked: false,
      onlineTransactionsBlocked: false,
      contactlessTransactionsBlocked: false,
      atmTransactionsBlocked: false,
      notificationPreferences: {
        email: true,
        sms: true,
        push: true
      },
      suspiciousActivityAlerts: true,
      geoLocationTracking: true,
      velocityChecks: true,
      merchantCategoryBlocking: [],
      trustedMerchants: [],
      createdAt: new Date(),
      lastModified: new Date()
    };
    mockData.fraudSettings.set(fraudSettings.id, fraudSettings);
  });
};

// Initialize sample data
generateSampleData();

// Helper functions
const findUserByEmail = (email) => {
  return Array.from(mockData.users.values()).find(user => user.email === email);
};

const findAccountsByUserId = (userId) => {
  return Array.from(mockData.accounts.values()).filter(account => account.userId === userId);
};

const findCardsByUserId = (userId) => {
  return Array.from(mockData.cards.values()).filter(card => card.userId === userId);
};

const findTransactionsByAccountId = (accountId) => {
  return Array.from(mockData.transactions.values()).filter(transaction => transaction.accountId === accountId);
};

const findBalanceTransfersByUserId = (userId) => {
  return Array.from(mockData.balanceTransfers.values()).filter(transfer => transfer.userId === userId);
};

const findDisputesByUserId = (userId) => {
  return Array.from(mockData.disputes.values()).filter(dispute => dispute.userId === userId);
};

const findFraudCasesByUserId = (userId) => {
  return Array.from(mockData.fraudCases.values()).filter(fraudCase => fraudCase.userId === userId);
};

module.exports = {
  mockData,
  findUserByEmail,
  findAccountsByUserId,
  findCardsByUserId,
  findTransactionsByAccountId,
  findBalanceTransfersByUserId,
  findDisputesByUserId,
  findFraudCasesByUserId,
  generateSampleData
};
