# DialogFlow Integration - Complete Step-by-Step Guide

**Date**: October 13, 2025  
**Project ID**: ai-experimentation-428115  
**Status**: Configuration Ready - Integration Pending

---

## ✅ Step 1: Review Generated Files (COMPLETED)

### Generated Structure
```
dialogflow-config/
├── DEPLOYMENT_SUMMARY.md       # Complete deployment summary
├── agent.json                  # Agent configuration
└── agent/
    ├── entities/               # 7 entity type definitions
    │   ├── account_type.json
    │   ├── transaction_type.json
    │   ├── time_period.json
    │   ├── card_type.json
    │   ├── service_type.json
    │   ├── loan_type.json
    │   └── document_type.json
    └── intents/                # 25+ intent definitions
        ├── welcome.json
        ├── check_balance.json
        ├── view_transactions.json
        ├── transfer_money.json
        ├── pay_bill.json
        ├── activate_card.json
        ├── block_card.json
        ├── request_new_card.json
        ├── apply_loan.json
        ├── dispute_transaction.json
        └── ... (15+ more intents)
```

### Quick Review
```bash
# View deployment summary
cat /Users/container/git/map_demo/poc-nlu-service/dialogflow-config/DEPLOYMENT_SUMMARY.md

# Count entities
ls -1 /Users/container/git/map_demo/poc-nlu-service/dialogflow-config/agent/entities/ | wc -l

# Count intents
ls -1 /Users/container/git/map_demo/poc-nlu-service/dialogflow-config/agent/intents/ | wc -l
```

**Result**: ✅ All 7 entities and 25+ intents created successfully!

---

## 🚀 Step 2: Import to DialogFlow Console

### Option A: Manual Import (Recommended for First Time)

#### 2.1 Access DialogFlow Console
```bash
# Open DialogFlow Console in browser
open https://dialogflow.cloud.google.com/
```

Or navigate to: https://dialogflow.cloud.google.com/

#### 2.2 Create/Select Agent

1. **Sign in** with your Google Cloud account
2. **Select Project**: `ai-experimentation-428115`
3. **Create New Agent** or **Select Existing Agent**:
   - Agent name: `POC Banking Assistant`
   - Default language: `English - en`
   - Time zone: `America/New_York`

#### 2.3 Import Agent Configuration

**Method 1: Restore from ZIP (Easiest)**

1. Create a ZIP file of the agent:
   ```bash
   cd /Users/container/git/map_demo/poc-nlu-service/dialogflow-config
   zip -r agent-backup.zip agent/
   ```

2. In DialogFlow Console:
   - Click **Settings** (gear icon) ⚙️
   - Go to **Export and Import** tab
   - Click **IMPORT FROM ZIP**
   - Select `agent-backup.zip`
   - Choose **RESTORE** (this will replace existing agent)

**Method 2: Import Individual Files**

If you prefer to add incrementally:

1. **Import Entities**:
   - Go to **Entities** section
   - Click **CREATE ENTITY**
   - Copy/paste content from each JSON file in `agent/entities/`
   - Repeat for all 7 entity types

2. **Import Intents**:
   - Go to **Intents** section
   - Click **CREATE INTENT**
   - Configure each intent manually using JSON files in `agent/intents/`
   - Repeat for all 25+ intents

### Option B: Programmatic Import (Advanced)

Using Google Cloud CLI:

```bash
# Set project
export PROJECT_ID=ai-experimentation-428115
gcloud config set project $PROJECT_ID

# Create agent backup ZIP
cd /Users/container/git/map_demo/poc-nlu-service/dialogflow-config
zip -r agent-backup.zip agent/

# Restore agent (requires DialogFlow API enabled)
gcloud alpha dialogflow agent restore \
  --project=$PROJECT_ID \
  --source=agent-backup.zip

# Or upload to Cloud Storage first
gsutil cp agent-backup.zip gs://${PROJECT_ID}-dialogflow/
gcloud alpha dialogflow agent restore \
  --project=$PROJECT_ID \
  --source=gs://${PROJECT_ID}-dialogflow/agent-backup.zip
```

