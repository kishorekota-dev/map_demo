# Fraud & Dispute Conversational Flows - Quick Reference

## Quick Intent Detection

| User Says | Intent | Priority |
|-----------|--------|----------|
| "Someone charged my card" | report_fraud | 🚨 URGENT |
| "I didn't make this transaction" | report_fraud | 🚨 URGENT |
| "My account was hacked" | report_fraud | 🚨 CRITICAL |
| "Suspicious activity on my card" | check_fraud_alerts | ⚠️ HIGH |
| "Show my fraud alerts" | check_fraud_alerts | ℹ️ NORMAL |
| "Was that charge legitimate?" | verify_transaction | ℹ️ NORMAL |
| "I want to dispute a charge" | dispute_transaction | ℹ️ NORMAL |
| "File a chargeback" | dispute_transaction | ℹ️ NORMAL |
| "Wrong amount charged" | dispute_transaction | ℹ️ NORMAL |

## Fraud Report Flow (URGENT - No Confirmation)

```
┌─────────────────────────────────────────────────────────┐
│ User: "Someone charged $500 to my card!"               │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │ BOT: Assesses Urgency    │
        │ • Fraud Type: unauthorized│
        │ • Severity: HIGH         │
        │ • Amount: $500           │
        └──────────────┬───────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │ IMMEDIATE ACTIONS:       │
        │ ✓ Create fraud alert     │
        │ ✓ Block card (optional)  │
        │ ✓ Flag transaction       │
        │ ✓ Notify fraud team      │
        └──────────────┬───────────┘
                       │
                       ▼
        ┌──────────────────────────────────────────┐
        │ BOT RESPONSE:                            │
        │                                          │
        │ 🚨 Fraud Alert Created: FA-20251009-xxxx│
        │                                          │
        │ ACTIONS TAKEN:                           │
        │ ✓ Card temporarily blocked               │
        │ ✓ Transaction flagged for reversal       │
        │ ✓ Investigation started                  │
        │                                          │
        │ NEXT STEPS:                              │
        │ 1. Review within 24 hours                │
        │ 2. Contact you for verification          │
        │ 3. Replacement card if needed            │
        │                                          │
        │ You're protected by Zero Liability       │
        │                                          │
        │ Would you like to permanently block      │
        │ your card and order a replacement?       │
        └──────────────────────────────────────────┘
```

## Dispute Filing Flow (Requires Confirmation)

```
┌──────────────────────────────────────────────────────────┐
│ User: "Dispute transaction TXN-12345. Was charged $150  │
│ but service was only worth $100"                         │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │ BOT: Collects Info       │
        │ ✓ Transaction ID         │
        │ ✓ Dispute type          │
        │ ? Amount disputed        │
        │ ? Evidence available     │
        └──────────────┬───────────┘
                       │
                       ▼
        ┌────────────────────────────────────────────┐
        │ BOT: "This appears to be an               │
        │ 'incorrect_amount' dispute.                │
        │                                            │
        │ To strengthen your case, do you have:      │
        │ • Receipt showing agreed amount            │
        │ • Email confirmations                      │
        │ • Service agreement                        │
        │                                            │
        │ Any additional details?"                   │
        └──────────────────┬───────────────────────── ┘
                           │
                           ▼
        ┌──────────────────────────────┐
        │ User: "I have email showing  │
        │ $100 was the agreed price"   │
        └──────────────┬───────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │ BOT: Creates Dispute     │
        │ • Generate case number   │
        │ • Set expected timeline  │
        │ • Record evidence        │
        └──────────────┬───────────┘
                       │
                       ▼
        ┌────────────────────────────────────────────┐
        │ BOT RESPONSE:                              │
        │                                            │
        │ ✅ Dispute Case #CASE202510-12345678      │
        │                                            │
        │ Details:                                   │
        │ • Transaction: TXN-12345                   │
        │ • Dispute Type: Incorrect Amount           │
        │ • Amount Disputed: $50                     │
        │ • Status: Under Review                     │
        │                                            │
        │ TIMELINE:                                  │
        │ • Merchant contact: 3 business days        │
        │ • Merchant response: 10 days               │
        │ • Final resolution: 30-45 days             │
        │                                            │
        │ EVIDENCE RECORDED:                         │
        │ • Email confirmation                       │
        │                                            │
        │ You can add more evidence anytime via      │
        │ your dispute dashboard.                    │
        └────────────────────────────────────────────┘
```

