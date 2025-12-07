# Fraud Case and Dispute Management - Implementation Guide

## Overview

This document describes the enhanced fraud case management and dispute resolution capabilities implemented in the AI Orchestrator, aligned with the Banking Service API specifications.

## New Intent Prompts

### 1. Enhanced Dispute Transaction Intent

**Intent**: `dispute_transaction`

**Purpose**: File a comprehensive dispute/chargeback case with proper categorization and evidence collection.

**Enhanced Features**:
- ✅ 10 dispute types supported (unauthorized, incorrect amount, service issues, fraud, etc.)
- ✅ Evidence collection guidance
- ✅ Case number generation and tracking
- ✅ Expected timeline communication (30-45 days)
- ✅ Merchant investigation workflow

**Required Data**:
- `transactionId`: Transaction being disputed
- `disputeType`: Type of dispute (from enumerated list)
- `reason`: Detailed explanation

**Optional Data**:
- `description`: Additional details
- `evidenceProvided`: Array of evidence types
- `amountDisputed`: Amount in question
- `merchantName`: Merchant involved

**Example Interaction**:
```
User: "I need to dispute transaction TXN-12345. I was charged $150 but only received $100 in service."

Bot: "I'll help you file a dispute for transaction TXN-12345.

This appears to be an 'incorrect_amount' dispute.

To strengthen your case, do you have any of the following evidence?
- Receipt showing the agreed amount
- Email confirmations
- Photos or screenshots
- Service agreement

Please provide any additional details about what happened."

User: "Yes, I have an email confirmation showing $100 was the agreed price."

Bot: "✅ Dispute Case #CASE202510-12345678 created successfully

Amount Disputed: $50 (difference between $150 charged and $100 agreed)
Expected Timeline: 30-45 days
Status: Under Review

Next Steps:
1. We'll contact the merchant within 3 business days
2. Merchant has 10 days to respond
3. We'll review all evidence and make a determination
4. You may be contacted for additional information

We've noted your email confirmation as evidence. You can add more evidence anytime through your dispute dashboard."
```

### 2. Report Fraud Intent

**Intent**: `report_fraud`

**Purpose**: Quickly report fraudulent activity and create fraud alerts.

**Key Features**:
- ✅ 9 fraud types (identity theft, account takeover, unauthorized transactions, etc.)
- ✅ Severity assessment (low, medium, high, critical)
- ✅ Immediate protective actions
- ✅ Risk score calculation
- ✅ 24-hour investigation timeline
- ✅ Zero Liability policy reminder

**Required Data**:
- `fraudType`: Type of fraudulent activity
- `description`: What happened

**Optional Data**:
- `transactionId`: Related transaction (if applicable)
- `amount`: Amount involved
- `location`: Where fraud occurred
- `dateOccurred`: When it happened

**NO CONFIRMATION REQUIRED** - Fraud reports are urgent and processed immediately.

**Example Interaction**:
```
User: "Someone charged $500 to my card and I didn't make this purchase!"

Bot: "🚨 I'm creating an urgent fraud alert right now.

Fraud Type: Unauthorized Transaction
Severity: HIGH
Amount: $500

IMMEDIATE ACTIONS TAKEN:
✓ Fraud alert created (Alert #FA-202510-987654)
✓ Transaction flagged for reversal
✓ Card temporarily blocked for your protection
✓ Fraud investigation team notified

NEXT STEPS:
1. Our fraud team will investigate within 24 hours
2. We'll contact you at your verified phone/email
3. You'll likely need a replacement card
4. Monitor your account for other suspicious activity

You're protected under our Zero Liability policy - you won't be responsible for fraudulent charges.

Would you like me to block your card permanently and order a replacement?"
```

### 3. Check Fraud Alerts Intent

**Intent**: `check_fraud_alerts`

**Purpose**: Review fraud alerts and their status.

**Features**:
- ✅ View all fraud alerts
- ✅ Filter by status and severity
- ✅ See actions taken
- ✅ Understand next steps

**Example Interaction**:
```
User: "Show me my fraud alerts"

Bot: "You have 2 fraud alerts:

1. Alert #FA-202510-987654
   Type: Unauthorized Transaction
   Severity: HIGH
   Status: Investigating
   Amount: $500.00
   Date: Oct 9, 2025
   Action Taken: Card blocked, transaction flagged
   Description: Unauthorized charge at unknown merchant

2. Alert #FA-202510-876543
   Type: Unusual Activity
   Severity: MEDIUM
   Status: Pending Verification
   Date: Oct 8, 2025
   Description: Multiple login attempts from new location
   
   ⚠️ ACTION NEEDED: Please verify if this was you.

Would you like details on any specific alert?"
```

