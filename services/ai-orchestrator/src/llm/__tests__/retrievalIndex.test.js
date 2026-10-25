jest.mock('axios');
const axios = require('axios');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../../middleware/auth');
const routes = require('../routes');
const { indexStatus, buildIndex } = require('../../services/procedureRetrieval');
const { EmbeddingIndex } = require('../../services/embeddingIndex');
const { defaultConfig } = require('../../../../api-gateway/control-plane/config');

const secret = 'synthetic-retrieval-index-secret';
const token = role => jwt.sign({ userId: `user-${role}`, role, type: 'access', tenantId: 'default-enterprise' }, secret);
const app = () => { const server = express(); server.use(express.json()); server.use('/llm', authenticate, routes); return server; };
const vector = text => [text.length % 7 + 1, text.length % 5 + 1, 1];

const procedure = overrides => ({ enabled: true, audience: 'customer', intents: [], channels: ['digital'], guardrails: [], ...overrides });
const procedures = [
  procedure({ id: 'travel_notice', title: 'Set up a travel notice', source: 'SOP-20', channels: ['digital', 'ava'],
    steps: [{ id: 'step_1', instruction: 'Tell us your travel dates.' }, { id: 'step_2', instruction: 'Tell us the destination countries.' }] }),
  procedure({ id: 'wire_cutoff', title: 'Wire transfer cut-off times', source: 'SOP-31', steps: [{ id: 'step_1', instruction: 'Domestic wires before 4 PM go the same day.' }] }),
  procedure({ id: 'internal_only', title: 'Internal fraud review', source: 'SOP-90', audience: 'internal', intents: [defaultConfig().intents[0].id], steps: [{ id: 'step_1', instruction: 'Escalate to fraud operations.' }] })
];
const configWith = (retrieval = { strategy: 'hybrid', minSimilarity: 0.4 }) => ({
  ...defaultConfig(), procedures, retrieval,
  llm: { enabled: true, profiles: [{ id: 'embed', name: 'Embeddings', providerId: 'fixture', model: 'fixture-embed', temperature: 0, maxOutputTokens: 1, timeoutMs: 5000 }], routing: { embedding: 'embed' } }
});
const fakeEmbed = () => {
  const calls = [];
  return { calls, embed: async (_llm, texts, purpose, recordUsage) => {
    calls.push({ texts, purpose });
    if (recordUsage) await recordUsage({ units: texts.length * 10 });
    return { vectors: texts.map(vector) };
  } };
};

