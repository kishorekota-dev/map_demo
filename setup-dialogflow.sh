#!/bin/bash

# DialogFlow Enterprise Banking Setup Script
# This script creates a complete DialogFlow project with banking intents

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="enterprise-banking-chatbot"
DISPLAY_NAME="Enterprise Banking Assistant"
DEFAULT_LANGUAGE_CODE="en"
TIME_ZONE="America/New_York"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if gcloud is installed and authenticated
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v gcloud &> /dev/null; then
        print_error "Google Cloud CLI is not installed. Please install it first:"
        echo "  https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "."; then
        print_error "Not authenticated with Google Cloud. Please run:"
        echo "  gcloud auth login"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Create Google Cloud Project
create_project() {
    print_status "Creating Google Cloud Project: $PROJECT_ID"
    
    if gcloud projects describe $PROJECT_ID &> /dev/null; then
        print_warning "Project $PROJECT_ID already exists"
    else
        gcloud projects create $PROJECT_ID --name="Enterprise Banking ChatBot"
        print_success "Created project $PROJECT_ID"
    fi
    
    # Set the project
    gcloud config set project $PROJECT_ID
    
    # Enable necessary APIs
    print_status "Enabling required APIs..."
    gcloud services enable dialogflow.googleapis.com
    gcloud services enable cloudbilling.googleapis.com
    
    print_success "APIs enabled"
}

# Create service account
create_service_account() {
    print_status "Creating service account..."
    
    SERVICE_ACCOUNT_NAME="dialogflow-service"
    SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    if gcloud iam service-accounts describe $SERVICE_ACCOUNT_EMAIL &> /dev/null; then
        print_warning "Service account already exists"
    else
        gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
            --display-name="DialogFlow Service Account" \
            --description="Service account for DialogFlow integration"
        
        # Grant necessary roles
        gcloud projects add-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
            --role="roles/dialogflow.admin"
        
        gcloud projects add-iam-policy-binding $PROJECT_ID \
            --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
            --role="roles/dialogflow.client"
            
        print_success "Service account created and configured"
    fi
    
    # Create and download service account key
    print_status "Creating service account key..."
    mkdir -p ./config
    
    if [ -f "./config/dialogflow-service-account.json" ]; then
        print_warning "Service account key already exists"
    else
        gcloud iam service-accounts keys create ./config/dialogflow-service-account.json \
            --iam-account=$SERVICE_ACCOUNT_EMAIL
        print_success "Service account key saved to ./config/dialogflow-service-account.json"
    fi
}

# Create DialogFlow agent
create_dialogflow_agent() {
    print_status "Creating DialogFlow agent..."
    
    # Set up authentication
    export GOOGLE_APPLICATION_CREDENTIALS="./config/dialogflow-service-account.json"
    
    # Create the agent configuration
    cat > ./config/agent-config.json << EOF
{
  "displayName": "$DISPLAY_NAME",
  "defaultLanguageCode": "$DEFAULT_LANGUAGE_CODE",
  "timeZone": "$TIME_ZONE",
  "description": "Enterprise Banking AI Assistant with comprehensive banking capabilities",
  "avatarUri": "",
  "enableLogging": true,
  "matchMode": "MATCH_MODE_HYBRID",
  "classificationThreshold": 0.3
}
EOF

    print_success "Agent configuration created"
}

