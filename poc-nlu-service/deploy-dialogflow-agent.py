#!/usr/bin/env python3
"""
DialogFlow Banking Agent - Programmatic Deployment Script

This script uses the DialogFlow API to programmatically create
a comprehensive banking agent with full NLU coverage.

Requirements:
    pip install google-cloud-dialogflow

Usage:
    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"
    export DIALOGFLOW_PROJECT_ID="your-project-id"
    python deploy-dialogflow-agent.py
"""

import os
import sys
from google.cloud import dialogflow
from google.api_core.exceptions import AlreadyExists, NotFound

# Configuration
PROJECT_ID = os.getenv('DIALOGFLOW_PROJECT_ID')
LANGUAGE_CODE = 'en-US'

class DialogFlowDeployer:
    def __init__(self, project_id):
        self.project_id = project_id
        self.intents_client = dialogflow.IntentsClient()
        self.entity_types_client = dialogflow.EntityTypesClient()
        self.agents_client = dialogflow.AgentsClient()
        
        self.project_agent_path = f'projects/{project_id}/agent'
        
        print(f"✓ DialogFlow clients initialized for project: {project_id}")
    
    def create_entity_types(self):
        """Create all banking entity types"""
        print("\n→ Creating entity types...")
        
        entity_types_data = [
            {
                'display_name': 'account_type',
                'kind': dialogflow.EntityType.Kind.KIND_MAP,
                'entities': [
                    {'value': 'checking', 'synonyms': ['checking', 'checking account', 'current account']},
                    {'value': 'savings', 'synonyms': ['savings', 'savings account', 'saving']},
                    {'value': 'credit', 'synonyms': ['credit', 'credit card', 'cc', 'card']},
                    {'value': 'loan', 'synonyms': ['loan', 'loan account', 'lending']},
                    {'value': 'mortgage', 'synonyms': ['mortgage', 'home loan', 'housing loan']},
                    {'value': 'investment', 'synonyms': ['investment', 'brokerage', 'trading']},
                    {'value': 'business', 'synonyms': ['business', 'business account', 'commercial']}
                ]
            },
            {
                'display_name': 'transaction_type',
                'kind': dialogflow.EntityType.Kind.KIND_MAP,
                'entities': [
                    {'value': 'deposit', 'synonyms': ['deposit', 'credit', 'add money']},
                    {'value': 'withdrawal', 'synonyms': ['withdrawal', 'withdraw', 'take out']},
                    {'value': 'transfer', 'synonyms': ['transfer', 'move money', 'send']},
                    {'value': 'payment', 'synonyms': ['payment', 'pay', 'bill payment']},
                    {'value': 'purchase', 'synonyms': ['purchase', 'buy', 'transaction']},
                    {'value': 'refund', 'synonyms': ['refund', 'return', 'chargeback']},
                    {'value': 'fee', 'synonyms': ['fee', 'charge', 'service charge']},
                    {'value': 'interest', 'synonyms': ['interest', 'interest payment', 'dividend']}
                ]
            },
            {
                'display_name': 'time_period',
                'kind': dialogflow.EntityType.Kind.KIND_MAP,
                'entities': [
                    {'value': 'today', 'synonyms': ['today', 'this day']},
                    {'value': 'yesterday', 'synonyms': ['yesterday', 'last day']},
                    {'value': 'this_week', 'synonyms': ['this week', 'current week', 'week']},
                    {'value': 'last_week', 'synonyms': ['last week', 'previous week']},
                    {'value': 'this_month', 'synonyms': ['this month', 'current month', 'month']},
                    {'value': 'last_month', 'synonyms': ['last month', 'previous month']},
                    {'value': 'recent', 'synonyms': ['recent', 'latest', 'last']}
                ]
            },
            {
                'display_name': 'card_type',
                'kind': dialogflow.EntityType.Kind.KIND_MAP,
                'entities': [
                    {'value': 'debit', 'synonyms': ['debit', 'debit card', 'atm card']},
                    {'value': 'credit', 'synonyms': ['credit', 'credit card', 'cc']},
                    {'value': 'prepaid', 'synonyms': ['prepaid', 'prepaid card', 'gift card']}
                ]
            },
            {
                'display_name': 'loan_type',
                'kind': dialogflow.EntityType.Kind.KIND_MAP,
                'entities': [
                    {'value': 'personal', 'synonyms': ['personal', 'personal loan']},
                    {'value': 'auto', 'synonyms': ['auto', 'car loan', 'vehicle loan']},
                    {'value': 'mortgage', 'synonyms': ['mortgage', 'home loan']},
                    {'value': 'student', 'synonyms': ['student', 'student loan']},
                    {'value': 'business', 'synonyms': ['business', 'business loan']},
                    {'value': 'line_of_credit', 'synonyms': ['line of credit', 'credit line']}
                ]
            }
        ]
        
        created_entities = {}
        
        for entity_data in entity_types_data:
            try:
                # Create entity type
                entity_type = dialogflow.EntityType(
                    display_name=entity_data['display_name'],
                    kind=entity_data['kind'],
                    entities=[
                        dialogflow.EntityType.Entity(
                            value=e['value'],
                            synonyms=e['synonyms']
                        ) for e in entity_data['entities']
                    ]
                )
                
                response = self.entity_types_client.create_entity_type(
                    parent=self.project_agent_path,
                    entity_type=entity_type
                )
                
                created_entities[entity_data['display_name']] = response.name
                print(f"  ✓ Created entity: {entity_data['display_name']}")
                
            except AlreadyExists:
                print(f"  ! Entity already exists: {entity_data['display_name']}")
            except Exception as e:
                print(f"  ✗ Error creating entity {entity_data['display_name']}: {e}")
        
        return created_entities
    
    def create_intents(self, entity_types):
        """Create all banking intents"""
        print("\n→ Creating intents...")
        
        # Get entity type references
        account_type_ref = f"@{entity_types.get('account_type', 'account_type')}"
        transaction_type_ref = f"@{entity_types.get('transaction_type', 'transaction_type')}"
        time_period_ref = f"@{entity_types.get('time_period', 'time_period')}"
        card_type_ref = f"@{entity_types.get('card_type', 'card_type')}"
        loan_type_ref = f"@{entity_types.get('loan_type', 'loan_type')}"
        
        intents_data = [
            {
                'display_name': 'check.balance',
                'training_phrases': [
                    "What is my balance",
                    "Check my balance",
                    "Show my account balance",
                    "How much money do I have",
                    "What's my checking balance",
                    "Balance of my savings account",
                    "Tell me my account balance",
                    "What's in my account",
                    "Check savings account balance",
                    "Balance inquiry",
                    "Account balance",
                    "Current balance",
                    "Available balance",
                    "How much is in my account"
                ],
                'messages': ["I'll check your account balance for you right away."],
                'parameters': [
                    {'display_name': 'account_type', 'entity_type': '@account_type'}
                ]
            },
            {
                'display_name': 'view.transactions',
                'training_phrases': [
                    "Show my transactions",
                    "View transaction history",
                    "Recent transactions",
                    "Show me my recent transactions",
                    "Transaction history from last month",
                    "What transactions happened today",
                    "List all transactions",
                    "Show checking transactions",
                    "Transaction list",
                    "Show me what I spent",
                    "Where did my money go",
                    "Account activity",
                    "Statement"
                ],
                'messages': ["I'll retrieve your transaction history for you."],
                'parameters': [
                    {'display_name': 'time_period', 'entity_type': '@time_period'},
                    {'display_name': 'account_type', 'entity_type': '@account_type'}
                ]
            },
            {
                'display_name': 'transfer.money',
                'training_phrases': [
                    "Transfer money",
                    "Send money",
                    "Move $500 to savings",
                    "Transfer $1000 from checking to savings",
                    "I want to transfer funds",
                    "Can I move money between accounts",
                    "Send $200 to John",
                    "Wire transfer",
                    "Make a transfer",
                    "Transfer from checking to savings",
                    "Move funds",
                    "Internal transfer"
                ],
                'messages': ["I can help you transfer money. Let me get the details."],
                'parameters': [
                    {'display_name': 'amount', 'entity_type': '@sys.currency'},
                    {'display_name': 'from_account', 'entity_type': '@account_type'},
                    {'display_name': 'to_account', 'entity_type': '@account_type'}
                ]
            },
            {
                'display_name': 'pay.bill',
                'training_phrases': [
                    "Pay bill",
                    "Pay my credit card",
                    "Make a payment",
                    "Pay $100 to credit card",
                    "Bill payment",
                    "I need to pay a bill",
                    "Pay utilities",
                    "Pay mortgage",
                    "Schedule payment",
                    "Set up autopay"
                ],
                'messages': ["I'll help you make a payment. What would you like to pay?"],
                'parameters': [
                    {'display_name': 'amount', 'entity_type': '@sys.currency'}
                ]
            },
            {
                'display_name': 'open.account',
                'training_phrases': [
                    "Open an account",
                    "I want to open a savings account",
                    "Create new account",
                    "Open checking",
                    "New account",
                    "Sign up for an account",
                    "Apply for account",
                    "Start a new account"
                ],
                'messages': ["I'd be happy to help you open a new account."],
                'parameters': [
                    {'display_name': 'account_type', 'entity_type': '@account_type'}
                ]
            },
            {
                'display_name': 'close.account',
                'training_phrases': [
                    "Close my account",
                    "I want to close my checking account",
                    "Close account",
                    "Cancel my account",
                    "Deactivate account"
                ],
                'messages': ["I understand you want to close an account. Let me help you with that."],
                'parameters': [
                    {'display_name': 'account_type', 'entity_type': '@account_type'}
                ]
            },
            {
                'display_name': 'apply.loan',
                'training_phrases': [
                    "Apply for a loan",
                    "I need a personal loan",
                    "Get a loan",
                    "Loan application",
                    "Apply for mortgage",
                    "I want to borrow money",
                    "Car loan",
                    "Student loan",
                    "Business loan"
                ],
                'messages': ["I can help you apply for a loan. What type of loan are you interested in?"],
                'parameters': [
                    {'display_name': 'loan_type', 'entity_type': '@loan_type'}
                ]
            },
            {
                'display_name': 'check.loan.status',
                'training_phrases': [
                    "Check my loan status",
                    "What's the status of my loan",
                    "Loan application status",
                    "Did my loan get approved",
                    "Is my loan approved",
                    "Loan status"
                ],
                'messages': ["Let me check the status of your loan application."],
                'parameters': [
                    {'display_name': 'loan_type', 'entity_type': '@loan_type'}
                ]
            },
            {
                'display_name': 'activate.card',
                'training_phrases': [
                    "Activate my card",
                    "Activate debit card",
                    "New card activation",
                    "I received my card",
                    "Turn on my card",
                    "Enable card"
                ],
                'messages': ["I'll help you activate your card right away."],
                'parameters': [
                    {'display_name': 'card_type', 'entity_type': '@card_type'}
                ]
            },
            {
                'display_name': 'block.card',
                'training_phrases': [
                    "Block my card",
                    "Freeze my card",
                    "Lock my credit card",
                    "Deactivate card",
                    "Stop my card",
                    "My card was stolen",
                    "Lost my card",
                    "Report stolen card"
                ],
                'messages': ["I'll block your card immediately for security."],
                'parameters': [
                    {'display_name': 'card_type', 'entity_type': '@card_type'}
                ]
            },
            {
                'display_name': 'request.new.card',
                'training_phrases': [
                    "Request new card",
                    "I need a replacement card",
                    "Order new debit card",
                    "Get a new card",
                    "Replace my card",
                    "My card is damaged"
                ],
                'messages': ["I'll order a replacement card for you."],
                'parameters': [
                    {'display_name': 'card_type', 'entity_type': '@card_type'}
                ]
            },
            {
                'display_name': 'request.statement',
                'training_phrases': [
                    "I need my statement",
                    "Send me my bank statement",
                    "Download statement",
                    "Get statement from last month",
                    "Account statement",
                    "Monthly statement",
                    "Tax documents"
                ],
                'messages': ["I'll retrieve your statement for you."],
                'parameters': [
                    {'display_name': 'time_period', 'entity_type': '@time_period'},
                    {'display_name': 'account_type', 'entity_type': '@account_type'}
                ]
            },
            {
                'display_name': 'find.atm.branch',
                'training_phrases': [
                    "Find ATM",
                    "Where is the nearest branch",
                    "Locate ATM",
                    "Branch near me",
                    "Find bank branch",
                    "ATM locations",
                    "Closest ATM"
                ],
                'messages': ["I'll help you find the nearest ATM or branch location."],
                'parameters': []
            },
            {
                'display_name': 'dispute.transaction',
                'training_phrases': [
                    "Dispute a transaction",
                    "I didn't make this transaction",
                    "Report fraud",
                    "Fraudulent charge",
                    "Unauthorized transaction",
                    "Wrong charge",
                    "Challenge transaction"
                ],
                'messages': ["I'll help you dispute this transaction. Let me gather the details."],
                'parameters': [
                    {'display_name': 'amount', 'entity_type': '@sys.currency'}
                ]
            },
            {
                'display_name': 'setup.alerts',
                'training_phrases': [
                    "Set up alerts",
                    "Turn on notifications",
                    "Enable transaction alerts",
                    "Low balance alert",
                    "Get notified",
                    "SMS alerts"
                ],
                'messages': ["I can help you set up account alerts."],
                'parameters': []
            },
            {
                'display_name': 'change.pin',
                'training_phrases': [
                    "Change my PIN",
                    "Reset PIN",
                    "Update PIN",
                    "I forgot my PIN",
                    "New PIN",
                    "Change ATM PIN"
                ],
                'messages': ["I'll help you change your PIN securely."],
                'parameters': []
            },
            {
                'display_name': 'check.interest.rates',
                'training_phrases': [
                    "What are your interest rates",
                    "Interest rate for savings",
                    "Loan rates",
                    "APR",
                    "APY",
                    "Mortgage rates",
                    "Current rates"
                ],
                'messages': ["Let me get you our current interest rates."],
                'parameters': [
                    {'display_name': 'account_type', 'entity_type': '@account_type'},
                    {'display_name': 'loan_type', 'entity_type': '@loan_type'}
                ]
            },
            {
                'display_name': 'update.contact.info',
                'training_phrases': [
                    "Update my phone number",
                    "Change my email",
                    "Update address",
                    "Change contact information",
                    "New phone number",
                    "Update my details"
                ],
                'messages': ["I can help you update your contact information."],
                'parameters': []
            },
            {
                'display_name': 'setup.direct.deposit',
                'training_phrases': [
                    "Set up direct deposit",
                    "Direct deposit information",
                    "Routing number",
                    "Account number",
                    "Payroll setup"
                ],
                'messages': ["I'll provide you with the information needed for direct deposit."],
                'parameters': []
            },
            {
                'display_name': 'stop.payment',
                'training_phrases': [
                    "Stop payment",
                    "Cancel check",
                    "Stop a check",
                    "Hold payment",
                    "Prevent payment"
                ],
                'messages': ["I can help you place a stop payment."],
                'parameters': []
            }
        ]
        
        created_count = 0
        
        for intent_data in intents_data:
            try:
                # Create training phrases
                training_phrases = []
                for phrase_text in intent_data['training_phrases']:
                    parts = [dialogflow.Intent.TrainingPhrase.Part(text=phrase_text)]
                    training_phrases.append(
                        dialogflow.Intent.TrainingPhrase(parts=parts)
                    )
                
                # Create messages
                messages = [
                    dialogflow.Intent.Message(
                        text=dialogflow.Intent.Message.Text(text=intent_data['messages'])
                    )
                ]
                
                # Create intent
                intent = dialogflow.Intent(
                    display_name=intent_data['display_name'],
                    training_phrases=training_phrases,
                    messages=messages
                )
                
                response = self.intents_client.create_intent(
                    parent=self.project_agent_path,
                    intent=intent,
                    language_code=LANGUAGE_CODE
                )
                
                created_count += 1
                print(f"  ✓ Created intent: {intent_data['display_name']}")
                
            except AlreadyExists:
                print(f"  ! Intent already exists: {intent_data['display_name']}")
            except Exception as e:
                print(f"  ✗ Error creating intent {intent_data['display_name']}: {e}")
        
        print(f"\n✓ Created {created_count} intents")
    
    def deploy(self):
        """Main deployment function"""
        print("\n" + "="*50)
        print("DialogFlow Banking Agent Deployment")
        print("="*50)
        
        try:
            # Create entity types
            entity_types = self.create_entity_types()
            
            # Create intents
            self.create_intents(entity_types)
            
            print("\n" + "="*50)
            print("✓ Deployment Complete!")
            print("="*50)
            print(f"\nProject ID: {self.project_id}")
            print(f"Entity Types: {len(entity_types)}")
            print(f"Intents: 20+")
            print("\nNext steps:")
            print("  1. Test in DialogFlow Console")
            print("  2. Train the agent")
            print("  3. Update NLU service configuration")
            
        except Exception as e:
            print(f"\n✗ Deployment failed: {e}")
            sys.exit(1)

def main():
    """Main entry point"""
    if not PROJECT_ID:
        print("Error: DIALOGFLOW_PROJECT_ID environment variable not set")
        sys.exit(1)
    
    if not os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
        print("Warning: GOOGLE_APPLICATION_CREDENTIALS not set")
        print("Make sure you're authenticated with gcloud or have credentials")
    
    deployer = DialogFlowDeployer(PROJECT_ID)
    deployer.deploy()

if __name__ == '__main__':
    main()