describe('index status', () => {
  test('counts eligible chunks per channel and procedure without calling the provider', async () => {
    const { embed, calls } = fakeEmbed();
    const index = new EmbeddingIndex({ embed });
    const before = await indexStatus({ config: configWith(), index });
    expect(calls).toHaveLength(0);
    expect(before).toMatchObject({ strategy: 'hybrid', embedding: { profileId: 'embed', providerId: 'fixture', model: 'fixture-embed' }, durable: false, building: false,
      totals: { chunks: 5, indexed: 0 } });
    // Internal procedures are never embedded; a chunk shared by channels is one vector.
    expect(before.procedures).toEqual([
      { id: 'travel_notice', title: 'Set up a travel notice', chunks: 3, indexed: 0 },
      { id: 'wire_cutoff', title: 'Wire transfer cut-off times', chunks: 2, indexed: 0 }
    ]);
    expect(before.channels).toEqual([
      { channel: 'digital', chunks: 5, indexed: 0, tooLarge: false },
      { channel: 'ava', chunks: 3, indexed: 0, tooLarge: false },
      { channel: 'ivr', chunks: 0, indexed: 0, tooLarge: false }
    ]);
    expect(await buildIndex({ config: configWith(), index })).toEqual({ ok: true });
    expect(calls.map(call => call.texts.length)).toEqual([5]);
    const after = await indexStatus({ config: configWith(), index });
    expect(after.totals).toEqual({ chunks: 5, indexed: 5 });
    expect(after.channels.map(channel => channel.indexed)).toEqual([5, 3, 0]);
  });

  test('a changed prefix or edited procedure shows only the affected chunks as missing', async () => {
    const { embed } = fakeEmbed();
    const index = new EmbeddingIndex({ embed });
    await buildIndex({ config: configWith(), index });
    const edited = configWith();
    edited.procedures = procedures.map(entry => entry.id === 'wire_cutoff' ? { ...entry, steps: [{ id: 'step_1', instruction: 'Domestic wires before 5 PM go the same day.' }] } : entry);
    const status = await indexStatus({ config: edited, index });
    expect(status.procedures.find(entry => entry.id === 'wire_cutoff')).toMatchObject({ chunks: 2, indexed: 1 });
    expect(status.totals).toEqual({ chunks: 5, indexed: 4 });
    const prefixed = await indexStatus({ config: configWith({ strategy: 'semantic', minSimilarity: 0.4, documentPrefix: 'passage: ' }), index });
    expect(prefixed.totals).toEqual({ chunks: 5, indexed: 0 });
  });

  test('lexical releases and releases without an embedding route have nothing to index', async () => {
    const { embed, calls } = fakeEmbed();
    const index = new EmbeddingIndex({ embed });
    const lexical = await indexStatus({ config: configWith({ strategy: 'lexical' }), index });
    expect(lexical).toMatchObject({ strategy: 'lexical', reason: 'lexical_strategy', totals: { chunks: 5, indexed: null } });
    const unrouted = configWith();
    unrouted.llm = { ...unrouted.llm, enabled: false };
    expect(await indexStatus({ config: unrouted, index })).toMatchObject({ embedding: null, reason: 'embedding_route_not_configured' });
    expect(await buildIndex({ config: configWith({ strategy: 'lexical' }), index })).toEqual({ ok: false, reason: 'not_semantic' });
    expect(calls).toHaveLength(0);
  });

  test('stored vectors count as indexed, and a storage outage is reported rather than hidden', async () => {
    const { embed } = fakeEmbed();
    const stored = new Set();
    const store = { enabled: () => true, get: async () => new Map(), has: async keys => new Set(keys.filter(key => stored.has(key))),
      put: async entries => { for (const [key] of entries) stored.add(key); } };
    await buildIndex({ config: configWith(), index: new EmbeddingIndex({ embed, store }) });
    // A fresh replica sees the shared vectors without embedding anything.
    const replica = new EmbeddingIndex({ embed: () => { throw new Error('must not embed'); }, store });
    expect(await indexStatus({ config: configWith(), index: replica })).toMatchObject({ durable: true, totals: { chunks: 5, indexed: 5 } });
    const broken = new EmbeddingIndex({ embed, store: { ...store, has: async () => { throw new Error('database down'); } } });
    expect(await indexStatus({ config: configWith(), index: broken })).toMatchObject({ durable: false, totals: { indexed: 0 } });
  });
});

