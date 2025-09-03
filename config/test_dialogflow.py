#!/usr/bin/env python3

"""
DialogFlow Testing and Validation Script
Tests all created intents and validates responses
"""

import json
import os
import time
from google.cloud import dialogflow

class DialogFlowTester:
    def __init__(self, project_id, session_id="test-session"):
        self.project_id = project_id
        self.session_id = session_id
        self.session_client = dialogflow.SessionsClient()
        self.session_path = self.session_client.session_path(project_id, session_id)
        
    def detect_intent(self, text_input, language_code='en'):
        """Detect intent from text input."""
        text_input = dialogflow.TextInput(text=text_input, language_code=language_code)
        query_input = dialogflow.QueryInput(text=text_input)
        
        response = self.session_client.detect_intent(
            request={"session": self.session_path, "query_input": query_input}
        )
        
        return response
    
    def test_intent(self, test_phrase, expected_intent=None):
        """Test a single phrase and return results."""
        try:
            response = self.detect_intent(test_phrase)
            result = {
                'input': test_phrase,
                'detected_intent': response.query_result.intent.display_name,
                'confidence': response.query_result.intent_detection_confidence,
                'parameters': dict(response.query_result.parameters),
                'fulfillment_text': response.query_result.fulfillment_text,
                'success': True
            }
            
            if expected_intent:
                result['expected_intent'] = expected_intent
                result['intent_match'] = (result['detected_intent'] == expected_intent)
            
            return result
        except Exception as e:
            return {
                'input': test_phrase,
                'error': str(e),
                'success': False
            }
    
    def run_comprehensive_tests(self):
        """Run comprehensive tests for all banking intents."""
        
        test_cases = [
            # Authentication Tests
            ("I want to log in", "auth.login"),
            ("Please sign me in", "auth.login"),
            ("I need to authenticate", "auth.login"),
            
            # Balance Tests
            ("What's my account balance", "account.balance"),
            ("Show me my balance", "account.balance"),
            ("How much money do I have in my checking account", "account.balance"),
            ("Balance for account 12345", "account.balance"),
            
            # Transaction History Tests
            ("Show me my transaction history", "transaction.history"),
            ("What are my recent transactions", "transaction.history"),
            ("Transaction history for last month", "transaction.history"),
            
            # Transfer Tests
            ("Transfer $100 to John", "payment.transfer"),
            ("Send money to Jane", "payment.transfer"),
            ("I want to transfer $50 to my friend", "payment.transfer"),
            ("Move $200 from checking to savings", "payment.transfer"),
            
            # Bill Payment Tests
            ("Pay my electricity bill", "payment.bill"),
            ("I want to pay my internet bill", "payment.bill"),
            ("Pay $150 for water bill", "payment.bill"),
            
            # Card Management Tests
            ("What's the status of my card", "card.status"),
            ("Check my credit card status", "card.status"),
            ("Is my debit card active", "card.status"),
            
            # Card Blocking Tests
            ("Block my card", "card.block"),
            ("My card is lost, please block it", "card.block"),
            ("I want to freeze my credit card", "card.block"),
            
            # Dispute Tests
            ("I want to dispute a transaction", "dispute.create"),
            ("This charge is wrong", "dispute.create"),
            ("File a dispute for $50 charge", "dispute.create"),
            
            # Fraud Tests
            ("I want to report fraud", "fraud.report"),
            ("My account has been compromised", "fraud.report"),
            ("Someone used my card without permission", "fraud.report"),
            
            # Statement Tests
            ("I need my account statement", "account.statement"),
            ("Send me my monthly statement", "account.statement"),
            ("Download statement for January", "account.statement"),
            
            # General Tests
            ("Hello", "general.greeting"),
            ("Help", "general.help"),
            ("What can you do", "general.help"),
        ]
        
        print("🧪 Running Comprehensive DialogFlow Tests")
        print("=" * 50)
        
        results = []
        passed = 0
        failed = 0
        
        for test_phrase, expected_intent in test_cases:
            print(f"\n Testing: '{test_phrase}'")
            result = self.test_intent(test_phrase, expected_intent)
            results.append(result)
            
            if result['success']:
                if result.get('intent_match', True):  # True if no expected intent
                    print(f"  ✓ Intent: {result['detected_intent']} (Confidence: {result['confidence']:.2f})")
                    if result.get('parameters'):
                        print(f"    Parameters: {result['parameters']}")
                    passed += 1
                else:
                    print(f"  ✗ Expected: {expected_intent}, Got: {result['detected_intent']}")
                    failed += 1
            else:
                print(f"  ✗ Error: {result['error']}")
                failed += 1
            
            time.sleep(0.1)  # Rate limiting
        
        # Summary
        print(f"\n{'='*50}")
        print(f"🏦 Test Results Summary")
        print(f"{'='*50}")
        print(f"Total Tests: {len(test_cases)}")
        print(f"Passed: {passed} ✓")
        print(f"Failed: {failed} ✗")
        print(f"Success Rate: {(passed/len(test_cases)*100):.1f}%")
        
        # Detailed results
        if failed > 0:
            print(f"\n❌ Failed Tests:")
            for result in results:
                if not result['success'] or not result.get('intent_match', True):
                    print(f"  - '{result['input']}'")
                    if 'error' in result:
                        print(f"    Error: {result['error']}")
                    elif 'expected_intent' in result:
                        print(f"    Expected: {result['expected_intent']}, Got: {result['detected_intent']}")
        
        return results

