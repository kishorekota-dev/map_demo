# DialogFlow Enterprise Banking Configuration Guide

## Overview
This guide helps you set up a comprehensive DialogFlow NLP system for the Enterprise Banking ChatBot with extensive intents matching your backend API system.

## Quick Start

### 1. Prerequisites
- Google Cloud account with billing enabled
- Google Cloud CLI installed and authenticated
- Python 3.8+ installed
- Docker and Docker Compose (for testing integration)

### 2. Run the Setup Script
```bash
# Make the script executable
chmod +x setup-dialogflow.sh

# Run the setup
./setup-dialogflow.sh
```

### 3. Install Python Dependencies
```bash
# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r config/requirements.txt
```

### 4. Upload Intents and Entities
```bash
# Set environment variables
export GOOGLE_APPLICATION_CREDENTIALS=./config/dialogflow-service-account.json
export GOOGLE_CLOUD_PROJECT=enterprise-banking-chatbot

# Upload to DialogFlow
python3 ./config/upload_dialogflow.py

# Enhance training (optional)
python3 ./config/enhance_training.py
```

## DialogFlow Configuration

### Intent Categories Created

#### 🔐 Authentication Intents
- `auth.login` - User authentication and session management
- Handles: login requests, authentication verification, session establishment

#### 🏦 Account Management Intents
- `account.balance` - Check account balances
- `account.statement` - Generate and download account statements
- `transaction.history` - View transaction history with date filtering

#### 💳 Card Management Intents
- `card.status` - Check card status and information
- `card.block` - Block/freeze cards for security
- Supports: credit cards, debit cards, business cards

#### 💸 Payment Intents
- `payment.transfer` - Money transfers between accounts and to external recipients
- `payment.bill` - Bill payments with merchant and amount detection
- Supports: P2P transfers, bill payments, scheduled payments

#### 🛡️ Security & Fraud Intents
- `dispute.create` - File transaction disputes
- `fraud.report` - Report fraudulent activity and security breaches
- Supports: unauthorized transactions, identity theft, account compromise

#### 🤖 General Intents
- `general.greeting` - Welcome messages and conversation starters
- `general.help` - Capability explanations and feature discovery

### Custom Entities Created

#### @account-type
- Values: checking, savings, credit, business, external
- Synonyms: current, chequing, primary, save, deposit, etc.

#### @card-type
- Values: credit, debit, prepaid, business
- Synonyms: visa, mastercard, amex, atm card, etc.

#### @bill-type
- Values: electricity, water, gas, internet, phone, credit card, rent, insurance
- Comprehensive utility and service provider coverage

#### @account-number (Regex Pattern)
- Pattern: `\d{4,12}` - Matches 4-12 digit account numbers
- Used for account identification and verification

#### @card-number (Regex Pattern)
- Pattern: `\d{4}` - Matches last 4 digits of card numbers
- Used for secure card identification

## Backend API Integration

### Intent-to-API Mapping

```javascript
// Intent mapping in your ChatBot service
const intentApiMapping = {
  'auth.login': {
    endpoint: '/api/auth/login',
    method: 'POST',
    requiresAuth: false
  },
  'account.balance': {
    endpoint: '/api/accounts/balance',
    method: 'GET',
    requiresAuth: true,
    permission: 'read:balance'
  },
  'payment.transfer': {
    endpoint: '/api/balance-transfers',
    method: 'POST',
    requiresAuth: true,
    permission: 'write:transfer'
  },
  'card.block': {
    endpoint: '/api/cards/block',
    method: 'POST',
    requiresAuth: true,
    permission: 'write:card'
  },
  'dispute.create': {
    endpoint: '/api/disputes',
    method: 'POST',
    requiresAuth: true,
    permission: 'write:dispute'
  },
  'fraud.report': {
    endpoint: '/api/fraud/report',
    method: 'POST',
    requiresAuth: true,
    permission: 'write:fraud'
  }
};
```

### Parameter Extraction

```javascript
// Extract parameters from DialogFlow response
const extractParameters = (queryResult) => {
  const { intent, parameters } = queryResult;
  
  switch (intent.displayName) {
    case 'payment.transfer':
      return {
        amount: parameters['amount-of-money']?.amount,
        currency: parameters['amount-of-money']?.currency,
        recipient: parameters['recipient'],
        fromAccount: parameters['from-account']
      };
      
    case 'account.balance':
      return {
        accountType: parameters['account-type'],
        accountNumber: parameters['account-number']
      };
      
    case 'card.block':
      return {
        cardType: parameters['card-type'],
        lastFourDigits: parameters['card-number']
      };
  }
};
```

## Environment Configuration

### ChatBot UI Environment Variables
Add to your `.env` file:

```bash
# DialogFlow Configuration
GOOGLE_PROJECT_ID=enterprise-banking-chatbot
GOOGLE_APPLICATION_CREDENTIALS=./config/dialogflow-service-account.json
DIALOGFLOW_LANGUAGE_CODE=en
DIALOGFLOW_SESSION_ID_PREFIX=banking-session-

# Integration Settings
DIALOGFLOW_ENABLED=true
DIALOGFLOW_CONFIDENCE_THRESHOLD=0.7
DIALOGFLOW_FALLBACK_ENABLED=true
```

### Docker Compose Integration
Update your `docker-compose-enterprise.yml`:

```yaml
services:
  chatbot-ui:
    environment:
      - GOOGLE_PROJECT_ID=${GOOGLE_PROJECT_ID}
      - GOOGLE_APPLICATION_CREDENTIALS=/app/config/dialogflow-service-account.json
      - DIALOGFLOW_ENABLED=true
    volumes:
      - ./config/dialogflow-service-account.json:/app/config/dialogflow-service-account.json:ro
```

## Testing Your Setup

### 1. Test DialogFlow Console
Visit: https://dialogflow.cloud.google.com/
- Navigate to your project
- Use the simulator on the right side
- Test sample phrases like:
  - "Check my account balance"
  - "Transfer $100 to John"
  - "Block my credit card"

### 2. Test API Integration
```bash
# Start your enterprise stack
./docker-run-enterprise.sh start-all

# Test ChatBot endpoint with DialogFlow intent
curl -X POST http://localhost:3002/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is my account balance", "sessionId": "test-session"}'
```

### 3. Verify Intent Recognition
Monitor your ChatBot logs to ensure:
- DialogFlow intents are properly recognized
- Parameters are extracted correctly
- Backend API calls are made with proper authentication
- Responses are formatted appropriately

## Security Considerations

### 1. Service Account Security
- Store service account JSON securely
- Use environment variables, not hardcoded credentials
- Implement proper IAM roles with minimal permissions
- Rotate service account keys regularly

### 2. Session Management
- Implement proper session timeout
- Validate user sessions before sensitive operations
- Use secure session storage (Redis recommended)
- Log all authentication attempts

### 3. Parameter Validation
- Sanitize all user inputs from DialogFlow
- Validate extracted parameters before API calls
- Implement rate limiting for sensitive operations
- Use HTTPS for all communications

## Monitoring and Analytics

### 1. DialogFlow Analytics
- Monitor intent detection accuracy
- Track conversation completion rates
- Analyze most common user queries
- Identify gaps in intent coverage

### 2. Custom Metrics
```javascript
// Track intent performance
const trackIntentUsage = (intentName, confidence, success) => {
  console.log({
    intent: intentName,
    confidence: confidence,
    success: success,
    timestamp: new Date().toISOString()
  });
};
```

### 3. Error Handling
- Implement comprehensive error logging
- Set up alerts for low confidence scores
- Monitor API integration failures
- Track user satisfaction metrics

## Troubleshooting

### Common Issues

#### 1. Authentication Errors
```bash
# Verify credentials
gcloud auth list
export GOOGLE_APPLICATION_CREDENTIALS=./config/dialogflow-service-account.json
```

#### 2. Intent Not Recognized
- Check training phrases in DialogFlow console
- Verify intent is enabled
- Test with exact training phrase first
- Adjust confidence threshold if needed

#### 3. Parameter Extraction Issues
- Verify entity types are properly defined
- Check parameter mapping in intent configuration
- Test with simple, clear parameter values
- Review entity synonym definitions

#### 4. API Integration Problems
- Verify MCP server is running and accessible
- Check authentication token flow
- Validate API endpoint permissions
- Review backend API logs

### Debugging Commands
```bash
# Check DialogFlow project status
gcloud projects describe enterprise-banking-chatbot

# List intents
gcloud alpha dialogflow intents list --project=enterprise-banking-chatbot

# Test intent detection
gcloud alpha dialogflow text-request --project=enterprise-banking-chatbot --query="Check my balance"
```

## Next Steps

1. **Custom Training**: Add more training phrases based on user interactions
2. **Context Management**: Implement conversation context for multi-turn dialogs
3. **Rich Responses**: Add cards, quick replies, and multimedia responses
4. **Analytics Integration**: Set up comprehensive conversation analytics
5. **A/B Testing**: Test different response variations
6. **Multi-language Support**: Expand to support multiple languages
7. **Voice Integration**: Add voice input/output capabilities

## Support

- DialogFlow Documentation: https://cloud.google.com/dialogflow/docs
- Google Cloud Console: https://console.cloud.google.com/
- Enterprise Banking API Documentation: Check your backend API docs
- ChatBot UI Integration: See packages/chatbot-ui/README.md

---

**Created by**: Enterprise Banking DialogFlow Setup Script
**Version**: 1.0.0
**Last Updated**: September 2025
