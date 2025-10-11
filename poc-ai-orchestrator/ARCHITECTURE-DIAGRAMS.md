# AI Orchestrator Architecture - Authentication & Checkpointer Flow

## Request Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client Application                         │
│  • User already authenticated                                   │
│  • Has userId from session/JWT                                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ POST /api/orchestrator/process
                         │ {
                         │   sessionId: "session-123",
                         │   userId: "user-456",
                         │   intent: "balance_inquiry",
                         │   question: "What is my balance?"
                         │ }
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│               Orchestrator Route Handler                        │
│  • Validates userId is present (required)                       │
│  • Validates other required fields                              │
│  • Passes to WorkflowService                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Workflow Service                              │
│  • Gets or creates session in database                          │
│  • Builds workflow input with userId                            │
│  • Calls workflow.execute(input)                                │
└──────────────┬──────────────────────────────────┬───────────────┘
               │                                  │
               ▼                                  ▼
    ┌────────────────────┐            ┌─────────────────────────┐
    │ Session Manager    │            │  LangGraph Workflow     │
    │   (PostgreSQL)     │            │  with Checkpointer      │
    │                    │            │                         │
    │ Purpose:           │            │ Purpose:                │
    │ • User sessions    │            │ • Workflow state        │
    │ • Conversation log │            │ • Step persistence      │
    │ • Audit trail      │            │ • Auto-resume           │
    │ • Metadata         │            │ • Thread continuity     │
    │                    │            │                         │
    │ Stores:            │            │ Stores:                 │
    │ • userId           │            │ • Current step          │
    │ • sessionId        │            │ • Collected data        │
    │ • intent           │            │ • Tool results          │
    │ • status           │            │ • Conversation state    │
    │ • created/updated  │            │ • Pending actions       │
    └────────────────────┘            └─────────────────────────┘
```

## Checkpointer State Management

```
Session Start
     │
     ▼
┌──────────────────────────────────────────────────────┐
│  Request 1: "Transfer $100 to John"                  │
│  thread_id: session-123                              │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────┐
          │  Workflow Graph  │
          │                  │
          │  analyze_intent  │
          │        ↓         │
          │  check_required  │
          │        ↓         │
          │  execute_tools   │
          │        ↓         │
          │  request_confirm │ ← PAUSE HERE
          └─────────┬────────┘
                    │
                    ▼
          ┌─────────────────────┐
          │   Checkpointer      │
          │   Saves State:      │
          │   • intent          │
          │   • userId          │
          │   • collectedData   │
          │   • toolResults     │
          │   • currentStep     │
          └─────────────────────┘
                    │
                    ▼
          Response to Client:
          {
            needsHumanInput: true,
            type: "confirmation_required",
            question: "Confirm transfer?"
          }

          ⏸️  WORKFLOW PAUSED
          
          ... User reviews and responds ...
          
┌──────────────────────────────────────────────────────┐
│  Request 2: "Yes, confirm"                            │
│  thread_id: session-123 (same!)                      │
└────────────────────┬─────────────────────────────────┘
                     │
                     ▼
          ┌─────────────────────┐
          │   Checkpointer      │
          │   Loads State:      │
          │   • intent          │
          │   • userId          │
          │   • collectedData   │
          │   • toolResults     │
          │   • currentStep     │
          └─────────┬───────────┘
                    │
                    ▼
          ┌──────────────────┐
          │  Workflow Graph  │
          │                  │
          │  request_confirm │ ← RESUME HERE
          │        ↓         │
          │  generate_resp   │
          │        ↓         │
          │       END        │
          └──────────────────┘
                    │
                    ▼
          Response to Client:
          {
            type: "complete",
            response: "Transfer completed!"
          }
```

## Intent Prompt Evolution

### BEFORE (Incorrect)
```javascript
balance_inquiry: {
  system: `Your role is to:
  1. Confirm the user's identity if needed  ❌ Wrong!
  2. Retrieve account balance information
  3. Present the balance clearly`,
  
  requiredData: ['userId'],  ❌ Wrong!
}
```

### AFTER (Correct)
```javascript
balance_inquiry: {
  system: `The user is already authenticated and their identity is verified. ✅
  Your role is to:
  1. Retrieve account balance using available tools ✅
  2. Present the balance clearly ✅`,
  
  user: (context) => `User Information:
  - User ID: ${context.userId} ✅
  
  Provide a clear, helpful response.`,
  
  requiredData: [],  ✅ Empty! userId always available
}
```

## State Persistence Comparison

### Without Checkpointer ❌
```
Request 1 → Create State → Process → Return → State Lost 💥
Request 2 → Create State → Process → Return → No Context 😞
```

### With Checkpointer ✅
```
Request 1 → Create State → Process → Save Checkpoint ✅ → Return
                                           ↓
                                    [Persisted State]
                                           ↓
Request 2 → Load Checkpoint ✅ → Resume → Process → Return 😊
```

## Data Flow Example: Fund Transfer

```
1. Client Request
   ├── sessionId: "session-123"
   ├── userId: "user-456"
   ├── intent: "transfer_funds"
   └── question: "Send $100 to John"

2. Workflow Analyzes
   ├── Intent: transfer_funds
   ├── Required Data: [recipient, amount]
   └── Needs Confirmation: true

3. Workflow Collects Data
   ├── recipient: "John" ✅
   ├── amount: 100 ✅
   └── userId: "user-456" (from session) ✅

4. Workflow Requests Confirmation
   ├── Builds confirmation question
   ├── Saves checkpoint with ALL state
   └── Returns: needsHumanInput = true

5. Checkpointer Saves
   {
     thread_id: "session-123",
     state: {
       intent: "transfer_funds",
       userId: "user-456",
       collectedData: {
         recipient: "John",
         amount: 100
       },
       toolResults: {},
       currentStep: "request_confirmation"
     }
   }

6. User Confirms
   ├── sessionId: "session-123" (same!)
   └── confirmed: true

7. Checkpointer Restores
   ├── Loads complete state from checkpoint
   └── Workflow resumes at exact point

8. Workflow Completes
   ├── Executes transfer tool
   ├── Generates final response
   └── Updates checkpoint to "complete"
```

## Key Differences Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Authentication** | Prompts asked to verify | Assumes authenticated |
| **userId** | Optional parameter | Required parameter |
| **Identity Check** | In prompts | Handled before orchestrator |
| **State Persistence** | Manual in database | Automatic via checkpointer |
| **Session Continuity** | Manual tracking | Automatic via thread_id |
| **Resumption** | Manual reconstruction | Automatic from checkpoint |
| **requiredData** | Included userId | Excludes userId (always available) |

## Benefits of New Architecture

1. ✅ **Cleaner Prompts**: No identity confusion
2. ✅ **Better UX**: Conversations flow naturally
3. ✅ **Automatic State**: No manual state management
4. ✅ **Resumption**: Workflows resume automatically
5. ✅ **Type Safety**: userId always present
6. ✅ **Production Ready**: Easy upgrade to persistent storage
7. ✅ **Separation of Concerns**: Auth vs workflow state
8. ✅ **Session Continuity**: Multi-turn conversations work seamlessly
