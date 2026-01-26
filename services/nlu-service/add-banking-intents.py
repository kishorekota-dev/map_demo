#!/usr/bin/env python3
"""
Add all banking intents to existing DialogFlow agent
"""

import os
import sys
import json
from google.cloud import dialogflow_v2 as dialogflow
from google.oauth2 import service_account

def add_all_banking_intents():
    """Add comprehensive banking intents to the agent"""
    
    # Configuration
    project_id = "ai-experimentation-428115"
    credentials_path = "/Users/container/git/map_demo/poc-nlu-service/credentials/dialogflow-key.json"
    
    print("🚀 Adding Banking Intents to DialogFlow Agent...")
    print(f"📁 Project ID: {project_id}")
    print()
    
    try:
        # Load credentials
        credentials = service_account.Credentials.from_service_account_file(
            credentials_path,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        # Create clients
        intents_client = dialogflow.IntentsClient(credentials=credentials)
        agents_client = dialogflow.AgentsClient(credentials=credentials)
        parent = f"projects/{project_id}/agent"
        
        # Update agent name
        print("📝 Updating agent name to 'POC Banking Assistant'...")
        agent = dialogflow.Agent(
            parent=f"projects/{project_id}",
            display_name="POC Banking Assistant",
            default_language_code="en",
            time_zone="America/New_York"
        )
        agents_client.set_agent(request={"agent": agent})
        print("  ✓ Agent renamed\n")
        
        # Get existing intents
        print("🔍 Checking existing intents...")
        existing_intents = intents_client.list_intents(request={"parent": parent})
        existing_names = set([intent.display_name for intent in existing_intents])
        print(f"  Found {len(existing_names)} existing intents\n")
        
        # Define all banking intents
        banking_intents = [
            {
                "display_name": "banking.balance.check",
                "training_phrases": [
                    "What is my balance", "Check my balance", "Show my account balance",
                    "How much money do I have", "What's my checking balance",
                    "Balance inquiry", "Current balance", "Available balance",
                    "Tell me my account balance", "What's in my account"
                ],
                "messages": ["I'll check your account balance for you right away."]
            },
            {
                "display_name": "banking.transfer.money",
                "training_phrases": [
                    "Transfer money", "Transfer $500 to savings", "I want to transfer funds",
                    "Move money between accounts", "Transfer 1000 dollars",
                    "Send money to my savings account", "Transfer funds",
                    "Move $200 to checking", "I need to transfer money"
                ],
                "messages": ["I can help you transfer money between your accounts."]
            },
            {
                "display_name": "banking.transactions.view",
                "training_phrases": [
                    "Show my transactions", "Transaction history", "Recent transactions",
                    "Last 10 transactions", "Show me my purchases",
                    "What did I spend money on", "View my transaction history",
                    "Show recent activity", "What are my recent transactions"
                ],
                "messages": ["I'll retrieve your recent transactions."]
            },
            {
                "display_name": "banking.card.block",
                "training_phrases": [
                    "Block my card", "Freeze my credit card", "I lost my card",
                    "Deactivate my debit card", "Stop my card", "Card was stolen",
                    "Lock my card", "Disable my card", "My card is missing"
                ],
                "messages": ["I'll help you block your card immediately for security."]
            },
            {
                "display_name": "banking.card.activate",
                "training_phrases": [
                    "Activate my card", "Enable my new card", "Activate debit card",
                    "Turn on my credit card", "Activate new card",
                    "I received a new card", "Start using new card"
                ],
                "messages": ["I'll help you activate your new card."]
            },
            {
                "display_name": "banking.loan.check",
                "training_phrases": [
                    "Check my loan", "What's my loan balance", "How much do I owe on my mortgage",
                    "Loan payment amount", "When is my loan due", "Loan status",
                    "What's my mortgage balance", "Auto loan balance"
                ],
                "messages": ["I can provide information about your loan."]
            },
            {
                "display_name": "banking.loan.apply",
                "training_phrases": [
                    "Apply for a loan", "I need a loan", "Can I get a personal loan",
                    "Apply for mortgage", "How do I apply for a loan",
                    "Loan application", "I want to borrow money"
                ],
                "messages": ["I can help you start a loan application."]
            },
            {
                "display_name": "banking.account.open",
                "training_phrases": [
                    "Open a new account", "Create an account", "I want to open a savings account",
                    "Open checking account", "Start a new account",
                    "How do I open an account"
                ],
                "messages": ["I'll help you open a new account."]
            },
            {
                "display_name": "banking.account.close",
                "training_phrases": [
                    "Close my account", "I want to close my savings account",
                    "Deactivate my account", "Cancel my account",
                    "How do I close my account"
                ],
                "messages": ["I can help you with closing your account."]
            },
            {
                "display_name": "banking.bill.pay",
                "training_phrases": [
                    "Pay a bill", "I need to pay my electricity bill",
                    "Pay utility bill", "Bill payment", "How do I pay bills",
                    "Set up bill payment", "Pay credit card bill"
                ],
                "messages": ["I can help you pay your bills."]
            },
            {
                "display_name": "banking.statement.request",
                "training_phrases": [
                    "Request a statement", "I need my bank statement",
                    "Send me my account statement", "Get statement",
                    "Download statement", "Email my statement"
                ],
                "messages": ["I'll help you request your account statement."]
            },
            {
                "display_name": "banking.pin.change",
                "training_phrases": [
                    "Change my PIN", "Update my PIN number", "I forgot my PIN",
                    "Reset PIN", "Modify my PIN", "New PIN"
                ],
                "messages": ["I can help you change your PIN."]
            },
            {
                "display_name": "banking.dispute.transaction",
                "training_phrases": [
                    "Dispute a transaction", "I didn't make this purchase",
                    "Report fraudulent transaction", "Challenge a charge",
                    "This transaction is wrong", "Dispute charge"
                ],
                "messages": ["I'll help you dispute this transaction."]
            },
            {
                "display_name": "banking.interest.rates",
                "training_phrases": [
                    "What are your interest rates", "Current interest rates",
                    "Savings account interest rate", "Loan interest rates",
                    "CD rates", "Mortgage rates"
                ],
                "messages": ["Let me get the current interest rates for you."]
            },
            {
                "display_name": "banking.atm.find",
                "training_phrases": [
                    "Find an ATM", "Where is the nearest ATM", "ATM locations",
                    "Find a branch", "Branch near me", "Closest ATM"
                ],
                "messages": ["I'll help you find the nearest ATM or branch."]
            }
        ]
        
        # Add intents
        print("📤 Adding banking intents...")
        created = 0
        skipped = 0
        
        for intent_data in banking_intents:
            if intent_data["display_name"] in existing_names:
                print(f"  ⚠ Skipped (exists): {intent_data['display_name']}")
                skipped += 1
                continue
            
            try:
                # Create training phrases
                training_phrases = []
                for phrase_text in intent_data["training_phrases"]:
                    part = dialogflow.Intent.TrainingPhrase.Part(text=phrase_text)
                    training_phrase = dialogflow.Intent.TrainingPhrase(parts=[part])
                    training_phrases.append(training_phrase)
                
                # Create message
                text = dialogflow.Intent.Message.Text(text=intent_data["messages"])
                message = dialogflow.Intent.Message(text=text)
                
                # Create intent
                intent = dialogflow.Intent(
                    display_name=intent_data["display_name"],
                    training_phrases=training_phrases,
                    messages=[message],
                    priority=500000
                )
                
                intents_client.create_intent(request={"parent": parent, "intent": intent})
                print(f"  ✓ Created: {intent_data['display_name']}")
                created += 1
                
            except Exception as e:
                print(f"  ✗ Failed: {intent_data['display_name']} - {str(e)}")
        
        print()
        print(f"✅ Added {created} new banking intents")
        print(f"   Skipped {skipped} existing intents")
        print()
        
        # Final count
        all_intents = intents_client.list_intents(request={"parent": parent})
        total = len(list(all_intents))
        print(f"📊 Total intents in agent: {total}")
        print()
        print("✅ Banking agent is ready!")
        print()
        print("🧪 Next Steps:")
        print("1. Start NLU service:")
        print("   cd /Users/container/git/map_demo/poc-nlu-service")
        print("   docker compose up --build -d")
        print()
        print("2. Test integration:")
        print("   ./test-dialogflow.sh")
        print()
        print("3. View in Console:")
        print("   https://dialogflow.cloud.google.com/")
        print()
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

if __name__ == "__main__":
    success = add_all_banking_intents()
    sys.exit(0 if success else 1)
