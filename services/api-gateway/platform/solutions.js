const { clone, object, identifier, text, defaultConfig, validateConfig } = require('../control-plane/config');
const { ControlPlaneError } = require('../control-plane/store');
const { fingerprint } = require('../control-plane/studio-model');
const { semanticDiff } = require('../control-plane/diff');
const fail = message => { throw new ControlPlaneError(400, message); };
const manifest = (id, name, description) => ({ id, name, description, version: '1.0.0' });
function catalog() {
  const service = {
    id: 'helpdesk_request', baseIntent: 'service_request', name: 'Service desk request', description: 'Create a tracked service request for a customer.',
    enabled: true, patterns: ['open a service request'], requiredData: ['subject', 'description'], optionalData: [], tools: [],
    needsConfirmation: true, systemPrompt: 'Collect the requested service details. Only report a case as created after fulfillment confirms it.',
    userPromptTemplate: '{{question}}', fieldSchemas: { subject: { type: 'string', minLength: 3, maxLength: 200 }, description: { type: 'string', minLength: 10, maxLength: 2000 } }
  };
  const knowledge = {
    id: 'policy_knowledge', baseIntent: 'knowledge_search', name: 'Approved policy answers', description: 'Answer questions using approved, permission-filtered knowledge sources.',
    enabled: true, patterns: ['find an approved policy'], requiredData: [], optionalData: ['query'], tools: [], needsConfirmation: false,
    systemPrompt: 'Answer using only approved retrieved evidence. Provide the source and say when evidence is unavailable.', userPromptTemplate: '{{question}}'
  };
  return [
    { schemaVersion: 1, manifest: manifest('banking-servicing', 'Banking servicing baseline', 'Canonical banking policies and channels; review differences before replacing existing settings.'), configuration: defaultConfig() },
    { schemaVersion: 1, manifest: manifest('service-desk', 'Service desk fulfillment', 'Add a typed service request with confirmation, ownership and a tracked fulfillment case.'), configuration: {
      intents: [service], queues: [{ id: 'service_desk', name: 'Service desk' }],
      journeys: [{ id: 'service_desk', name: 'Service desk fulfillment', intents: ['helpdesk_request'], channels: ['digital', 'ava'], enabled: true, fulfillment: 'automated', queue: 'service_desk', slaMinutes: 240 }]
    } },
    { schemaVersion: 1, manifest: manifest('knowledge-assistant', 'Approved knowledge assistant', 'Add a source-grounded knowledge journey; published, accessible documents are still required.'), configuration: {
      intents: [knowledge], queues: [{ id: 'knowledge_support', name: 'Knowledge support' }],
      journeys: [{ id: 'knowledge_support', name: 'Approved knowledge', intents: ['policy_knowledge'], channels: ['digital', 'ava'], enabled: true, fulfillment: 'automated', queue: 'knowledge_support', slaMinutes: 60 }]
    } }
  ];
}
function validatePackage(value) {
  if (!object(value) || Buffer.byteLength(JSON.stringify(value)) > 512000
    || Object.keys(value).some(key => !['schemaVersion', 'manifest', 'configuration'].includes(key)) || value.schemaVersion !== 1
    || !object(value.manifest) || Object.keys(value.manifest).some(key => !['id', 'name', 'description', 'version'].includes(key))
    || !identifier(value.manifest.id) || !text(value.manifest.name) || !text(value.manifest.description, 2000)
    || typeof value.manifest.version !== 'string' || !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(value.manifest.version)
    || !object(value.configuration) || !Object.keys(value.configuration).length
    || Object.keys(value.configuration).some(key => !['intents', 'queues', 'journeys', 'channels', 'prompts', 'recognition', 'llm', 'procedures'].includes(key))) {
    fail('A bounded schemaVersion 1 servicing solution package with a valid manifest is required.');
  }
  for (const key of ['intents', 'queues', 'journeys', 'channels', 'procedures']) {
    if (value.configuration[key] === undefined) continue;
    const list = value.configuration[key];
    if (!Array.isArray(list) || list.length > 200 || list.some(entry => !object(entry) || !identifier(entry.id))
      || new Set(list.map(entry => entry.id)).size !== list.length) fail(`Package ${key} must contain unique registered identifiers.`);
  }
  return clone(value);
}
function previewPackage(current, input) {
  const solution = validatePackage(input);
  const configuration = clone(current);
  const conflicts = [];
  for (const [key, value] of Object.entries(solution.configuration)) {
    if (['intents', 'queues', 'journeys', 'channels', 'procedures'].includes(key)) {
      const entries = new Map((configuration[key] || []).map(entry => [entry.id, entry]));
      for (const entry of value) {
        if (entries.has(entry.id) && fingerprint(entries.get(entry.id)) !== fingerprint(entry)) conflicts.push(`${key}[${entry.id}]`);
        entries.set(entry.id, clone(entry));
      }
      configuration[key] = [...entries.values()];
    } else if (key === 'prompts') {
      if (!object(value)) fail('Package prompts must be an object.');
      configuration.prompts = { ...configuration.prompts, ...clone(value) };
      if (fingerprint(current.prompts) !== fingerprint(configuration.prompts)) conflicts.push('prompts');
    } else {
      configuration[key] = clone(value);
      if (current[key] !== undefined && fingerprint(current[key]) !== fingerprint(value)) conflicts.push(key);
    }
  }
  const errors = validateConfig(configuration);
  if (errors.length) throw new ControlPlaneError(400, 'Solution conflicts with the servicing contract.', { errors });
  return { solution, configuration, conflicts, digest: fingerprint(solution), baseFingerprint: fingerprint(current),
    resultFingerprint: fingerprint(configuration), diff: semanticDiff(current, configuration) };
}
module.exports = { catalog, validatePackage, previewPackage };
