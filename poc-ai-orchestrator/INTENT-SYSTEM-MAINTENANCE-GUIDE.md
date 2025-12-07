# Intent-Based Prompt System - Maintenance Guide

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Adding a New Intent](#adding-a-new-intent)
3. [Modifying Existing Intents](#modifying-existing-intents)
4. [Prompt Template Management](#prompt-template-management)
5. [Configuration Reference](#configuration-reference)
6. [Validation and Testing](#validation-and-testing)
7. [Troubleshooting](#troubleshooting)

---

## System Overview

The intent-based prompt system provides a centralized, maintainable way to manage conversational intents. It consists of:

### Architecture Components

```
config/
  └── intentConfig.js          # Central configuration & mapping
src/
  ├── prompts/
  │   └── templates/
  │       ├── account.js       # Account operation prompts
  │       ├── transaction.js   # Transaction prompts
  │       ├── card.js          # Card management prompts
  │       ├── security.js      # Fraud & security prompts
  │       └── support.js       # Support & help prompts
  ├── services/
  │   └── intentMapper.js      # Intent mapping service
  └── workflows/
      └── bankingChatWorkflow.js  # Main workflow (uses intentMapper)
```

### Key Features
- ✅ **Centralized Configuration**: All intent settings in one place
- ✅ **Modular Prompts**: Organized by category (account, transaction, card, security, support)
- ✅ **Easy Maintenance**: Simple steps to add/modify intents
- ✅ **Data Validation**: Built-in validation rules for each intent
- ✅ **Tool Mapping**: Automatic tool selection per intent
- ✅ **Behavior Control**: Configure confirmation, urgency, retries per intent

---

## Adding a New Intent

Follow these 5 steps to add a new intent:

### Step 1: Add Intent to Category

**File**: `config/intentConfig.js`

```javascript
const INTENT_CATEGORIES = {
  ACCOUNT_OPERATIONS: [
    'balance_inquiry',
    'account_info',
    'new_intent_here'  // ← Add your intent
  ],
  // ...
};
```

### Step 2: Define Intent Metadata

**File**: `config/intentConfig.js`

```javascript
const INTENT_METADATA = {
  // ... existing intents
  
  new_intent_name: {
    name: 'Human-Readable Intent Name',
    category: 'ACCOUNT_OPERATIONS',  // Must match category
    description: 'Brief description of intent',
    requiresAuth: true,               // Does user need to be authenticated?
    priority: 'normal',               // normal, high, critical
    estimatedDuration: 'quick'        // quick, medium, long
  }
};
```

### Step 3: Configure Intent Behavior

**File**: `config/intentConfig.js`

```javascript
const INTENT_BEHAVIOR = {
  // ... existing intents
  
  new_intent_name: {
    needsConfirmation: false,         // Require user confirmation?
    allowsPartialData: true,          // Can proceed with partial data?
    requiresAllFields: true,          // Must have all required fields?
    canUseDefaults: true,             // Can use default values?
    maxRetries: 3,                    // Max data collection attempts
    isUrgent: false,                  // Skip confirmations if urgent?
    confirmationMessage: 'Confirm...' // Optional confirmation prompt
  }
};
```

### Step 4: Define Data Requirements

**File**: `config/intentConfig.js`

```javascript
const INTENT_DATA_REQUIREMENTS = {
  // ... existing intents
  
  new_intent_name: {
    required: ['field1', 'field2'],   // Must collect these
    optional: ['field3', 'field4'],   // Nice to have
    defaults: {
      field5: 'default_value'         // Default values
    },
    validation: {
      field1: { 
        type: 'string', 
        minLength: 5, 
        maxLength: 100 
      },
      field2: { 
        type: 'number', 
        min: 0, 
        max: 10000 
      },
      field3: {
        type: 'enum',
        values: ['option1', 'option2', 'option3']
      }
    }
  }
};
```

**Validation Types**:
- `string`: Text validation (minLength, maxLength, pattern)
- `number`: Numeric validation (min, max)
- `boolean`: True/false validation
- `enum`: Allowed values list

### Step 5: Map Tools and Prompts

**File**: `config/intentConfig.js`

```javascript
// Map tools the intent can use
const INTENT_TOOL_MAPPING = {
  // ... existing intents
  
  new_intent_name: [
    'banking_tool_1',
    'banking_tool_2'
  ]
};

// Link to prompt templates
const INTENT_PROMPTS = {
  // ... existing intents
  
  new_intent_name: {
    systemPromptTemplate: 'category/intent_name_system',
    userPromptTemplate: 'category/intent_name_user',
    contextFields: ['userId', 'field1', 'field2', 'field3']
  }
};

// Optional: Add NLU patterns
const INTENT_PATTERNS = {
  // ... existing intents
  
  new_intent_name: [
    'common phrase 1',
    'common phrase 2',
    'trigger word'
  ]
};
```

### Step 6: Create Prompt Templates

**File**: `src/prompts/templates/{category}.js` (choose appropriate category)

```javascript
const CATEGORY_PROMPTS = {
  // ... existing prompts
  
  // System prompt
  intent_name_system: `You are a banking assistant helping with {task}.
The user is already authenticated and their identity is verified.

Your role is to:
1. First action
2. Second action
3. Third action

Be {tone} and {style}.`,

  // User prompt (function that builds context)
  intent_name_user: (context) => `User Question: ${context.question}

User Information:
- User ID: ${context.userId}

{Intent-Specific Data}:
${context.field1 ? `- Field 1: ${context.field1}` : '- Field 1: [REQUIRED - Ask user]'}
${context.field2 ? `- Field 2: ${context.field2}` : '- Field 2: [Optional]'}

${context.result ? `
✅ ACTION COMPLETE
Result: ${context.result}
` : ''}

Guide the user through {task}.`
};

module.exports = CATEGORY_PROMPTS;
```

### Step 7: Test Your Intent

```javascript
// Test in Node.js console or create test file
const intentMapper = require('./src/services/intentMapper');

// Validate intent exists
console.log(intentMapper.isValidIntent('new_intent_name')); // true

// Get configuration
const config = intentMapper.getIntentConfig('new_intent_name');
console.log(config);

// Test prompt generation
const systemPrompt = intentMapper.buildSystemMessage('new_intent_name');
const userPrompt = intentMapper.buildUserMessage('new_intent_name', {
  question: 'Test question',
  userId: 'user123',
  field1: 'test value'
});

console.log(systemPrompt);
console.log(userPrompt);

// Test data validation
const validation = intentMapper.validateData('new_intent_name', {
  field1: 'test',
  field2: 100
});
console.log(validation); // { valid: true/false, missing: [], invalid: [] }
```

---

## Modifying Existing Intents

### Changing Intent Behavior

**File**: `config/intentConfig.js`

```javascript
// Example: Change confirmation requirement
const INTENT_BEHAVIOR = {
  transfer_funds: {
    needsConfirmation: true,  // Change false → true
    // ... other settings
  }
};
```

### Adding Required Fields

**File**: `config/intentConfig.js`

```javascript
const INTENT_DATA_REQUIREMENTS = {
  dispute_transaction: {
    required: [
      'transactionId', 
      'disputeType', 
      'reason',
      'newField'  // ← Add new required field
    ],
    // ...
  }
};
```

### Adding Tools

**File**: `config/intentConfig.js`

```javascript
const INTENT_TOOL_MAPPING = {
  card_management: [
    'banking_get_cards',
    'banking_block_card',
    'banking_new_tool'  // ← Add new tool
  ]
};
```

### Updating Prompts

**File**: `src/prompts/templates/{category}.js`

```javascript
// Modify existing prompt
balance_inquiry_system: `You are a banking assistant helping with balance inquiries.
The user is already authenticated and their identity is verified.

Your role is to:
1. Retrieve account balance information using available tools
2. Present the balance clearly and professionally
3. NEW: Suggest savings opportunities  // ← Add new behavior
4. Offer relevant additional assistance

Be professional, concise, and helpful.`,
```

---

## Prompt Template Management

### Template Structure

Each prompt template follows this pattern:

```javascript
{
  // System prompt: Defines role and behavior
  intent_name_system: `Static system prompt text`,
  
  // User prompt: Dynamic function that builds user context
  intent_name_user: (context) => `Dynamic prompt with ${context.variables}`
}
```

### Context Variables

Common context variables available in user prompts:

```javascript
{
  question: string,      // User's original question
  userId: string,        // Authenticated user ID
  sessionId: string,     // Session identifier
  
  // Intent-specific fields (from collectedData)
  field1: any,
  field2: any,
  
  // Tool results (from toolResults)
  accountData: object,
  transactions: array,
  actionResult: object
}
```

### Conditional Display

```javascript
intent_name_user: (context) => `
${context.field ? `
✅ Field Present: ${context.field}
` : 'Field not available yet'}

${context.result ? `
SUCCESS MESSAGE
Details: ${context.result.details}
` : 'Waiting for result...'}
`
```

### Formatting Guidelines

**✅ DO**:
- Use clear, professional language
- Include specific instructions for AI
- Show required vs optional fields clearly
- Provide examples when helpful
- Use emoji sparingly for emphasis (✅ 🚨 ⚠️)

**❌ DON'T**:
- Use overly casual language
- Include sensitive data in prompts
- Make prompts too long (keep under 2000 chars)
- Use complex logic in templates

---

## Configuration Reference

### Priority Levels
- `normal`: Standard operations
- `high`: Important operations (transfers, disputes)
- `critical`: Urgent operations (fraud reporting)

### Duration Estimates
- `quick`: < 1 minute
- `medium`: 1-5 minutes
- `long`: > 5 minutes

### Validation Types

#### String Validation
```javascript
{
  type: 'string',
  minLength: 5,
  maxLength: 500,
  pattern: '^[A-Z0-9]+$'  // Regex pattern
}
```

#### Number Validation
```javascript
{
  type: 'number',
  min: 0,
  max: 10000
}
```

#### Enum Validation
```javascript
{
  type: 'enum',
  values: ['option1', 'option2', 'option3']
}
```

#### Boolean Validation
```javascript
{
  type: 'boolean'
}
```

---

## Validation and Testing

### Manual Testing

```bash
# Start development server
npm run dev

# Test intent via API
curl -X POST http://localhost:3000/api/orchestrator/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "question": "Your test question",
    "sessionId": "test-session"
  }'
```

### Validation Checklist

Before deploying changes:

- [ ] Intent exists in `INTENT_CATEGORIES`
- [ ] Metadata defined in `INTENT_METADATA`
- [ ] Behavior configured in `INTENT_BEHAVIOR`
- [ ] Data requirements in `INTENT_DATA_REQUIREMENTS`
- [ ] Tools mapped in `INTENT_TOOL_MAPPING`
- [ ] Prompts linked in `INTENT_PROMPTS`
- [ ] System prompt created in templates
- [ ] User prompt function created in templates
- [ ] Prompt templates exported from category file
- [ ] Test intent with `intentMapper.isValidIntent()`
- [ ] Test prompts with `intentMapper.buildSystemMessage()`
- [ ] Test validation with `intentMapper.validateData()`
- [ ] End-to-end test via API

### Common Validation Errors

**Error**: `Intent not found`
- Check spelling in all configuration sections
- Ensure intent is added to category

**Error**: `Prompt template not found`
- Verify template name matches in INTENT_PROMPTS
- Check template is exported from category file
- Ensure intentMapper imports template

**Error**: `Validation failed`
- Check validation rules match data types
- Verify required fields are collected
- Check enum values match exactly

---

## Troubleshooting

### Intent Not Triggering

**Check**:
1. Intent exists in `INTENT_METADATA`
2. NLU patterns defined in `INTENT_PATTERNS`
3. Category is correct
4. Intent is valid: `intentMapper.isValidIntent('intent_name')`

### Wrong Prompt Displayed

**Check**:
1. `INTENT_PROMPTS` has correct template names
2. Template names match in category files
3. Category file is properly exported
4. intentMapper imports correct category file

### Validation Errors

**Check**:
1. Field names match in all configurations
2. Validation rules match data types
3. Required fields are marked in `INTENT_DATA_REQUIREMENTS`
4. Test validation: `intentMapper.validateData(intent, data)`

### Tools Not Executing

**Check**:
1. Tools are mapped in `INTENT_TOOL_MAPPING`
2. Tool names match MCP tool definitions
3. mcpClient supports the tools
4. Test tool list: `intentMapper.getToolsForIntent(intent)`

### Debug Logging

Enable debug logging to troubleshoot:

```javascript
// In config/index.js
module.exports = {
  logging: {
    level: 'debug'  // Change from 'info' to 'debug'
  }
};
```

Check logs for:
- Intent validation messages
- Prompt retrieval logs
- Tool execution logs
- Validation result logs

---

## Quick Reference

### Adding Intent Checklist

```
1. Add to INTENT_CATEGORIES
2. Define in INTENT_METADATA
3. Configure in INTENT_BEHAVIOR
4. Set requirements in INTENT_DATA_REQUIREMENTS
5. Map tools in INTENT_TOOL_MAPPING
6. Link prompts in INTENT_PROMPTS
7. Create system prompt in templates/{category}.js
8. Create user prompt function in templates/{category}.js
9. Test with intentMapper
10. Deploy and monitor
```

### File Locations

| What | Where |
|------|-------|
| Intent config | `config/intentConfig.js` |
| Account prompts | `src/prompts/templates/account.js` |
| Transaction prompts | `src/prompts/templates/transaction.js` |
| Card prompts | `src/prompts/templates/card.js` |
| Security prompts | `src/prompts/templates/security.js` |
| Support prompts | `src/prompts/templates/support.js` |
| Intent mapper | `src/services/intentMapper.js` |
| Workflow | `src/workflows/bankingChatWorkflow.js` |

### Common Commands

```javascript
// Check if intent is valid
intentMapper.isValidIntent('intent_name')

// Get full configuration
intentMapper.getIntentConfig('intent_name')

// Get system prompt
intentMapper.buildSystemMessage('intent_name')

// Get user prompt
intentMapper.buildUserMessage('intent_name', context)

// Get required fields
intentMapper.getRequiredData('intent_name')

// Get tools
intentMapper.getToolsForIntent('intent_name')

// Validate data
intentMapper.validateData('intent_name', collectedData)

// Get all intents
intentMapper.getAllIntents()

// Get category
intentMapper.getCategoryForIntent('intent_name')
```

---

## Best Practices

### 1. **Organize by Category**
Group related intents together (account, transaction, security, etc.)

### 2. **Use Clear Names**
Intent names should be descriptive: `transfer_funds` not `transfer`

### 3. **Document Validation Rules**
Comment complex validation patterns

### 4. **Keep Prompts Concise**
Aim for < 2000 characters per prompt

### 5. **Test Thoroughly**
Always test new intents end-to-end before deploying

### 6. **Version Control**
Track all changes to configuration and prompts

### 7. **Monitor Performance**
Watch for intents with high retry rates or failures

### 8. **Update Documentation**
Keep this guide updated when adding new patterns

---

## Support

For questions or issues:
- Check logs: `logs/app.log`
- Review error messages in response
- Enable debug logging
- Test individual components with intentMapper
- Check configuration matches this guide

---

**Last Updated**: 2025-10-09
**Maintainer**: AI Orchestrator Team