---

## 🧪 Step 3: Test and Train the Agent

### 3.1 Initial Testing in DialogFlow Console

1. **Open DialogFlow Console**: https://dialogflow.cloud.google.com/
2. **Select your agent**: POC Banking Assistant
3. **Use the Test Console** (right sidebar):

#### Test Cases

**Test 1: Balance Check**
```
Input: "What is my account balance?"
Expected Intent: check.balance
Expected Parameters: None or account_type
```

**Test 2: Transfer Money**
```
Input: "I want to transfer $500 from checking to savings"
Expected Intent: transfer.money
Expected Parameters: 
  - amount: $500
  - from_account: checking
  - to_account: savings
```

**Test 3: View Transactions**
```
Input: "Show me my transactions from last month"
Expected Intent: view.transactions
Expected Parameters:
  - time_period: last_month
```

**Test 4: Card Operations**
```
Input: "Block my credit card"
Expected Intent: block.card
Expected Parameters:
  - card_type: credit
```

**Test 5: Loan Inquiry**
```
Input: "I want to apply for a personal loan"
Expected Intent: apply.loan
Expected Parameters:
  - loan_type: personal
```

### 3.2 Review Intent Detection

For each test:
- ✅ Check if correct intent is detected
- ✅ Verify confidence score (should be > 0.6 for production)
- ✅ Confirm entity extraction is accurate
- ✅ Review fulfillment text response

### 3.3 Training Improvements

If intent detection is poor:

1. **Add More Training Phrases**:
   - Go to the specific intent
   - Add 5-10 more variations
   - Include user typos and casual language

2. **Adjust Entity Matching**:
   - Ensure entities are properly annotated
   - Add more synonyms to entities

3. **Review Confidence Threshold**:
   - Settings → ML Settings
   - Adjust classification threshold (default: 0.3)
   - For production: 0.6 recommended

### 3.4 Bulk Testing Script

Create a test file:

```bash
# Create test cases file
cat > /Users/container/git/map_demo/poc-nlu-service/dialogflow-test-cases.txt <<'EOF'
What is my account balance?
Check my checking account balance
Show me transactions from last week
I want to transfer $500 to my savings
Transfer money from checking to savings
Block my debit card
My card was stolen
Apply for a car loan
How much is in my account?
Send $200 to John
Show recent activity
What are your mortgage rates?
I need a new credit card
Dispute this transaction
Find the nearest ATM
Update my phone number
Set up direct deposit
EOF
```

Test programmatically:
```bash
# Using DialogFlow API (requires setup)
while IFS= read -r query; do
  echo "Testing: $query"
  # Call DialogFlow API here
  curl -X POST \
    "https://dialogflow.googleapis.com/v2/projects/$PROJECT_ID/agent/sessions/test-session:detectIntent" \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "Content-Type: application/json" \
    -d "{
      \"queryInput\": {
        \"text\": {
          \"text\": \"$query\",
          \"languageCode\": \"en-US\"
        }
      }
    }"
  echo ""
done < dialogflow-test-cases.txt
```

---

## 🔗 Step 4: Integrate with NLU Service

### 4.1 Set Up Service Account Credentials

1. **Create Service Account**:
   ```bash
   # Set variables
   export PROJECT_ID=ai-experimentation-428115
   export SERVICE_ACCOUNT_NAME=nlu-service-account
   
   # Create service account
   gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
     --display-name="NLU Service Account" \
     --project=$PROJECT_ID
   
   # Get service account email
   export SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
   ```

2. **Grant DialogFlow Permissions**:
   ```bash
   # Grant DialogFlow Client role
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
     --role="roles/dialogflow.client"
   
   # Grant DialogFlow Admin role (if needed for training)
   gcloud projects add-iam-policy-binding $PROJECT_ID \
     --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
     --role="roles/dialogflow.admin"
   ```

