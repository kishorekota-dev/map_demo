#!/usr/bin/env python3
"""
Deploy DialogFlow Agent - Alternative Method
Creates agent and intents programmatically using service account
"""

import os
import sys
import json
from google.cloud import dialogflow_v2 as dialogflow
from google.oauth2 import service_account

def create_agent_and_intents():
    """Create agent and basic intents programmatically"""
    
    # Configuration
    project_id = "ai-experimentation-428115"
    credentials_path = "/Users/container/git/map_demo/poc-nlu-service/credentials/dialogflow-key.json"
    
    print("🚀 Starting DialogFlow Agent Creation...")
    print(f"📁 Project ID: {project_id}")
    print(f"🔑 Credentials: {credentials_path}")
    print()
    
    # Check if credentials exist
    if not os.path.exists(credentials_path):
        print(f"❌ Error: Credentials file not found: {credentials_path}")
        sys.exit(1)
    
    try:
        # Load credentials
        print("🔐 Loading credentials...")
        credentials = service_account.Credentials.from_service_account_file(
            credentials_path,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        # Create intents client
        print("🔌 Creating DialogFlow intents client...")
        intents_client = dialogflow.IntentsClient(credentials=credentials)
        parent = f"projects/{project_id}/agent"
        
        print(f"📤 Creating intents in {parent}...")
        print()
        
        # Define essential banking intents
        intents_to_create = [
            {
                "display_name": "check.balance",
                "training_phrases": [
                    "What is my balance",
                    "Check my balance",
                    "Show my account balance",
                    "How much money do I have",
                    "What's my checking balance",
                    "Balance inquiry",
                    "Current balance",
                    "Available balance"
                ],
                "messages": ["I'll check your account balance for you right away."],
                "priority": 500000
            },
            {
                "display_name": "transfer.money",
                "training_phrases": [
                    "Transfer money",
                    "Transfer $500 to savings",
                    "I want to transfer funds",
                    "Move money between accounts",
                    "Transfer 1000 dollars",
                    "Send money to my savings account"
                ],
                "messages": ["I can help you transfer money between your accounts."],
                "priority": 500000
            },
            {
                "display_name": "view.transactions",
                "training_phrases": [
                    "Show my transactions",
                    "Transaction history",
                    "Recent transactions",
                    "Last 10 transactions",
                    "Show me my purchases",
                    "What did I spend money on"
                ],
                "messages": ["I'll retrieve your recent transactions."],
                "priority": 500000
            },
            {
                "display_name": "block.card",
                "training_phrases": [
                    "Block my card",
                    "Freeze my credit card",
                    "I lost my card",
                    "Deactivate my debit card",
                    "Stop my card",
                    "Card was stolen"
                ],
                "messages": ["I'll help you block your card immediately for security."],
                "priority": 500000
            },
            {
                "display_name": "check.loan.status",
                "training_phrases": [
                    "Check my loan",
                    "What's my loan balance",
                    "How much do I owe on my mortgage",
                    "Loan payment amount",
                    "When is my loan due"
                ],
                "messages": ["I can provide information about your loan."],
                "priority": 500000
            },
            {
                "display_name": "welcome",
                "training_phrases": [
                    "Hello",
                    "Hi",
                    "Hey",
                    "Good morning",
                    "Good afternoon",
                    "Hi there"
                ],
                "messages": ["Hello! I'm your banking assistant. How can I help you today?"],
                "priority": 500000
            },
            {
                "display_name": "help",
                "training_phrases": [
                    "Help",
                    "What can you do",
                    "How can you help me",
                    "What are your features",
                    "Show me what you can do"
                ],
                "messages": ["I can help you check balances, transfer money, view transactions, manage cards, and more!"],
                "priority": 500000
            }
        ]
        
        created_count = 0
        
        for intent_data in intents_to_create:
            try:
                # Create training phrases
                training_phrases = []
                for phrase_text in intent_data["training_phrases"]:
                    part = dialogflow.Intent.TrainingPhrase.Part(text=phrase_text)
                    training_phrase = dialogflow.Intent.TrainingPhrase(parts=[part])
                    training_phrases.append(training_phrase)
                
                # Create text message
                text = dialogflow.Intent.Message.Text(text=intent_data["messages"])
                message = dialogflow.Intent.Message(text=text)
                
                # Create intent
                intent = dialogflow.Intent(
                    display_name=intent_data["display_name"],
                    training_phrases=training_phrases,
                    messages=[message],
                    priority=intent_data["priority"]
                )
                
                # Create the intent
                response = intents_client.create_intent(
                    request={"parent": parent, "intent": intent}
                )
                
                print(f"  ✓ Created intent: {intent_data['display_name']}")
                created_count += 1
                
            except Exception as e:
                if "already exists" in str(e).lower():
                    print(f"  ⚠ Intent already exists: {intent_data['display_name']}")
                else:
                    print(f"  ✗ Failed to create {intent_data['display_name']}: {str(e)}")
        
        print()
        print(f"✅ Created {created_count} intents successfully!")
        print()
        
        # List all intents to verify
        print("📋 Verifying created intents...")
        intents = intents_client.list_intents(request={"parent": parent})
        intent_list = list(intents)
        
        print(f"   Total intents in agent: {len(intent_list)}")
        for intent in intent_list[:10]:  # Show first 10
            print(f"   • {intent.display_name}")
        
        if len(intent_list) > 10:
            print(f"   ... and {len(intent_list) - 10} more")
        
        print()
        print("✅ Agent is operational!")
        print()
        print("📊 Next Steps:")
        print("1. Test in DialogFlow Console: https://dialogflow.cloud.google.com/")
        print("2. Start NLU service:")
        print("   cd /Users/container/git/map_demo/poc-nlu-service")
        print("   docker compose up --build -d")
        print("3. Run tests: ./test-dialogflow.sh")
        print()
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print()
        
        # Check if it's an agent not found error
        if "NOT_FOUND" in str(e) or "Agent not found" in str(e):
            print("💡 The agent doesn't exist yet. Creating it...")
            try:
                # Try to create the agent first
                agents_client = dialogflow.AgentsClient(credentials=credentials)
                
                agent = dialogflow.Agent(
                    parent=f"projects/{project_id}",
                    display_name="POC Banking Assistant",
                    default_language_code="en",
                    time_zone="America/New_York",
                    tier=dialogflow.Agent.Tier.TIER_STANDARD,
                    enable_logging=True,
                    match_mode=dialogflow.Agent.MatchMode.MATCH_MODE_HYBRID,
                    classification_threshold=0.3
                )
                
                # Set the agent
                agents_client.set_agent(request={"agent": agent})
                print("✅ Agent created successfully!")
                print("   Re-running intent creation...")
                print()
                return create_agent_and_intents()  # Retry
                
            except Exception as agent_error:
                print(f"❌ Failed to create agent: {str(agent_error)}")
                print()
                print("💡 Manual steps:")
                print("1. Go to: https://dialogflow.cloud.google.com/")
                print("2. Select project: ai-experimentation-428115")
                print("3. Click 'Create Agent'")
                print("4. Run this script again")
                print()
                return False
        else:
            print("💡 Troubleshooting:")
            print("1. Verify credentials file exists")
            print("2. Check service account has dialogflow.admin role")
            print("3. Ensure DialogFlow API is enabled")
            print()
            return False

if __name__ == "__main__":
    success = create_agent_and_intents()
    sys.exit(0 if success else 1)
