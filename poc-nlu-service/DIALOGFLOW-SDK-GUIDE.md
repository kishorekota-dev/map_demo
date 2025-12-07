# DialogFlow SDK Implementation Guide

## Overview

The POC NLU Service **already uses the official Google Cloud DialogFlow SDK** (`@google-cloud/dialogflow` v6.0.0). This document explains the SDK implementation, features, and how to use it.

## Current Implementation Status

✅ **DialogFlow SDK is already implemented and integrated**

The service uses:
- **Package**: `@google-cloud/dialogflow` v6.0.0
- **Client**: `SessionsClient` for intent detection
- **Mode**: Dual mode (Real API + Mock fallback)
- **Location**: `src/services/dialogflow.service.js`

## DialogFlow SDK Architecture

```javascript
// Current Implementation in dialogflow.service.js
const { SessionsClient } = require('@google-cloud/dialogflow');

class DialogFlowService {
  constructor() {
    // Initialize SDK client
    this.sessionsClient = new SessionsClient({
      projectId: config.dialogflow.projectId,
      keyFilename: config.dialogflow.keyFilename  // Optional
    });
  }
  
  async detectIntent(message, sessionId, languageCode) {
    // Create session path
    const sessionPath = this.sessionsClient.projectAgentSessionPath(
      projectId,
      sessionId
    );
    
    // Create request
    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: message,
          languageCode: languageCode
        }
      }
    };
    
    // Call DialogFlow API
    const [response] = await this.sessionsClient.detectIntent(request);
    
    return response;
  }
}
```

## Available DialogFlow SDK Clients

The `@google-cloud/dialogflow` SDK provides several clients:

### 1. SessionsClient (Currently Used)
**Purpose**: Detect intents and handle user queries

```javascript
const { SessionsClient } = require('@google-cloud/dialogflow');
const sessionsClient = new SessionsClient();

// Methods:
- detectIntent()           // Detect intent from text
- streamingDetectIntent()  // Streaming audio/text
```

### 2. IntentsClient
**Purpose**: Manage intents programmatically

```javascript
const { IntentsClient } = require('@google-cloud/dialogflow');
const intentsClient = new IntentsClient();

// Methods:
- listIntents()           // Get all intents
- getIntent()             // Get specific intent
- createIntent()          // Create new intent
- updateIntent()          // Update intent
- deleteIntent()          // Delete intent
- batchUpdateIntents()    // Batch operations
```

### 3. EntityTypesClient
**Purpose**: Manage entity types

```javascript
const { EntityTypesClient } = require('@google-cloud/dialogflow');
const entityTypesClient = new EntityTypesClient();

// Methods:
- listEntityTypes()
- getEntityType()
- createEntityType()
- updateEntityType()
- deleteEntityType()
- batchUpdateEntityTypes()
```

### 4. ContextsClient
**Purpose**: Manage conversation contexts

```javascript
const { ContextsClient } = require('@google-cloud/dialogflow');
const contextsClient = new ContextsClient();

// Methods:
- listContexts()
- getContext()
- createContext()
- updateContext()
- deleteContext()
- deleteAllContexts()
```

### 5. AgentsClient
**Purpose**: Manage DialogFlow agents

```javascript
const { AgentsClient } = require('@google-cloud/dialogflow');
const agentsClient = new AgentsClient();

// Methods:
- getAgent()
- setAgent()
- deleteAgent()
- searchAgents()
- trainAgent()
- exportAgent()
- importAgent()
```

## Enhanced Implementation with All SDK Features

Here's an enhanced version that shows all SDK capabilities:

```javascript
/**
 * Enhanced DialogFlow Service with Full SDK Features
 */

const {
  SessionsClient,
  IntentsClient,
  EntityTypesClient,
  ContextsClient,
  AgentsClient
} = require('@google-cloud/dialogflow');
const logger = require('../utils/logger');
const config = require('../config/config');

class EnhancedDialogFlowService {
  constructor() {
    this.enabled = config.dialogflow.enabled;
    this.projectId = config.dialogflow.projectId;
    
    if (this.enabled) {
      this.initializeClients();
    }
  }
  
  initializeClients() {
    const clientConfig = {
      projectId: this.projectId
    };
    
    if (config.dialogflow.keyFilename) {
      clientConfig.keyFilename = config.dialogflow.keyFilename;
    }
    
    // Initialize all SDK clients
    this.sessionsClient = new SessionsClient(clientConfig);
    this.intentsClient = new IntentsClient(clientConfig);
    this.entityTypesClient = new EntityTypesClient(clientConfig);
    this.contextsClient = new ContextsClient(clientConfig);
    this.agentsClient = new AgentsClient(clientConfig);
    
    logger.info('All DialogFlow SDK clients initialized');
  }
  
  // ==================== SESSION OPERATIONS ====================
  
  /**
   * Detect intent from text (Current Implementation)
   */
  async detectIntent(message, sessionId, languageCode = 'en-US') {
    const sessionPath = this.sessionsClient.projectAgentSessionPath(
      this.projectId,
      sessionId
    );
    
    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: message,
          languageCode: languageCode
        }
      }
    };
    
    const [response] = await this.sessionsClient.detectIntent(request);
    return response.queryResult;
  }
  
  /**
   * Detect intent with context
   */
  async detectIntentWithContext(message, sessionId, contexts, languageCode = 'en-US') {
    const sessionPath = this.sessionsClient.projectAgentSessionPath(
      this.projectId,
      sessionId
    );
    
    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: message,
          languageCode: languageCode
        }
      },
      queryParams: {
        contexts: contexts  // Array of context objects
      }
    };
    
    const [response] = await this.sessionsClient.detectIntent(request);
    return response.queryResult;
  }
  
  /**
   * Streaming detect intent (for voice/audio)
   */
  async streamingDetectIntent(audioStream, sessionId, languageCode = 'en-US') {
    const sessionPath = this.sessionsClient.projectAgentSessionPath(
      this.projectId,
      sessionId
    );
    
    const stream = this.sessionsClient.streamingDetectIntent();
    
    // Configure audio settings
    const initialStreamRequest = {
      session: sessionPath,
      queryInput: {
        audioConfig: {
          audioEncoding: 'AUDIO_ENCODING_LINEAR_16',
          sampleRateHertz: 16000,
          languageCode: languageCode
        }
      }
    };
    
    stream.write(initialStreamRequest);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (data) => {
        if (data.queryResult) {
          resolve(data.queryResult);
        }
      });
      
      stream.on('error', reject);
      
      audioStream.on('data', (chunk) => {
        stream.write({ inputAudio: chunk });
      });
      
      audioStream.on('end', () => {
        stream.end();
      });
    });
  }
  
  // ==================== INTENT OPERATIONS ====================
  
  /**
   * List all intents
   */
  async listIntents() {
    const projectAgentPath = this.intentsClient.projectAgentPath(this.projectId);
    
    const [intents] = await this.intentsClient.listIntents({
      parent: projectAgentPath
    });
    
    return intents.map(intent => ({
      name: intent.name,
      displayName: intent.displayName,
      priority: intent.priority,
      trainingPhrasesCount: intent.trainingPhrases?.length || 0,
      isFallback: intent.isFallback
    }));
  }
  
  /**
   * Get specific intent by ID
   */
  async getIntent(intentId) {
    const intentPath = this.intentsClient.projectAgentIntentPath(
      this.projectId,
      intentId
    );
    
    const [intent] = await this.intentsClient.getIntent({
      name: intentPath
    });
    
    return intent;
  }
  
  /**
   * Create new intent programmatically
   */
  async createIntent(displayName, trainingPhrases, messages) {
    const projectAgentPath = this.intentsClient.projectAgentPath(this.projectId);
    
    const intent = {
      displayName: displayName,
      trainingPhrases: trainingPhrases.map(phrase => ({
        parts: [{ text: phrase }]
      })),
      messages: messages.map(msg => ({
        text: { text: [msg] }
      }))
    };
    
    const [response] = await this.intentsClient.createIntent({
      parent: projectAgentPath,
      intent: intent
    });
    
    return response;
  }
  
  /**
   * Update existing intent
   */
  async updateIntent(intentId, updates) {
    const intentPath = this.intentsClient.projectAgentIntentPath(
      this.projectId,
      intentId
    );
    
    const intent = {
      name: intentPath,
      ...updates
    };
    
    const [response] = await this.intentsClient.updateIntent({
      intent: intent
    });
    
    return response;
  }
  
  /**
   * Delete intent
   */
  async deleteIntent(intentId) {
    const intentPath = this.intentsClient.projectAgentIntentPath(
      this.projectId,
      intentId
    );
    
    await this.intentsClient.deleteIntent({
      name: intentPath
    });
    
    return { success: true, message: 'Intent deleted' };
  }
  
  // ==================== ENTITY OPERATIONS ====================
  
  /**
   * List all entity types
   */
  async listEntityTypes() {
    const projectAgentPath = this.entityTypesClient.projectAgentPath(this.projectId);
    
    const [entityTypes] = await this.entityTypesClient.listEntityTypes({
      parent: projectAgentPath
    });
    
    return entityTypes.map(entity => ({
      name: entity.name,
      displayName: entity.displayName,
      kind: entity.kind,
      entitiesCount: entity.entities?.length || 0
    }));
  }
  
  /**
   * Create custom entity type
   */
  async createEntityType(displayName, entities, kind = 'KIND_MAP') {
    const projectAgentPath = this.entityTypesClient.projectAgentPath(this.projectId);
    
    const entityType = {
      displayName: displayName,
      kind: kind,
      entities: entities.map(e => ({
        value: e.value,
        synonyms: e.synonyms || [e.value]
      }))
    };
    
    const [response] = await this.entityTypesClient.createEntityType({
      parent: projectAgentPath,
      entityType: entityType
    });
    
    return response;
  }
  
  // ==================== CONTEXT OPERATIONS ====================
  
  /**
   * List all contexts for a session
   */
  async listContexts(sessionId) {
    const sessionPath = this.contextsClient.projectAgentSessionPath(
      this.projectId,
      sessionId
    );
    
    const [contexts] = await this.contextsClient.listContexts({
      parent: sessionPath
    });
    
    return contexts;
  }
  
  /**
   * Create context
   */
  async createContext(sessionId, contextName, lifespanCount, parameters) {
    const sessionPath = this.contextsClient.projectAgentSessionPath(
      this.projectId,
      sessionId
    );
    
    const contextPath = `${sessionPath}/contexts/${contextName}`;
    
    const context = {
      name: contextPath,
      lifespanCount: lifespanCount,
      parameters: parameters
    };
    
    const [response] = await this.contextsClient.createContext({
      parent: sessionPath,
      context: context
    });
    
    return response;
  }
  
  /**
   * Delete all contexts for a session
   */
  async deleteAllContexts(sessionId) {
    const sessionPath = this.contextsClient.projectAgentSessionPath(
      this.projectId,
      sessionId
    );
    
    await this.contextsClient.deleteAllContexts({
      parent: sessionPath
    });
    
    return { success: true, message: 'All contexts deleted' };
  }
  
  // ==================== AGENT OPERATIONS ====================
  
  /**
   * Get agent information
   */
  async getAgent() {
    const projectPath = this.agentsClient.projectPath(this.projectId);
    
    const [agent] = await this.agentsClient.getAgent({
      parent: projectPath
    });
    
    return {
      displayName: agent.displayName,
      defaultLanguageCode: agent.defaultLanguageCode,
      supportedLanguageCodes: agent.supportedLanguageCodes,
      timeZone: agent.timeZone,
      description: agent.description
    };
  }
  
  /**
   * Train agent
   */
  async trainAgent() {
    const projectPath = this.agentsClient.projectPath(this.projectId);
    
    const [operation] = await this.agentsClient.trainAgent({
      parent: projectPath
    });
    
    // Wait for training to complete
    const [response] = await operation.promise();
    
    return { success: true, message: 'Agent training complete' };
  }
  
  /**
   * Export agent
   */
  async exportAgent() {
    const projectPath = this.agentsClient.projectPath(this.projectId);
    
    const [operation] = await this.agentsClient.exportAgent({
      parent: projectPath
    });
    
    const [response] = await operation.promise();
    
    return response.agentContent;
  }
}

module.exports = new EnhancedDialogFlowService();
```

