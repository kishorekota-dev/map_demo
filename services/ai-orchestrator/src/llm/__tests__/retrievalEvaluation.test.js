jest.mock('axios');
const axios = require('axios');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../../middleware/auth');
const routes = require('../routes');
const { suggestFloor } = require('../../services/retrievalEvaluation');
const { defaultConfig } = require('../../../../api-gateway/control-plane/config');

const secret = 'synthetic-retrieval-evaluation-secret';
const token = role => jwt.sign({ userId: `user-${role}`, role, type: 'access', tenantId: 'default-enterprise' }, secret);
const app = () => { const server = express(); server.use(express.json()); server.use('/llm', authenticate, routes); return server; };

const CONCEPTS = {
  travel: ['travel', 'traveling', 'trip', 'abroad', 'overseas', 'vacation', 'destination', 'countries'],
  card: ['card', 'cards', 'debit', 'plastic', 'purchases'],
  loss: ['lost', 'stolen', 'missing', 'misplaced'],
  wire: ['wire', 'wires', 'transfer', 'send'],
  timing: ['cut', 'off', 'cutoff', 'deadline', 'pm', 'time', 'times', 'same', 'business', 'day', 'late'],
  replace: ['replace', 'replacement', 'new', 'order'],
  notify: ['notice', 'tell', 'inform', 'note', 'dates', 'let', 'know']
};
const conceptVector = text => {
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  return Object.values(CONCEPTS).map(vocabulary => words.filter(word => vocabulary.includes(word)).length + 0.01);
};
const procedure = overrides => ({ enabled: true, audience: 'customer', intents: [], channels: ['digital'], guardrails: [], ...overrides });
const procedures = [
  procedure({ id: 'travel_notice', title: 'Set up a travel notice', source: 'SOP-20', steps: [{ id: 'step_1', instruction: 'Tell us your travel dates and destination countries.' }] }),
  procedure({ id: 'wire_cutoff', title: 'Wire transfer cut-off times', source: 'SOP-31', steps: [{ id: 'step_1', instruction: 'Domestic wires submitted before 4 PM Eastern are sent the same business day.' }] }),
  procedure({ id: 'card_replacement', title: 'Order a replacement card', source: 'SOP-14', steps: [{ id: 'step_1', instruction: 'Report a lost or stolen card, then we order a new one.' }] })
];
const cases = [
  { question: 'Should I let you know before my overseas vacation?', expectedProcedureId: 'travel_notice' },
  { question: 'How late can I send money today?', expectedProcedureId: 'wire_cutoff' },
  { question: 'My debit card went missing, I need a new one', expectedProcedureId: 'card_replacement' },
  { question: 'travel dates destination', expectedProcedureId: 'travel_notice' },
  { question: 'What is your mortgage rate?', expectedProcedureId: null }
];
const configWith = (embedding) => {
  const config = { ...defaultConfig(), procedures };
  if (embedding) {
    config.llm = { enabled: true, profiles: [{ id: 'embed', name: 'Embeddings', providerId: 'fixture', model: 'fixture-embed', temperature: 0, maxOutputTokens: 1, timeoutMs: 5000 }], routing: { embedding: 'embed' } };
    config.retrieval = { strategy: 'hybrid', minSimilarity: 0.5 };
  }
  return config;
};