def test_parameter_extraction():
    """Test parameter extraction capabilities."""
    
    project_id = os.environ.get('GOOGLE_CLOUD_PROJECT', 'enterprise-banking-chatbot')
    tester = DialogFlowTester(project_id)
    
    print("\n🔍 Testing Parameter Extraction")
    print("=" * 40)
    
    parameter_tests = [
        ("Transfer $100 to John", {'amount-of-money', 'recipient'}),
        ("Pay my electricity bill", {'bill-type'}),
        ("Check balance for account 12345", {'account-number'}),
        ("Block my credit card", {'card-type'}),
        ("Show transactions for last month", {'date-period'}),
        ("Pay $150 for water bill", {'amount-of-money', 'bill-type'}),
    ]
    
    for test_phrase, expected_params in parameter_tests:
        print(f"\nTesting: '{test_phrase}'")
        result = tester.test_intent(test_phrase)
        
        if result['success']:
            extracted_params = set(result['parameters'].keys())
            missing_params = expected_params - extracted_params
            extra_params = extracted_params - expected_params
            
            print(f"  Intent: {result['detected_intent']}")
            print(f"  Extracted: {result['parameters']}")
            
            if not missing_params and not extra_params:
                print(f"  ✓ Parameter extraction correct")
            else:
                if missing_params:
                    print(f"  ⚠ Missing parameters: {missing_params}")
                if extra_params:
                    print(f"  ⚠ Extra parameters: {extra_params}")
        else:
            print(f"  ✗ Error: {result['error']}")

def validate_entities():
    """Validate that all custom entities are properly created."""
    
    project_id = os.environ.get('GOOGLE_CLOUD_PROJECT', 'enterprise-banking-chatbot')
    client = dialogflow.EntityTypesClient()
    parent = f"projects/{project_id}/agent"
    
    print("\n🏷️  Validating Custom Entities")
    print("=" * 35)
    
    expected_entities = [
        'account-type',
        'card-type', 
        'bill-type',
        'account-number',
        'card-number'
    ]
    
    try:
        entity_types = client.list_entity_types(request={"parent": parent})
        found_entities = [et.display_name for et in entity_types]
        
        for entity in expected_entities:
            if entity in found_entities:
                print(f"  ✓ {entity}")
            else:
                print(f"  ✗ {entity} - Missing")
        
        print(f"\nTotal entities found: {len(found_entities)}")
        print(f"Expected entities: {len(expected_entities)}")
        
    except Exception as e:
        print(f"  ✗ Error listing entities: {e}")

def main():
    """Main testing function."""
    
    # Check authentication
    if not os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'):
        print("❌ GOOGLE_APPLICATION_CREDENTIALS not set")
        print("Please run: export GOOGLE_APPLICATION_CREDENTIALS=./config/dialogflow-service-account.json")
        return
    
    project_id = os.environ.get('GOOGLE_CLOUD_PROJECT', 'enterprise-banking-chatbot')
    print(f"🏦 Testing DialogFlow Project: {project_id}")
    
    # Validate entities
    validate_entities()
    
    # Test parameter extraction
    test_parameter_extraction()
    
    # Run comprehensive tests
    tester = DialogFlowTester(project_id)
    results = tester.run_comprehensive_tests()
    
    # Save results to file
    timestamp = int(time.time())
    results_file = f"./config/test_results_{timestamp}.json"
    
    with open(results_file, 'w') as f:
        json.dump({
            'timestamp': timestamp,
            'project_id': project_id,
            'results': results
        }, f, indent=2)
    
    print(f"\n💾 Test results saved to: {results_file}")
    print("\n🎯 Next Steps:")
    print("1. Review failed tests and improve training phrases")
    print("2. Test integration with your ChatBot UI")
    print("3. Monitor real user interactions for improvements")
    print("4. Consider adding more domain-specific training data")

if __name__ == "__main__":
    main()
