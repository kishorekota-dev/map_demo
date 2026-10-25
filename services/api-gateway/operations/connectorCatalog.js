// Immutable endpoint bindings loaded by the server, never registered by an API caller.
const { readFileSync } = require('fs');
const { createHash } = require('crypto');
const { identifier, text } = require('../control-plane/config');
const { validateBaseUrl, resolveSecret } = require('./connectors');
const { OperationsError } = require('./store');
const BINDINGS = ['kind', 'baseUrl', 'credentialRef', 'webhookSecretRef', 'webhookPublicUrl'];
const secretReference = value => typeof value === 'string' && /^env:CONNECTOR_SECRET_[A-Z0-9_]+$/.test(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);

function publicWebhookUrl(raw, id) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || !url.pathname.endsWith(`/webhooks/${id}`)) throw new Error();
    return url.href;
  } catch { throw new OperationsError(400, 'Declare an exact HTTPS webhook public URL ending in /webhooks/<connector-id>.'); }
}

class ConnectorCatalog {
  constructor(definitions = [], env = process.env) {
    if (!Array.isArray(definitions) || definitions.length > 100) throw new OperationsError(400, 'Declare at most 100 server-owned connectors.');
    this.definitions = new Map();
    for (const item of definitions) {
      if (!plain(item) || Object.keys(item).some(key => !['id', 'name', ...BINDINGS].includes(key))
        || !identifier(item.id) || !text(item.name, 120) || !['case', 'voice', 'knowledge'].includes(item.kind)
        || this.definitions.has(item.id)) throw new OperationsError(400, 'Invalid or duplicate server-owned connector definition.');
      const baseUrl = validateBaseUrl(item.baseUrl, env).href.replace(/\/$/, '');
      for (const ref of [item.credentialRef, item.webhookSecretRef]) {
        if (ref != null && !secretReference(ref)) throw new OperationsError(400, 'Connector credentials must name an env:CONNECTOR_SECRET_NAME reference.');
        if (ref) resolveSecret(ref, env); // Configuration errors fail startup, without disclosing values.
      }
      if (!!item.webhookSecretRef !== !!item.webhookPublicUrl || (item.kind === 'knowledge' && item.webhookSecretRef)) {
        throw new OperationsError(400, 'Case/voice webhooks require both a secret environment reference and an exact public URL.');
      }
      const definition = Object.freeze({ id: item.id, name: item.name.trim(), kind: item.kind, baseUrl,
        credentialRef: item.credentialRef || null, webhookSecretRef: item.webhookSecretRef || null,
        webhookPublicUrl: item.webhookPublicUrl ? publicWebhookUrl(item.webhookPublicUrl, item.id) : null });
      this.definitions.set(item.id, definition);
    }
  }
  list() { return [...this.definitions.values()].map(item => ({ ...item })); }
  get(id) {
    const item = this.definitions.get(id);
    if (!item) throw new OperationsError(400, 'Connector is not declared in server-side configuration.');
    return item;
  }
  configure(id, input) {
    const definition = this.get(id);
    for (const key of BINDINGS) {
      if (input[key] !== undefined && (input[key] || null) !== definition[key]) {
        throw new OperationsError(400, 'Endpoint and credential bindings are server-owned and cannot be changed through the API.');
      }
    }
    return { ...definition, name: input.name.trim(), enabled: input.enabled, timeoutMs: input.timeoutMs, lastTest: null };
  }
  bind(connection) {
    if (!connection) throw new OperationsError(400, 'Connector is not configured.');
    const definition = this.get(connection.id);
    if (BINDINGS.some(key => (connection[key] || null) !== definition[key])) {
      throw new OperationsError(409, 'Connector bindings changed or are not server-owned. Reconfigure before use.');
    }
    const bindings = Object.fromEntries(['id', ...BINDINGS].map(key => [key, definition[key]]));
    return { ...connection, definitionDigest: createHash('sha256').update(JSON.stringify(bindings)).digest('hex') };
  }
}

function loadConnectorCatalog(env = process.env, definitions) {
  if (definitions !== undefined) return new ConnectorCatalog(definitions, env);
  if (!env.CONNECTORS_CONFIG_PATH) return new ConnectorCatalog([], env);
  let raw;
  try { raw = readFileSync(env.CONNECTORS_CONFIG_PATH, 'utf8'); }
  catch { throw new OperationsError(503, 'Cannot read CONNECTORS_CONFIG_PATH.'); }
  let parsed;
  try {
    if (Buffer.byteLength(raw) > 262144) throw new Error();
    parsed = JSON.parse(raw);
  } catch { throw new OperationsError(503, 'CONNECTORS_CONFIG_PATH must contain bounded valid JSON.'); }
  if (!plain(parsed) || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.connectors)) {
    throw new OperationsError(503, 'CONNECTORS_CONFIG_PATH must contain a connectors array.');
  }
  return new ConnectorCatalog(parsed.connectors, env);
}
module.exports = { ConnectorCatalog, loadConnectorCatalog, publicWebhookUrl };
