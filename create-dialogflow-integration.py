#!/usr/bin/env python3

"""
DialogFlow Integration Helper
Creates integration files for ChatBot UI and MCP server
"""

import json
import os

def create_chatbot_integration():
    """Create ChatBot UI integration files."""
    
    # Create enhanced DialogFlow service
    chatbot_service = '''// Enhanced DialogFlow Service for Enterprise Banking
import { SessionsClient } from '@google-cloud/dialogflow';

interface DialogFlowConfig {
  projectId: string;
  sessionId: string;
  languageCode: string;
  credentials?: any;
}

interface IntentResult {
  intent: string;
  confidence: number;
  parameters: Record<string, any>;
  fulfillmentText: string;
  requiresAuth: boolean;
  apiEndpoint?: string;
  permission?: string;
}

export class DialogFlowService {
  private sessionClient: SessionsClient;
  private sessionPath: string;
  private config: DialogFlowConfig;

  constructor(config: DialogFlowConfig) {
    this.config = config;
    
    // Initialize DialogFlow client
    this.sessionClient = new SessionsClient({
      projectId: config.projectId,
      keyFilename: config.credentials || process.env.GOOGLE_APPLICATION_CREDENTIALS
    });
    
    this.sessionPath = this.sessionClient.projectAgentSessionPath(
      config.projectId,
      config.sessionId
    );
  }

  async detectIntent(message: string): Promise<IntentResult> {
    try {
      const request = {
        session: this.sessionPath,
        queryInput: {
          text: {
            text: message,
            languageCode: this.config.languageCode,
          },
        },
      };

      const [response] = await this.sessionClient.detectIntent(request);
      const queryResult = response.queryResult;

      if (!queryResult) {
        throw new Error('No query result received from DialogFlow');
      }

      const intentName = queryResult.intent?.displayName || 'unknown';
      const confidence = queryResult.intentDetectionConfidence || 0;
      const parameters = this.extractParameters(queryResult.parameters);
      const fulfillmentText = queryResult.fulfillmentText || '';

      // Map intent to banking operations
      const bankingIntent = this.mapToBankingOperation(intentName, parameters);

      return {
        intent: intentName,
        confidence,
        parameters,
        fulfillmentText,
        requiresAuth: bankingIntent.requiresAuth,
        apiEndpoint: bankingIntent.apiEndpoint,
        permission: bankingIntent.permission
      };

    } catch (error) {
      console.error('DialogFlow intent detection error:', error);
      throw new Error(`Failed to detect intent: ${error.message}`);
    }
  }

  private extractParameters(parameters: any): Record<string, any> {
    if (!parameters) return {};
    
    const extracted: Record<string, any> = {};
    
    // Convert Google Struct to plain object
    Object.keys(parameters.fields || {}).forEach(key => {
      const field = parameters.fields[key];
      
      if (field.stringValue !== undefined) {
        extracted[key] = field.stringValue;
      } else if (field.numberValue !== undefined) {
        extracted[key] = field.numberValue;
      } else if (field.structValue) {
        // Handle complex parameters like money amounts
        if (field.structValue.fields?.amount) {
          extracted[key] = {
            amount: field.structValue.fields.amount.numberValue,
            currency: field.structValue.fields.currency?.stringValue || 'USD'
          };
        }
      }
    });
    
    return extracted;
  }

  private mapToBankingOperation(intent: string, parameters: any) {
    const intentMapping: Record<string, any> = {
      'auth.login': {
        requiresAuth: false,
        apiEndpoint: '/api/auth/login',
        permission: null
      },
      'account.balance': {
        requiresAuth: true,
        apiEndpoint: '/api/accounts/balance',
        permission: 'read:balance'
      },
      'transaction.history': {
        requiresAuth: true,
        apiEndpoint: '/api/transactions',
        permission: 'read:transactions'
      },
      'payment.transfer': {
        requiresAuth: true,
        apiEndpoint: '/api/balance-transfers',
        permission: 'write:transfer'
      },
      'payment.bill': {
        requiresAuth: true,
        apiEndpoint: '/api/payments/bill',
        permission: 'write:payment'
      },
      'card.status': {
        requiresAuth: true,
        apiEndpoint: '/api/cards',
        permission: 'read:cards'
      },
      'card.block': {
        requiresAuth: true,
        apiEndpoint: '/api/cards/block',
        permission: 'write:card'
      },
      'dispute.create': {
        requiresAuth: true,
        apiEndpoint: '/api/disputes',
        permission: 'write:dispute'
      },
      'fraud.report': {
        requiresAuth: true,
        apiEndpoint: '/api/fraud/report',
        permission: 'write:fraud'
      },
      'account.statement': {
        requiresAuth: true,
        apiEndpoint: '/api/accounts/statement',
        permission: 'read:statement'
      },
      'general.greeting': {
        requiresAuth: false,
        apiEndpoint: null,
        permission: null
      },
      'general.help': {
        requiresAuth: false,
        apiEndpoint: null,
        permission: null
      }
    };

    return intentMapping[intent] || {
      requiresAuth: true,
      apiEndpoint: null,
      permission: null
    };
  }

  // Format response for different banking operations
  formatBankingResponse(intentResult: IntentResult, apiResponse?: any): string {
    const { intent, parameters } = intentResult;

    switch (intent) {
      case 'account.balance':
        if (apiResponse?.balance) {
          return `Your account balance is $${apiResponse.balance.toFixed(2)}`;
        }
        return 'I can help you check your account balance. Please wait while I retrieve this information.';

      case 'payment.transfer':
        const amount = parameters['amount-of-money']?.amount || parameters.amount;
        const recipient = parameters.recipient;
        if (apiResponse?.success) {
          return `Successfully transferred $${amount} to ${recipient}. Transaction ID: ${apiResponse.transactionId}`;
        }
        return `I'll help you transfer $${amount} to ${recipient}. Please confirm this transaction.`;

      case 'card.block':
        const cardType = parameters['card-type'] || 'card';
        if (apiResponse?.success) {
          return `Your ${cardType} has been successfully blocked for security. A replacement card will be sent to you.`;
        }
        return `I'll block your ${cardType} immediately for security. This action cannot be undone.`;

      case 'dispute.create':
        if (apiResponse?.disputeId) {
          return `Dispute filed successfully. Reference number: ${apiResponse.disputeId}. We'll investigate and contact you within 5-7 business days.`;
        }
        return 'I'll help you file a dispute for this transaction. Please provide details about the disputed charge.';

      case 'fraud.report':
        if (apiResponse?.reportId) {
          return `Fraud report filed. Reference: ${apiResponse.reportId}. Your account has been flagged for monitoring. Please change your passwords immediately.`;
        }
        return 'I understand you need to report fraud. This is serious - I'll immediately flag your account and start the investigation process.';

      default:
        return intentResult.fulfillmentText || 'I can help you with that. Let me process your request.';
    }
  }
}

// Export configuration helper
export const createDialogFlowConfig = (
  projectId: string,
  sessionId: string,
  languageCode: string = 'en'
): DialogFlowConfig => ({
  projectId,
  sessionId,
  languageCode,
  credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

// Export for use in ChatBot components
export default DialogFlowService;'''

    # Write the service file
    os.makedirs('./packages/chatbot-ui/src/services/dialogflow', exist_ok=True)
    with open('./packages/chatbot-ui/src/services/dialogflow/DialogFlowService.ts', 'w') as f:
        f.write(chatbot_service)

    # Create React hook for DialogFlow
    dialogflow_hook = '''// React Hook for DialogFlow Integration
import { useState, useCallback } from 'react';
import DialogFlowService, { createDialogFlowConfig } from './DialogFlowService';

interface UseDialogFlowOptions {
  projectId: string;
  sessionId: string;
  languageCode?: string;
}

interface DialogFlowState {
  isProcessing: boolean;
  lastIntent: string | null;
  confidence: number;
  error: string | null;
}

export const useDialogFlow = (options: UseDialogFlowOptions) => {
  const [state, setState] = useState<DialogFlowState>({
    isProcessing: false,
    lastIntent: null,
    confidence: 0,
    error: null
  });

  const [dialogFlowService] = useState(() => {
    const config = createDialogFlowConfig(
      options.projectId,
      options.sessionId,
      options.languageCode
    );
    return new DialogFlowService(config);
  });

  const processMessage = useCallback(async (message: string) => {
    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      const result = await dialogFlowService.detectIntent(message);
      
      setState(prev => ({
        ...prev,
        isProcessing: false,
        lastIntent: result.intent,
        confidence: result.confidence,
        error: null
      }));

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: errorMessage
      }));

      throw error;
    }
  }, [dialogFlowService]);

  return {
    ...state,
    processMessage,
    dialogFlowService
  };
};

export default useDialogFlow;'''

    with open('./packages/chatbot-ui/src/services/dialogflow/useDialogFlow.ts', 'w') as f:
        f.write(dialogflow_hook)

    print("✓ Created ChatBot UI DialogFlow integration files")