## SDK Features Currently Implemented

### ✅ Implemented in Current Service

1. **SessionsClient.detectIntent()** - Text-based intent detection
2. **SessionsClient.projectAgentSessionPath()** - Session path generation
3. **Error handling with fallback** - Automatic mock mode
4. **Credential management** - Service account + ADC support

### 🔄 Can Be Added (SDK Supports)

1. **Streaming detection** - For audio/voice input
2. **Context management** - Store conversation state
3. **Intent management** - CRUD operations on intents
4. **Entity management** - Custom entity types
5. **Agent training** - Programmatic training
6. **Batch operations** - Bulk intent/entity updates

## Installation & Setup

### 1. SDK is Already Installed

```json
// package.json (already includes)
"dependencies": {
  "@google-cloud/dialogflow": "^6.0.0"
}
```

### 2. Authentication Options

**Option A: Service Account Key File**
```bash
DIALOGFLOW_KEY_FILENAME=./config/dialogflow-credentials.json
```

**Option B: Application Default Credentials (ADC)**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
# Or use: gcloud auth application-default login
```

**Option C: In-Code Credentials**
```javascript
const sessionsClient = new SessionsClient({
  projectId: 'your-project-id',
  keyFilename: './path/to/key.json'
});
```

## SDK API Examples

### Example 1: Basic Intent Detection (Current)

```javascript
const { SessionsClient } = require('@google-cloud/dialogflow');

const client = new SessionsClient();
const sessionPath = client.projectAgentSessionPath(projectId, sessionId);

const request = {
  session: sessionPath,
  queryInput: {
    text: {
      text: 'What is my balance?',
      languageCode: 'en-US'
    }
  }
};

