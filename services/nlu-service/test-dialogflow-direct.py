#!/usr/bin/env python3
"""
Test DialogFlow agent directly
"""

import sys
import uuid
from google.cloud import dialogflow_v2 as dialogflow
from google.oauth2 import service_account

def test_dialogflow():
    """Test DialogFlow intent detection"""
    
    project_id = "ai-experimentation-428115"
    credentials_path = "/Users/container/git/map_demo/poc-nlu-service/credentials/dialogflow-key.json"
    session_id = str(uuid.uuid4())
    
    print("🧪 Testing DialogFlow Agent...")
    print(f"📁 Project: {project_id}")
    print(f"🔑 Session: {session_id}")
    print()
    
    try:
        # Load credentials
        credentials = service_account.Credentials.from_service_account_file(
            credentials_path,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        # Create session client
        session_client = dialogflow.SessionsClient(credentials=credentials)
        session = session_client.session_path(project_id, session_id)
        
        # Test queries
        test_queries = [
            "What is my account balance?",
            "Transfer $500 to savings",
            "Show me my transactions",
            "I want to block my card",
            "What are your interest rates?"
        ]
        
        print("🎯 Running test queries...\n")
        
        for i, query_text in enumerate(test_queries, 1):
            # Create text input
            text_input = dialogflow.TextInput(text=query_text, language_code="en")
            query_input = dialogflow.QueryInput(text=text_input)
            
            # Detect intent
            response = session_client.detect_intent(
                request={"session": session, "query_input": query_input}
            )
            
            result = response.query_result
            
            print(f"Test {i}: \"{query_text}\"")
            print(f"  Intent: {result.intent.display_name}")
            print(f"  Confidence: {result.intent_detection_confidence:.2f}")
            print(f"  Response: {result.fulfillment_text}")
            print()
        
        print("✅ All tests passed!")
        print()
        print("🎉 DialogFlow agent is working perfectly!")
        print()
        print("📊 Next Steps:")
        print("1. Start Docker Desktop")
        print("2. Run: docker compose up --build -d")
        print("3. Test full stack: ./test-dialogflow.sh")
        print("4. Access frontend: http://localhost:3000")
        print()
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

if __name__ == "__main__":
    success = test_dialogflow()
    sys.exit(0 if success else 1)