def create_mcp_integration():
    """Create MCP server DialogFlow integration."""
    
    mcp_dialogflow = '''// MCP Server DialogFlow Integration
const { SessionsClient } = require('@google-cloud/dialogflow');

class MCPDialogFlowService {
  constructor(projectId, credentials) {
    this.projectId = projectId;
    this.sessionClient = new SessionsClient({
      projectId,
      keyFilename: credentials
    });
  }

  async processNaturalLanguage(message, sessionId, userId) {
    try {
      const sessionPath = this.sessionClient.projectAgentSessionPath(
        this.projectId,
        sessionId
      );

      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: message,
            languageCode: 'en',
          },
        },
      };

      const [response] = await this.sessionClient.detectIntent(request);
      const queryResult = response.queryResult;

      if (!queryResult) {
        throw new Error('No query result from DialogFlow');
      }

      const intent = queryResult.intent?.displayName || 'unknown';
      const confidence = queryResult.intentDetectionConfidence || 0;
      const parameters = this.extractParameters(queryResult.parameters);

      // Convert to MCP action
      const mcpAction = this.mapToMCPAction(intent, parameters, userId);

      return {
        intent,
        confidence,
        parameters,
        mcpAction,
        fulfillmentText: queryResult.fulfillmentText
      };

    } catch (error) {
      console.error('DialogFlow processing error:', error);
      throw error;
    }
  }

  extractParameters(parameters) {
    if (!parameters || !parameters.fields) return {};
    
    const extracted = {};
    
    Object.keys(parameters.fields).forEach(key => {
      const field = parameters.fields[key];
      
      if (field.stringValue !== undefined) {
        extracted[key] = field.stringValue;
      } else if (field.numberValue !== undefined) {
        extracted[key] = field.numberValue;
      } else if (field.structValue && field.structValue.fields) {
        // Handle money amounts
        if (field.structValue.fields.amount) {
          extracted[key] = {
            amount: field.structValue.fields.amount.numberValue,
            currency: field.structValue.fields.currency?.stringValue || 'USD'
          };
        }
      }
    });
    
    return extracted;
  }

  mapToMCPAction(intent, parameters, userId) {
    const actionMap = {
      'account.balance': {
        tool: 'get_account_balance',
        args: {
          userId,
          accountType: parameters['account-type'],
          accountNumber: parameters['account-number']
        }
      },
      'transaction.history': {
        tool: 'get_transactions',
        args: {
          userId,
          accountNumber: parameters['account-number'],
          dateRange: parameters['date-period'],
          limit: 20
        }
      },
      'payment.transfer': {
        tool: 'create_transfer',
        args: {
          userId,
          amount: parameters['amount-of-money']?.amount,
          currency: parameters['amount-of-money']?.currency || 'USD',
          recipient: parameters.recipient,
          fromAccount: parameters['from-account']
        }
      },
      'payment.bill': {
        tool: 'pay_bill',
        args: {
          userId,
          billType: parameters['bill-type'],
          amount: parameters['amount-of-money']?.amount,
          currency: parameters['amount-of-money']?.currency || 'USD'
        }
      },
      'card.status': {
        tool: 'get_card_status',
        args: {
          userId,
          cardType: parameters['card-type'],
          lastFourDigits: parameters['card-number']
        }
      },
      'card.block': {
        tool: 'block_card',
        args: {
          userId,
          cardType: parameters['card-type'],
          lastFourDigits: parameters['card-number'],
          reason: 'user_requested'
        }
      },
      'dispute.create': {
        tool: 'create_dispute',
        args: {
          userId,
          amount: parameters['amount-of-money']?.amount,
          merchant: parameters.merchant,
          reason: 'unauthorized_transaction'
        }
      },
      'fraud.report': {
        tool: 'report_fraud',
        args: {
          userId,
          type: 'account_compromise',
          urgent: true
        }
      },
      'account.statement': {
        tool: 'generate_statement',
        args: {
          userId,
          accountNumber: parameters['account-number'],
          period: parameters['date-period'] || 'current_month'
        }
      }
    };

    return actionMap[intent] || {
      tool: 'unknown_intent',
      args: { intent, parameters, userId }
    };
  }
}

module.exports = MCPDialogFlowService;'''

    os.makedirs('./mcp-server/src/services', exist_ok=True)
    with open('./mcp-server/src/services/dialogflow.js', 'w') as f:
        f.write(mcp_dialogflow)

    print("✓ Created MCP server DialogFlow integration")