3. **Generate Key File**:
   ```bash
   # Create credentials directory
   mkdir -p /Users/container/git/map_demo/poc-nlu-service/credentials
   
   # Generate and download key
   gcloud iam service-accounts keys create \
     /Users/container/git/map_demo/poc-nlu-service/credentials/dialogflow-key.json \
     --iam-account=$SERVICE_ACCOUNT_EMAIL \
     --project=$PROJECT_ID
   
   # Secure the key file
   chmod 600 /Users/container/git/map_demo/poc-nlu-service/credentials/dialogflow-key.json
   ```

4. **Verify Key Created**:
   ```bash
   ls -lh /Users/container/git/map_demo/poc-nlu-service/credentials/dialogflow-key.json
   cat /Users/container/git/map_demo/poc-nlu-service/credentials/dialogflow-key.json | jq .
   ```

### 4.2 Update NLU Service Configuration

1. **Update Environment Variables**:

Edit `.env.development`:
```bash
cat > /Users/container/git/map_demo/poc-nlu-service/.env.development <<EOF
# NLU Service Configuration
NODE_ENV=development
PORT=3003
LOG_LEVEL=debug

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3006,http://localhost:8080

# DialogFlow Configuration
DIALOGFLOW_ENABLED=true
DIALOGFLOW_PROJECT_ID=ai-experimentation-428115
DIALOGFLOW_LANGUAGE_CODE=en-US
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/dialogflow-key.json

# Cache
CACHE_ENABLED=true
CACHE_TTL=300
CACHE_MAX_ITEMS=500

# Service
SERVICE_NAME=poc-nlu-service
SERVICE_VERSION=1.0.0
EOF
```

2. **Update Docker Compose**:

The docker-compose.yml already has the configuration! Verify:
```bash
grep -A 10 "DialogFlow Configuration" /Users/container/git/map_demo/poc-nlu-service/docker-compose.yml
```

3. **Set Environment Variable for Local Testing**:
```bash
export DIALOGFLOW_PROJECT_ID=ai-experimentation-428115
export GOOGLE_APPLICATION_CREDENTIALS=/Users/container/git/map_demo/poc-nlu-service/credentials/dialogflow-key.json
```

### 4.3 Test DialogFlow Integration

1. **Restart NLU Service with DialogFlow Enabled**:
   ```bash
   cd /Users/container/git/map_demo/poc-nlu-service
   
   # Stop current service
   docker compose down
   
   # Start with DialogFlow enabled
   docker compose up --build -d
   
   # Check logs for DialogFlow initialization
   docker compose logs -f | grep -i dialogflow
   ```

2. **Verify DialogFlow Status**:
   ```bash
   curl http://localhost:3003/api/nlu/dialogflow/status | jq .
   ```

   Expected response:
   ```json
   {
     "success": true,
     "data": {
       "configured": true,
       "available": true,
       "projectId": "ai-experimentation-428115",
       "fallbackMode": false
     }
   }
   ```

3. **Test Intent Detection**:
   ```bash
   curl -X POST http://localhost:3003/api/nlu/analyze \
     -H "Content-Type: application/json" \
     -d '{
       "user_input": "What is my checking account balance?",
       "sessionId": "test-session-001",
       "userId": "test-user-001",
       "languageCode": "en-US"
     }' | jq .
   ```

   Expected response:
   ```json
   {
     "success": true,
     "data": {
       "intent": "check.balance",
       "confidence": 0.95,
       "dialogflow": {
         "fulfillmentText": "I'll check your account balance for you right away.",
         "parameters": {
           "account_type": "checking"
         },
         "languageCode": "en-US",
         "allRequiredParamsPresent": true
       },
       "banking": {
         "intent": "banking.balance.check",
         "confidence": 0.95
       }
     }
   }
   ```

4. **Run Comprehensive Integration Tests**:
   ```bash
   /Users/container/git/map_demo/deployment-scripts/test-nlu-integration.sh
   ```

### 4.4 Update Chat Backend Configuration

1. **Verify Chat Backend has NLU Service URL**:
   ```bash
   grep NLU_SERVICE_URL /Users/container/git/map_demo/poc-chat-backend/.env.development
   ```