## Verify Transaction Flow

```
┌──────────────────────────────────────────────┐
│ User: "I have an alert about a $300 charge" │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
        ┌─────────────────────────┐
        │ BOT: Retrieves Alert    │
        │ • Gets alert details    │
        │ • Gets transaction info │
        └─────────┬───────────────┘
                  │
                  ▼
        ┌──────────────────────────────────────┐
        │ BOT: "Alert #FA-20251009-xxxx       │
        │                                      │
        │ Transaction Details:                 │
        │ • Amount: $300.00                    │
        │ • Merchant: Best Buy                 │
        │ • Date: Oct 9, 2025, 2:30 PM        │
        │ • Location: San Francisco, CA        │
        │ • Device: New iPhone                 │
        │                                      │
        │ Flagged because:                     │
        │ • New device used                    │
        │ • Different location                 │
        │                                      │
        │ Did you authorize this? (Yes/No)"   │
        └─────────────────┬────────────────────┘
                          │
            ┌─────────────┴─────────────┐
            │                           │
            ▼                           ▼
     ┌──────────┐              ┌───────────────┐
     │ "YES"    │              │ "NO"          │
     │          │              │               │
     ▼          │              ▼               │
┌────────────────┐      ┌─────────────────────┐
│ Mark False     │      │ Confirm Fraud       │
│ Positive       │      │                     │
│ • Remove alert │      │ • Block card        │
│ • No action    │      │ • Reverse charge    │
│ • Update       │      │ • Start case        │
│   profile      │      │ • Offer replacement │
└────────────────┘      └─────────────────────┘
```

## Check Fraud Alerts Flow

```
┌────────────────────────────────────┐
│ User: "Show my fraud alerts"      │
└──────────────┬─────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ BOT: Retrieves       │
    │ fraud alerts         │
    │ • Filter by status   │
    │ • Sort by severity   │
    └──────────┬───────────┘
               │
               ▼
    ┌────────────────────────────────────────────┐
    │ BOT: "You have 2 fraud alerts:            │
    │                                            │
    │ 1. 🔴 Alert #FA-202510-987654 (HIGH)     │
    │    • Unauthorized Transaction              │
    │    • $500.00                               │
    │    • Status: Investigating                 │
    │    • Action: Card blocked                  │
    │                                            │
    │ 2. 🟡 Alert #FA-202510-876543 (MEDIUM)   │
    │    • Unusual Activity                      │
    │    • Multiple login attempts               │
    │    • Status: Pending Verification          │
    │    ⚠️ ACTION NEEDED: Verify activity     │
    │                                            │
    │ Would you like details on any alert?"     │
    └────────────────────────────────────────────┘
```

## Multi-Turn Conversations

### Example: Complete Fraud Report

```
Turn 1 - Initial Report:
User: "I see charges I didn't make"
Bot: "I'll help you report fraud. Can you tell me more about these charges? 
      How many transactions, and approximately what amount?"

Turn 2 - Collect Details:
User: "Two charges for $200 each at stores I've never been to"
Bot: "That's concerning. When did you first notice these charges?
      And do you still have your physical card?"

Turn 3 - Assess & Act:
User: "Just now. Yes, I have my card with me."
Bot: "🚨 Creating fraud alert now. Since you have your card, this is likely 
      card-not-present fraud (online/phone purchases).
      
      IMMEDIATE ACTIONS:
      ✓ Fraud alert created (Alert #FA-20251009-xxxx)
      ✓ Card marked for monitoring
      ✓ Transactions flagged ($400 total)
      ✓ Fraud team notified
      
      Your card is safe to keep using for now, but we'll monitor closely.
      Would you like me to block it preventively?"

Turn 4 - Follow-up:
User: "Yes, block it"
Bot: "✓ Card blocked
      ✓ Replacement card ordered (arrives in 3-5 business days)
      
      Case #FRAUD-20251009-xxxx created
      You'll receive updates via email and text."
```