# Create intents JSON files
create_intents() {
    print_status "Creating banking intents..."
    
    mkdir -p ./config/intents
    
    # 1. Authentication Intents
    cat > ./config/intents/auth-login.json << 'EOF'
{
  "displayName": "auth.login",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "I want to log in"}]},
    {"parts": [{"text": "Please sign me in"}]},
    {"parts": [{"text": "I need to authenticate"}]},
    {"parts": [{"text": "Login to my account"}]},
    {"parts": [{"text": "Sign in please"}]},
    {"parts": [{"text": "I want to access my account"}]},
    {"parts": [{"text": "Let me log into my banking"}]},
    {"parts": [{"text": "I need to verify my identity"}]},
    {"parts": [{"text": "Can I sign in"}]},
    {"parts": [{"text": "I want to login"}]}
  ],
  "messages": [
    {
      "text": {
        "text": ["I'll help you sign in to your account. Please provide your email and password for secure authentication."]
      }
    }
  ],
  "parameters": [],
  "contexts": [],
  "resetContexts": false
}
EOF

    # 2. Account Balance Intents
    cat > ./config/intents/account-balance.json << 'EOF'
{
  "displayName": "account.balance",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "What's my account balance"}]},
    {"parts": [{"text": "Show me my balance"}]},
    {"parts": [{"text": "How much money do I have"}]},
    {"parts": [{"text": "Check my account balance"}]},
    {"parts": [{"text": "What's the balance in my account"}]},
    {"parts": [{"text": "I want to see my current balance"}]},
    {"parts": [{"text": "Can you tell me my balance"}]},
    {"parts": [{"text": "What's my current account balance"}]},
    {"parts": [{"text": "How much is in my "},{"text": "checking","entityType": "@account-type"}, {"text": " account"}]},
    {"parts": [{"text": "Balance for account "},{"text": "12345","entityType": "@account-number"}]},
    {"parts": [{"text": "Show balance for my "},{"text": "savings","entityType": "@account-type"}, {"text": " account"}]}
  ],
  "messages": [
    {
      "text": {
        "text": ["I'll check your account balance for you. Please wait while I retrieve your current balance information."]
      }
    }
  ],
  "parameters": [
    {
      "name": "account-type",
      "displayName": "account-type",
      "value": "$account-type",
      "entityTypeDisplayName": "@account-type",
      "mandatory": false,
      "prompts": ["Which account would you like to check?"]
    },
    {
      "name": "account-number",
      "displayName": "account-number",
      "value": "$account-number",
      "entityTypeDisplayName": "@account-number",
      "mandatory": false,
      "prompts": ["Which account number?"]
    }
  ],
  "contexts": [],
  "resetContexts": false
}
EOF

    # 3. Transaction History Intents
    cat > ./config/intents/transaction-history.json << 'EOF'
{
  "displayName": "transaction.history",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "Show me my transaction history"}]},
    {"parts": [{"text": "I want to see my recent transactions"}]},
    {"parts": [{"text": "What are my last transactions"}]},
    {"parts": [{"text": "Show transactions for "},{"text": "last month","entityType": "@sys.date-period"}]},
    {"parts": [{"text": "Transaction history for account "},{"text": "12345","entityType": "@account-number"}]},
    {"parts": [{"text": "Recent activity on my account"}]},
    {"parts": [{"text": "What transactions have I made"}]},
    {"parts": [{"text": "Show me transactions from "},{"text": "January","entityType": "@sys.date-period"}]},
    {"parts": [{"text": "I need my transaction report"}]},
    {"parts": [{"text": "Display my account activity"}]},
    {"parts": [{"text": "What purchases did I make recently"}]},
    {"parts": [{"text": "Show me all transactions for "},{"text": "this week","entityType": "@sys.date-period"}]}
  ],
  "messages": [
    {
      "text": {
        "text": ["I'll retrieve your transaction history. Let me fetch your recent account activity."]
      }
    }
  ],
  "parameters": [
    {
      "name": "date-period",
      "displayName": "date-period",
      "value": "$sys.date-period",
      "entityTypeDisplayName": "@sys.date-period",
      "mandatory": false,
      "prompts": ["For which time period would you like to see transactions?"]
    },
    {
      "name": "account-number",
      "displayName": "account-number",
      "value": "$account-number",
      "entityTypeDisplayName": "@account-number",
      "mandatory": false,
      "prompts": ["Which account would you like to check?"]
    }
  ],
  "contexts": [],
  "resetContexts": false
}
EOF

    # 4. Payment Transfer Intents
    cat > ./config/intents/payment-transfer.json << 'EOF'
{
  "displayName": "payment.transfer",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "Transfer "},{"text": "$100","entityType": "@sys.amount-of-money"}, {"text": " to "},{"text": "John","entityType": "@sys.person"}]},
    {"parts": [{"text": "Send money to "},{"text": "Jane","entityType": "@sys.person"}]},
    {"parts": [{"text": "I want to make a transfer"}]},
    {"parts": [{"text": "Transfer money to account "},{"text": "12345","entityType": "@account-number"}]},
    {"parts": [{"text": "Send "},{"text": "$50","entityType": "@sys.amount-of-money"}, {"text": " to my friend"}]},
    {"parts": [{"text": "I need to transfer funds"}]},
    {"parts": [{"text": "Move "},{"text": "$200","entityType": "@sys.amount-of-money"}, {"text": " from checking to savings"}]},
    {"parts": [{"text": "Transfer "},{"text": "$500","entityType": "@sys.amount-of-money"}, {"text": " to "},{"text": "Bob","entityType": "@sys.person"}]},
    {"parts": [{"text": "Can I send money to someone"}]},
    {"parts": [{"text": "I want to pay "},{"text": "Alice","entityType": "@sys.person"}, {"text": " "},{"text": "$75","entityType": "@sys.amount-of-money"}]},
    {"parts": [{"text": "Transfer funds to "},{"text": "external account","entityType": "@account-type"}]}
  ],
  "messages": [
    {
      "text": {
        "text": ["I'll help you transfer money. For your security, I'll need to verify the amount, recipient, and your authorization."]
      }
    }
  ],
  "parameters": [
    {
      "name": "amount-of-money",
      "displayName": "amount-of-money",
      "value": "$sys.amount-of-money",
      "entityTypeDisplayName": "@sys.amount-of-money",
      "mandatory": true,
      "prompts": ["How much would you like to transfer?"]
    },
    {
      "name": "recipient",
      "displayName": "recipient",
      "value": "$sys.person",
      "entityTypeDisplayName": "@sys.person",
      "mandatory": true,
      "prompts": ["Who would you like to send money to?"]
    },
    {
      "name": "from-account",
      "displayName": "from-account",
      "value": "$account-number",
      "entityTypeDisplayName": "@account-number",
      "mandatory": false,
      "prompts": ["Which account should I transfer from?"]
    }
  ],
  "contexts": [],
  "resetContexts": false
}
EOF

    # 5. Bill Payment Intents
    cat > ./config/intents/payment-bill.json << 'EOF'
{
  "displayName": "payment.bill",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "Pay my "},{"text": "electricity","entityType": "@bill-type"}, {"text": " bill"}]},
    {"parts": [{"text": "I want to pay my bills"}]},
    {"parts": [{"text": "Pay "},{"text": "$150","entityType": "@sys.amount-of-money"}, {"text": " for "},{"text": "water","entityType": "@bill-type"}, {"text": " bill"}]},
    {"parts": [{"text": "Schedule payment for "},{"text": "credit card","entityType": "@bill-type"}]},
    {"parts": [{"text": "Pay my monthly "},{"text": "rent","entityType": "@bill-type"}]},
    {"parts": [{"text": "I need to pay "},{"text": "internet","entityType": "@bill-type"}, {"text": " bill"}]},
    {"parts": [{"text": "Can you help me pay bills"}]},
    {"parts": [{"text": "Pay "},{"text": "phone","entityType": "@bill-type"}, {"text": " bill of "},{"text": "$80","entityType": "@sys.amount-of-money"}]},
    {"parts": [{"text": "I want to make a bill payment"}]},
    {"parts": [{"text": "Pay my "},{"text": "gas","entityType": "@bill-type"}, {"text": " utility"}]}
  ],
  "messages": [
    {
      "text": {
        "text": ["I'll help you pay your bill. Let me gather the payment details and process this securely for you."]
      }
    }
  ],
  "parameters": [
    {
      "name": "bill-type",
      "displayName": "bill-type",
      "value": "$bill-type",
      "entityTypeDisplayName": "@bill-type",
      "mandatory": true,
      "prompts": ["Which bill would you like to pay?"]
    },
    {
      "name": "amount-of-money",
      "displayName": "amount-of-money",
      "value": "$sys.amount-of-money",
      "entityTypeDisplayName": "@sys.amount-of-money",
      "mandatory": false,
      "prompts": ["How much would you like to pay?"]
    }
  ],
  "contexts": [],
  "resetContexts": false
}
EOF

    # 6. Card Management Intents
    cat > ./config/intents/card-status.json << 'EOF'
{
  "displayName": "card.status",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "What's the status of my card"}]},
    {"parts": [{"text": "Check my card status"}]},
    {"parts": [{"text": "Is my "},{"text": "credit","entityType": "@card-type"}, {"text": " card active"}]},
    {"parts": [{"text": "Show me my card information"}]},
    {"parts": [{"text": "What cards do I have"}]},
    {"parts": [{"text": "List my cards"}]},
    {"parts": [{"text": "Card details for "},{"text": "4532","entityType": "@card-number"}]},
    {"parts": [{"text": "Status of my "},{"text": "debit","entityType": "@card-type"}, {"text": " card"}]},
    {"parts": [{"text": "Is my card working"}]},
    {"parts": [{"text": "Check if my card is blocked"}]}
  ],
  "messages": [
    {
      "text": {
        "text": ["I'll check your card status for you. Let me retrieve your current card information."]
      }
    }
  ],
  "parameters": [
    {
      "name": "card-type",
      "displayName": "card-type",
      "value": "$card-type",
      "entityTypeDisplayName": "@card-type",
      "mandatory": false,
      "prompts": ["Which type of card are you asking about?"]
    },
    {
      "name": "card-number",
      "displayName": "card-number",
      "value": "$card-number",
      "entityTypeDisplayName": "@card-number",
      "mandatory": false,
      "prompts": ["What are the last 4 digits of your card?"]
    }
  ],
  "contexts": [],
  "resetContexts": false
}
EOF

    # 7. Card Block Intents
    cat > ./config/intents/card-block.json << 'EOF'
{
  "displayName": "card.block",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "Block my card"}]},
    {"parts": [{"text": "I want to block my "},{"text": "credit","entityType": "@card-type"}, {"text": " card"}]},
    {"parts": [{"text": "My card is lost, please block it"}]},
    {"parts": [{"text": "Freeze my card"}]},
    {"parts": [{"text": "Disable my "},{"text": "debit","entityType": "@card-type"}, {"text": " card"}]},
    {"parts": [{"text": "I need to stop my card"}]},
    {"parts": [{"text": "Cancel card ending in "},{"text": "4532","entityType": "@card-number"}]},
    {"parts": [{"text": "My card was stolen"}]},
    {"parts": [{"text": "Emergency card block"}]},
    {"parts": [{"text": "Suspend my card immediately"}]}
  ],
  "messages": [
    {
      "text": {
        "text": ["I understand you need to block your card. For your security, I'll process this request immediately. Your card will be blocked right away."]
      }
    }
  ],
  "parameters": [
    {
      "name": "card-type",
      "displayName": "card-type",
      "value": "$card-type",
      "entityTypeDisplayName": "@card-type",
      "mandatory": false,
      "prompts": ["Which card would you like to block?"]
    },
    {
      "name": "card-number",
      "displayName": "card-number",
      "value": "$card-number",
      "entityTypeDisplayName": "@card-number",
      "mandatory": false,
      "prompts": ["What are the last 4 digits of the card?"]
    }
  ],
  "contexts": [],
  "resetContexts": false
}
EOF

    # 8. Dispute Creation Intents
    cat > ./config/intents/dispute-create.json << 'EOF'
{
  "displayName": "dispute.create",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "I want to dispute a transaction"}]},
    {"parts": [{"text": "This charge is wrong"}]},
    {"parts": [{"text": "I didn't make this purchase"}]},
    {"parts": [{"text": "File a dispute for "},{"text": "$50","entityType": "@sys.amount-of-money"}, {"text": " charge"}]},
    {"parts": [{"text": "This transaction is fraudulent"}]},
    {"parts": [{"text": "I want to report an unauthorized transaction"}]},
    {"parts": [{"text": "Dispute charge from "},{"text": "Amazon","entityType": "@sys.organization"}]},
    {"parts": [{"text": "I need to contest a payment"}]},
    {"parts": [{"text": "This is not my transaction"}]},
    {"parts": [{"text": "I want to challenge this charge"}]},
    {"parts": [{"text": "Report incorrect billing"}]}
  ],
  "messages": [
    {
      "text": {
        "text": ["I'll help you file a dispute for this transaction. I'll need some details about the transaction you want to dispute."]
      }
    }
  ],
  "parameters": [
    {
      "name": "amount-of-money",
      "displayName": "amount-of-money",
      "value": "$sys.amount-of-money",
      "entityTypeDisplayName": "@sys.amount-of-money",
      "mandatory": false,
      "prompts": ["What was the amount of the disputed transaction?"]
    },
    {
      "name": "merchant",
      "displayName": "merchant",
      "value": "$sys.organization",
      "entityTypeDisplayName": "@sys.organization",
      "mandatory": false,
      "prompts": ["What merchant was this charge from?"]
    }
  ],
  "contexts": [],
  "resetContexts": false
}
EOF

    # 9. Fraud Report Intents
    cat > ./config/intents/fraud-report.json << 'EOF'
{
  "displayName": "fraud.report",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "I want to report fraud"}]},
    {"parts": [{"text": "My account has been compromised"}]},
    {"parts": [{"text": "Someone used my card without permission"}]},
    {"parts": [{"text": "Report fraudulent activity"}]},
    {"parts": [{"text": "I think my account is hacked"}]},
    {"parts": [{"text": "Unauthorized transactions on my account"}]},
    {"parts": [{"text": "My card information was stolen"}]},
    {"parts": [{"text": "I see suspicious activity"}]},
    {"parts": [{"text": "Report identity theft"}]},
    {"parts": [{"text": "Someone is using my banking details"}]},
    {"parts": [{"text": "Emergency fraud alert"}]}
  ],
  "messages": [
    {
      "text": {
        "text": ["I understand you need to report fraud. This is a serious matter and I'll help you immediately. Your account security is our priority."]
      }
    }
  ],
  "parameters": [],
  "contexts": [],
  "resetContexts": false
}
EOF

    # 10. Account Statement Intents
    cat > ./config/intents/account-statement.json << 'EOF'
{
  "displayName": "account.statement",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "I need my account statement"}]},
    {"parts": [{"text": "Send me my "},{"text": "monthly","entityType": "@sys.date-period"}, {"text": " statement"}]},
    {"parts": [{"text": "Download statement for "},{"text": "January","entityType": "@sys.date-period"}]},
    {"parts": [{"text": "Get my bank statement"}]},
    {"parts": [{"text": "I want my account summary"}]},
    {"parts": [{"text": "Statement for account "},{"text": "12345","entityType": "@account-number"}]},
    {"parts": [{"text": "Email me my statement"}]},
    {"parts": [{"text": "Generate account report"}]},
    {"parts": [{"text": "I need statement from "},{"text": "last quarter","entityType": "@sys.date-period"}]}
  ],
  "messages": [
    {
      "text": {
        "text": ["I'll generate your account statement for you. Let me prepare your account summary and transaction details."]
      }
    }
  ],
  "parameters": [
    {
      "name": "date-period",
      "displayName": "date-period",
      "value": "$sys.date-period",
      "entityTypeDisplayName": "@sys.date-period",
      "mandatory": false,
      "prompts": ["For which period would you like the statement?"]
    },
    {
      "name": "account-number",
      "displayName": "account-number",
      "value": "$account-number",
      "entityTypeDisplayName": "@account-number",
      "mandatory": false,
      "prompts": ["Which account statement do you need?"]
    }
  ],
  "contexts": [],
  "resetContexts": false
}
EOF

    # 11. General Greeting Intents
    cat > ./config/intents/general-greeting.json << 'EOF'
{
  "displayName": "general.greeting",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "Hello"}]},
    {"parts": [{"text": "Hi"}]},
    {"parts": [{"text": "Good morning"}]},
    {"parts": [{"text": "Good afternoon"}]},
    {"parts": [{"text": "Good evening"}]},
    {"parts": [{"text": "Hey there"}]},
    {"parts": [{"text": "Greetings"}]},
    {"parts": [{"text": "Hi there"}]},
    {"parts": [{"text": "How are you"}]},
    {"parts": [{"text": "Hey"}]}
  ],
  "messages": [
    {
      "text": {
        "text": [
          "Hello! I'm your Enterprise Banking AI Assistant. I can help you with account balances, transactions, payments, card management, and more. How can I assist you today?",
          "Hi there! Welcome to Enterprise Banking. I'm here to help with all your banking needs. What would you like to do today?",
          "Good day! I'm your personal banking assistant. I can help you check balances, make payments, view transactions, and much more. How may I help you?"
        ]
      }
    }
  ],
  "parameters": [],
  "contexts": [],
  "resetContexts": false
}
EOF

    # 12. Help Intents
    cat > ./config/intents/general-help.json << 'EOF'
{
  "displayName": "general.help",
  "priority": 500000,
  "mlDisabled": false,
  "trainingPhrases": [
    {"parts": [{"text": "Help"}]},
    {"parts": [{"text": "What can you do"}]},
    {"parts": [{"text": "I need help"}]},
    {"parts": [{"text": "How can you assist me"}]},
    {"parts": [{"text": "What services do you offer"}]},
    {"parts": [{"text": "Help me with banking"}]},
    {"parts": [{"text": "What are your capabilities"}]},
    {"parts": [{"text": "Show me what you can do"}]},
    {"parts": [{"text": "I don't know what to ask"}]},
    {"parts": [{"text": "Banking assistance"}]}
  ],
  "messages": [
    {
      "text": {
        "text": [
          "I can help you with:\n\n🏦 **Account Services**\n• Check account balances\n• View transaction history\n• Download statements\n\n💳 **Card Management**\n• Check card status\n• Block/unblock cards\n• Report lost cards\n\n💸 **Payments & Transfers**\n• Transfer money between accounts\n• Pay bills\n• Send money to others\n\n🛡️ **Security & Support**\n• Report fraud\n• File transaction disputes\n• Update security settings\n\nJust tell me what you'd like to do!"
        ]
      }
    }
  ],
  "parameters": [],
  "contexts": [],
  "resetContexts": false
}
EOF

    print_success "Created all banking intents"
}

