# AI Orchestrator - Authentication & Checkpointer Revisions

## Overview
This document summarizes the revisions made to the AI Orchestrator to reflect that users are already authenticated and to implement LangGraph checkpointer for proper state management.

## Changes Made

### 1. Intent Prompts Revision (`src/prompts/intentPrompts.js`)

**Key Changes:**
- ✅ Removed all references to "confirm identity" or "verify user"
- ✅ Updated all system prompts to state: "The user is already authenticated and their identity is verified"
- ✅ Added `userId` to context in user prompts for all intents
- ✅ Removed `userId` from `requiredData` arrays (it's always available from authenticated session)

**Updated Intents:**
- `balance_inquiry` - No longer requires userId as requiredData
- `transaction_history` - Removed userId requirement, made timeframe optional with defaults
- `transfer_funds` - Focus on transaction details, not identity verification
- `card_management` - Removed userId from required data
- `dispute_transaction` - Removed userId from required data
- `general_inquiry` - Already had no auth requirements
- `account_info` - Removed userId from required data

**Example Before:**
```javascript
requiredData: ['userId', 'transactionId'],
system: `Your role is to:
1. Confirm the user's identity if needed
2. Retrieve transaction history...`
```

**Example After:**
```javascript
requiredData: ['transactionId'], // userId removed
system: `The user is already authenticated and their identity is verified.
Your role is to:
1. Retrieve transaction history using available tools...`
```

### 2. Orchestrator Routes Update (`src/routes/orchestrator.routes.js`)

**Key Changes:**
- ✅ Made `userId` **required** in `/process` endpoint (was optional)
- ✅ Updated validation to enforce userId presence
- ✅ Added clear documentation explaining userId comes from authenticated session

**Updated Validation:**
```javascript
body('userId').notEmpty().withMessage('User ID is required (from authenticated session)')
```

**Route Documentation:**
```javascript
/**
 * POST /api/orchestrator/process
 * Process a message through the AI orchestrator workflow
 * 
 * The user must be authenticated and userId is required.
 * This endpoint receives userId from the authenticated session via the client.
 */
```

### 3. LangGraph Checkpointer Implementation

#### 3.1 New Checkpointer Utility (`src/utils/checkpointer.js`)

**Created comprehensive checkpointer management:**
- ✅ Singleton pattern for checkpointer instance
- ✅ Uses LangGraph's `MemorySaver` for in-memory state persistence
- ✅ Configurable enable/disable via environment variables
- ✅ Methods for checkpoint management:
  - `getCheckpointer()` - Get checkpointer instance
  - `getCheckpoint(threadId)` - Retrieve checkpoint for specific session
  - `clearCheckpoint(threadId)` - Clear checkpoint when session ends
  - `getCheckpointHistory(threadId)` - Get checkpoint history (future enhancement)

**Key Features:**
```javascript
// Singleton access
const { getCheckpointer } = require('./utils/checkpointer');
const checkpointerManager = getCheckpointer();

// Thread-based persistence
const checkpoint = await checkpointerManager.getCheckpoint(sessionId);
```

**Production Considerations:**
- Current: Uses `MemorySaver` (in-memory, suitable for development)
- Future: Can upgrade to `SqliteSaver` or `PostgresSaver` for production persistence

#### 3.2 Workflow Integration (`src/workflows/bankingChatWorkflow.js`)

**Key Changes:**
- ✅ Import and initialize checkpointer manager
- ✅ Added `userId` to workflow state schema
- ✅ Compile graph with checkpointer enabled
- ✅ Updated `execute()` method to use thread_id (sessionId)
- ✅ Pass userId through all workflow nodes

**Workflow Compilation with Checkpointer:**
```javascript
const checkpointer = this.checkpointerManager.getCheckpointer();
if (checkpointer) {
  return workflow.compile({ checkpointer });
} else {
  return workflow.compile();
}
```

**Execute Method with Thread ID:**
```javascript
async execute(input) {
  const config = {
    configurable: {
      thread_id: input.sessionId  // Session ID = Thread ID
    }
  };
  
  const result = await this.graph.invoke(input, config);
  return result;
}
```

**State Schema Update:**
```javascript
const graphState = {
  sessionId: null,
  userId: null,        // ← Added
  intent: null,
  question: null,
  conversationHistory: [],
  collectedData: {},
  requiredData: [],
  currentStep: 'start',
  needsHumanInput: false,
  humanInputQuestion: null,
  toolResults: {},
  finalResponse: null,
  error: null
};
```

### 4. Workflow Service Update (`src/services/workflowService.js`)

**Key Changes:**
- ✅ Pass `userId` to workflow input
- ✅ Ensure userId is always included in workflow execution context

**Updated Workflow Input:**
```javascript
const workflowInput = {
  sessionId,
  userId,              // ← Now always included
  intent,
  question,
  conversationHistory: session.conversationHistory,
  collectedData: session.collectedData,
  requiredData: session.requiredData || []
};
```

### 5. Session Manager Update (`src/services/sessionManager.js`)

**Key Changes:**
- ✅ Added comprehensive documentation explaining dual persistence model
- ✅ Made userId validation explicit and required
- ✅ Enhanced metadata to track authenticated user context
- ✅ Clarified separation of concerns between SessionManager and Checkpointer

**Dual Persistence Model:**
```javascript
/**
 * Session Manager Service
 * 
 * Note: This service handles database-level session tracking for business logic
 * and audit purposes. LangGraph's checkpointer handles workflow state persistence
 * for conversation continuity. Both work together:
 * - SessionManager: User sessions, conversation history, metadata, audit trail
 * - LangGraph Checkpointer: Workflow state, step transitions, resumption points
 */
```

**Enhanced Session Creation:**
```javascript
async createSession(userId, sessionId, intent = null, metadata = {}) {
  if (!userId) {
    throw new Error('userId is required - user must be authenticated');
  }
  
  const session = await Session.create({
    userId,
    sessionId,
    // ... other fields
    metadata: {
      ...metadata,
      createdBy: 'authenticated_user',
      authenticatedUserId: userId
    }
  });
}
```

## Architecture Benefits

### 1. Clear Authentication Model
- **Before:** Prompts asked to "confirm identity" - ambiguous and confusing
- **After:** All prompts assume authenticated user, focus on task completion

### 2. Proper State Management
- **SessionManager:** Database persistence for business logic, audit, user data
- **LangGraph Checkpointer:** Workflow state persistence for conversation flow
- **Separation of Concerns:** Each handles its domain appropriately

### 3. Session Continuity
- Uses `thread_id` (sessionId) for conversation continuity
- Workflow state automatically persists between invocations
- Human-in-the-loop flows can resume from checkpoints

### 4. Production Ready
- Current setup works for development (MemorySaver)
- Easy upgrade path to PostgresSaver for production
- Configurable via environment variables

## API Contract

### POST /api/orchestrator/process

**Required Fields:**
```json
{
  "sessionId": "string (required) - Unique session identifier",
  "userId": "string (required) - Authenticated user ID from session",
  "intent": "string (required) - Detected intent",
  "question": "string (required) - User's question/request",
  "metadata": "object (optional) - Additional context"
}
```

**Authentication:**
- Client must send userId from their authenticated session
- Server validates userId is present (frontend auth responsibility)
- All intents assume user is authenticated

## Configuration

### Environment Variables

```bash
# Enable/disable checkpointer
CHECKPOINT_ENABLED=true

# Session configuration
SESSION_TTL=1800000  # 30 minutes
```

### Upgrade to Production Persistence

To upgrade from MemorySaver to PostgreSQL persistence:

```javascript
// In src/utils/checkpointer.js
const { PostgresSaver } = require('@langchain/langgraph-checkpoint-postgres');

// Replace MemorySaver initialization
this.checkpointer = await PostgresSaver.fromConnString(
  process.env.DATABASE_URL
);
```

## Testing Recommendations

### 1. Test Authentication Flow
- Verify userId is required in all /process requests
- Test with missing userId (should return 400)
- Test with valid userId (should work)

### 2. Test Checkpointer
- Start a conversation (creates checkpoint)
- Continue conversation (restores from checkpoint)
- Verify state persistence across requests

### 3. Test Human-in-the-Loop
- Initiate transfer (workflow pauses for confirmation)
- Submit feedback (workflow resumes from checkpoint)
- Verify correct state restoration

### 4. Test Intent Prompts
- Verify no prompts ask for identity verification
- Verify userId is included in all contexts
- Test each intent with authenticated user

## Migration Notes

### For Frontend Developers
- **MUST** include userId in all /process requests
- userId should come from authenticated session (JWT, session cookie, etc.)
- No changes to intent detection or question format

### For Backend Developers
- Checkpointer is automatically enabled (configurable)
- No manual checkpoint management needed
- LangGraph handles state persistence automatically

### For DevOps
- Current setup: MemorySaver (development only)
- Production: Upgrade to PostgresSaver or SqliteSaver
- Add DATABASE_URL for PostgresSaver configuration

## Summary

✅ **Authentication:** All prompts and routes now assume authenticated users
✅ **State Management:** LangGraph checkpointer properly configured with thread_id
✅ **Session Continuity:** Conversations can span multiple requests seamlessly
✅ **Production Ready:** Clear upgrade path from MemorySaver to persistent storage
✅ **Clean Architecture:** Separation between business logic (SessionManager) and workflow state (Checkpointer)

## Next Steps

1. **Testing:** Test all intents with authenticated user flow
2. **Frontend Integration:** Update frontend to send userId in all requests
3. **Monitoring:** Add metrics for checkpointer usage and performance
4. **Production Upgrade:** Implement PostgresSaver for production deployment
