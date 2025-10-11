# DialogFlow SDK Architecture

## Current Implementation Architecture

```
┌─────────────────────────────────────────────────────────┐
│           POC NLU Service                               │
│           (Port 3003)                                   │
└─────────────────────────────────────────────────────────┘
                          │
                          │ POST /api/nlu/analyze
                          ↓
┌─────────────────────────────────────────────────────────┐
│        NLU Controller                                   │
│        (nlu.controller.js)                              │
└─────────────────────────────────────────────────────────┘
                          │
                          │ analyzeUserInput()
                          ↓
┌─────────────────────────────────────────────────────────┐
│     DialogFlow Service (dialogflow.service.js)          │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │  Uses: @google-cloud/dialogflow SDK               │ │
│  │  Client: SessionsClient                           │ │
│  │  Version: 6.0.0                                   │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  detectIntent(message, sessionId, languageCode)         │
│         │                                               │
│         ├─ Try: Real DialogFlow API via SDK             │
│         │      │                                        │
│         │      └─→ SessionsClient.detectIntent()       │
│         │                                               │
│         └─ Catch: Fallback to Mock Mode                │
│                                                         │
└─────────────────────────────────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│      Google Cloud DialogFlow API                        │
│      (via SDK)                                          │
│                                                         │
│  • Intent Detection                                     │
│  • Parameter Extraction                                 │
│  • Fulfillment Text                                     │
│  • Context Management                                   │
└─────────────────────────────────────────────────────────┘
```

## Enhanced Implementation Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Enhanced DialogFlow Service                            │
│  (dialogflow-enhanced.service.js)                       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Uses: @google-cloud/dialogflow SDK             │   │
│  │  All Clients Initialized:                       │   │
│  │                                                  │   │
│  │  1. SessionsClient      ← Intent Detection      │   │
│  │  2. IntentsClient       ← Intent Management     │   │
│  │  3. EntityTypesClient   ← Entity Management     │   │
│  │  4. ContextsClient      ← Context Management    │   │
│  │  5. AgentsClient        ← Agent Operations      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Session Operations                             │   │
│  │  • detectIntent()                               │   │
│  │  • detectIntentWithContext()                    │   │
│  │  • detectIntentWithSentiment()                  │   │
│  │  • streamingDetectIntent() [planned]            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Context Operations                             │   │
│  │  • listContexts(sessionId)                      │   │
│  │  • setContext(sessionId, name, lifespan)        │   │
│  │  • clearContexts(sessionId)                     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Intent Operations                              │   │
│  │  • listAllIntents()                             │   │
│  │  • getIntentDetails(intentId)                   │   │
│  │  • createIntent() [planned]                     │   │
│  │  • updateIntent() [planned]                     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Agent Operations                               │   │
│  │  • getAgentInfo()                               │   │
│  │  • trainAgent() [planned]                       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## SDK Client Flow

```
User Message: "What is my account balance?"
        │
        ↓
┌─────────────────────────────────────────┐
│  NLU Controller                         │
│  analyzeUserInput()                     │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│  DialogFlow Service                     │
│  detectIntent()                         │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│  @google-cloud/dialogflow SDK           │
│  SessionsClient                         │
└────────────────┬────────────────────────┘
                 │
                 │ Create Session Path
                 ↓
┌─────────────────────────────────────────┐
│  projects/{projectId}/agent/            │
│  sessions/{sessionId}                   │
└────────────────┬────────────────────────┘
                 │
                 │ Build Request
                 ↓
┌─────────────────────────────────────────┐
│  {                                      │
│    session: sessionPath,                │
│    queryInput: {                        │
│      text: {                            │
│        text: "What is my balance?",     │
│        languageCode: "en-US"            │
│      }                                  │
│    }                                    │
│  }                                      │
└────────────────┬────────────────────────┘
                 │
                 │ SDK Call
                 ↓
┌─────────────────────────────────────────┐
│  sessionsClient.detectIntent(request)   │
└────────────────┬────────────────────────┘
                 │
                 │ HTTPS Call with Auth
                 ↓
┌─────────────────────────────────────────┐
│  Google Cloud DialogFlow API            │
│  https://dialogflow.googleapis.com      │
└────────────────┬────────────────────────┘
                 │
                 │ Process & Match Intent
                 ↓
┌─────────────────────────────────────────┐
│  DialogFlow Agent                       │
│  • Match Intent: "check.balance"        │
│  • Extract Parameters: account_type     │
│  • Generate Fulfillment Text            │
└────────────────┬────────────────────────┘
                 │
                 │ Response
                 ↓
┌─────────────────────────────────────────┐
│  {                                      │
│    queryResult: {                       │
│      intent: {                          │
│        displayName: "check.balance"     │
│      },                                 │
│      intentDetectionConfidence: 0.92,   │
│      parameters: {                      │
│        account_type: "checking"         │
│      },                                 │
│      fulfillmentText: "..."             │
│    }                                    │
│  }                                      │
└────────────────┬────────────────────────┘
                 │
                 │ Parse Response
                 ↓
┌─────────────────────────────────────────┐
│  Standardized Response                  │
│  {                                      │
│    intent: "check.balance",             │
│    confidence: 0.92,                    │
│    entities: [...],                     │
│    fulfillmentText: "...",              │
│    source: "dialogflow-sdk"             │
│  }                                      │
└────────────────┬────────────────────────┘
                 │
                 ↓
           Return to Controller
```

