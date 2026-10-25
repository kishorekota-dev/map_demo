const { randomUUID } = require('crypto');
const { PostgresControlPlaneStore } = require('../postgres-store');
const { initialState } = require('../store');

describe('PostgreSQL transaction contract', () => {
  const mockStore = (row = initialState('tenant-a', 'Tenant A')) => {
    const client = {
      query: jest.fn(async (sql) => {
        if (sql.startsWith('SELECT revision')) return { rows: [{ revision: row.revision, state: row }] };
        if (sql.startsWith('UPDATE')) return { rowCount: 1 };
        return { rows: [] };
      }),
      release: jest.fn()
    };
    const pool = { connect: jest.fn().mockResolvedValue(client), end: jest.fn() };
    const store = new PostgresControlPlaneStore({ pool, tenantId: 'tenant-a' });
    store.ready = Promise.resolve();
    return { store, client };
  };
  test('locks the authenticated tenant row and commits state/revision/audit atomically', async () => {
    const { store, client } = mockStore();
    const result = await store.update(1, 'operator-a', 'draft.updated', (state) => { state.draft.channels[0].name = 'New name'; });
    expect(result.revision).toBe(2);
    expect(result.audit[0]).toMatchObject({ actor: 'operator-a', tenantId: 'tenant-a', revision: 2 });
    expect(client.query.mock.calls[0]).toEqual(['BEGIN']);
    expect(client.query.mock.calls[1]).toEqual(['SELECT revision, state FROM servicing_control_plane_state WHERE tenant_id = $1 FOR UPDATE', ['tenant-a']]);
    expect(client.query.mock.calls[2][1][0]).toBe('tenant-a');
    expect(client.query.mock.calls[2][1][3]).toBe(1);
    expect(client.query.mock.calls[3]).toEqual(['COMMIT']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
  test('rejects stale revision inside the transaction and releases its lock', async () => {
    const { store, client } = mockStore();
    await expect(store.update(2, 'operator-a', 'draft.updated', () => {})).rejects.toMatchObject({ status: 409 });
    expect(client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
  test('rolls back failed mutations without an audit write', async () => {
    const { store, client } = mockStore();
    await expect(store.update(1, 'operator-a', 'draft.updated', () => { throw new Error('validation failed'); })).rejects.toThrow('validation failed');
    expect(client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
  test('rejects stored state for a different tenant even if the database returns it', async () => {
    const { store, client } = mockStore(initialState('tenant-b', 'Tenant B'));
    await expect(store.update(1, 'operator-a', 'draft.updated', () => {})).rejects.toThrow('tenant mismatch');
    expect(client.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
  });
});

const databaseUrl = process.env.TEST_CONTROL_PLANE_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('PostgreSQL live persistence and replica isolation', () => {
  const tenantId = `control-plane-test-${randomUUID()}`;
  const otherTenant = `${tenantId}-other`;
  let first;
  let second;
  let other;
  beforeAll(async () => {
    first = new PostgresControlPlaneStore({ databaseUrl, tenantId });
    second = new PostgresControlPlaneStore({ databaseUrl, tenantId });
    other = new PostgresControlPlaneStore({ databaseUrl, tenantId: otherTenant });
    await Promise.all([first.read(), second.read(), other.read()]);
  });
  afterAll(async () => {
    if (first) await first.pool.query('DELETE FROM servicing_control_plane_state WHERE tenant_id = ANY($1::text[])', [[tenantId, otherTenant]]);
    await Promise.all([first?.close(), second?.close(), other?.close()]);
  });
  test('concurrent replicas preserve a single winner and reject the stale edit', async () => {
    const results = await Promise.allSettled([
      first.update(1, 'editor-a', 'draft.updated', (state) => { state.draft.channels[0].name = 'Replica A'; }),
      second.update(1, 'editor-b', 'draft.updated', (state) => { state.draft.channels[0].name = 'Replica B'; })
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason.status).toBe(409);
    const current = await first.read();
    expect(current.revision).toBe(2);
    expect(current.audit).toHaveLength(1);
    expect(await second.read()).toEqual(current);
  });
  test('restores committed state using a fresh adapter and separates deployment tenants', async () => {
    const fresh = new PostgresControlPlaneStore({ databaseUrl, tenantId });
    try {
      expect(await fresh.read()).toEqual(await first.read());
      const isolated = await other.read();
      expect(isolated.tenant.id).toBe(otherTenant);
      expect(isolated.revision).toBe(1);
      expect(isolated.audit).toHaveLength(0);
      expect(isolated.draft.channels[0].name).toBe('Digital');
    } finally { await fresh.close(); }
  });
  test('a failed mutation rolls back both configuration and audit in PostgreSQL', async () => {
    const previous = await first.read();
    await expect(first.update(previous.revision, 'editor-a', 'draft.updated', (state) => {
      state.draft.channels[0].name = 'Must not be committed';
      throw new Error('intent validation rejected');
    })).rejects.toThrow('intent validation rejected');
    expect(await second.read()).toEqual(previous);
  });
});