# Create entities
create_entities() {
    print_status "Creating custom entities..."
    
    mkdir -p ./config/entities
    
    # Account Type Entity
    cat > ./config/entities/account-type.json << 'EOF'
{
  "displayName": "account-type",
  "kind": "KIND_MAP",
  "entities": [
    {"value": "checking", "synonyms": ["checking", "current", "chequing", "primary"]},
    {"value": "savings", "synonyms": ["savings", "save", "saving", "deposit"]},
    {"value": "credit", "synonyms": ["credit", "credit card", "cc", "visa", "mastercard"]},
    {"value": "business", "synonyms": ["business", "commercial", "corporate", "company"]},
    {"value": "external", "synonyms": ["external", "other bank", "different bank", "outside"]}
  ]
}
EOF

    # Card Type Entity
    cat > ./config/entities/card-type.json << 'EOF'
{
  "displayName": "card-type",
  "kind": "KIND_MAP",
  "entities": [
    {"value": "credit", "synonyms": ["credit", "credit card", "cc", "visa", "mastercard", "amex"]},
    {"value": "debit", "synonyms": ["debit", "debit card", "bank card", "atm card"]},
    {"value": "prepaid", "synonyms": ["prepaid", "gift card", "prepaid card"]},
    {"value": "business", "synonyms": ["business", "corporate card", "company card"]}
  ]
}
EOF

    # Bill Type Entity
    cat > ./config/entities/bill-type.json << 'EOF'
{
  "displayName": "bill-type",
  "kind": "KIND_MAP",
  "entities": [
    {"value": "electricity", "synonyms": ["electricity", "electric", "power", "electric bill"]},
    {"value": "water", "synonyms": ["water", "water bill", "utilities", "municipal"]},
    {"value": "gas", "synonyms": ["gas", "natural gas", "heating", "gas bill"]},
    {"value": "internet", "synonyms": ["internet", "broadband", "wifi", "web"]},
    {"value": "phone", "synonyms": ["phone", "mobile", "cell", "telephone", "cellular"]},
    {"value": "credit card", "synonyms": ["credit card", "cc", "visa", "mastercard", "amex"]},
    {"value": "rent", "synonyms": ["rent", "rental", "lease", "housing"]},
    {"value": "insurance", "synonyms": ["insurance", "policy", "coverage", "premium"]},
    {"value": "cable", "synonyms": ["cable", "tv", "television", "satellite"]},
    {"value": "loan", "synonyms": ["loan", "mortgage", "car loan", "personal loan"]}
  ]
}
EOF

    # Account Number Entity (Pattern-based)
    cat > ./config/entities/account-number.json << 'EOF'
{
  "displayName": "account-number",
  "kind": "KIND_REGEXP",
  "entities": [
    {"value": "account-number", "synonyms": ["\\d{4,12}"]}
  ]
}
EOF

    # Card Number Entity (Pattern-based for last 4 digits)
    cat > ./config/entities/card-number.json << 'EOF'
{
  "displayName": "card-number",
  "kind": "KIND_REGEXP",
  "entities": [
    {"value": "card-number", "synonyms": ["\\d{4}"]}
  ]
}
EOF

    print_success "Created all custom entities"
}

