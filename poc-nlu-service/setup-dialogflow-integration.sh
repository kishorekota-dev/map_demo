#!/bin/bash

###############################################################################
# DialogFlow Integration - Quick Setup Script
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Project configuration
PROJECT_ID="ai-experimentation-428115"
SERVICE_ACCOUNT_NAME="nlu-service-account"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CREDS_DIR="${SCRIPT_DIR}/credentials"
CONFIG_DIR="${SCRIPT_DIR}/dialogflow-config"
GCLOUD_PATH="/Users/container/Downloads/google-cloud-sdk/bin/gcloud"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}DialogFlow Integration - Quick Setup${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Function to print messages
print_info() { echo -e "${BLUE}ℹ ${1}${NC}"; }
print_success() { echo -e "${GREEN}✓ ${1}${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ ${1}${NC}"; }
print_error() { echo -e "${RED}✗ ${1}${NC}"; }

# Step 1: Create agent backup ZIP
create_agent_zip() {
    print_info "Creating agent backup ZIP..."
    
    cd "$CONFIG_DIR"
    
    if [ -f "agent-backup.zip" ]; then
        print_warning "Removing existing agent-backup.zip"
        rm agent-backup.zip
    fi
    
    zip -r agent-backup.zip agent/ > /dev/null 2>&1
    
    if [ -f "agent-backup.zip" ]; then
        print_success "Agent backup created: ${CONFIG_DIR}/agent-backup.zip"
        print_info "Size: $(du -h agent-backup.zip | cut -f1)"
    else
        print_error "Failed to create agent backup ZIP"
        exit 1
    fi
    
    echo ""
}

# Step 2: Check $GCLOUD_PATH authentication
check_gcloud() {
    print_info "Checking Google Cloud authentication..."
    
    if [ ! -f "$GCLOUD_PATH" ]; then
        print_error "$GCLOUD_PATH CLI not found at: $GCLOUD_PATH"
        print_info "Install from: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    
    if $GCLOUD_PATH auth list --filter="status:ACTIVE" --format="value(account)" 2>/dev/null | grep -q "@"; then
        ACTIVE_ACCOUNT=$($GCLOUD_PATH auth list --filter="status:ACTIVE" --format="value(account)")
        print_success "Authenticated as: $ACTIVE_ACCOUNT"
    else
        print_warning "Not authenticated with gcloud"
        print_info "Run: $GCLOUD_PATH auth login"
        exit 1
    fi
    
    echo ""
}

# Step 3: Set project
set_project() {
    print_info "Setting Google Cloud project..."
    
    $GCLOUD_PATH config set project $PROJECT_ID >/dev/null 2>&1
    
    CURRENT_PROJECT=$($GCLOUD_PATH config get-value project 2>/dev/null)
    if [ "$CURRENT_PROJECT" = "$PROJECT_ID" ]; then
        print_success "Project set to: $PROJECT_ID"
    else
        print_error "Failed to set project"
        exit 1
    fi
    
    echo ""
}

# Step 4: Enable DialogFlow API
enable_api() {
    print_info "Enabling DialogFlow API..."
    
    if $GCLOUD_PATH services list --enabled --project="$PROJECT_ID" 2>/dev/null | grep -q "dialogflow.googleapis.com"; then
        print_success "DialogFlow API already enabled"
    else
        print_warning "Enabling DialogFlow API (this may take a minute)..."
        $GCLOUD_PATH services enable dialogflow.googleapis.com --project="$PROJECT_ID"
        print_success "DialogFlow API enabled"
    fi
    
    echo ""
}

# Step 5: Create service account
create_service_account() {
    print_info "Creating service account..."
    
    SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    # Check if service account exists
    if $GCLOUD_PATH iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
        print_warning "Service account already exists: $SERVICE_ACCOUNT_EMAIL"
    else
        $GCLOUD_PATH iam service-accounts create $SERVICE_ACCOUNT_NAME \
            --display-name="NLU Service Account" \
            --project=$PROJECT_ID
        print_success "Service account created: $SERVICE_ACCOUNT_EMAIL"
    fi
    
    echo ""
}

# Step 6: Grant permissions
grant_permissions() {
    print_info "Granting DialogFlow permissions..."
    
    SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    
    # Grant DialogFlow Client role
    $GCLOUD_PATH projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="roles/dialogflow.client" \
        --condition=None \
        >/dev/null 2>&1
    
    print_success "Granted roles/dialogflow.client"
    
    # Grant DialogFlow Admin role (optional, for training)
    $GCLOUD_PATH projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
        --role="roles/dialogflow.admin" \
        --condition=None \
        >/dev/null 2>&1
    
    print_success "Granted roles/dialogflow.admin"
    
    echo ""
}

# Step 7: Generate key file
generate_key() {
    print_info "Generating service account key..."
    
    mkdir -p "$CREDS_DIR"
    
    SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
    KEY_FILE="${CREDS_DIR}/dialogflow-key.json"
    
    if [ -f "$KEY_FILE" ]; then
        print_warning "Key file already exists"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Keeping existing key file"
            echo ""
            return
        fi
        rm "$KEY_FILE"
    fi
    
    $GCLOUD_PATH iam service-accounts keys create "$KEY_FILE" \
        --iam-account="$SERVICE_ACCOUNT_EMAIL" \
        --project="$PROJECT_ID"
    
    chmod 600 "$KEY_FILE"
    
    print_success "Key file created: $KEY_FILE"
    print_info "Size: $(du -h "$KEY_FILE" | cut -f1)"
    print_warning "Keep this file secure!"
    
    echo ""
}

# Step 8: Update environment file
update_env() {
    print_info "Updating .env.development file..."
    
    ENV_FILE="${SCRIPT_DIR}/.env.development"
    
    cat > "$ENV_FILE" <<EOF
# NLU Service Configuration
NODE_ENV=development
PORT=3003
LOG_LEVEL=debug

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3006,http://localhost:8080

# DialogFlow Configuration
DIALOGFLOW_ENABLED=true
DIALOGFLOW_PROJECT_ID=${PROJECT_ID}
DIALOGFLOW_LANGUAGE_CODE=en-US
GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/dialogflow-key.json

# Cache
CACHE_ENABLED=true
CACHE_TTL=300
CACHE_MAX_ITEMS=500

# Service
SERVICE_NAME=poc-nlu-service
SERVICE_VERSION=1.0.0
MAX_REQUEST_SIZE=10mb
REQUEST_TIMEOUT=30000
EOF
    
    print_success "Environment file updated: $ENV_FILE"
    echo ""
}

# Step 9: Test configuration
test_config() {
    print_info "Testing configuration..."
    
    KEY_FILE="${CREDS_DIR}/dialogflow-key.json"
    
    if [ ! -f "$KEY_FILE" ]; then
        print_error "Key file not found: $KEY_FILE"
        exit 1
    fi
    
    # Verify key file is valid JSON
    if jq empty "$KEY_FILE" 2>/dev/null; then
        print_success "Key file is valid JSON"
    else
        print_error "Key file is not valid JSON"
        exit 1
    fi
    
    # Extract project ID from key file
    KEY_PROJECT=$(jq -r '.project_id' "$KEY_FILE")
    if [ "$KEY_PROJECT" = "$PROJECT_ID" ]; then
        print_success "Key file project matches: $KEY_PROJECT"
    else
        print_warning "Key file project mismatch: $KEY_PROJECT (expected: $PROJECT_ID)"
    fi
    
    echo ""
}

# Step 10: Display next steps
show_next_steps() {
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}✓ Setup Complete!${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    
    echo -e "${BLUE}Files Created:${NC}"
    echo "  • Agent ZIP: ${CONFIG_DIR}/agent-backup.zip"
    echo "  • Service Key: ${CREDS_DIR}/dialogflow-key.json"
    echo "  • Environment: ${SCRIPT_DIR}/.env.development"
    echo ""
    
    echo -e "${YELLOW}Next Steps:${NC}"
    echo ""
    echo -e "${BLUE}1. Import Agent to DialogFlow:${NC}"
    echo "   • Open: https://dialogflow.cloud.google.com/"
    echo "   • Select project: ${PROJECT_ID}"
    echo "   • Create or select agent: POC Banking Assistant"
    echo "   • Settings → Export and Import → IMPORT FROM ZIP"
    echo "   • Upload: ${CONFIG_DIR}/agent-backup.zip"
    echo "   • Choose: RESTORE"
    echo ""
    
    echo -e "${BLUE}2. Test in DialogFlow Console:${NC}"
    echo "   • Try: \"What is my account balance?\""
    echo "   • Try: \"Transfer $500 to savings\""
    echo "   • Try: \"Show my transactions\""
    echo "   • Verify intent detection accuracy"
    echo ""
    
    echo -e "${BLUE}3. Test NLU Service with DialogFlow:${NC}"
    echo "   cd ${SCRIPT_DIR}"
    echo "   docker compose down"
    echo "   docker compose up --build -d"
    echo "   docker compose logs -f | grep -i dialogflow"
    echo ""
    
    echo -e "${BLUE}4. Verify DialogFlow Integration:${NC}"
    echo "   curl http://localhost:3003/api/nlu/dialogflow/status"
    echo ""
    
    echo -e "${BLUE}5. Test Intent Detection:${NC}"
    echo '   curl -X POST http://localhost:3003/api/nlu/analyze \'
    echo '     -H "Content-Type: application/json" \'
    echo '     -d '"'"'{"user_input":"What is my balance?","sessionId":"test"}'"'"
    echo ""
    
    echo -e "${BLUE}6. Start Full Stack:${NC}"
    echo "   cd /Users/container/git/map_demo"
    echo "   ./deployment-scripts/start-local-dev.sh"
    echo ""
    
    echo -e "${BLUE}📚 Documentation:${NC}"
    echo "   • Complete Guide: ${SCRIPT_DIR}/DIALOGFLOW-INTEGRATION-GUIDE.md"
    echo "   • Deployment Summary: ${CONFIG_DIR}/DEPLOYMENT_SUMMARY.md"
    echo ""
}

# Main execution
main() {
    create_agent_zip
    check_gcloud
    set_project
    enable_api
    create_service_account
    grant_permissions
    generate_key
    update_env
    test_config
    show_next_steps
}

# Run main
main "$@"
