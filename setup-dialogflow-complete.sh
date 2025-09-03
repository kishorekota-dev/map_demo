#!/bin/bash

# Master DialogFlow Setup Script
# Orchestrates the complete DialogFlow NLP setup for Enterprise Banking

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

print_banner() {
    echo -e "${PURPLE}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║         🏦 Enterprise Banking DialogFlow Setup 🤖           ║"
    echo "║                                                              ║"
    echo "║    Complete NLP Solution for Banking ChatBot Integration     ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

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

check_prerequisites() {
    print_status "Checking prerequisites..."
    
    local missing_tools=()
    
    # Check for required tools
    if ! command -v gcloud &> /dev/null; then
        missing_tools+=("Google Cloud CLI")
    fi
    
    if ! command -v python3 &> /dev/null; then
        missing_tools+=("Python 3")
    fi
    
    if ! command -v node &> /dev/null; then
        missing_tools+=("Node.js")
    fi
    
    if ! command -v npm &> /dev/null; then
        missing_tools+=("npm")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools:"
        for tool in "${missing_tools[@]}"; do
            echo "  - $tool"
        done
        echo ""
        echo "Please install missing tools and try again."
        exit 1
    fi
    
    print_success "All prerequisites are available"
}

show_menu() {
    echo ""
    echo -e "${YELLOW}Choose setup option:${NC}"
    echo "  1) 🚀 Complete Setup (Recommended)"
    echo "  2) 🔧 DialogFlow Cloud Setup Only"
    echo "  3) 🎯 Create Integration Files Only"
    echo "  4) 🧪 Test Existing DialogFlow Setup"
    echo "  5) 📚 Show Documentation"
    echo "  6) ❌ Exit"
    echo ""
    read -p "Enter your choice (1-6): " choice
    echo ""
}

complete_setup() {
    print_status "Starting complete DialogFlow setup..."
    
    echo "This will:"
    echo "  ✓ Create Google Cloud project and DialogFlow agent"
    echo "  ✓ Generate comprehensive banking intents and entities"
    echo "  ✓ Create integration files for ChatBot UI and MCP server"
    echo "  ✓ Set up testing and validation tools"
    echo "  ✓ Provide complete documentation"
    echo ""
    
    read -p "Continue with complete setup? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "Setup cancelled"
        return
    fi
    
    # Step 1: DialogFlow Cloud Setup
    print_status "Step 1: Setting up DialogFlow in Google Cloud..."
    if ./setup-dialogflow.sh; then
        print_success "DialogFlow cloud setup completed"
    else
        print_error "DialogFlow setup failed"
        return 1
    fi
    
    # Step 2: Create Integration Files
    print_status "Step 2: Creating integration files..."
    if python3 create-dialogflow-integration.py; then
        print_success "Integration files created"
    else
        print_error "Integration file creation failed"
        return 1
    fi
    
    # Step 3: Install Python Dependencies
    print_status "Step 3: Setting up Python environment..."
    if [ ! -d "venv" ]; then
        python3 -m venv venv
        print_success "Created Python virtual environment"
    fi
    
    source venv/bin/activate
    pip install -r config/requirements.txt
    print_success "Python dependencies installed"
    
    # Step 4: Provide next steps
    print_success "🎉 Complete setup finished!"
    echo ""
    echo -e "${GREEN}Next Steps:${NC}"
    echo "  1. Activate Python environment: source venv/bin/activate"
    echo "  2. Upload intents: python3 ./config/upload_dialogflow.py"
    echo "  3. Test setup: python3 ./config/test_dialogflow.py"
    echo "  4. Install npm dependencies in ChatBot UI and MCP server"
    echo "  5. Update your .env files with DialogFlow configuration"
    echo ""
    echo -e "${BLUE}Documentation:${NC}"
    echo "  - Setup Guide: DIALOGFLOW_SETUP_GUIDE.md"
    echo "  - Integration Guide: DIALOGFLOW_INTEGRATION.md"
    echo "  - Google Cloud Console: https://console.cloud.google.com/"
    echo "  - DialogFlow Console: https://dialogflow.cloud.google.com/"
}

dialogflow_setup_only() {
    print_status "Running DialogFlow cloud setup only..."
    
    if ./setup-dialogflow.sh; then
        print_success "DialogFlow cloud setup completed"
        echo ""
        echo "To complete the integration:"
        echo "  1. Run: python3 create-dialogflow-integration.py"
        echo "  2. Install dependencies: pip install -r config/requirements.txt"
        echo "  3. Upload intents: python3 ./config/upload_dialogflow.py"
    else
        print_error "DialogFlow setup failed"
    fi
}

integration_files_only() {
    print_status "Creating integration files only..."
    
    if python3 create-dialogflow-integration.py; then
        print_success "Integration files created"
        echo ""
        echo "Files created for:"
        echo "  ✓ ChatBot UI DialogFlow service"
        echo "  ✓ MCP server DialogFlow integration"
        echo "  ✓ Environment configuration templates"
        echo "  ✓ Integration documentation"
        echo ""
        echo "Next: Install npm dependencies and update your components"
    else
        print_error "Integration file creation failed"
    fi
}

test_dialogflow() {
    print_status "Testing existing DialogFlow setup..."
    
    if [ ! -f "config/dialogflow-service-account.json" ]; then
        print_error "DialogFlow service account not found"
        echo "Please run the complete setup first or ensure you have:"
        echo "  - config/dialogflow-service-account.json"
        echo "  - GOOGLE_PROJECT_ID environment variable"
        return 1
    fi
    
    # Set up environment
    export GOOGLE_APPLICATION_CREDENTIALS="./config/dialogflow-service-account.json"
    export GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-enterprise-banking-chatbot}"
    
    print_status "Running DialogFlow tests..."
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
    fi
    
    if python3 ./config/test_dialogflow.py; then
        print_success "DialogFlow testing completed"
    else
        print_error "DialogFlow testing failed"
    fi
}

