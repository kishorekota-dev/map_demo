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
            "Balance inquiry",
            "How much money is in my bank account",
            "Can you tell me my account balance",
            "I want to see my balance",
            "Display my current balance"
        ],
        "payment.transfer": [
            "Send payment",
            "Make a transfer",
            "Move money",
            "Transfer between accounts",
            "Send funds",
            "Pay someone",
            "Transfer cash",
            "Wire transfer",
            "Electronic transfer",
            "Bank transfer",
            "Move funds",
            "Send money electronically"
        ],
        "card.block": [
            "Stop my card",
            "Deactivate card",
            "Turn off my card",
            "Secure my card",
            "Freeze card",
            "Put hold on card",
            "Card security",
            "Emergency stop",
            "Disable my card",
            "Lock my card",
            "Suspend card",
            "Cancel my card temporarily"
        ],
        "transaction.history": [
            "Show my recent activity",
            "What transactions did I make",
            "Account activity",
            "Recent purchases",
            "Transaction log",
            "Spending history",
            "Payment history",
            "Account movements",
            "Financial activity",
            "Recent charges"
        ],
        "payment.bill": [
            "Pay utility bill",
            "Make bill payment",
            "Pay monthly bills",
            "Utility payment",
            "Pay service provider",
            "Bill pay",
            "Monthly payments",
            "Service payments",
            "Pay my bills online",
            "Electronic bill payment"
        ],
        "dispute.create": [
            "Challenge this transaction",
            "This is not my charge",
            "Incorrect transaction",
            "Wrong amount charged",
            "Unauthorized charge",
            "I didn't authorize this",
            "Contest this payment",
            "Report wrong transaction",
            "This charge is incorrect",
            "File transaction complaint"
        ],
        "fraud.report": [
            "Account security breach",
            "Suspicious account activity",
            "Identity theft report",
            "Unauthorized access",
            "Security incident",
            "Account hacked",
            "Fraudulent charges",
            "Security violation",
            "Compromised account",
            "Report security issue"
        ],
        "auth.login": [
            "Access my account",
            "Sign into banking",
            "Authenticate me",
            "Verify my identity",
            "Login to online banking",
            "Account access",
            "Banking login",
            "Secure login",
            "Account signin",
            "User authentication"
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

def enhance_entities(project_id):
    """Add more synonyms to existing entities."""
    
    entity_enhancements = {
        "account-type": [
            {"value": "checking", "synonyms": ["checking", "current", "chequing", "primary", "main", "everyday"]},
            {"value": "savings", "synonyms": ["savings", "save", "saving", "deposit", "savings account", "interest"]},
            {"value": "credit", "synonyms": ["credit", "credit card", "cc", "visa", "mastercard", "amex", "credit line"]},
            {"value": "business", "synonyms": ["business", "commercial", "corporate", "company", "enterprise", "business account"]}
        ],
        "card-type": [
            {"value": "credit", "synonyms": ["credit", "credit card", "cc", "visa", "mastercard", "amex", "american express"]},
            {"value": "debit", "synonyms": ["debit", "debit card", "bank card", "atm card", "check card", "pin card"]},
            {"value": "prepaid", "synonyms": ["prepaid", "gift card", "prepaid card", "stored value", "reloadable"]}
        ],
        "bill-type": [
            {"value": "electricity", "synonyms": ["electricity", "electric", "power", "electric bill", "utility", "energy"]},
            {"value": "water", "synonyms": ["water", "water bill", "utilities", "municipal", "sewer", "water service"]},
            {"value": "gas", "synonyms": ["gas", "natural gas", "heating", "gas bill", "propane", "energy"]},
            {"value": "internet", "synonyms": ["internet", "broadband", "wifi", "web", "isp", "fiber"]},
            {"value": "phone", "synonyms": ["phone", "mobile", "cell", "telephone", "cellular", "wireless"]},
            {"value": "rent", "synonyms": ["rent", "rental", "lease", "housing", "apartment", "mortgage"]},
            {"value": "insurance", "synonyms": ["insurance", "policy", "coverage", "premium", "health", "auto", "life"]}
        ]
    }
    
    client = dialogflow.EntityTypesClient()
    parent = f"projects/{project_id}/agent"
    
    try:
        entity_types = client.list_entity_types(request={"parent": parent})
        
        for entity_type in entity_types:
            entity_name = entity_type.display_name
            if entity_name in entity_enhancements:
                print(f"Enhancing entity: {entity_name}")
                
                # Clear existing entities and add enhanced ones
                entity_type.entities.clear()
                for entity_data in entity_enhancements[entity_name]:
                    entity_type.entities.append(
                        dialogflow.EntityType.Entity(
                            value=entity_data['value'],
                            synonyms=entity_data['synonyms']
                        )
                    )
                
                # Update the entity type
                try:
                    client.update_entity_type(request={"entity_type": entity_type})
                    print(f"✓ Enhanced {entity_name} with improved synonyms")
                except Exception as e:
                    print(f"✗ Error updating {entity_name}: {e}")
                    
    except Exception as e:
        print(f"✗ Error listing entity types: {e}")

def main():
    """Main function to enhance training."""
    project_id = os.environ.get('GOOGLE_CLOUD_PROJECT', 'enterprise-banking-chatbot')
    
    print(f"🚀 Enhancing DialogFlow training for project: {project_id}")
    print("=" * 60)
    
    # Enhance training phrases
    print("\n📝 Adding additional training phrases...")
    add_training_phrases(project_id)
    
    # Enhance entities
    print("\n🏷️ Enhancing entity synonyms...")
    enhance_entities(project_id)
    
    print("\n✅ Training enhancement complete!")
    print("\n💡 Recommendations:")
    print("1. Test enhanced intents in DialogFlow console")
    print("2. Monitor intent detection accuracy")
    print("3. Add more domain-specific training phrases based on user feedback")
    print("4. Consider adding context for multi-turn conversations")
    print("5. Review and optimize low-performing intents")

if __name__ == "__main__":
    main()