describe('retrieval evaluation endpoint', () => {
  const previous = {};
  beforeAll(() => {
    for (const key of ['JWT_SECRET', 'LLM_PROVIDERS_JSON', 'LLM_PROVIDERS_FILE', 'DEPLOYMENT_TENANT_ID']) previous[key] = process.env[key];
    process.env.JWT_SECRET = secret; process.env.DEPLOYMENT_TENANT_ID = 'default-enterprise'; delete process.env.LLM_PROVIDERS_FILE;
    process.env.LLM_PROVIDERS_JSON = JSON.stringify({ providers: [{ id: 'fixture', type: 'ollama', enabled: true, baseUrl: 'http://never-contact.invalid:11434', allowedModels: ['fixture-embed'] }] });
  });
  afterAll(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  beforeEach(() => {
    axios.request.mockReset();
    axios.request.mockImplementation(async ({ url, data }) => {
      if (!url.endsWith('/api/embed')) throw new Error(`unexpected ${url}`);
      return { data: { embeddings: data.input.map(conceptVector), prompt_eval_count: data.input.length } };
    });
  });
  const evaluate = (body, role = 'control_plane_editor') => request(app()).post('/llm/retrieval/evaluate').set('Authorization', `Bearer ${token(role)}`).send(body);

  test('only editors and administrators can run evaluations', async () => {
    expect((await evaluate({ config: configWith(false), cases }, 'customer')).status).toBe(403);
    expect((await evaluate({ config: configWith(false), cases }, 'control_plane_viewer')).status).toBe(403);
    expect((await evaluate({ config: configWith(false), cases }, 'admin')).status).toBe(200);
  });

  test('production refuses retrieval evaluation before any provider call', async () => {
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = await evaluate({ config: configWith(true), cases }, 'admin');
      expect(result.status).toBe(403);
      expect(result.body.error.code).toBe('LLM_EVALUATION_DISABLED');
      expect(axios.request).not.toHaveBeenCalled();
    } finally { if (previousEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnvironment; }
  });

  test.each([
    ['an invalid configuration', { config: { procedures }, cases }],
    ['a case naming an unknown procedure', { config: configWith(false), cases: [{ question: 'x', expectedProcedureId: 'nope' }] }],
    ['no cases', { config: configWith(false), cases: [] }],
    ['an unknown field', { config: configWith(false), cases, prompt: 'free text' }],
    ['an out-of-range floor', { config: configWith(false), cases, minSimilarity: 3 }],
  ])('rejects %s', async (_label, body) => {
    expect((await evaluate(body)).status).toBe(400);
    expect(axios.request).not.toHaveBeenCalled();
  });

  test('without an embedding route only lexical retrieval is measured', async () => {
    const result = await evaluate({ config: configWith(false), cases });
    expect(result.status).toBe(200);
    expect(result.body.strategies.semantic).toEqual({ available: false, reason: 'embedding_route_not_configured' });
    expect(result.body.strategies.lexical).toMatchObject({ available: true, answerable: 4, unanswerable: 1, hitAt1: 0.5, correctRejections: 1 });
    expect(result.body.calibration).toBeNull();
    expect(axios.request).not.toHaveBeenCalled();
  });

  test('semantic and hybrid retrieval are measured against lexical with a calibrated floor', async () => {
    const result = await evaluate({ config: configWith(true), cases });
    expect(result.status).toBe(200);
    const { lexical, semantic, hybrid } = result.body.strategies;
    expect(result.body.embedding).toEqual({ profileId: 'embed', providerId: 'fixture', model: 'fixture-embed' });
    expect(semantic).toMatchObject({ available: true, hitAt1: 1, hitAt3: 1, mrr: 1, fallbacks: 0 });
    expect(hybrid.hitAt1).toBe(1);
    expect(semantic.hitAt1).toBeGreaterThan(lexical.hitAt1);
    // At the configured 0.5 floor the off-topic question still matches something.
    expect(semantic.correctRejections).toBe(0);
    const { calibration } = result.body;
    expect(calibration).toMatchObject({ correct: 5, cases: 5, basis: 'matched_and_unmatched_cases' });
    expect(calibration.minSimilarity).toBeGreaterThan(0.5);
    // Re-running at the suggested floor rejects it without losing any match.
    const calibrated = await evaluate({ config: configWith(true), cases, minSimilarity: calibration.minSimilarity });
    expect(calibrated.body.strategies.semantic).toMatchObject({ hitAt1: 1, correctRejections: 1 });
    expect(result.body.results[0]).toMatchObject({ expectedProcedureId: 'travel_notice', strategies: { lexical: { procedures: [] }, semantic: { procedures: ['travel_notice'], mode: 'semantic' } },
      similarity: { bestProcedureId: 'travel_notice' } });
    // Only the procedure chunks and the synthetic questions were sent to the provider.
    const sent = axios.request.mock.calls.flatMap(([call]) => call.data.input);
    expect(sent).toEqual(expect.arrayContaining(['Should I let you know before my overseas vacation?', 'Set up a travel notice\n1. Tell us your travel dates and destination countries.']));
  });

  test('an unreachable embedding provider is reported, not hidden', async () => {
    axios.request.mockRejectedValue(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    const result = await evaluate({ config: { ...configWith(true), procedures: procedures.map(entry => ({ ...entry, title: `${entry.title} v2` })) }, cases });
    expect(result.status).toBe(200);
    expect(result.body.strategies.semantic).toEqual({ available: false, reason: 'embedding_unavailable' });
    expect(result.body.strategies.lexical.available).toBe(true);
  });
});

describe('similarity floor suggestion', () => {
  test('chooses the middle of the range that separates matches from non-matches', () => {
    const suggestion = suggestFloor([
      { expected: 'a', similarity: 0.62, best: 0.62 }, { expected: 'b', similarity: 0.71, best: 0.71 },
      { expected: null, similarity: null, best: 0.38 }, { expected: null, similarity: null, best: 0.44 }
    ]);
    expect(suggestion).toEqual({ minSimilarity: 0.53, correct: 4, cases: 4, basis: 'matched_and_unmatched_cases' });
  });
  test('prefers the widest separating range when disjoint ranges tie', () => {
    // Floors up to 0.58 keep the weak match; floors in 0.63..0.98 reject the off-topic one. Both score 4 of 5.
    const suggestion = suggestFloor([
      { expected: 'a', similarity: 1, best: 1 }, { expected: 'b', similarity: 0.981, best: 0.981 }, { expected: 'c', similarity: 0.584, best: 0.584 },
      { expected: 'd', similarity: 0.984, best: 0.984 }, { expected: null, similarity: null, best: 0.621 }
    ]);
    expect(suggestion.correct).toBe(4);
    expect(suggestion.minSimilarity).toBe(0.29);
  });
  test('needs at least one case that should match', () => {
    expect(suggestFloor([{ expected: null, similarity: null, best: 0.3 }])).toBeNull();
  });
});
