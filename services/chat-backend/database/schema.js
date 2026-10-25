// Startup verifies the model contract without DDL when migrations are managed externally.
function manageSchema(env = process.env) {
  if (env.DATABASE_MANAGE_SCHEMA !== undefined && !['true', 'false'].includes(env.DATABASE_MANAGE_SCHEMA)) {
    throw new Error('DATABASE_MANAGE_SCHEMA must be true or false');
  }
  return env.DATABASE_MANAGE_SCHEMA === undefined ? env.NODE_ENV !== 'production' : env.DATABASE_MANAGE_SCHEMA === 'true';
}
async function verifyModelSchema(sequelize) {
  const query = sequelize.getQueryInterface();
  for (const model of Object.values(sequelize.models)) {
    const table = model.getTableName();
    let columns;
    try { columns = await query.describeTable(table); }
    catch { throw new Error(`Required database table ${typeof table === 'string' ? table : table.tableName} is unavailable; run controlled migrations before startup`); }
    const missing = Object.values(model.rawAttributes)
      .filter(attribute => attribute.type?.key !== 'VIRTUAL')
      .map(attribute => attribute.field || attribute.fieldName)
      .filter(column => !Object.hasOwn(columns, column));
    if (missing.length) throw new Error(`Required database columns missing from ${typeof table === 'string' ? table : table.tableName}: ${missing.join(', ')}; run controlled migrations before startup`);
  }
}
async function initializeModelSchema(sequelize, env = process.env) {
  if (manageSchema(env)) await sequelize.sync({ alter: false });
  await verifyModelSchema(sequelize);
}
module.exports = { manageSchema, verifyModelSchema, initializeModelSchema };