### 4. Verify Transaction Intent

**Intent**: `verify_transaction`

**Purpose**: Respond to fraud alerts by confirming if activity was legitimate.

**Features**:
- ✅ View flagged transaction details
- ✅ Simple yes/no verification
- ✅ Automatic false positive marking
- ✅ Automatic fraud escalation if confirmed

**Example Interaction**:
```
User: "I need to verify alert FA-202510-876543"

Bot: "Alert #FA-202510-876543 Details:

Transaction: $150.00 at Amazon.com
Date: Oct 8, 2025, 3:45 PM
Location: Seattle, WA
Device: iPhone (new device)
IP Address: 192.168.1.100

This was flagged because:
- Login from new device
- Different location than usual
- Higher than typical transaction amount

Did you authorize this transaction? (Yes/No)"

User: "Yes, that was me. I got a new phone."

Bot: "✅ Transaction verified as legitimate

I've marked Alert #FA-202510-876543 as a false positive. Your account and card remain active with no restrictions.

For future security:
- Your new device is now recognized
- Consider enabling biometric authentication
- Set up transaction alerts for purchases over $100"
```

## MCP Tool Definitions

### Fraud Management Tools

| Tool Name | Purpose | Required Fields |
|-----------|---------|-----------------|
| `banking_create_fraud_alert` | Create fraud alert/case | userId, alertType, description |
| `banking_get_fraud_alerts` | List user's fraud alerts | userId |
| `banking_get_fraud_alert_details` | Get specific alert details | alertId, userId |
| `banking_confirm_fraud` | Confirm fraud is real | alertId, userId |
| `banking_mark_false_positive` | Mark as legitimate | alertId, userId |
| `banking_verify_transaction` | Verify transaction legitimacy | transactionId, userId, isLegitimate |

### Dispute Management Tools

| Tool Name | Purpose | Required Fields |
|-----------|---------|-----------------|
| `banking_create_dispute` | Create dispute case | userId, accountId, transactionId, disputeType, amountDisputed, description |
| `banking_get_disputes` | List user's disputes | userId |
| `banking_get_dispute_details` | Get specific dispute details | disputeId, userId |
| `banking_add_dispute_evidence` | Add evidence to dispute | disputeId, userId, evidenceType, evidenceData |
| `banking_update_dispute` | Update dispute information | disputeId, userId |
| `banking_withdraw_dispute` | Withdraw/cancel dispute | disputeId, userId, reason |

## API Endpoints Used

### Fraud APIs
```
POST   /api/v1/fraud/alerts                    # Create fraud alert
GET    /api/v1/fraud/alerts                    # List fraud alerts
GET    /api/v1/fraud/alerts/:alertId           # Get alert details
POST   /api/v1/fraud/alerts/:alertId/confirm   # Confirm fraud
POST   /api/v1/fraud/alerts/:alertId/false-positive  # Mark false positive
POST   /api/v1/fraud/verify                    # Verify transaction
```

### Dispute APIs
```
POST   /api/v1/disputes                        # Create dispute
GET    /api/v1/disputes                        # List disputes
GET    /api/v1/disputes/:disputeId             # Get dispute details
POST   /api/v1/disputes/:disputeId/evidence    # Add evidence
PUT    /api/v1/disputes/:disputeId             # Update dispute
POST   /api/v1/disputes/:disputeId/withdraw    # Withdraw dispute
```

## Fraud Types Reference

### Alert Types (from Banking API)
1. **unusual_activity**: Suspicious patterns detected
2. **high_value_transaction**: Unusually large transaction
3. **multiple_failed_attempts**: Multiple failed login/transaction attempts
4. **location_mismatch**: Transaction from unexpected location
5. **velocity_check**: Too many transactions in short time
6. **suspicious_merchant**: Questionable merchant detected
7. **card_not_present**: Card-not-present fraud (online/phone)
8. **account_takeover**: Unauthorized account access
9. **identity_theft**: Identity theft suspected

### Severity Levels
- **critical**: Identity theft, account takeover
- **high**: Unauthorized high-value transactions
- **medium**: Unusual patterns, concerning activity
- **low**: Minor suspicious activity

## Dispute Types Reference

### Dispute Categories (from Banking API)
1. **unauthorized_transaction**: Charge you didn't make
2. **incorrect_amount**: Wrong amount charged
3. **duplicate_charge**: Same charge appears multiple times
4. **service_not_received**: Paid but didn't get service
5. **product_not_received**: Paid but didn't get product
6. **defective_product**: Received damaged/defective item
7. **cancelled_service**: Service cancelled but still charged
8. **fraudulent_charge**: Suspected fraudulent activity
9. **billing_error**: Error in billing/statement
10. **other**: Other dispute reasons

