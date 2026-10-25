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
postgres('controlled chat base and grant SQL', () => {
  let database, schema, models;
  beforeAll(async () => {
    const { Sequelize } = require('sequelize');
    database = new Sequelize(process.env.RUNTIME_TEST_DATABASE_URL, { logging: false, pool: { max: 1, min: 0 } });
    schema = 'chat_schema_' + require('crypto').randomUUID().replaceAll('-', '');
    await database.query(`CREATE SCHEMA "${schema}"`); await database.query(`SET search_path TO "${schema}"`);
    models = [require('../models/ChatSession')(database).schema(schema), require('../models/ChatMessage')(database).schema(schema)];
  });
  afterAll(async () => { if (database) { await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await database.close(); } });
  test('all migrations repeat safely and support current Sequelize model round trips', async () => {
    const fs = require('fs'); const path = require('path'); const directory = path.resolve(__dirname, '../../migrations');
    const sqlFiles = fs.readdirSync(directory).filter(file => /^V[1-6]__.*\.sql$/.test(file)).sort();
    expect(sqlFiles).toHaveLength(6);
    for (let repeat = 0; repeat < 2; repeat++) for (const file of sqlFiles) await database.query(fs.readFileSync(path.join(directory, file), 'utf8'));
    await verifyModelSchema({ models, getQueryInterface: () => database.getQueryInterface() });
    const session = await models[0].create({ user_id: 'schema-user' });
    const message = await models[1].create({ session_id: session.session_id, user_id: 'schema-user', direction: 'incoming', content: 'schema-test' });
    expect(message.content).toBe('schema-test');
    expect((await models[1].findByPk(message.message_id)).session_id).toBe(session.session_id);
    await database.query('ALTER TABLE chat_messages DROP COLUMN agent_info');
    await expect(verifyModelSchema({ models, getQueryInterface: () => database.getQueryInterface() })).rejects.toThrow('agent_info');
  });
});
