#!/usr/bin/env python3
"""
Deploy DialogFlow Agent from ZIP file
"""

import os
import sys
from google.cloud import dialogflow_v2 as dialogflow
from google.oauth2 import service_account

def deploy_agent():
    """Deploy DialogFlow agent from ZIP file"""
    
    # Configuration
    project_id = "ai-experimentation-428115"
    credentials_path = "/Users/container/git/map_demo/poc-nlu-service/credentials/dialogflow-key.json"
    agent_zip_path = "/Users/container/git/map_demo/poc-nlu-service/dialogflow-config/agent-api.zip"
    
    print("🚀 Starting DialogFlow Agent Deployment...")
    print(f"📁 Project ID: {project_id}")
    print(f"🔑 Credentials: {credentials_path}")
    print(f"📦 Agent ZIP: {agent_zip_path}")
    print()
    
    # Check if files exist
    if not os.path.exists(credentials_path):
        print(f"❌ Error: Credentials file not found: {credentials_path}")
        sys.exit(1)
    
    if not os.path.exists(agent_zip_path):
        print(f"❌ Error: Agent ZIP file not found: {agent_zip_path}")
        sys.exit(1)
    
    try:
        # Load credentials
        print("🔐 Loading credentials...")
        credentials = service_account.Credentials.from_service_account_file(
            credentials_path,
            scopes=['https://www.googleapis.com/auth/cloud-platform']
        )
        
        # Create client
        print("🔌 Creating DialogFlow client...")
        agents_client = dialogflow.AgentsClient(credentials=credentials)
        
        # Read agent ZIP file
        print("📖 Reading agent ZIP file...")
        with open(agent_zip_path, 'rb') as agent_file:
            agent_content = agent_file.read()
        
        # Prepare restore request
        parent = f"projects/{project_id}"
        print(f"📤 Uploading agent to {parent}...")
        
        # Restore agent
        restore_request = dialogflow.RestoreAgentRequest(
            parent=parent,
            agent_content=agent_content
        )
        
        operation = agents_client.restore_agent(request=restore_request)
        
        print("⏳ Restoring agent (this may take a minute)...")
        print("   Please wait...")
        
        # Wait for operation to complete
        result = operation.result(timeout=300)  # 5 minutes timeout
        
        print()
        print("✅ Agent deployed successfully!")
        print()
        print("📊 Next Steps:")
        print("1. Verify in Console: https://dialogflow.cloud.google.com/")
        print("2. Test NLU service:")
        print("   cd /Users/container/git/map_demo/poc-nlu-service")
        print("   docker compose up --build -d")
        print("   ./test-dialogflow.sh")
        print()
        
        return True
        
    except Exception as e:
        print(f"❌ Error deploying agent: {str(e)}")
        print()
        print("💡 Troubleshooting:")
        print("1. Check credentials file permissions")
        print("2. Verify service account has dialogflow.client role")
        print("3. Ensure DialogFlow API is enabled")
        print("4. Try manual import via Console:")
        print("   https://dialogflow.cloud.google.com/")
        print()
        return False

if __name__ == "__main__":
    success = deploy_agent()
    sys.exit(0 if success else 1)