### Dispute Status Flow
```
submitted → under_review → pending_merchant → pending_customer
    ↓
resolved_in_favor / resolved_against / partially_resolved / withdrawn / escalated
```

## Workflow Integration

### Intent Mapping
```javascript
// In intentPrompts.js
{
  'report_fraud': {
    tools: ['banking_create_fraud_alert', 'banking_get_transactions', 'banking_block_card'],
    needsConfirmation: false  // Urgent!
  },
  'check_fraud_alerts': {
    tools: ['banking_get_fraud_alerts', 'banking_get_fraud_alert_details']
  },
  'verify_transaction': {
    tools: ['banking_get_fraud_alert_details', 'banking_verify_transaction', 'banking_confirm_fraud']
  },
  'dispute_transaction': {
    tools: ['banking_get_transactions', 'banking_create_dispute', 'banking_get_disputes']
  }
}
```

## Security Considerations

### Fraud Reporting
1. **No confirmation required** - Fraud is urgent
2. **Immediate protective action** - Block cards/freeze accounts if needed
3. **Zero Liability protection** - Communicate to users
4. **24-hour response time** - Fraud team investigates quickly

### Dispute Filing
1. **Evidence collection** - Guide users on what strengthens case
2. **Case number generation** - Unique tracking number
3. **Timeline communication** - 30-45 days for resolution
4. **Merchant rights** - 10 days to respond
5. **User protection** - Fair resolution process

## Testing Scenarios

### Scenario 1: Report Unauthorized Transaction
```javascript
POST /api/orchestrator/process
{
  "sessionId": "sess-123",
  "userId": "user-456",
  "intent": "report_fraud",
  "question": "Someone charged $800 to my card and it wasn't me!"
}

Expected Flow:
1. Identify fraud type: unauthorized_transaction
2. Assess severity: HIGH
3. Create fraud alert
4. Block card
5. Provide alert ID and next steps
6. Offer replacement card
```

### Scenario 2: File Dispute with Evidence
```javascript
POST /api/orchestrator/process
{
  "sessionId": "sess-124",
  "userId": "user-456",
  "intent": "dispute_transaction",
  "question": "I want to dispute TXN-999. I paid $200 but product never arrived."
}

Expected Flow:
1. Collect transaction ID: TXN-999
2. Determine dispute type: product_not_received
3. Ask for evidence (tracking number, emails)
4. Create dispute case
5. Generate case number
6. Explain timeline and next steps
```

### Scenario 3: Verify Suspicious Activity
```javascript
POST /api/orchestrator/process
{
  "sessionId": "sess-125",
  "userId": "user-456",
  "intent": "verify_transaction",
  "question": "I got an alert about a $300 charge. That was me."
}

Expected Flow:
1. Retrieve fraud alert details
2. Show transaction details
3. User confirms legitimate: "yes"
4. Mark as false positive
5. Remove any restrictions
6. Update user's risk profile
```

## Benefits of Enhanced Implementation

### For Users
✅ **Faster fraud response** - Immediate protective action
✅ **Clear guidance** - Step-by-step dispute filing
✅ **Evidence support** - Knows what strengthens case
✅ **Transparent timelines** - Knows what to expect
✅ **Easy verification** - Simple yes/no for alerts

### For Business
✅ **Reduced fraud losses** - Quick detection and action
✅ **Better case management** - Proper categorization
✅ **Audit trail** - Complete case history
✅ **Regulatory compliance** - Proper dispute handling
✅ **Customer satisfaction** - Clear communication

### For Developers
✅ **Well-defined tools** - Clear MCP tool definitions
✅ **Type safety** - Enumerated types for categories
✅ **API alignment** - Matches banking service exactly
✅ **Extensible** - Easy to add new fraud/dispute types
✅ **Testable** - Clear test scenarios

## Next Steps

1. ✅ Intent prompts created
2. ✅ MCP tools defined
3. ✅ Workflow integration ready
4. 🔄 Test with banking service API
5. 📋 Add monitoring and analytics
6. 📋 Train NLU model with fraud/dispute examples
7. 📋 Add dispute evidence upload capability
8. 📋 Implement fraud risk scoring visualization

## References

- Banking Service API: `/poc-banking-service/API-DOCUMENTATION.md`
- Fraud Alerts Table: `/poc-banking-service/database/migrations/V6__create_fraud_alerts_table.sql`
- Disputes Table: `/poc-banking-service/database/migrations/V7__create_disputes_table.sql`
- Test Cases: `/poc-banking-service/test-api.sh`
