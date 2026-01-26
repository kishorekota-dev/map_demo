# 🚀 DialogFlow Agent - Ready for Deployment

## ✅ All Prerequisites Complete!

### Backend Setup (100% Done)
- ✅ Service Account: `nlu-service-account@ai-experimentation-428115.iam.gserviceaccount.com`
- ✅ Permissions: `dialogflow.client` + `dialogflow.admin`
- ✅ Credentials: `credentials/dialogflow-key.json` (secured)
- ✅ Environment: `.env.development` configured
- ✅ DialogFlow API: Enabled
- ✅ Agent ZIP: `dialogflow-config/agent-backup.zip` (15KB, 24 intents, 7 entities)

---

## 📋 Manual Import (5 Minutes - Final Step!)

### Why Manual Import?
The DialogFlow API requires Application Default Credentials (ADC) setup, but the **Console import is faster and more reliable** for initial deployment.

### Step-by-Step Instructions

#### 1. Open DialogFlow Console
The browser window should already be open at:
```
https://dialogflow.cloud.google.com/
```

If not, [click here to open it](https://dialogflow.cloud.google.com/)

#### 2. Create New Agent
1. Click the **"Create Agent"** button (top left or center)
2. Fill in the form:
   - **Agent name:** `POC Banking Assistant`
   - **Default language:** English
   - **Default time zone:** America/New_York (or your timezone)
   - **Google Project:** Select `ai-experimentation-428115` from dropdown
3. Click **"CREATE"**

#### 3. Import Agent Configuration  
1. After agent is created, click the **⚙️ Settings** (gear icon) next to agent name
2. Click the **"Export and Import"** tab
3. Click **"IMPORT FROM ZIP"** button
4. Click **"SELECT FILE"** and navigate to:
   ```
   /Users/container/git/map_demo/poc-nlu-service/dialogflow-config/agent-backup.zip
   ```
5. In the text field, type: `RESTORE`
6. Click the **"RESTORE"** button
7. Wait ~30 seconds for import to complete

#### 4. Verify Import Success
After import, you should see:
- ✅ **Intents:** 24 intents listed in left sidebar
- ✅ **Entities:** 7 entities listed
- ✅ **Agent name:** "POC Banking Assistant"

---

## 🧪 Test in DialogFlow Console

Use the test panel on the RIGHT side of the screen. Try these queries:

### Test 1: Balance Check
**Input:** `What is my account balance?`
**Expected:**
- Intent: `check.balance`
- Confidence: > 0.8

### Test 2: Money Transfer
**Input:** `Transfer $500 to my savings account`
**Expected:**
- Intent: `transfer.money`
- Parameters: amount = 500, account = savings
- Confidence: > 0.7

### Test 3: Transaction History
**Input:** `Show me my last 10 transactions`
**Expected:**
- Intent: `view.transactions`
- Confidence: > 0.8

### Test 4: Card Operations
**Input:** `I want to block my credit card`
**Expected:**
- Intent: `block.card`
- Parameters: card_type = credit
- Confidence: > 0.7

### Test 5: Loan Inquiry
**Input:** `How much is my mortgage payment?`
**Expected:**
- Intent: `check.loan.status`
- Parameters: loan_type = mortgage
- Confidence: > 0.7

---

## 🎯 After Successful Import

### Start NLU Service with DialogFlow
```bash
cd /Users/container/git/map_demo/poc-nlu-service
docker compose down
docker compose up --build -d
```

### Monitor Logs
```bash
docker compose logs -f | grep -i dialogflow
```

You should see:
```
✓ DialogFlow initialized successfully
✓ Project: ai-experimentation-428115
✓ Credentials loaded
✓ Agent ready
```

### Test DialogFlow Integration
```bash
./test-dialogflow.sh
```

This will run 10 integration tests and show:
- DialogFlow status (enabled: true)
- Intent detection results
- Confidence scores
- Entity extraction

### Test Through NLU Service API
```bash
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{"user_input":"What is my balance?","sessionId":"test-123"}'
```

Expected response:
```json
{
  "intent": {
    "name": "check.balance",
    "displayName": "Check Account Balance",
    "confidence": 0.92
  },
  "parameters": {},
  "fulfillmentText": "I'll check your account balance for you.",
  "source": "dialogflow"
}
```

### Start Full Stack
```bash
cd /Users/container/git/map_demo
./deployment-scripts/start-local-dev.sh
```

Access:
- 🖥️  **Frontend:** http://localhost:3000
- 💬 **Chat Backend:** http://localhost:3006  
- 🧠 **NLU Service:** http://localhost:3003
- 🏦 **Banking Service:** http://localhost:3005

---

## 📊 What's in Your Agent

### 24 Intents
1. `check.balance` - Check account balance
2. `transfer.money` - Transfer funds between accounts
3. `view.transactions` - View transaction history
4. `block.card` - Block/freeze cards
5. `activate.card` - Activate new cards
6. `request.new.card` - Request replacement card
7. `change.pin` - Change card PIN
8. `check.loan.status` - Check loan information
9. `apply.loan` - Apply for new loan
10. `check.interest.rates` - Check current rates
11. `open.account` - Open new account
12. `close.account` - Close existing account
13. `dispute.transaction` - Dispute a transaction
14. `stop.payment` - Stop payment on check
15. `pay.bill` - Pay bills
16. `wire.transfer` - International wire transfer
17. `request.statement` - Request account statement
18. `setup.direct.deposit` - Setup direct deposit
19. `setup.alerts` - Setup account alerts
20. `update.contact.info` - Update contact information
21. `find.atm.branch` - Find ATM or branch
22. `overdraft.protection` - Overdraft protection
23. `welcome` - Greeting intent
24. `fallback` - Default fallback

### 7 Entity Types
1. `@account_type` - checking, savings, credit card, loan, etc.
2. `@transaction_type` - deposit, withdrawal, transfer, payment, etc.
3. `@card_type` - debit, credit, ATM, prepaid
4. `@loan_type` - personal, mortgage, auto, student, etc.
5. `@time_period` - today, yesterday, last month, etc.
6. `@service_type` - ATM, branch, online, mobile, etc.
7. `@document_type` - statement, receipt, tax form, etc.

---

## 💰 Cost Reminder
- **Text Requests:** FREE (unlimited)
- **Monthly Cost:** $0 ✅
- **No credit card required** for text-based chatbot

---

## 📚 Documentation
- **This Guide:** `DIALOGFLOW-MANUAL-IMPORT-GUIDE.md`
- **Integration Guide:** `DIALOGFLOW-INTEGRATION-GUIDE.md`
- **Deployment Status:** `DIALOGFLOW-DEPLOYMENT-STATUS.md`
- **Test Script:** `test-dialogflow.sh`

---

## ⏱️ Time to Complete
- **Import to Console:** ~5 minutes
- **Testing in Console:** ~3 minutes  
- **NLU Service Integration:** ~2 minutes
- **Total:** ~10 minutes

---

## 🆘 Troubleshooting

### Agent Import Fails
- Ensure project `ai-experimentation-428115` is selected
- Verify you typed `RESTORE` correctly (case-sensitive)
- Check ZIP file size (~15KB)

### Low Confidence Scores
- Add more training phrases in DialogFlow Console
- Review and improve entity annotations
- Adjust classification threshold (Settings → ML Settings)

### NLU Service Can't Connect
- Verify credentials file exists: `credentials/dialogflow-key.json`
- Check environment variable: `DIALOGFLOW_ENABLED=true`
- Restart service: `docker compose restart`
- Check logs: `docker compose logs poc-nlu-service`

---

## ✅ Success Checklist

- [ ] DialogFlow Console opened
- [ ] Agent "POC Banking Assistant" created  
- [ ] ZIP file imported successfully
- [ ] 24 intents visible in Console
- [ ] 7 entities visible in Console
- [ ] Test queries working in Console (confidence > 0.7)
- [ ] NLU service running with DialogFlow enabled
- [ ] Integration tests passing
- [ ] Full stack accessible

---

## 🎉 You're Almost Done!

Just complete the manual import in the Console (steps 1-4 above) and you'll have a fully functional AI-powered banking chatbot!

**Next Action:** Complete Step 2 (Create Agent) in the DialogFlow Console that's already open in your browser.

---

**Questions?** Check the documentation files or test using `./test-dialogflow.sh` after import.

Good luck! 🚀
