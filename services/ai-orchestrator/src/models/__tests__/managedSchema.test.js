const { manageSchema, initializeModelSchema, verifyModelSchema } = require('../schema');
test('production defaults to verification only and invalid flags fail startup', async () => {
  expect(manageSchema({ NODE_ENV: 'production' })).toBe(false);
  expect(manageSchema({ NODE_ENV: 'development' })).toBe(true);
  expect(() => manageSchema({ DATABASE_MANAGE_SCHEMA: 'yes' })).toThrow('true or false');
  const database = { sync: jest.fn(), models: { Session: { getTableName: () => 'sessions', rawAttributes: { id: { field: 'id' } } } }, getQueryInterface: () => ({ describeTable: async () => ({ id: {} }) }) };
  await initializeModelSchema(database, { NODE_ENV: 'production' }); expect(database.sync).not.toHaveBeenCalled();
  database.getQueryInterface = () => ({ describeTable: async () => ({}) });
  await expect(initializeModelSchema(database, { DATABASE_MANAGE_SCHEMA: 'false' })).rejects.toThrow('columns missing');
  expect(database.sync).not.toHaveBeenCalled();
});

const postgres = process.env.RUNTIME_TEST_DATABASE_URL ? describe : describe.skip;
postgres('controlled AI model and ledger SQL', () => {
  let database, schema, models;
  beforeAll(async () => {
    const { Sequelize } = require('sequelize');
    database = new Sequelize(process.env.RUNTIME_TEST_DATABASE_URL, { logging: false, pool: { max: 1, min: 0 } });
    schema = 'ai_schema_' + require('crypto').randomUUID().replaceAll('-', '');
    await database.query(`CREATE SCHEMA "${schema}"`);
    await database.query(`SET search_path TO "${schema}"`);
    models = require('..');
  });
  afterAll(async () => { if (database) { await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await database.close(); } await models?.sequelize.close(); });
  test('migrations repeat, match all model columns, and upgrade the older operation ledger', async () => {
    const fs = require('fs'); const path = require('path');
    const files = ['V0__ai_model_tables.sql', 'V1__servicing_tool_operations.sql'].map(file => fs.readFileSync(path.resolve(__dirname, '../../../migrations', file), 'utf8'));
    await database.query(`CREATE TABLE servicing_tool_operations (operation_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, session_id TEXT NOT NULL, tool TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('dispatched','succeeded','reconciliation_required')), result JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
    await database.query("INSERT INTO servicing_tool_operations(operation_id,tenant_id,session_id,tool,request_hash,status) VALUES('retained','t','s','tool','hash','dispatched')");
    for (let repeat = 0; repeat < 2; repeat++) for (const sql of files) await database.query(sql);
    const selected = [models.Session, models.WorkflowExecution, models.HumanFeedback].map(model => { const scoped = model.schema(schema); scoped.sequelize = database; return scoped; });
    await verifyModelSchema({ models: selected, getQueryInterface: () => database.getQueryInterface() });
    const session = await selected[0].create({ userId: 'schema-user', sessionId: 'schema-session' });
    expect(session.userId).toBe('schema-user');
    const [rows] = await database.query("UPDATE servicing_tool_operations SET status='failed',resolution='{}',context='{}' WHERE operation_id='retained' RETURNING status");
    expect(rows[0].status).toBe('failed');
    await database.query('ALTER TABLE ai_sessions DROP COLUMN collected_data');
    await expect(verifyModelSchema({ models: selected, getQueryInterface: () => database.getQueryInterface() })).rejects.toThrow('collected_data');
  });
});
