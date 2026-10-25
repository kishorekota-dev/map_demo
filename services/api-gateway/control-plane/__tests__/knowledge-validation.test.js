const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { randomBytes, randomUUID } = require('crypto');
const { createControlPlaneRouter } = require('..');
const { ControlPlaneStore } = require('../store');
const { PostgresControlPlaneStore } = require('../postgres-store');
const { validateKnowledgeDocument } = require('../../operations/knowledgeValidation');

const databaseUrl = process.env.TEST_CONTROL_PLANE_DATABASE_URL;
const document = (id, overrides = {}) => ({ id, title: 'Support policy', content: 'Replacement requests are reviewed during business hours.',
  source: 'Approved support manual', allowedRoles: ['customer'], expiresAt: null, status: 'published', ...overrides });
const cardLike = Array(16).fill('7').join(' ');
const ssnLike = [3, 2, 4].map(length => '2'.repeat(length)).join('-');

describe.each(['memory', ...(databaseUrl ? ['postgres'] : [])])('%s knowledge publication and retrieval validation', kind => {
  let store; let router; let app; let key;
  const call = (method, path, body, role = 'admin') => request(app)[method](path)
    .set('Authorization', `Bearer ${jwt.sign({ userId: 'operator', role, tenantId: store.tenantId, type: 'access' }, key, { expiresIn: '10m' })}`).send(body);
  beforeEach(() => {
    key = randomBytes(32).toString('hex');
    const options = { tenantId: `knowledge-${randomUUID()}`, file: null, databaseUrl };
    store = kind === 'postgres' ? new PostgresControlPlaneStore(options) : new ControlPlaneStore(options);
    router = createControlPlaneRouter({ store, jwtSecret: key });
    app = express(); app.use(express.json()); app.use(router);
  });
  afterEach(async () => {
    if (kind === 'postgres') await store.pool.query('DELETE FROM servicing_control_plane_state WHERE tenant_id=$1', [store.tenantId]);
    await router.close();
  });

  test('manual authoring rejects sensitive text, inadequate content and unsafe provenance without changing a release', async () => {
    const invalid = [
      { content: 'Too short.' }, { content: 'Contact fixture@example.invalid for support information.' },
      { content: `Do not publish this identifier ${cardLike}.` }, { content: `Do not publish this identifier ${ssnLike}.` },
      { content: `Do not publish this identifier ${cardLike.replace(/\d/g, digit => String.fromCharCode(digit.charCodeAt(0) + 0xfee0))}.` },
      { title: 'Contact fixture@example.invalid' }, { source: 'fixture@example.invalid' },
      { source: ' unknown ' }, { source: 'javascript:alert(1)' }, { source: 'https://user@example.invalid/help' }, { version: 0 },
    ];
    for (const overrides of invalid) await call('put', '/studio/knowledge/policy', { revision: 1, document: document('policy', overrides) }).expect(400);
    expect((await store.read()).revision).toBe(1);
    expect((await store.listRecords('knowledge')).total).toBe(0);
    const saved = await call('put', '/studio/knowledge/policy', { revision: 1, document: document('policy') }).expect(200);
    expect(saved.body.knowledge[0]).toMatchObject({ id: 'policy', version: 1, publishedVersion: 1 });
    const found = await call('post', '/runtime/knowledge/search', { query: 'replacement' }, 'customer').expect(200);
    expect(found.body.matches.map(({ id, version }) => ({ id, version }))).toEqual([{ id: 'policy', version: 1 }]);
  });

  test('invalid or duplicate imports are atomic and supplied labels cannot replace internal revisions', async () => {
    await call('post', '/studio/knowledge/import', { revision: 1, documents: [document('safe'), document('invalid', { source: 'unknown' })] }).expect(400);
    await call('post', '/studio/knowledge/import', { revision: 1, documents: [document('same'), document('same')] }).expect(400);
    expect((await store.listRecords('knowledge')).total).toBe(0);
    expect((await store.read()).revision).toBe(1);
    await call('post', '/studio/knowledge/import', { revision: 1, documents: [document('safe', { version: 'source-label' })] }).expect(200);
    expect((await store.getRecord('knowledge_published', 'safe')).version).toBe(1);
    await call('put', '/studio/knowledge/safe', { revision: 2, document: document('safe', { version: 'source-label', status: 'draft' }) }).expect(200);
    expect((await store.getRecord('knowledge', 'safe')).version).toBe(2);
    expect((await store.getRecord('knowledge_published', 'safe')).version).toBe(1);
  });

  test('unsafe historical published records never become answer sources', async () => {
    const legacy = [document('valid', { version: 1 }), document('missing-version'), document('invalid-version', { version: 'source-label' }),
      document('unknown-source', { version: 1, source: 'UNKNOWN' }), document('sensitive-title', { version: 1, title: 'fixture@example.invalid' }),
      document('sensitive-content', { version: 1, content: `Replacement information contains ${cardLike}.` }),
      document('invalid-access', { version: 1, allowedRoles: null })];
    await store.update(1, 'system', 'test.seed', async (_state, records) => {
      for (const item of legacy) await records.put('knowledge_published', item.id, item);
      await records.put('knowledge_published', 'aliased-id', legacy[0]);
    });
    const found = await call('post', '/runtime/knowledge/search', { query: 'replacement', limit: 10 }, 'customer').expect(200);
    expect(found.body.matches.map(item => item.id)).toEqual(['valid']);
    expect(found.body.grounded).toBe(true);
    await store.update(2, 'system', 'test.withdraw', async (_state, records) => {
      await records.put('knowledge_published', 'valid', { ...legacy[0], status: 'archived' });
    });
    const empty = await call('post', '/runtime/knowledge/search', { query: 'replacement', limit: 10 }, 'customer').expect(200);
    expect(empty.body.matches.map(item => item.id)).toEqual([]);
    expect(empty.body.grounded).toBe(false);
  });

  test('publication authorization remains required after validation', async () => {
    await request(app).post('/studio/knowledge/import').send({ revision: 1, documents: [document('policy')] }).expect(401);
    await call('post', '/studio/knowledge/import', { revision: 1, documents: [document('policy')] }, 'control_plane_editor').expect(403);
    await call('post', '/studio/knowledge/import', { revision: 1, documents: [document('policy', { status: 'draft' })] }, 'control_plane_editor').expect(200);
    expect((await call('post', '/runtime/knowledge/search', { query: 'replacement' }, 'customer')).body.matches.map(item => item.id)).toEqual([]);
  });
});

test('answer-source validation requires the server-assigned version while draft input remains compatible', () => {
  expect(validateKnowledgeDocument(document('draft')).valid).toBe(true);
  expect(validateKnowledgeDocument(document('draft'), { requireVersion: true }).valid).toBe(false);
  expect(validateKnowledgeDocument(document('published', { version: 1 }), { requireVersion: true }).valid).toBe(true);
});
