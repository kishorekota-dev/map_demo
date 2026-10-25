const { retrieveProcedures, validateRetrieval, cosine } = require('../procedureRetrieval');
const { EmbeddingIndex, EmbeddingStore } = require('../embeddingIndex');
const { validateSnapshot } = require('../controlPlaneRuntime');
const { defaultConfig } = require('../../../../api-gateway/control-plane/config');

// A deterministic stand-in for an embedding model: each dimension is a concept,
// so paraphrases that share no words still land close together.
const CONCEPTS = {
  travel: ['travel', 'traveling', 'trip', 'abroad', 'overseas', 'vacation', 'destination', 'countries'],
  card: ['card', 'cards', 'debit', 'credit', 'plastic', 'purchases'],
  loss: ['lost', 'stolen', 'missing', 'misplaced'],
  wire: ['wire', 'wires', 'transfer', 'send'],
  timing: ['cut', 'off', 'cutoff', 'deadline', 'pm', 'time', 'times', 'same', 'business', 'day'],
  replace: ['replace', 'replacement', 'new', 'order'],
  notify: ['notice', 'tell', 'inform', 'note', 'dates', 'let', 'know']
};
const conceptVector = text => {
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  return Object.values(CONCEPTS).map(vocabulary => words.filter(word => vocabulary.includes(word)).length + 0.01);
};
function fakeEmbedder() {
  const calls = [];
  const embed = jest.fn(async (_llm, texts, purpose) => {
    calls.push({ texts, purpose });
    return { vectors: texts.map(conceptVector), dimensions: 7, usage: {}, callId: `call-${calls.length}`, providerId: 'embedder', model: 'concepts' };
  });
  return { embed, calls };
}

const llm = { enabled: true, profiles: [{ id: 'embed', name: 'Embeddings', providerId: 'embedder', model: 'concepts', temperature: 0, maxOutputTokens: 1, timeoutMs: 5000 }], routing: { embedding: 'embed' } };
const procedure = (overrides) => ({ enabled: true, audience: 'customer', intents: [], channels: ['digital'], guardrails: [], ...overrides });
const procedures = [
  procedure({ id: 'travel_notice', title: 'Set up a travel notice', source: 'SOP-20',
    steps: [{ id: 'step_1', instruction: 'Tell us your travel dates and destination countries.' }, { id: 'step_2', instruction: 'We note your cards so purchases abroad are not declined.' }] }),
  procedure({ id: 'wire_cutoff', title: 'Wire transfer cut-off times', source: 'SOP-31',
    steps: [{ id: 'step_1', instruction: 'Domestic wires submitted before 4 PM Eastern are sent the same business day.' }] }),
  procedure({ id: 'card_replacement', title: 'Order a replacement card', source: 'SOP-14',
    steps: [{ id: 'step_1', instruction: 'Report a lost or stolen card, then we order a new one.' }] }),
  procedure({ id: 'fee_waiver', title: 'Waive travel card fees', source: 'SOP-INT', audience: 'internal', intents: ['help'],
    steps: [{ id: 'step_1', instruction: 'Supervisors may waive travel fees for premium customers.' }] })
];
const paraphrase = 'I am going overseas on vacation, should I let you know?';