### Example: Complete Dispute Filing

```
Turn 1 - Initial Request:
User: "File dispute for transaction TXN-99999"
Bot: "I'll help you file a dispute. What's the issue with this transaction?
      • Wrong amount charged?
      • Never received product/service?
      • Duplicate charge?
      • Something else?"

Turn 2 - Categorize:
User: "I ordered a laptop but it arrived damaged"
Bot: "I'm sorry to hear that. This is a 'defective product' dispute.
      
      To help your case:
      • Do you have photos of the damage?
      • Did you contact the merchant first?
      • What was their response?
      • Do you still have the packaging?"

Turn 3 - Collect Evidence:
User: "Yes I have photos. Merchant said contact manufacturer, but it arrived 
      damaged so that's not my problem."
Bot: "You're absolutely right. Let me get a few more details:
      • What was the purchase amount?
      • When was it delivered?
      • What's the merchant name?"

Turn 4 - Create Dispute:
User: "$1,200. Delivered last week from TechStore"
Bot: "✅ Dispute Case #CASE202510-87654321 Filed
      
      Details:
      • Amount: $1,200
      • Type: Defective Product
      • Merchant: TechStore
      • Evidence: Photos of damage
      
      TIMELINE:
      • We'll contact TechStore within 3 business days
      • They have 10 days to respond
      • Final resolution: 30-45 days
      
      POSSIBLE OUTCOMES:
      • Full refund ($1,200)
      • Replacement product
      • Merchant credit
      
      We'll keep you updated at each step. You can upload additional
      evidence anytime by saying 'add evidence to case CASE202510-87654321'."
```

## Response Templates

### Fraud Alert Created
```
🚨 Fraud Alert Created: {alertId}
Risk Score: {riskScore}/100
Severity: {severity}

IMMEDIATE ACTIONS:
✓ {actions taken}

NEXT STEPS:
1. Investigation within 24 hours
2. Contact at {phone/email}
3. {additional steps}

You're protected by Zero Liability Policy.
```

### Dispute Case Created
```
✅ Dispute Case #{caseNumber}

Details:
• Transaction: {txnId}
• Type: {disputeType}
• Amount: ${amount}
• Status: {status}

TIMELINE:
• Merchant contact: 3 business days
• Merchant response: 10 days
• Resolution: 30-45 days

EVIDENCE: {evidenceList}

Track your case anytime by referencing #{caseNumber}
```

### Transaction Verified
```
✅ Transaction Verified as Legitimate

Alert #{alertId} marked as false positive.
No restrictions on your account.

For future security:
• {recommendation 1}
• {recommendation 2}
```

### Fraud Confirmed
```
🚨 Fraud Confirmed - Case #{caseNumber}

PROTECTIVE ACTIONS:
✓ {action 1}
✓ {action 2}
✓ {action 3}

NEXT STEPS:
1. {step 1}
2. {step 2}
3. {step 3}

Timeline: {timeline}
```

## Error Handling

### Transaction Not Found
```
"I couldn't find transaction {txnId}. Could you double-check the transaction ID?
You can find it in your transaction history or on your statement."
```

### Alert Not Found
```
"I don't see alert {alertId} associated with your account.
Would you like me to show all your current fraud alerts?"
```

### Dispute Already Exists
```
"There's already an active dispute (Case #{caseNumber}) for transaction {txnId}.
Would you like to:
• Add more evidence to the existing case?
• Check the status of your dispute?
• Speak with a representative?"
```

### Missing Required Information
```
"To file a dispute, I need:
✓ Transaction ID
✓ Dispute reason
? {missing fields}

Could you provide {missing info}?"
```

## Pro Tips for Implementation

1. **Urgency Matters**: Fraud = no confirmation, Disputes = can gather info
2. **Evidence Guidance**: Tell users what helps their case
3. **Timeline Communication**: Always set expectations
4. **Case Numbers**: Always provide for tracking
5. **Next Steps**: Always clear what happens next
6. **Empathy**: Fraud is stressful, be supportive
7. **Zero Liability**: Reassure users about protection
8. **Follow-up**: Offer to help with related actions
