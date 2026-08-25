/**
 * Intent configuration consistency + prompt-resolution contract tests.
 * These would have caught the dead-prompt prefix bug and the missing-intent
 * config gaps. Dependency-free (no winston/db), so they run anywhere.
 */
const path = require('path');
const intentConfig = require('../intentConfig');
const CompleteBankingTools = require(path.join(
  __dirname, '..', '..', '..', 'mcp-service', 'src', 'tools', 'completeBankingTools'
));

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

  test('required fields and enums match the executable MCP schemas', () => {
    const bankingTools = new CompleteBankingTools('http://banking.local/api/v1');
    const schemas = Object.fromEntries(
      bankingTools.getToolDefinitions().map(tool => [tool.name, tool.inputSchema])
    );
    const withoutAuth = fields => fields.filter(field => field !== 'authToken');

    expect(intentConfig.INTENT_DATA_REQUIREMENTS.transfer_funds.required)
      .toEqual(withoutAuth(schemas.banking_create_transfer.required));
    expect(intentConfig.INTENT_DATA_REQUIREMENTS.account_statement.required)
      .toEqual(withoutAuth(schemas.banking_get_account_statement.required));
    expect(intentConfig.INTENT_DATA_REQUIREMENTS.dispute_transaction.required)
      .toEqual(withoutAuth(schemas.banking_create_dispute.required));
    expect(intentConfig.INTENT_DATA_REQUIREMENTS.report_fraud.validation.fraudType.values)
      .toEqual(schemas.banking_create_fraud_alert.properties.alertType.enum);
    expect(intentConfig.INTENT_DATA_REQUIREMENTS.card_replacement.validation.reason.values)
      .toEqual(schemas.banking_replace_card.properties.reason.enum);
    expect([...intentConfig.INTENT_DATA_REQUIREMENTS.card_management.validation.reason.values].sort())
      .toEqual([...new Set([
        ...schemas.banking_block_card.properties.reason.enum,
        ...schemas.banking_replace_card.properties.reason.enum
      ])].sort());
    expect(intentConfig.INTENT_DATA_REQUIREMENTS.check_fraud_alerts.validation.status.values)
      .toEqual(schemas.banking_get_fraud_alerts.properties.status.enum);
    expect(intentConfig.INTENT_DATA_REQUIREMENTS.check_fraud_alerts.validation.severity.values)
      .toEqual(schemas.banking_get_fraud_alerts.properties.severity.enum);

    expect(bankingTools.validateParameters({
      inputSchema: schemas.banking_get_fraud_alerts
    }, {
      authToken: 'token',
      ...intentConfig.INTENT_DATA_REQUIREMENTS.check_fraud_alerts.defaults
    })).toEqual({ valid: true, errors: [] });
  });
});