describe('retrieval strategies', () => {
  test('lexical retrieval never calls the embedding model', async () => {
    const { embed } = fakeEmbedder();
    const result = await retrieveProcedures({ procedures, question: 'travel dates destination', retrieval: { strategy: 'lexical' }, llm, index: new EmbeddingIndex({ embed }) });
    expect(result).toMatchObject({ strategy: 'lexical', mode: 'lexical' });
    expect(result.matches[0].procedureId).toBe('travel_notice');
    expect(embed).not.toHaveBeenCalled();
  });

  test('semantic retrieval finds a paraphrase that shares no words with the procedure', async () => {
    const { embed, calls } = fakeEmbedder();
    const index = new EmbeddingIndex({ embed });
    const lexical = await retrieveProcedures({ procedures, question: paraphrase, retrieval: { strategy: 'lexical' }, llm, index });
    expect(lexical.matches).toEqual([]);
    const semantic = await retrieveProcedures({ procedures, question: paraphrase, retrieval: { strategy: 'semantic', minSimilarity: 0.5 }, llm, index });
    expect(semantic.mode).toBe('semantic');
    expect(semantic.matches[0]).toMatchObject({ procedureId: 'travel_notice', title: 'Set up a travel notice', source: 'SOP-20' });
    expect(semantic.matches[0].similarity).toBeGreaterThanOrEqual(0.5);
    expect(calls.map(call => call.purpose)).toEqual(['document', 'query']);
    // Internal procedures are never embedded or retrieved for customers.
    expect(calls[0].texts.join(' ')).not.toContain('Supervisors');
  });

  test('the similarity floor and result limit apply', async () => {
    const { embed } = fakeEmbedder();
    const index = new EmbeddingIndex({ embed });
    // The best chunk for this question scores about 0.8 cosine.
    expect((await retrieveProcedures({ procedures, question: 'overseas trip', retrieval: { strategy: 'semantic', minSimilarity: 0.7 }, llm, index })).matches.length).toBeGreaterThan(0);
    expect((await retrieveProcedures({ procedures, question: 'overseas trip', retrieval: { strategy: 'semantic', minSimilarity: 0.95 }, llm, index })).matches).toEqual([]);
    expect((await retrieveProcedures({ procedures, question: paraphrase, retrieval: { strategy: 'semantic', minSimilarity: 0, maxResults: 2 }, llm, index })).matches).toHaveLength(2);
  });

  test('hybrid fuses both rankings and keeps paraphrase-only matches', async () => {
    const { embed } = fakeEmbedder();
    const index = new EmbeddingIndex({ embed });
    const both = await retrieveProcedures({ procedures, question: 'When is the cut-off time for a wire?', retrieval: { strategy: 'hybrid', minSimilarity: 0.5 }, llm, index });
    expect(both.mode).toBe('hybrid');
    expect(both.matches[0]).toMatchObject({ procedureId: 'wire_cutoff' });
    expect(both.matches[0].lexicalScore).toBeGreaterThan(0);
    expect(both.matches[0].similarity).toBeGreaterThan(0.5);
    const semanticOnly = await retrieveProcedures({ procedures, question: paraphrase, retrieval: { strategy: 'hybrid', minSimilarity: 0.5 }, llm, index });
    expect(semanticOnly.matches[0]).toMatchObject({ procedureId: 'travel_notice' });
    expect(semanticOnly.matches[0]).not.toHaveProperty('lexicalScore');
  });

  test('results are deterministic', async () => {
    const run = async () => retrieveProcedures({ procedures, question: 'lost my debit card, need a new one', retrieval: { strategy: 'hybrid', minSimilarity: 0.3 }, llm, index: new EmbeddingIndex(fakeEmbedder()) });
    expect(await run()).toEqual(await run());
  });
});

describe('fallback to lexical retrieval', () => {
  test('an unavailable embedding model falls back with the reason', async () => {
    const embed = jest.fn(async () => { throw Object.assign(new Error('down'), { code: 'LLM_PROVIDER_ERROR' }); });
    const result = await retrieveProcedures({ procedures, question: 'travel dates destination', retrieval: { strategy: 'hybrid', minSimilarity: 0.5 }, llm, index: new EmbeddingIndex({ embed }) });
    expect(result).toMatchObject({ strategy: 'hybrid', mode: 'lexical_fallback', fallbackReason: 'embedding_unavailable' });
    expect(result.matches[0].procedureId).toBe('travel_notice');
  });

  test('a large new release warms in the background, then retrieval becomes semantic', async () => {
    const { embed } = fakeEmbedder();
    const index = new EmbeddingIndex({ embed, inlineBudget: 2 });
    const first = await retrieveProcedures({ procedures, question: paraphrase, retrieval: { strategy: 'semantic', minSimilarity: 0.5 }, llm, index });
    expect(first).toMatchObject({ mode: 'lexical_fallback', fallbackReason: 'index_warming' });
    await new Promise(resolve => setImmediate(resolve));
    await Promise.all([...index.pending.values()]);
    const second = await retrieveProcedures({ procedures, question: paraphrase, retrieval: { strategy: 'semantic', minSimilarity: 0.5 }, llm, index });
    expect(second.mode).toBe('semantic');
  });

  test('query and document vectors of different dimensions fall back', async () => {
    const embed = jest.fn(async (_llm, texts, purpose) => ({ vectors: texts.map(() => (purpose === 'query' ? [1, 2] : [1, 2, 3])), usage: {} }));
    const result = await retrieveProcedures({ procedures, question: 'travel dates', retrieval: { strategy: 'semantic', minSimilarity: 0 }, llm, index: new EmbeddingIndex({ embed }) });
    expect(result).toMatchObject({ mode: 'lexical_fallback', fallbackReason: 'embedding_mismatch' });
  });

  test('an over-large procedure set never attempts semantic retrieval', async () => {
    const { embed } = fakeEmbedder();
    const result = await retrieveProcedures({ procedures, question: 'travel dates', retrieval: { strategy: 'semantic', minSimilarity: 0 }, llm, index: new EmbeddingIndex({ embed, maxChunks: 2 }) });
    expect(result).toMatchObject({ mode: 'lexical_fallback', fallbackReason: 'index_too_large' });
    expect(embed).not.toHaveBeenCalled();
  });
});

