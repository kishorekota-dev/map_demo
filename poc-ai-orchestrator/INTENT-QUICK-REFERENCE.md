# Intent Configuration Quick Reference Card

## 🚀 Add New Intent in 5 Minutes

### 1️⃣ Edit `config/intentConfig.js`

```javascript
// Add to category
INTENT_CATEGORIES.YOUR_CATEGORY.push('new_intent')

// Add metadata
INTENT_METADATA.new_intent = {
  name: 'Display Name',
  category: 'YOUR_CATEGORY',
  description: 'What it does',
  requiresAuth: true,
  priority: 'normal', // normal | high | critical
  estimatedDuration: 'quick' // quick | medium | long
}

// Add behavior
INTENT_BEHAVIOR.new_intent = {
  needsConfirmation: false,
  allowsPartialData: true,
  requiresAllFields: false,
  canUseDefaults: true,
  maxRetries: 3
}

// Add data requirements
INTENT_DATA_REQUIREMENTS.new_intent = {
  required: ['field1'],
  optional: ['field2'],
  defaults: { field3: 'default' },
  validation: {
    field1: { type: 'string', minLength: 5 }
  }
}

// Map tools
INTENT_TOOL_MAPPING.new_intent = ['tool1', 'tool2']

// Link prompts
INTENT_PROMPTS.new_intent = {
  systemPromptTemplate: 'category/new_intent_system',
  userPromptTemplate: 'category/new_intent_user',
  contextFields: ['userId', 'field1', 'field2']
}

// Add NLU patterns (optional)
INTENT_PATTERNS.new_intent = [
  'trigger phrase 1',
  'trigger phrase 2'
]
```

### 2️⃣ Create Prompts in `src/prompts/templates/{category}.js`

```javascript
const PROMPTS = {
  // System prompt
  new_intent_system: `You are helping with {task}.
Your role:
1. Action 1
2. Action 2
Be {tone}.`,

  // User prompt
  new_intent_user: (context) => `User: ${context.question}
ID: ${context.userId}

Data:
${context.field1 ? `- Field1: ${context.field1}` : '- Field1: [ASK]'}

${context.result ? `✅ Done: ${context.result}` : ''}

Guide user.`
}

module.exports = PROMPTS;
```

### 3️⃣ Test

```javascript
const intentMapper = require('./src/services/intentMapper');

// Validate
intentMapper.isValidIntent('new_intent'); // true

// Test prompts
intentMapper.buildSystemMessage('new_intent');
intentMapper.buildUserMessage('new_intent', { 
  question: 'test', 
  userId: '123' 
});

// Validate data
intentMapper.validateData('new_intent', { field1: 'value' });
```

---

## 📝 Common Modifications

### Change Confirmation Requirement
```javascript
// config/intentConfig.js
INTENT_BEHAVIOR.intent_name.needsConfirmation = true
```

### Add Required Field
```javascript
// config/intentConfig.js
INTENT_DATA_REQUIREMENTS.intent_name.required.push('new_field')
```

### Add Tool
```javascript
// config/intentConfig.js
INTENT_TOOL_MAPPING.intent_name.push('new_tool')
```

### Update Prompt
```javascript
// src/prompts/templates/{category}.js
intent_name_system: `Updated prompt text...`
```

---

## 🔍 Validation Types

| Type | Config | Example |
|------|--------|---------|
| String | `{ type: 'string', minLength: 5, maxLength: 100 }` | Text fields |
| Number | `{ type: 'number', min: 0, max: 10000 }` | Amounts |
| Enum | `{ type: 'enum', values: ['a', 'b'] }` | Select options |
| Boolean | `{ type: 'boolean' }` | Yes/No |

---

## 🎯 Intent Categories

- `ACCOUNT_OPERATIONS`: Balance, statements
- `TRANSACTION_OPERATIONS`: History, transfers
- `CARD_OPERATIONS`: Block, activate, replace
- `SECURITY_OPERATIONS`: Fraud, disputes
- `SUPPORT_OPERATIONS`: Help, feedback

---

## 🛠️ IntentMapper API

```javascript
const intentMapper = require('./src/services/intentMapper');

// Validation
intentMapper.isValidIntent(intent)
intentMapper.getAllIntents()
intentMapper.getIntentsByCategory(category)

// Configuration
intentMapper.getIntentConfig(intent)
intentMapper.getIntentMetadata(intent)
intentMapper.getIntentBehavior(intent)

// Prompts
intentMapper.buildSystemMessage(intent)
intentMapper.buildUserMessage(intent, context)

// Data
intentMapper.getRequiredData(intent)
intentMapper.getOptionalData(intent)
intentMapper.validateData(intent, data)

// Tools
intentMapper.getToolsForIntent(intent)

// Behavior
intentMapper.needsConfirmation(intent)
intentMapper.requiresAuth(intent)
intentMapper.isUrgent(intent)
intentMapper.getMaxRetries(intent)
```

---

## 📂 File Structure

```
config/
  └── intentConfig.js           ← All configuration here
src/prompts/templates/
  ├── account.js                ← Account prompts
  ├── transaction.js            ← Transaction prompts
  ├── card.js                   ← Card prompts
  ├── security.js               ← Security prompts
  └── support.js                ← Support prompts
src/services/
  └── intentMapper.js           ← Mapping service (don't edit)
```

---

## ⚡ Quick Test

```bash
# Start server
npm run dev

# Test API
curl -X POST http://localhost:3000/api/orchestrator/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test",
    "question": "test question",
    "sessionId": "test-123"
  }'
```

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| Intent not found | Check spelling in all config sections |
| Prompt not loading | Verify template name in INTENT_PROMPTS |
| Validation fails | Check field types match validation rules |
| Tools not executing | Verify tool names in INTENT_TOOL_MAPPING |

**Enable Debug Logging**:
```javascript
// config/index.js
logging: { level: 'debug' }
```

---

## ✅ Pre-Deploy Checklist

- [ ] Intent in INTENT_CATEGORIES
- [ ] Metadata in INTENT_METADATA
- [ ] Behavior in INTENT_BEHAVIOR
- [ ] Data requirements in INTENT_DATA_REQUIREMENTS
- [ ] Tools in INTENT_TOOL_MAPPING
- [ ] Prompts in INTENT_PROMPTS
- [ ] Templates created in category file
- [ ] Templates exported
- [ ] Tested with intentMapper
- [ ] End-to-end API test

---

**Full Guide**: See `INTENT-SYSTEM-MAINTENANCE-GUIDE.md`