show_documentation() {
    print_status "Available documentation:"
    echo ""
    echo "📋 Setup Guides:"
    echo "  - DIALOGFLOW_SETUP_GUIDE.md     Complete setup instructions"
    echo "  - DIALOGFLOW_INTEGRATION.md     Integration with ChatBot UI"
    echo ""
    echo "🔧 Configuration Files:"
    echo "  - .env.dialogflow.template       Environment variables template"
    echo "  - config/requirements.txt        Python dependencies"
    echo ""
    echo "🧪 Testing Tools:"
    echo "  - config/test_dialogflow.py      DialogFlow testing script"
    echo "  - config/upload_dialogflow.py    Intent upload script"
    echo ""
    echo "🏦 Banking Intents Created:"
    echo "  - Authentication (auth.login)"
    echo "  - Account Management (account.balance, account.statement)"
    echo "  - Transactions (transaction.history)"
    echo "  - Payments (payment.transfer, payment.bill)"
    echo "  - Card Management (card.status, card.block)"
    echo "  - Security (dispute.create, fraud.report)"
    echo "  - General (general.greeting, general.help)"
    echo ""
    echo "🎯 Custom Entities:"
    echo "  - @account-type (checking, savings, credit, business)"
    echo "  - @card-type (credit, debit, prepaid, business)"
    echo "  - @bill-type (electricity, water, gas, internet, etc.)"
    echo "  - @account-number (regex pattern for account numbers)"
    echo "  - @card-number (regex pattern for card numbers)"
    echo ""
    
    read -p "Open detailed setup guide? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if command -v less &> /dev/null; then
            less DIALOGFLOW_SETUP_GUIDE.md
        elif command -v more &> /dev/null; then
            more DIALOGFLOW_SETUP_GUIDE.md
        else
            cat DIALOGFLOW_SETUP_GUIDE.md
        fi
    fi
}

main() {
    print_banner
    
    check_prerequisites
    
    while true; do
        show_menu
        
        case $choice in
            1)
                complete_setup
                break
                ;;
            2)
                dialogflow_setup_only
                break
                ;;
            3)
                integration_files_only
                break
                ;;
            4)
                test_dialogflow
                break
                ;;
            5)
                show_documentation
                ;;
            6)
                print_status "Goodbye!"
                exit 0
                ;;
            *)
                print_error "Invalid option. Please choose 1-6."
                ;;
        esac
    done
}

# Run main function
main "$@"
