const fs = require('fs');
const path = require('path');

jest.mock('../database', () => {
  const { Sequelize } = require('sequelize');
  return new Sequelize('ai_orchestrator', 'test', 'test', {
    dialect: 'postgres',
    logging: false
  });
});

const {
  sequelize,
  Session,
  WorkflowExecution,
  HumanFeedback
} = require('..');

const bootstrapPath = path.resolve(
  __dirname,
  '../../../../..',
  'scripts/init-ai-orchestrator-db.sql'
);
const bootstrapSql = fs.readFileSync(bootstrapPath, 'utf8');

const contracts = [
  {
    model: Session,
    table: 'ai_sessions',
    columns: [
      'id', 'user_id', 'session_id', 'status', 'intent', 'current_step',
      'workflow_state', 'conversation_history', 'collected_data',
      'required_data', 'metadata', 'expires_at', 'last_activity_at',
      'created_at', 'updated_at'
    ]
  },
  {
    model: WorkflowExecution,
    table: 'ai_workflow_executions',
    columns: [
      'id', 'session_id', 'execution_id', 'intent', 'input', 'output',
      'status', 'current_node', 'execution_path', 'checkpoints', 'error',
      'metrics', 'started_at', 'completed_at', 'created_at', 'updated_at'
    ]
  },
  {
    model: HumanFeedback,
    table: 'ai_human_feedback',
    columns: [
      'id', 'session_id', 'execution_id', 'feedback_type', 'question',
      'required_fields', 'context', 'response', 'status', 'expires_at',
      'responded_at', 'created_at', 'updated_at'
    ]
  }
];

describe('AI persistence schema contract', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  test.each(contracts)('$table model and bootstrap use the same physical columns', ({ model, table, columns }) => {
    expect(model.getTableName()).toBe(table);

    const modelColumns = Object.values(model.rawAttributes).map(attribute => attribute.field);
    expect(new Set(modelColumns)).toEqual(new Set(columns));

    for (const index of model.options.indexes) {
      for (const field of index.fields) {
        expect(columns).toContain(typeof field === 'string' ? field : field.name);
      }
    }

    const tableDefinition = bootstrapSql.match(
      new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`)
    );
    expect(tableDefinition).not.toBeNull();

    for (const column of columns) {
      expect(tableDefinition[1]).toMatch(new RegExp(`^\\s*${column}\\s`, 'm'));
    }
  });

  test('uses compatible string business keys for cross-table relationships', () => {
    expect(bootstrapSql).toMatch(
      /CREATE TABLE IF NOT EXISTS ai_workflow_executions[\s\S]*?session_id VARCHAR\(255\)[\s\S]*?REFERENCES ai_sessions\(session_id\)/
    );
    expect(bootstrapSql).toMatch(
      /CREATE TABLE IF NOT EXISTS ai_human_feedback[\s\S]*?execution_id VARCHAR\(255\)[\s\S]*?REFERENCES ai_workflow_executions\(execution_id\)/
    );
  });

  test('leaves legacy tables unused and makes bootstrap DDL repeatable', () => {
    expect(contracts.map(({ table }) => table)).not.toContain('sessions');
    expect(bootstrapSql.match(/CREATE TABLE IF NOT EXISTS ai_/g)).toHaveLength(3);
    expect(bootstrapSql).toContain('CREATE INDEX IF NOT EXISTS');
    expect(bootstrapSql).toContain('DROP TRIGGER IF EXISTS');
  });
});