const [response] = await client.detectIntent(request);
console.log('Intent:', response.queryResult.intent.displayName);
console.log('Confidence:', response.queryResult.intentDetectionConfidence);
```

### Example 2: Intent Detection with Context

```javascript
const request = {
  session: sessionPath,
  queryInput: {
    text: { text: 'Transfer $500', languageCode: 'en-US' }
  },
  queryParams: {
    contexts: [
      {
        name: `${sessionPath}/contexts/transfer-context`,
        lifespanCount: 5,
        parameters: {
          fields: {
            sourceAccount: { stringValue: 'checking' }
          }
        }
      }
    ]
  }
};

const [response] = await client.detectIntent(request);
```

### Example 3: List All Intents

```javascript
const { IntentsClient } = require('@google-cloud/dialogflow');

const intentsClient = new IntentsClient();
const projectAgentPath = intentsClient.projectAgentPath(projectId);

const [intents] = await intentsClient.listIntents({
  parent: projectAgentPath
});

intents.forEach(intent => {
  console.log('Intent:', intent.displayName);
  console.log('Training Phrases:', intent.trainingPhrases.length);
});
```

### Example 4: Create Intent Programmatically

```javascript
const intent = {
  displayName: 'check.loan.status',
  trainingPhrases: [
    { parts: [{ text: 'What is my loan status?' }] },
    { parts: [{ text: 'Check loan application' }] },
    { parts: [{ text: 'Loan status' }] }
  ],
  messages: [
    {
      text: {
        text: ['Let me check your loan status for you.']
      }
    }
  ]
};

const [response] = await intentsClient.createIntent({
  parent: projectAgentPath,
  intent: intent
});
```

## SDK Response Structure

```javascript
{
  queryResult: {
    queryText: 'What is my balance?',
    languageCode: 'en-US',
    intent: {
      name: 'projects/*/agent/intents/12345',
      displayName: 'check.balance'
    },
    intentDetectionConfidence: 0.92,
    parameters: {
      fields: {
        account_type: {
          kind: 'stringValue',
          stringValue: 'checking'
        }
      }
    },
    fulfillmentText: 'I can help you check your account balance.',
    fulfillmentMessages: [...],
    outputContexts: [...],
    allRequiredParamsPresent: true
  },
  webhookStatus: {...}
}
```

## Best Practices

### 1. Error Handling

```javascript
try {
  const [response] = await sessionsClient.detectIntent(request);
  return response.queryResult;
} catch (error) {
  if (error.code === 5) {
    // NOT_FOUND error - intent not recognized
    logger.warn('Intent not found');
  } else if (error.code === 7) {
    // PERMISSION_DENIED - auth issue
    logger.error('Permission denied');
  }
  throw error;
}
```

### 2. Session Management

```javascript
// Use unique session IDs per user
const sessionId = `${userId}-${Date.now()}`;

// Or use persistent session IDs for conversation continuity
const sessionId = `user-${userId}`;
```

### 3. Context Management

```javascript
// Set context after detecting an intent
const context = {
  name: `${sessionPath}/contexts/awaiting-confirmation`,
  lifespanCount: 2,  // Valid for next 2 queries
  parameters: {
    fields: {
      amount: { numberValue: 500 },
      recipient: { stringValue: 'John' }
    }
  }
};

await contextsClient.createContext({
  parent: sessionPath,
  context: context
});
```

### 4. Batch Operations

```javascript
// Update multiple intents at once
const intentsToUpdate = [...];  // Array of intent objects

const [operation] = await intentsClient.batchUpdateIntents({
  parent: projectAgentPath,
  intentBatchInline: {
    intents: intentsToUpdate
  }
});

await operation.promise();
```

## Testing the SDK

```bash
# Install dependencies
cd poc-nlu-service
npm install

# Set environment variables
export DIALOGFLOW_ENABLED=true
export DIALOGFLOW_PROJECT_ID=your-project-id
export GOOGLE_APPLICATION_CREDENTIALS=./config/credentials.json

# Test the service
curl -X POST http://localhost:3003/api/nlu/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "user_input": "What is my account balance?",
    "sessionId": "test-session",
    "userId": "test-user"
  }'
```

## Documentation Links

- **Official SDK Docs**: https://googleapis.dev/nodejs/dialogflow/latest/
- **DialogFlow Docs**: https://cloud.google.com/dialogflow/es/docs
- **GitHub Repo**: https://github.com/googleapis/nodejs-dialogflow
- **API Reference**: https://cloud.google.com/dialogflow/es/docs/reference/rpc

## Conclusion

✅ **The POC NLU Service already uses the official Google Cloud DialogFlow SDK**

The current implementation:
- Uses `SessionsClient` for intent detection
- Supports both real API and mock fallback
- Handles authentication properly
- Provides error handling and logging

**You can enhance it further by:**
- Adding streaming detection for voice
- Implementing context management
- Adding intent/entity CRUD operations
- Implementing agent training

The SDK is production-ready and fully functional! 🚀
