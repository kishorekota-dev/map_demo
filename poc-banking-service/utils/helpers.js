const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');

/**
 * Generate unique account number
 * @param {string} accountType - Type of account
 * @returns {string} Formatted account number
 */
const generateAccountNumber = (accountType = 'checking') => {
  const prefix = {
    'checking': '1001',
    'savings': '2001',
    'credit': '3001',
    'loan': '4001'
  };
  
  const typePrefix = prefix[accountType] || '1001';
  const randomPart = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  
  return `${typePrefix}${randomPart}`;
};

/**
 * Generate unique transaction ID
 * @returns {string} Transaction ID
 */
const generateTransactionId = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TXN${timestamp}${random}`;
};

/**
 * Generate unique card number (mock)
 * @param {string} cardType - Type of card
 * @returns {string} Formatted card number
 */
const generateCardNumber = (cardType = 'debit') => {
  const prefix = {
    'debit': '4532',
    'credit': '5555',
    'prepaid': '4000'
  };
  
  const typePrefix = prefix[cardType] || '4532';
  const middle = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  const last = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  return `${typePrefix} ${middle.substring(0, 4)} ${middle.substring(4)} ${last}`;
};

/**
 * Generate CVV code
 * @returns {string} CVV code
 */
const generateCVV = () => {
  return Math.floor(Math.random() * 1000).toString().padStart(3, '0');
};

/**
 * Generate expiration date (2 years from now)
 * @returns {string} Expiration date in MM/YY format
 */
const generateExpirationDate = () => {
  const futureDate = moment().add(2, 'years');
  return futureDate.format('MM/YY');
};

/**
 * Generate reference number for transfers
 * @returns {string} Reference number
 */
const generateReferenceNumber = () => {
  const prefix = 'REF';
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}${timestamp}${random}`;
};

/**
 * Generate dispute case number
 * @returns {string} Case number
 */
const generateCaseNumber = () => {
  const prefix = 'CASE';
  const date = moment().format('YYYYMMDD');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}${date}${random}`;
};

/**
 * Hash sensitive data
 * @param {string} data - Data to hash
 * @param {string} salt - Salt for hashing
 * @returns {string} Hashed data
 */
const hashData = (data, salt = null) => {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(data, actualSalt, 10000, 64, 'sha512');
  return {
    hash: hash.toString('hex'),
    salt: actualSalt
  };
};

/**
 * Verify hashed data
 * @param {string} data - Original data
 * @param {string} hash - Hash to verify against
 * @param {string} salt - Salt used for hashing
 * @returns {boolean} Verification result
 */
const verifyHash = (data, hash, salt) => {
  const verifyHash = crypto.pbkdf2Sync(data, salt, 10000, 64, 'sha512');
  return hash === verifyHash.toString('hex');
};

/**
 * Mask sensitive data for logging
 * @param {string} data - Data to mask
 * @param {number} visibleChars - Number of characters to keep visible
 * @returns {string} Masked data
 */
const maskSensitiveData = (data, visibleChars = 4) => {
  if (!data || data.length <= visibleChars) {
    return '*'.repeat(data?.length || 0);
  }
  
  const visible = data.slice(-visibleChars);
  const masked = '*'.repeat(data.length - visibleChars);
  return masked + visible;
};

/**
 * Format currency amount
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string} Formatted amount
 */
const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
};

/**
 * Validate account number format
 * @param {string} accountNumber - Account number to validate
 * @returns {boolean} Validation result
 */
const validateAccountNumber = (accountNumber) => {
  // Basic format validation: 4-digit prefix + 8-digit number
  const pattern = /^\d{12}$/;
  return pattern.test(accountNumber.replace(/\s/g, ''));
};

/**
 * Validate card number using Luhn algorithm
 * @param {string} cardNumber - Card number to validate
 * @returns {boolean} Validation result
 */
const validateCardNumber = (cardNumber) => {
  const digits = cardNumber.replace(/\s/g, '').split('').map(Number);
  let sum = 0;
  let isEven = false;
  
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits[i];
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
};

/**
 * Calculate transaction fee
 * @param {number} amount - Transaction amount
 * @param {string} type - Transaction type
 * @returns {number} Fee amount
 */
const calculateTransactionFee = (amount, type) => {
  const feeStructure = {
    'wire_transfer': 25.00,
    'international_transfer': 45.00,
    'atm_withdrawal': 2.50,
    'overdraft': 35.00,
    'transfer': 0.00,
    'payment': 0.00,
    'deposit': 0.00,
    'withdrawal': 0.00
  };
  
  return feeStructure[type] || 0.00;
};

/**
 * Generate random PIN
 * @returns {string} 4-digit PIN
 */
const generatePIN = () => {
  return Math.floor(Math.random() * 10000).toString().padStart(4, '0');
};

/**
 * Validate routing number
 * @param {string} routingNumber - Routing number to validate
 * @returns {boolean} Validation result
 */
const validateRoutingNumber = (routingNumber) => {
  if (!/^\d{9}$/.test(routingNumber)) {
    return false;
  }
  
  // ABA routing number checksum validation
  const digits = routingNumber.split('').map(Number);
  const checksum = (3 * (digits[0] + digits[3] + digits[6])) +
                   (7 * (digits[1] + digits[4] + digits[7])) +
                   (digits[2] + digits[5] + digits[8]);
  
  return checksum % 10 === 0;
};

module.exports = {
  generateAccountNumber,
  generateTransactionId,
  generateCardNumber,
  generateCVV,
  generateExpirationDate,
  generateReferenceNumber,
  generateCaseNumber,
  generatePIN,
  hashData,
  verifyHash,
  maskSensitiveData,
  formatCurrency,
  validateAccountNumber,
  validateCardNumber,
  validateRoutingNumber,
  calculateTransactionFee
};