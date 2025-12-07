# Intent-Based Prompt System Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER REQUEST                                     │
│                    "What's my balance?"                                  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      NLU Service (Intent Detection)                      │
│                     Detects: "balance_inquiry"                          │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BankingChatWorkflow                                  │
│                  (src/workflows/bankingChatWorkflow.js)                 │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────┐       │
│  │  1. Analyze Intent                                          │       │
│  │     → intentMapper.getRequiredData('balance_inquiry')      │       │
│  └────────────────────────────────────────────────────────────┘       │
│                               │                                        │
│                               ▼                                        │
│  ┌────────────────────────────────────────────────────────────┐       │
│  │  2. Check Required Data                                     │       │
│  │     → No required fields for balance_inquiry                │       │
│  └────────────────────────────────────────────────────────────┘       │
│                               │                                        │
│                               ▼                                        │
│  ┌────────────────────────────────────────────────────────────┐       │
│  │  3. Execute Tools                                           │       │
│  │     → intentMapper.getToolsForIntent('balance_inquiry')    │       │
│  │     → Execute: banking_get_balance                          │       │
│  └────────────────────────────────────────────────────────────┘       │
│                               │                                        │
│                               ▼                                        │
│  ┌────────────────────────────────────────────────────────────┐       │
│  │  4. Generate Response                                       │       │
│  │     → intentMapper.buildSystemMessage('balance_inquiry')   │       │
│  │     → intentMapper.buildUserMessage('balance_inquiry',...)  │       │
│  │     → Send to LLM → Get Response                            │       │
│  └────────────────────────────────────────────────────────────┘       │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         RESPONSE TO USER                                 │
│            "Your checking account balance is $5,432.10"                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       Configuration Layer                                 │
│                     (config/intentConfig.js)                             │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │   INTENT     │  │   INTENT     │  │   INTENT     │                 │
│  │  CATEGORIES  │  │   METADATA   │  │   BEHAVIOR   │                 │
│  └──────────────┘  └──────────────┘  └──────────────┘                 │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │    DATA      │  │     TOOL     │  │    PROMPT    │                 │
│  │ REQUIREMENTS │  │   MAPPINGS   │  │  REFERENCES  │                 │
│  └──────────────┘  └──────────────┘  └──────────────┘                 │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       Prompt Template Layer                               │
│                   (src/prompts/templates/*.js)                           │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Account   │  │ Transaction │  │    Card     │  │  Security   │  │
│  │  Templates  │  │  Templates  │  │  Templates  │  │  Templates  │  │
│  │             │  │             │  │             │  │             │  │
│  │ • balance   │  │ • history   │  │ • mgmt      │  │ • fraud     │  │
│  │ • info      │  │ • transfer  │  │ • activate  │  │ • dispute   │  │
│  │ • statement │  │ • payment   │  │ • replace   │  │ • verify    │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
│                                                                          │
│                          ┌─────────────┐                                │
│                          │   Support   │                                │
│                          │  Templates  │                                │
│                          │             │                                │
│                          │ • help      │                                │
│                          │ • complaint │                                │
│                          │ • feedback  │                                │
│                          └─────────────┘                                │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Service Layer                                      │
│                   (src/services/intentMapper.js)                         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │              IntentMapper (Singleton Service)                   │    │
│  │                                                                 │    │
│  │  • Validates intents                                           │    │
│  │  • Retrieves configuration                                     │    │
│  │  • Builds prompts                                              │    │
│  │  • Validates data                                              │    │
│  │  • Maps tools                                                  │    │
│  │  • Handles fallbacks                                           │    │
│  │  • Provides utility functions                                  │    │
│  └────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        Workflow Layer                                     │
│                  (src/workflows/bankingChatWorkflow.js)                  │
│                                                                          │
│  Uses intentMapper for:                                                 │
│  • Getting required data fields                                         │
│  • Retrieving tool mappings                                             │
│  • Building system prompts                                              │
│  • Building user prompts with context                                   │
│  • Checking confirmation requirements                                   │
│  • Validating collected data                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Data Flow for New Intent Addition

```
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 1: Edit config/intentConfig.js                                   │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  • Add to INTENT_CATEGORIES                                      │ │
│  │  • Define INTENT_METADATA                                        │ │
│  │  • Configure INTENT_BEHAVIOR                                     │ │
│  │  • Set INTENT_DATA_REQUIREMENTS                                  │ │
│  │  • Map INTENT_TOOL_MAPPING                                       │ │
│  │  • Link INTENT_PROMPTS                                           │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 2: Create prompts in src/prompts/templates/{category}.js        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  new_intent_system: `System prompt...`                          │ │
│  │  new_intent_user: (context) => `User prompt with ${context}`    │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 3: Test with intentMapper                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  intentMapper.isValidIntent('new_intent')        // true         │ │
│  │  intentMapper.buildSystemMessage('new_intent')   // prompt text  │ │
│  │  intentMapper.validateData('new_intent', data)   // validation   │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬───────────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│  STEP 4: Auto-integrated into workflow                                 │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  bankingChatWorkflow.js automatically uses new intent via        │ │
│  │  intentMapper - no workflow changes needed!                      │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

## Intent Lifecycle

```
User Question
     │
     ▼
┌─────────────────┐
│ Intent Detection│ (NLU Service)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validate Intent │ intentMapper.isValidIntent()
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Get Config      │ intentMapper.getIntentConfig()
└────────┬────────┘
         │
         ├──→ Get Required Data Fields
         ├──→ Get Tools
         ├──→ Check Behavior (confirmation, urgency)
         │
         ▼
┌─────────────────┐
│ Collect Data    │ From user via conversation
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validate Data   │ intentMapper.validateData()
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Execute Tools   │ Using tool mappings
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Build Prompts   │ System + User prompts with context
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate Reply  │ LLM generates response
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Check Confirm   │ If needed, request confirmation
└────────┬────────┘
         │
         ▼
    Response to User
```

## Configuration Hierarchy

```
INTENT
  │
  ├── METADATA
  │     ├── name
  │     ├── category
  │     ├── description
  │     ├── requiresAuth
  │     ├── priority
  │     └── estimatedDuration
  │
  ├── BEHAVIOR
  │     ├── needsConfirmation
  │     ├── allowsPartialData
  │     ├── requiresAllFields
  │     ├── canUseDefaults
  │     ├── maxRetries
  │     ├── isUrgent
  │     └── confirmationMessage
  │
  ├── DATA_REQUIREMENTS
  │     ├── required: []
  │     ├── optional: []
  │     ├── defaults: {}
  │     └── validation: {}
  │
  ├── TOOL_MAPPING
  │     └── tools: []
  │
  ├── PROMPTS
  │     ├── systemPromptTemplate
  │     ├── userPromptTemplate
  │     └── contextFields: []
  │
  └── PATTERNS
        └── patterns: []
```

## Validation Flow

```
collectedData
     │
     ▼
┌──────────────────┐
│ Check Required   │ Are all required fields present?
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Type Validation  │ string, number, boolean, enum
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Range/Length     │ min/max, minLength/maxLength
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Pattern Match    │ Regex validation
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Return Result    │ { valid, missing, invalid, warnings }
└──────────────────┘
```

## Category Organization

```
INTENT_CATEGORIES
│
├── ACCOUNT_OPERATIONS
│     ├── balance_inquiry
│     ├── account_info
│     └── account_statement
│
├── TRANSACTION_OPERATIONS
│     ├── transaction_history
│     ├── transfer_funds
│     └── payment_inquiry
│
├── CARD_OPERATIONS
│     ├── card_management
│     ├── card_activation
│     └── card_replacement
│
├── SECURITY_OPERATIONS
│     ├── report_fraud
│     ├── check_fraud_alerts
│     ├── verify_transaction
│     └── dispute_transaction
│
└── SUPPORT_OPERATIONS
      ├── general_inquiry
      ├── help
      ├── complaint
      ├── contact_support
      └── feedback
```

## Files and Responsibilities

```
┌────────────────────────────────────────────────────────┐
│ config/intentConfig.js                                 │
│ • Intent categories                                    │
│ • Metadata definitions                                 │
│ • Behavior configurations                              │
│ • Data requirements                                    │
│ • Tool mappings                                        │
│ • Prompt references                                    │
│ • NLU patterns                                         │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ src/prompts/templates/{category}.js                    │
│ • System prompt templates                              │
│ • User prompt functions                                │
│ • Context-aware prompt building                        │
│ • Organized by functional category                     │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ src/services/intentMapper.js                           │
│ • Intent validation                                    │
│ • Configuration retrieval                              │
│ • Prompt building                                      │
│ • Data validation                                      │
│ • Tool mapping                                         │
│ • Utility functions                                    │
│ • Fallback handling                                    │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│ src/workflows/bankingChatWorkflow.js                   │
│ • Uses intentMapper service                            │
│ • Orchestrates conversation flow                       │
│ • Manages state and context                            │
│ • Executes tools                                       │
│ • Generates responses                                  │
└────────────────────────────────────────────────────────┘
```

---

This architecture provides:
✅ Clear separation of concerns
✅ Easy maintenance and extensibility  
✅ Centralized configuration
✅ Modular prompt organization
✅ Automatic validation
✅ Scalable design