def create_environment_template():
    """Create environment template for DialogFlow integration."""
    
    env_template = '''# DialogFlow Configuration
GOOGLE_PROJECT_ID=enterprise-banking-chatbot
GOOGLE_APPLICATION_CREDENTIALS=./config/dialogflow-service-account.json
DIALOGFLOW_LANGUAGE_CODE=en
DIALOGFLOW_SESSION_ID_PREFIX=banking-session-

# DialogFlow Settings
DIALOGFLOW_ENABLED=true
DIALOGFLOW_CONFIDENCE_THRESHOLD=0.7
DIALOGFLOW_FALLBACK_ENABLED=true
DIALOGFLOW_DEBUG=false

# Session Management
DIALOGFLOW_SESSION_TIMEOUT=1800  # 30 minutes
DIALOGFLOW_MAX_SESSIONS=1000

# Integration Settings
ENABLE_NATURAL_LANGUAGE_PROCESSING=true
AUTO_EXECUTE_HIGH_CONFIDENCE_INTENTS=false
REQUIRE_CONFIRMATION_FOR_SENSITIVE_OPERATIONS=true

# Security
DIALOGFLOW_RATE_LIMIT=100  # requests per minute
DIALOGFLOW_IP_WHITELIST=
ENABLE_INTENT_LOGGING=true
MASK_SENSITIVE_PARAMETERS=true'''

    with open('./.env.dialogflow.template', 'w') as f:
        f.write(env_template)

    print("✓ Created environment template")

