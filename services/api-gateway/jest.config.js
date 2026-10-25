module.exports = {
  // PostgreSQL suites deliberately share schema objects. Serialize their DDL
  // initialization; individual suites still exercise concurrent workers/replicas.
  ...(process.env.TEST_OPERATIONS_DATABASE_URL || process.env.TEST_CONTROL_PLANE_DATABASE_URL ? { maxWorkers: 1 } : {}),
  setupFilesAfterEnv: ['<rootDir>/test/setupLoopback.js']
};