## SDK Authentication Flow

```
┌──────────────────────────────────────────────────────┐
│  Application Startup                                 │
└─────────────────────┬────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────┐
│  Load Environment Variables                          │
│  • DIALOGFLOW_ENABLED                                │
│  • DIALOGFLOW_PROJECT_ID                             │
│  • DIALOGFLOW_KEY_FILENAME                           │
└─────────────────────┬────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────┐
│  Initialize DialogFlow Service                       │
└─────────────────────┬────────────────────────────────┘
                      │
                      ↓
         ┌────────────┴────────────┐
         │                         │
    enabled=true            enabled=false
         │                         │
         ↓                         ↓
┌─────────────────┐      ┌─────────────────┐
│  Initialize SDK │      │   Mock Mode     │
└────────┬────────┘      └─────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────┐
│  Check for Credentials                               │
│  1. DIALOGFLOW_KEY_FILENAME?                         │
│  2. GOOGLE_APPLICATION_CREDENTIALS?                  │
│  3. Application Default Credentials (ADC)?           │
└─────────────────────┬────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
  Credentials Found      No Credentials
         │                         │
         ↓                         ↓
┌─────────────────┐      ┌─────────────────┐
│  new SessionsClient({   │  Fall back to   │
│    projectId,           │  Mock Mode      │
│    keyFilename          │                 │
│  })                     │                 │
└────────┬────────┘      └─────────────────┘
         │
         ↓
┌──────────────────────────────────────────────────────┐
│  SDK Authenticates with Google Cloud                 │
│  • Reads service account key                         │
│  • Exchanges for OAuth2 token                        │
│  • Stores token for API calls                        │
└─────────────────────┬────────────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────────────┐
│  SDK Ready for API Calls                             │
│  Service Status: "connected"                         │
└──────────────────────────────────────────────────────┘
```

## SDK vs Mock Mode Decision Tree

```
              User Query
                 │
                 ↓
        Is SDK Initialized?
              /   \
            Yes    No
             │      │
             │      └──→ Use Mock Mode
             │
             ↓
     Try SDK API Call
             │
        ┌────┴────┐
        │         │
    Success    Failure
        │         │
        │         └──→ Log Error
        │              └──→ Fallback to Mock
        │
        ↓
   Return SDK Response
```

## File Structure

```
poc-nlu-service/
│
├── package.json
│   └── "@google-cloud/dialogflow": "^6.0.0" ✅
│
├── src/
│   ├── services/
│   │   ├── dialogflow.service.js          ✅ Current (Production)
│   │   │   └── Uses: SessionsClient
│   │   │       └── detectIntent()
│   │   │
│   │   └── dialogflow-enhanced.service.js ✅ Enhanced (Optional)
│   │       └── Uses: All 5 SDK Clients
│   │           ├── SessionsClient
│   │           ├── IntentsClient
│   │           ├── EntityTypesClient
│   │           ├── ContextsClient
│   │           └── AgentsClient
│   │
│   └── controllers/
│       └── nlu.controller.js
│           └── Imports: dialogflow.service.js
│
├── config/
│   └── dialogflow-credentials.json (Not in git)
│
└── Documentation/
    ├── DIALOGFLOW-SDK-GUIDE.md         ✅ Complete SDK reference
    ├── SDK-IMPLEMENTATION-SUMMARY.md   ✅ Summary & comparison
    ├── SDK-QUICK-COMPARISON.md         ✅ Quick reference
    └── ARCHITECTURE.md                 ✅ System architecture
```

---

**Key Point**: The SDK is already implemented and working! 🎉