def create_integration_readme():
    """Create integration-specific README."""
    
    readme_content = '''# DialogFlow Integration for Enterprise Banking

## Overview
This integration connects your Enterprise Banking ChatBot with Google DialogFlow for advanced natural language processing and intent recognition.

## Files Created

### ChatBot UI Integration
- `packages/chatbot-ui/src/services/dialogflow/DialogFlowService.ts` - Core DialogFlow service
- `packages/chatbot-ui/src/services/dialogflow/useDialogFlow.ts` - React hook for DialogFlow

### MCP Server Integration  
- `mcp-server/src/services/dialogflow.js` - MCP DialogFlow service

### Configuration
- `.env.dialogflow.template` - Environment variables template

## Quick Integration

### 1. Install Dependencies
```bash
# In ChatBot UI directory
cd packages/chatbot-ui
npm install @google-cloud/dialogflow

# In MCP server directory  
cd ../../mcp-server
npm install @google-cloud/dialogflow
```

### 2. Update ChatBot Component
Add DialogFlow to your main ChatBot component:

```typescript
import { useDialogFlow } from '../services/dialogflow/useDialogFlow';

const ChatBot = () => {
  const { processMessage, isProcessing, confidence } = useDialogFlow({
    projectId: process.env.GOOGLE_PROJECT_ID!,
    sessionId: `user-${userId}`,
    languageCode: 'en'
  });

  const handleMessage = async (message: string) => {
    try {
      const result = await processMessage(message);
      
      if (result.requiresAuth && !isAuthenticated) {
        // Handle authentication required
        return;
      }

      if (result.apiEndpoint) {
        // Execute banking operation via MCP
        const apiResponse = await executeAPICall(result);
        const formattedResponse = dialogFlowService.formatBankingResponse(result, apiResponse);
        setMessages(prev => [...prev, { text: formattedResponse, isBot: true }]);
      } else {
        // Use DialogFlow fulfillment text
        setMessages(prev => [...prev, { text: result.fulfillmentText, isBot: true }]);
      }
    } catch (error) {
      console.error('ChatBot error:', error);
    }
  };

  // ... rest of component
};
```

### 3. Update MCP Server
Add DialogFlow processing to your MCP server:

```javascript
const MCPDialogFlowService = require('./services/dialogflow');

const dialogFlowService = new MCPDialogFlowService(
  process.env.GOOGLE_PROJECT_ID,
  process.env.GOOGLE_APPLICATION_CREDENTIALS
);

// In your message handler
async function handleChatMessage(message, sessionId, userId) {
  try {
    const result = await dialogFlowService.processNaturalLanguage(
      message, 
      sessionId, 
      userId
    );

    if (result.mcpAction && result.confidence > 0.7) {
      // Execute the mapped MCP action
      const response = await executeMCPAction(result.mcpAction);
      return {
        intent: result.intent,
        confidence: result.confidence,
        response: response,
        fulfillmentText: result.fulfillmentText
      };
    }

    return {
      intent: result.intent,
      confidence: result.confidence,
      fulfillmentText: result.fulfillmentText
    };

  } catch (error) {
    console.error('DialogFlow processing error:', error);
    throw error;
  }
}
```

### 4. Environment Setup
Copy and configure the environment template:

```bash
cp .env.dialogflow.template .env.local
# Edit .env.local with your DialogFlow credentials
```

## Testing Integration

### 1. Test DialogFlow Service
```bash
# Run the test script
python3 ./config/test_dialogflow.py
```

### 2. Test ChatBot Integration
```bash
# Start your development server
npm run dev

# Test messages:
# "What's my account balance?"
# "Transfer $100 to John"
# "Block my credit card"
```

## Intent Confidence Thresholds

Configure confidence thresholds for different actions:

```typescript
const CONFIDENCE_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.8,    // Auto-execute safe operations
  MEDIUM_CONFIDENCE: 0.6,  // Require confirmation
  LOW_CONFIDENCE: 0.4      // Ask for clarification
};

const handleIntent = (result) => {
  if (result.confidence >= CONFIDENCE_THRESHOLDS.HIGH_CONFIDENCE) {
    // Execute immediately for safe operations
    if (result.intent.startsWith('account.') || result.intent === 'general.help') {
      executeAction(result);
    }
  } else if (result.confidence >= CONFIDENCE_THRESHOLDS.MEDIUM_CONFIDENCE) {
    // Ask for confirmation for sensitive operations
    askForConfirmation(result);
  } else {
    // Ask for clarification
    requestClarification(result);
  }
};
```

## Security Considerations

1. **Parameter Validation**: Always validate parameters extracted from DialogFlow
2. **Authentication**: Check user authentication before executing sensitive operations
3. **Confirmation**: Require explicit confirmation for financial transactions
4. **Logging**: Log all intent detections for security auditing
5. **Rate Limiting**: Implement rate limiting for DialogFlow API calls

## Troubleshooting

### Common Issues

1. **Low Confidence Scores**: Add more training phrases to intents
2. **Parameter Extraction Issues**: Check entity definitions and synonyms  
3. **Authentication Errors**: Verify service account permissions
4. **Integration Errors**: Check MCP server connectivity

### Debug Mode
Enable debug mode in your environment:
```bash
DIALOGFLOW_DEBUG=true
```

This will log all DialogFlow requests and responses.

## Next Steps

1. Test all banking intents with real user scenarios
2. Add conversation context for multi-turn dialogs
3. Implement fallback handling for unrecognized intents
4. Add analytics for intent performance monitoring
5. Consider adding voice input/output capabilities

---

For detailed setup instructions, see: `DIALOGFLOW_SETUP_GUIDE.md`'''

    with open('./DIALOGFLOW_INTEGRATION.md', 'w') as f:
        f.write(readme_content)

    print("✓ Created integration README")

def main():
    """Create all integration files."""
    
    print("🔧 Creating DialogFlow Integration Files")
    print("=" * 45)
    
    create_chatbot_integration()
    create_mcp_integration()
    create_environment_template()
    create_integration_readme()
    
    print("\n✅ DialogFlow integration files created!")
    print("\n📁 Files created:")
    print("  - packages/chatbot-ui/src/services/dialogflow/DialogFlowService.ts")
    print("  - packages/chatbot-ui/src/services/dialogflow/useDialogFlow.ts")
    print("  - mcp-server/src/services/dialogflow.js")
    print("  - .env.dialogflow.template")
    print("  - DIALOGFLOW_INTEGRATION.md")
    
    print("\n🚀 Next steps:")
    print("  1. Run the main setup script: ./setup-dialogflow.sh")
    print("  2. Install npm dependencies in ChatBot UI and MCP server")
    print("  3. Update your components to use DialogFlow integration")
    print("  4. Test the integration with sample banking queries")

if __name__ == "__main__":
    main()
