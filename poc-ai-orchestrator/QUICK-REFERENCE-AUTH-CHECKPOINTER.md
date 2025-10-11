# Quick Reference: Authentication & Checkpointer Updates

## 🔑 Key Changes Summary

### 1. User Authentication is Assumed
- ✅ All users are **already authenticated** before reaching orchestrator
- ✅ `userId` is **required** in every API call
- ✅ No identity verification in prompts or workflows

### 2. LangGraph Checkpointer Enabled
- ✅ Automatic state persistence using `sessionId` as `thread_id`
- ✅ Conversations resume seamlessly across multiple requests
- ✅ Human-in-the-loop workflows maintain state

## 📝 API Usage

### Making a Request

```javascript
// POST /api/orchestrator/process
const response = await fetch('/api/orchestrator/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sessionId: 'session-123',           // Required: Unique per conversation
    userId: 'user-456',                 // Required: From authenticated session
    intent: 'balance_inquiry',          // Required: Detected intent
    question: 'What is my balance?',    // Required: User's question
    metadata: {}                        // Optional: Additional context
  })
});
```

### Response Format

```javascript
{
  "success": true,
  "sessionId": "session-123",
  "type": "complete",                   // or "human_input_required" or "confirmation_required"
  "response": "Your balance is...",     // For complete responses
  "needsHumanInput": false,             // true if waiting for user input
  "currentStep": "generate_response"
}
```

## 🎯 Intent-Specific Changes

### Balance Inquiry
**Before:** Required userId, asked to confirm identity
**Now:** Only needs question, userId from session

```javascript
// Old requiredData
requiredData: ['userId']

// New requiredData
requiredData: []  // Empty! userId from authenticated session
```

### Transaction History
**Before:** Required userId and timeframe
**Now:** Timeframe optional (defaults to 30 days)

```javascript
// Old requiredData
requiredData: ['userId', 'timeframe']

// New requiredData
requiredData: []
optionalData: ['timeframe', 'transactionType']
```

### Fund Transfer
**Before:** Required userId, recipient, amount
**Now:** Only requires recipient and amount

```javascript
// Old requiredData
requiredData: ['userId', 'recipient', 'amount']

// New requiredData
requiredData: ['recipient', 'amount']
optionalData: ['purpose', 'memo']
```

### Card Management
**Before:** Required userId and cardAction
**Now:** Only requires cardAction

```javascript
// Old requiredData
requiredData: ['userId', 'cardAction']

// New requiredData
requiredData: ['cardAction']
optionalData: ['cardId', 'reason']
```

### Dispute Transaction
**Before:** Required userId, transactionId, reason
**Now:** Only requires transactionId and reason

```javascript
// Old requiredData
requiredData: ['userId', 'transactionId', 'reason']

// New requiredData
requiredData: ['transactionId', 'reason']
optionalData: ['description', 'evidence']
```

## 🔄 Checkpointer Behavior

### How It Works

```javascript
// First request - creates checkpoint
POST /api/orchestrator/process
{
  "sessionId": "session-123",
  "userId": "user-456",
  "intent": "transfer_funds",
  "question": "Transfer $100 to John"
}

// Response - needs confirmation
{
  "success": true,
  "needsHumanInput": true,
  "type": "confirmation_required",
  "question": "Are you sure you want to transfer $100 to John?"
}

// Second request - resumes from checkpoint
POST /api/orchestrator/feedback
{
  "sessionId": "session-123",  // Same sessionId!
  "response": "yes",
  "confirmed": true
}

// Workflow automatically resumes from checkpoint
// No need to repeat intent, question, or context
```

### Session Continuity

The checkpointer ensures:
- ✅ State persists across requests
- ✅ No need to repeat context
- ✅ Conversation history maintained
- ✅ Tool results remembered

## 🏗️ Architecture

### Two-Layer Persistence

```
┌─────────────────────────────────────────┐
│         Frontend Request                │
│  { sessionId, userId, intent, ... }    │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│        Orchestrator Routes              │
│  • Validates userId required            │
│  • Forwards to WorkflowService          │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│        Workflow Service                 │
│  • Creates/gets session                 │
│  • Passes userId to workflow            │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        ▼                   ▼
┌──────────────┐   ┌──────────────────┐
│ SessionManager│   │ LangGraph        │
│ (Database)   │   │ Checkpointer     │
│              │   │ (Memory/DB)      │
│ • User data  │   │ • Workflow state │
│ • Audit log  │   │ • Step tracking  │
│ • Metadata   │   │ • Resumption     │
└──────────────┘   └──────────────────┘
```

## 📦 Files Modified

1. **`src/prompts/intentPrompts.js`**
   - Removed userId from requiredData
   - Updated all system prompts
   - Added userId to context

2. **`src/routes/orchestrator.routes.js`**
   - Made userId required
   - Updated documentation

3. **`src/utils/checkpointer.js`** (NEW)
   - Checkpointer management
   - MemorySaver configuration

4. **`src/workflows/bankingChatWorkflow.js`**
   - Added userId to state
   - Integrated checkpointer
   - Updated execute() method

5. **`src/services/workflowService.js`**
   - Pass userId to workflow
   - Enhanced context

6. **`src/services/sessionManager.js`**
   - Enforce userId requirement
   - Document dual persistence

## 🧪 Testing Checklist

### ✅ Authentication Tests
```bash
# Test missing userId (should fail)
curl -X POST http://localhost:3000/api/orchestrator/process \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","intent":"balance_inquiry","question":"Balance?"}'

# Test with userId (should work)
curl -X POST http://localhost:3000/api/orchestrator/process \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","userId":"user123","intent":"balance_inquiry","question":"Balance?"}'
```

### ✅ Checkpointer Tests
```javascript
// Test 1: Create session with checkpoint
const session1 = await fetch('/api/orchestrator/process', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: 'test-checkpoint',
    userId: 'user123',
    intent: 'transfer_funds',
    question: 'Send $50 to Alice'
  })
});

// Test 2: Resume from checkpoint
const session2 = await fetch('/api/orchestrator/feedback', {
  method: 'POST',
  body: JSON.stringify({
    sessionId: 'test-checkpoint',  // Same session!
    response: 'yes',
    confirmed: true
  })
});
```

## 🚀 Deployment Notes

### Development
- Uses `MemorySaver` (in-memory)
- Checkpoints lost on restart
- Perfect for testing

### Production
- Upgrade to `PostgresSaver`
- Persistent checkpoints
- Survives restarts

```javascript
// Production setup (future)
const { PostgresSaver } = require('@langchain/langgraph-checkpoint-postgres');
const checkpointer = await PostgresSaver.fromConnString(DATABASE_URL);
```

## ❓ Common Issues

### Issue: "userId is required" error
**Solution:** Ensure userId is included in request body from authenticated session

### Issue: Conversation doesn't remember context
**Solution:** Use the same sessionId for all requests in the conversation

### Issue: Checkpointer not working
**Solution:** Check `CHECKPOINT_ENABLED=true` in environment variables

## 📚 Additional Resources

- Full documentation: `AUTHENTICATION-CHECKPOINTER-REVISIONS.md`
- LangGraph docs: https://langchain-ai.github.io/langgraph/
- MCP Protocol: `README-MCP.md`
