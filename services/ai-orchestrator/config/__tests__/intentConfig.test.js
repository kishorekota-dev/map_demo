/**
 * Intent configuration consistency + prompt-resolution contract tests.
 * These would have caught the dead-prompt prefix bug and the missing-intent
 * config gaps. Dependency-free (no winston/db), so they run anywhere.
 */
const path = require('path');
const intentConfig = require('../intentConfig');

// Recreate the flat ALL_PROMPTS map exactly as intentMapper does, without
// pulling in the winston logger.
const templatesDir = path.join(__dirname, '..', '..', 'src', 'prompts', 'templates');
const ALL_PROMPTS = {
  ...require(path.join(templatesDir, 'account')),
  ...require(path.join(templatesDir, 'transaction')),
  ...require(path.join(templatesDir, 'card')),
  ...require(path.join(templatesDir, 'security')),
  ...require(path.join(templatesDir, 'support'))
};

describe('intentConfig consistency', () => {
  test('configuration is internally consistent', () => {
    expect(intentConfig.validateConfigConsistency()).toEqual([]);
  });

  test('every categorized intent has all five config blocks', () => {
    const categorized = Object.values(intentConfig.INTENT_CATEGORIES).flat();
    for (const intent of categorized) {
      expect(intentConfig.INTENT_METADATA[intent]).toBeDefined();
      expect(intentConfig.INTENT_BEHAVIOR[intent]).toBeDefined();
      expect(intentConfig.INTENT_DATA_REQUIREMENTS[intent]).toBeDefined();
      expect(intentConfig.INTENT_TOOL_MAPPING[intent]).toBeDefined();
      expect(intentConfig.INTENT_PROMPTS[intent]).toBeDefined();
    }
  });

  test('every intent prompt template resolves in ALL_PROMPTS (no dead prompts)', () => {
    const unresolved = [];
    for (const [intent, p] of Object.entries(intentConfig.INTENT_PROMPTS)) {
      if (!ALL_PROMPTS[p.systemPromptTemplate]) unresolved.push(`${intent}:${p.systemPromptTemplate}`);
      if (!ALL_PROMPTS[p.userPromptTemplate]) unresolved.push(`${intent}:${p.userPromptTemplate}`);
    }
    expect(unresolved).toEqual([]);
  });

  test('every mapped tool is in the canonical banking-tool contract', () => {
    const canonical = new Set(intentConfig.CANONICAL_BANKING_TOOLS);
    for (const [intent, tools] of Object.entries(intentConfig.INTENT_TOOL_MAPPING)) {
      for (const tool of tools) {
        expect({ intent, tool, known: canonical.has(tool) }).toEqual({ intent, tool, known: true });
      }
    }
  });

  test('isValidIntent accepts the full canonical vocabulary', () => {
    const intents = intentConfig.getAllIntents();
    expect(intents.length).toBeGreaterThanOrEqual(16);
    for (const intent of intents) {
      expect(intentConfig.isValidIntent(intent)).toBe(true);
    }
  });
});