describe('embedding index', () => {
  const texts = count => Array.from({ length: count }, (_value, index) => `procedure chunk ${index} about travel cards`);

  test('document vectors are reused; only changed text is embedded again', async () => {
    const { embed, calls } = fakeEmbedder();
    const index = new EmbeddingIndex({ embed });
    await index.documentVectors(llm, ['alpha travel', 'beta card']);
    await index.documentVectors(llm, ['alpha travel', 'beta card']);
    await index.documentVectors(llm, ['alpha travel', 'beta card revised']);
    expect(calls.map(call => call.texts)).toEqual([['alpha travel', 'beta card'], ['beta card revised']]);
  });

  test('a different model never reuses another model\'s vectors', async () => {
    const { embed, calls } = fakeEmbedder();
    const index = new EmbeddingIndex({ embed });
    await index.documentVectors(llm, ['alpha travel']);
    await index.documentVectors({ ...llm, profiles: [{ ...llm.profiles[0], model: 'concepts-v2' }] }, ['alpha travel']);
    expect(calls).toHaveLength(2);
  });

  test('concurrent requests share in-flight embedding work', async () => {
    const { embed } = fakeEmbedder();
    const index = new EmbeddingIndex({ embed });
    await Promise.all([index.documentVectors(llm, texts(5)), index.documentVectors(llm, texts(5))]);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  test('missing chunks are embedded in sequential batches and the first failure stops the rest', async () => {
    const { embed, calls } = fakeEmbedder();
    await new EmbeddingIndex({ embed }).documentVectors(llm, texts(70), { wait: true });
    expect(calls.map(call => call.texts.length)).toEqual([32, 32, 6]);
    const failing = jest.fn(async () => { throw Object.assign(new Error('down'), { code: 'LLM_TIMEOUT' }); });
    await expect(new EmbeddingIndex({ embed: failing }).documentVectors(llm, texts(70), { wait: true })).rejects.toMatchObject({ code: 'LLM_TIMEOUT' });
    expect(failing).toHaveBeenCalledTimes(1);
  });

  test('memory is bounded by least-recent use', async () => {
    const index = new EmbeddingIndex({ embed: fakeEmbedder().embed, maxEntries: 3 });
    await index.documentVectors(llm, texts(5));
    expect(index.memory.size).toBe(3);
  });

  test('a durable store is consulted first, written after embedding, and its outage is tolerated', async () => {
    const { embed, calls } = fakeEmbedder();
    const stored = new Map();
    const store = { enabled: () => true, get: jest.fn(async keys => new Map(keys.filter(key => stored.has(key)).map(key => [key, stored.get(key)]))),
      put: jest.fn(async entries => { for (const [key, vector] of entries) stored.set(key, vector); }) };
    await new EmbeddingIndex({ embed, store }).documentVectors(llm, ['alpha travel']);
    expect(store.put).toHaveBeenCalledWith([[expect.stringMatching(/^[a-f0-9]{64}$/), expect.any(Array)]], expect.objectContaining({ providerId: 'embedder', model: 'concepts' }));
    await new EmbeddingIndex({ embed, store }).documentVectors(llm, ['alpha travel']);
    expect(calls).toHaveLength(1);
    const broken = { enabled: () => true, get: jest.fn(async () => { throw new Error('db down'); }), put: jest.fn(async () => { throw new Error('db down'); }) };
    await expect(new EmbeddingIndex({ embed, store: broken }).documentVectors(llm, ['gamma'])).resolves.toHaveLength(1);
  });
});

describe('retrieval configuration', () => {
  test.each([
    [{ strategy: 'lexical' }, true], [{ strategy: 'semantic', minSimilarity: 0.4 }, true], [{ strategy: 'hybrid', minSimilarity: 0.4, maxResults: 5 }, true],
    [{ strategy: 'semantic' }, false], [{ strategy: 'vector', minSimilarity: 0.4 }, false], [{ strategy: 'hybrid', minSimilarity: 1.5 }, false],
    [{ strategy: 'lexical', maxResults: 9 }, false], [{ strategy: 'lexical', index: 'pgvector' }, false]
  ])('%j valid: %s', (retrieval, valid) => {
    if (valid) expect(() => validateRetrieval(retrieval)).not.toThrow();
    else expect(() => validateRetrieval(retrieval)).toThrow('Unsafe published retrieval configuration');
  });

  test('a published semantic strategy requires an embedding route', () => {
    const config = { ...defaultConfig(), retrieval: { strategy: 'hybrid', minSimilarity: 0.4 } };
    expect(() => validateSnapshot({ version: 1, config })).toThrow('embedding profile');
    config.llm = { ...config.llm, enabled: true, routing: { ...config.llm.routing, embedding: config.llm.profiles[0].id } };
    expect(() => validateSnapshot({ version: 1, config })).not.toThrow();
  });

  test('cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([1, 0], [1, 0, 0])).toBeNaN();
  });
});

const databaseUrl = process.env.RUNTIME_TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)('PostgreSQL embedding store', () => {
  const { Pool } = require('pg');
  let pool;
  const persistence = { enabled: () => true, initialize: async () => {}, get pool() { return pool; } };
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await pool.query('DROP TABLE IF EXISTS servicing_retrieval_embeddings');
  });
  afterAll(async () => { await pool.query('DROP TABLE IF EXISTS servicing_retrieval_embeddings'); await pool.end(); });

  test('the store creates its schema, round-trips float32 vectors and ignores duplicate keys', async () => {
    const store = new EmbeddingStore(persistence);
    const key = 'a'.repeat(64);
    const vector = [0.1, -0.25, 3.3333333].map(Math.fround);
    await store.put([[key, vector]], { providerId: 'embedder', model: 'concepts' });
    await store.put([[key, [9, 9, 9]]], { providerId: 'embedder', model: 'concepts' });
    expect((await store.get([key, 'b'.repeat(64)])).get(key)).toEqual(vector);
    await expect(pool.query("INSERT INTO servicing_retrieval_embeddings (cache_key,provider_id,model,dimensions,vector) VALUES ('not-a-hash','p','m',1,'{1}')")).rejects.toThrow();
    await expect(pool.query(`INSERT INTO servicing_retrieval_embeddings (cache_key,provider_id,model,dimensions,vector) VALUES ('${'c'.repeat(64)}','p','m',2,'{1}')`)).rejects.toThrow();
  });

  test('a second replica reuses stored vectors without calling the model', async () => {
    const first = fakeEmbedder();
    await new EmbeddingIndex({ embed: first.embed, store: new EmbeddingStore(persistence) }).documentVectors(llm, ['shared chunk about travel']);
    const second = fakeEmbedder();
    const vectors = await new EmbeddingIndex({ embed: second.embed, store: new EmbeddingStore(persistence) }).documentVectors(llm, ['shared chunk about travel']);
    expect(second.embed).not.toHaveBeenCalled();
    expect(vectors[0]).toEqual(conceptVector('shared chunk about travel').map(Math.fround));
  });
});

describe('model task prefixes', () => {
  test('query and document prefixes are embedded, and changing one re-embeds documents', async () => {
    const { embed, calls } = fakeEmbedder();
    const index = new EmbeddingIndex({ embed });
    const retrieval = { strategy: 'semantic', minSimilarity: 0, queryPrefix: 'search_query: ', documentPrefix: 'search_document: ' };
    await retrieveProcedures({ procedures, question: paraphrase, retrieval, llm, index });
    expect(calls[0].texts.every(text => text.startsWith('search_document: '))).toBe(true);
    expect(calls[1].texts).toEqual([`search_query: ${paraphrase}`]);
    await retrieveProcedures({ procedures, question: paraphrase, retrieval: { ...retrieval, documentPrefix: 'passage: ' }, llm, index });
    expect(calls[2].purpose).toBe('document');
    expect(calls[2].texts.every(text => text.startsWith('passage: '))).toBe(true);
  });

  test.each([{ queryPrefix: 'x'.repeat(65) }, { documentPrefix: 'line\nbreak' }, { queryPrefix: 7 }])('rejects %j', (prefix) => {
    expect(() => validateRetrieval({ strategy: 'semantic', minSimilarity: 0.4, ...prefix })).toThrow();
  });
});