2. **Test Full Stack with DialogFlow**:
   ```bash
   cd /Users/container/git/map_demo
   
   # Start full stack
   ./deployment-scripts/start-local-dev.sh
   
   # Wait for services to be healthy
   sleep 30
   
   # Check status
   ./deployment-scripts/check-local-status.sh
   ```

3. **Test End-to-End Flow**:
   ```bash
   # Send message through chat backend
   # The chat backend will call NLU service which will use DialogFlow
   
   # Test via frontend: http://localhost:3000
   # Or test via API:
   curl -X POST http://localhost:3006/api/chat/message \
     -H "Content-Type: application/json" \
     -d '{
       "message": "What is my account balance?",
       "sessionId": "test-session",
       "userId": "test-user"
     }' | jq .
   ```

---

## 📊 Step 5: Monitor and Optimize

### 5.1 Monitor DialogFlow Usage

1. **View in Cloud Console**:
   ```bash
   open "https://console.cloud.google.com/dialogflow/agent/list?project=ai-experimentation-428115"
   ```

2. **Check Analytics**:
   - Go to DialogFlow Console
   - Click on **Analytics** tab
   - Review:
     - Intent detection accuracy
     - Fallback intent frequency
     - Session count
     - Average confidence scores

### 5.2 Monitor NLU Service Logs

```bash
# View NLU service logs
docker compose -f /Users/container/git/map_demo/docker-compose.local.yml logs -f poc-nlu-service

# Filter for DialogFlow-related logs
docker compose -f /Users/container/git/map_demo/docker-compose.local.yml logs poc-nlu-service | grep -i dialogflow

# Check for errors
docker compose -f /Users/container/git/map_demo/docker-compose.local.yml logs poc-nlu-service | grep -i error
```

### 5.3 Performance Metrics

Track these metrics:
- **Intent Detection Accuracy**: > 85% (adjust training if lower)
- **Average Confidence Score**: > 0.7 for production
- **Response Time**: < 500ms
- **Fallback Intent Rate**: < 10%
- **API Error Rate**: < 1%

---

## 🎯 Quick Commands Reference

```bash
# Check DialogFlow status
curl http://localhost:3003/api/nlu/dialogflow/status

# Test intent detection
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{"user_input":"Check my balance","sessionId":"test"}'

# View NLU logs
docker compose logs -f poc-nlu-service

# Restart NLU service
cd /Users/container/git/map_demo/poc-nlu-service
docker compose restart

# Run integration tests
/Users/container/git/map_demo/deployment-scripts/test-nlu-integration.sh

# Start full stack
/Users/container/git/map_demo/deployment-scripts/start-local-dev.sh
```

---

## ✅ Completion Checklist

- [ ] **Step 1**: Review generated DialogFlow configuration files
- [ ] **Step 2**: Import agent to DialogFlow Console
  - [ ] Agent created/selected
  - [ ] Entities imported (7 types)
  - [ ] Intents imported (25+ intents)
- [ ] **Step 3**: Test and train agent
  - [ ] Test 10+ sample queries
  - [ ] Verify intent detection accuracy > 85%
  - [ ] Add training phrases if needed
  - [ ] Adjust confidence thresholds
- [ ] **Step 4**: Integrate with NLU Service
  - [ ] Service account created
  - [ ] Key file generated and secured
  - [ ] Environment variables updated
  - [ ] NLU service restarted
  - [ ] DialogFlow integration verified
  - [ ] End-to-end testing completed
- [ ] **Step 5**: Monitor and optimize
  - [ ] Analytics dashboard reviewed
  - [ ] Performance metrics tracked
  - [ ] Logging configured

---

## 📚 Additional Resources

- **DialogFlow Documentation**: https://cloud.google.com/dialogflow/docs
- **DialogFlow Console**: https://dialogflow.cloud.google.com/
- **Cloud Console**: https://console.cloud.google.com/
- **API Reference**: https://cloud.google.com/dialogflow/es/docs/reference/rest/v2-overview
- **NLU Service OpenAPI**: `/Users/container/git/map_demo/poc-nlu-service/openapi.yaml`

---

**Ready to proceed? Start with creating the ZIP file and importing to DialogFlow!** 🚀