# Create Python script to upload intents via API
create_upload_script() {
    print_status "Creating Python upload script..."
    
    cat > ./config/upload_dialogflow.py << 'EOF'
#!/usr/bin/env python3

import json
import os
from google.cloud import dialogflow

def create_entity_type(project_id, entity_data):
    """Create an entity type in DialogFlow."""
    client = dialogflow.EntityTypesClient()
    parent = f"projects/{project_id}/agent"
    
    entity_type = dialogflow.EntityType(
        display_name=entity_data['displayName'],
        kind=getattr(dialogflow.EntityType.Kind, entity_data['kind']),
        entities=[
            dialogflow.EntityType.Entity(
                value=entity['value'],
                synonyms=entity['synonyms']
            ) for entity in entity_data['entities']
        ]
    )
    
    try:
        response = client.create_entity_type(
            request={"parent": parent, "entity_type": entity_type}
        )
        print(f"✓ Created entity type: {entity_data['displayName']}")
        return response
    except Exception as e:
        print(f"✗ Error creating entity type {entity_data['displayName']}: {e}")
        return None

def create_intent(project_id, intent_data):
    """Create an intent in DialogFlow."""
    client = dialogflow.IntentsClient()
    parent = f"projects/{project_id}/agent"
    
    # Convert training phrases
    training_phrases = []
    for phrase_data in intent_data.get('trainingPhrases', []):
        parts = []
        for part in phrase_data['parts']:
            text_part = dialogflow.Intent.TrainingPhrase.Part(text=part['text'])
            if 'entityType' in part:
                text_part.entity_type = part['entityType']
                text_part.alias = part.get('alias', part['text'])
            parts.append(text_part)
        
        training_phrases.append(
            dialogflow.Intent.TrainingPhrase(parts=parts)
        )
    
    # Convert parameters
    parameters = []
    for param_data in intent_data.get('parameters', []):
        parameters.append(
            dialogflow.Intent.Parameter(
                display_name=param_data['displayName'],
                value=param_data['value'],
                entity_type_display_name=param_data['entityTypeDisplayName'],
                mandatory=param_data.get('mandatory', False),
                prompts=param_data.get('prompts', [])
            )
        )
    
    # Convert messages
    messages = []
    for msg_data in intent_data.get('messages', []):
        if 'text' in msg_data:
            messages.append(
                dialogflow.Intent.Message(
                    text=dialogflow.Intent.Message.Text(
                        text=msg_data['text']['text']
                    )
                )
            )
    
    intent = dialogflow.Intent(
        display_name=intent_data['displayName'],
        training_phrases=training_phrases,
        parameters=parameters,
        messages=messages,
        priority=intent_data.get('priority', 500000),
        ml_disabled=intent_data.get('mlDisabled', False),
        reset_contexts=intent_data.get('resetContexts', False)
    )
    
    try:
        response = client.create_intent(
            request={"parent": parent, "intent": intent}
        )
        print(f"✓ Created intent: {intent_data['displayName']}")
        return response
    except Exception as e:
        print(f"✗ Error creating intent {intent_data['displayName']}: {e}")
        return None

def main():
    """Main function to upload all intents and entities."""
    project_id = os.environ.get('GOOGLE_CLOUD_PROJECT', 'enterprise-banking-chatbot')
    
    print(f"Uploading to DialogFlow project: {project_id}")
    
    # Create entities first
    entities_dir = './config/entities'
    if os.path.exists(entities_dir):
        print("\n🔧 Creating entities...")
        for filename in os.listdir(entities_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(entities_dir, filename)
                with open(filepath, 'r') as file:
                    entity_data = json.load(file)
                    create_entity_type(project_id, entity_data)
    
    # Create intents
    intents_dir = './config/intents'
    if os.path.exists(intents_dir):
        print("\n🎯 Creating intents...")
        for filename in os.listdir(intents_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(intents_dir, filename)
                with open(filepath, 'r') as file:
                    intent_data = json.load(file)
                    create_intent(project_id, intent_data)
    
    print("\n✅ DialogFlow setup complete!")
    print("\nNext steps:")
    print("1. Test your intents in the DialogFlow console")
    print("2. Train your agent with additional examples")
    print("3. Update your ChatBot UI environment variables")
    print(f"4. Set GOOGLE_PROJECT_ID={project_id} in your .env file")

if __name__ == "__main__":
    main()
EOF

    chmod +x ./config/upload_dialogflow.py
    print_success "Created Python upload script"
}

# Create training script
create_training_script() {
    print_status "Creating training enhancement script..."
    
    cat > ./config/enhance_training.py << 'EOF'
#!/usr/bin/env python3

import json
import os
from google.cloud import dialogflow

def add_training_phrases(project_id):
    """Add additional training phrases to existing intents."""
    
    additional_training = {
        "account.balance": [
            "How much do I have in my account",
            "Account balance please",
            "Show me how much money I have",
            "What's my available balance",
            "Current balance",
            "Check funds",
            "Available funds",
            "Balance inquiry"
        ],
        "payment.transfer": [
            "Send payment",
            "Make a transfer",
            "Move money",
            "Transfer between accounts",
            "Send funds",
            "Pay someone",
            "Transfer cash",
            "Wire transfer"
        ],
        "card.block": [
            "Stop my card",
            "Deactivate card",
            "Turn off my card",
            "Secure my card",
            "Freeze card",
            "Put hold on card",
            "Card security",
            "Emergency stop"
        ]
    }
    
    client = dialogflow.IntentsClient()
    parent = f"projects/{project_id}/agent"
    
    # List existing intents
    intents = client.list_intents(request={"parent": parent})
    
    for intent in intents:
        intent_name = intent.display_name
        if intent_name in additional_training:
            print(f"Enhancing intent: {intent_name}")
            
            # Add new training phrases
            for phrase_text in additional_training[intent_name]:
                intent.training_phrases.append(
                    dialogflow.Intent.TrainingPhrase(
                        parts=[
                            dialogflow.Intent.TrainingPhrase.Part(text=phrase_text)
                        ]
                    )
                )
            
            # Update the intent
            try:
                client.update_intent(request={"intent": intent})
                print(f"✓ Enhanced {intent_name} with {len(additional_training[intent_name])} phrases")
            except Exception as e:
                print(f"✗ Error updating {intent_name}: {e}")

if __name__ == "__main__":
    project_id = os.environ.get('GOOGLE_CLOUD_PROJECT', 'enterprise-banking-chatbot')
    add_training_phrases(project_id)
EOF

    chmod +x ./config/enhance_training.py
    print_success "Created training enhancement script"
}

# Main execution flow
main() {
    print_status "🏦 Enterprise Banking DialogFlow Setup"
    print_status "======================================"
    
    echo "This script will:"
    echo "  1. Create Google Cloud Project"
    echo "  2. Enable DialogFlow API"
    echo "  3. Create service account and credentials"
    echo "  4. Generate comprehensive banking intents"
    echo "  5. Create custom entities for banking"
    echo "  6. Prepare upload scripts"
    echo ""
    
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Setup cancelled"
        exit 0
    fi
    
    # Execute setup steps
    check_prerequisites
    create_project
    create_service_account
    create_dialogflow_agent
    create_entities
    create_intents
    create_upload_script
    create_training_script
    
    print_success "🎉 DialogFlow setup files created successfully!"
    echo ""
    echo "📋 Next Steps:"
    echo "  1. Install Python dependencies:"
    echo "     pip install google-cloud-dialogflow"
    echo ""
    echo "  2. Set up authentication:"
    echo "     export GOOGLE_APPLICATION_CREDENTIALS=./config/dialogflow-service-account.json"
    echo "     export GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
    echo ""
    echo "  3. Upload intents and entities:"
    echo "     python3 ./config/upload_dialogflow.py"
    echo ""
    echo "  4. Enhance training (optional):"
    echo "     python3 ./config/enhance_training.py"
    echo ""
    echo "  5. Update your ChatBot UI environment:"
    echo "     GOOGLE_PROJECT_ID=$PROJECT_ID"
    echo "     GOOGLE_APPLICATION_CREDENTIALS=./config/dialogflow-service-account.json"
    echo ""
    echo "🔗 DialogFlow Console: https://dialogflow.cloud.google.com/"
    echo "🏦 Your Project: https://console.cloud.google.com/home/dashboard?project=$PROJECT_ID"
    echo ""
    print_success "Setup complete! Your enterprise banking DialogFlow is ready."
}

# Run main function
main "$@"
