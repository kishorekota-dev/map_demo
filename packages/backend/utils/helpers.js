const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY || '24h'
  });
};

const hashPassword = async (password) => {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  return await bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

const generateCardNumber = () => {
  // Generate a 16-digit card number starting with 4532 (Visa)
  const prefix = '4532';
  let number = prefix;
  
  for (let i = 4; i < 15; i++) {
    number += Math.floor(Math.random() * 10);
  }
  
  // Calculate Luhn checksum for the last digit
  let sum = 0;
  let isEven = true;
  
  for (let i = number.length - 1; i >= 0; i--) {
    let digit = parseInt(number[i]);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit = digit % 10 + Math.floor(digit / 10);
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return number + checkDigit;
};

const maskCardNumber = (cardNumber) => {
  if (!cardNumber || cardNumber.length < 4) return cardNumber;
  return cardNumber.slice(0, 4) + '****' + cardNumber.slice(-4);
};

const generateAuthCode = () => {
  return 'AUTH' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
};

const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
};

const generateReferenceNumber = (prefix = 'REF') => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}${timestamp}${random}`;
};

const validateEmailFormat = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePhoneFormat = (phone) => {
  const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
};

const isValidCardNumber = (cardNumber) => {
  // Basic Luhn algorithm validation
  const number = cardNumber.replace(/\D/g, '');
  if (number.length < 13 || number.length > 19) return false;
  
  let sum = 0;
  let isEven = false;
  
  for (let i = number.length - 1; i >= 0; i--) {
    let digit = parseInt(number[i]);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit = digit % 10 + Math.floor(digit / 10);
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
};

const getPaginationParams = (req) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
  const offset = (page - 1) * limit;
  
  return { page, limit, offset };
};

const createPaginatedResponse = (data, totalCount, page, limit) => {
  const totalPages = Math.ceil(totalCount / limit);
  
  return {
    data,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems: totalCount,
      itemsPerPage: limit,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
};

module.exports = {
  generateToken,
  hashPassword,
  comparePassword,
  generateCardNumber,
  maskCardNumber,
  generateAuthCode,
  formatCurrency,
  generateReferenceNumber,
  validateEmailFormat,
  validatePhoneFormat,
  isValidCardNumber,
  getPaginationParams,
  createPaginatedResponse
};