describe('index routes', () => {
  const previous = {};
  beforeAll(() => {
    for (const key of ['JWT_SECRET', 'LLM_PROVIDERS_JSON', 'LLM_PROVIDERS_FILE', 'DEPLOYMENT_TENANT_ID', 'CONTROL_PLANE_URL', 'NODE_ENV']) previous[key] = process.env[key];
    process.env.JWT_SECRET = secret; process.env.DEPLOYMENT_TENANT_ID = 'default-enterprise'; delete process.env.LLM_PROVIDERS_FILE;
    process.env.CONTROL_PLANE_URL = 'http://control-plane.invalid/api/control-plane';
    process.env.LLM_PROVIDERS_JSON = JSON.stringify({ providers: [{ id: 'fixture', type: 'ollama', enabled: true, baseUrl: 'https://never-contact.invalid:11434', allowedModels: ['fixture-embed'] }] });
  });
  afterAll(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let release;
  beforeEach(() => {
    release = { version: 3, config: configWith() };
    axios.request.mockReset(); axios.get.mockReset();
    axios.request.mockImplementation(async ({ url, data }) => {
      if (!url.endsWith('/api/embed')) throw new Error(`unexpected ${url}`);
      return { data: { embeddings: data.input.map(vector), prompt_eval_count: data.input.length * 4 } };
    });
    axios.get.mockImplementation(async (url, options) => {
      if (options.params.version !== release.version) throw Object.assign(new Error('missing'), { response: { status: 404 } });
      return { data: release };
    });
  });
  const post = (path, body, role = 'control_plane_editor') => request(app()).post(`/llm/retrieval/index/${path}`).set('Authorization', `Bearer ${token(role)}`).send(body);
  const settle = async () => { for (let turn = 0; turn < 50; turn += 1) await new Promise(resolve => setImmediate(resolve)); };

  test('status is read-only and open to control-plane viewers', async () => {
    const result = await post('status', { config: configWith() }, 'control_plane_viewer');
    expect(result.status).toBe(200);
    expect(result.body.totals).toEqual({ chunks: 5, indexed: 0 });
    expect(axios.request).not.toHaveBeenCalled();
    expect((await post('status', { config: configWith() }, 'customer')).status).toBe(403);
    expect((await post('status', { config: { procedures } })).status).toBe(400);
    expect((await post('status', { config: configWith(), prompt: 'x' })).status).toBe(400);
  });

  test('a build embeds the published release with the caller\'s credentials and reports its outcome', async () => {
    process.env.NODE_ENV = 'production';
    try {
      const started = await post('build', { version: 3 });
      expect(started.status).toBe(202);
      expect(started.body).toMatchObject({ building: true, build: { state: 'running', version: 3, missingAtStart: 5, startedBy: 'user-control_plane_editor' } });
      const [url, options] = axios.get.mock.calls[0];
      expect(url).toBe('http://control-plane.invalid/api/control-plane/runtime/config');
      expect(options).toMatchObject({ params: { version: 3 }, maxRedirects: 0 });
      expect(options.headers.Authorization).toBe(`Bearer ${token('control_plane_editor')}`);
      await settle();
      const status = await post('status', { config: configWith(), version: 3 }, 'control_plane_viewer');
      expect(status.body.totals).toEqual({ chunks: 5, indexed: 5 });
      expect(status.body.build).toMatchObject({ state: 'succeeded', remaining: 0, inputTokens: 20 });
      expect(axios.request.mock.calls.map(([call]) => call.data.input.length)).toEqual([5]);
    } finally { delete process.env.NODE_ENV; }
  });

  test('provider failures, missing releases and lexical releases are reported', async () => {
    release = { version: 4, config: { ...configWith(), procedures: procedures.map(entry => ({ ...entry, title: `${entry.title} v4` })) } };
    axios.request.mockRejectedValue(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    expect((await post('build', { version: 4 })).status).toBe(202);
    await settle();
    const failed = await post('status', { config: release.config, version: 4 });
    expect(failed.body.build).toMatchObject({ state: 'failed', reason: 'embedding_unavailable', remaining: 5 });
    expect((await post('build', { version: 9 })).status).toBe(404);
    release = { version: 5, config: configWith({ strategy: 'lexical' }) };
    const lexical = await post('build', { version: 5 });
    expect(lexical.status).toBe(409);
    expect(lexical.body.error.code).toBe('RETRIEVAL_NOT_SEMANTIC');
  });

  test('builds need edit permission and a version', async () => {
    expect((await post('build', { version: 3 }, 'control_plane_viewer')).status).toBe(403);
    expect((await post('build', {}, 'admin')).status).toBe(400);
    expect((await post('build', { version: 3, config: configWith() }, 'admin')).status).toBe(400);
    expect(axios.get).not.toHaveBeenCalled();
  });
});
