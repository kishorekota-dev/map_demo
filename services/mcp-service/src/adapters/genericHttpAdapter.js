/**
 * Execute a generic backend adapter tool over HTTP.
 *
 * Outcomes are explicit, never guessed:
 * - completed: backend responded 2xx.
 * - failed: backend responded with a definitive error (4xx/5xx), or the
 *   request never reached the backend (DNS/connect error). Safe to retry
 *   with the same idempotencyKey.
 * - uncertain: the request may have reached the backend but no response
 *   arrived (timeout, connection reset after send). The caller must NOT
 *   retry blindly; it must reconcile (see reconciliation.js). The result
 *   carries reconciliationReference = the idempotencyKey.
 *
 * Retries: automatic retries happen only for read-only tools, on network
 * errors or 5xx, up to retry.maxAttempts. Mutating tools are never
 * auto-retried, even on 5xx, because a retried mutation could execute twice.
 *
 * The httpClient is injectable (default axios) so tests can drive every
 * outcome without a live backend. Its call shape is axios-like:
 *   httpClient({ method, url, params, data, headers, timeout }) -> { status, data }
 * and it throws errors with .code, .response?.status, .response?.data and
 * .request (set when a request was sent) on failure.
 */

const axios = require('axios');
const { validateParameters } = require('./adapterContract');
const { resolveAuthHeaders } = require('./credentialResolver');
const IdempotencyStore = require('./idempotencyStore');

class AdapterExecutionError extends Error {
  constructor(message, { outcome = 'failed', status = null, reconciliationReference = null } = {}) {
    super(message);
    this.name = 'AdapterExecutionError';
    this.outcome = outcome;
    this.status = status;
    this.reconciliationReference = reconciliationReference;
  }
}

function fillPathTemplate(path, parameters) {
  const used = new Set();
  const filled = path.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => {
    if (parameters[name] === undefined || parameters[name] === null) {
      throw new AdapterExecutionError(`Missing path parameter "${name}"`);
    }
    used.add(name);
    return encodeURIComponent(String(parameters[name]));
  });
  return { filled, used };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUncertainError(error) {
  // A timeout or a reset after the request was sent: the backend may or may
  // not have applied the mutation. DNS/connect errors have no request sent
  // (axios sets error.request only once a request is made) and are failures.
  if (error.code === 'ECONNABORTED') return true;
  if (error.code === 'ECONNRESET' && error.request) return true;
  if (error.code === 'ETIMEDOUT') return true;
  return false;
}

function backendErrorMessage(error) {
  const data = error.response?.data;
  if (typeof data === 'string') return data.slice(0, 500);
  if (data && typeof data.message === 'string') return data.message.slice(0, 500);
  if (data && typeof data.error === 'string') return data.error.slice(0, 500);
  return error.message ? String(error.message).slice(0, 500) : 'Backend error';
}

/**
 * @param {object} adapter normalized adapter definition
 * @param {object} options { httpClient, idempotencyStore, env }
 */
class GenericHttpAdapter {
  constructor(adapter, { httpClient = axios, idempotencyStore = new IdempotencyStore(), env = process.env } = {}) {
    this.adapter = adapter;
    this.httpClient = httpClient;
    this.idempotencyStore = idempotencyStore;
    this.env = env;
  }

  findTool(toolName) {
    const tool = this.adapter.tools.find((t) => t.name === toolName);
    if (!tool) throw new AdapterExecutionError(`Tool not found: ${toolName}`);
    return tool;
  }

  async execute(toolName, parameters = {}, { idempotencyKey = null } = {}) {
    const tool = this.findTool(toolName);
    const params = parameters || {};
    const validation = validateParameters(tool, params);
    if (!validation.valid) {
      throw new AdapterExecutionError(`Invalid arguments for ${toolName}: ${validation.errors.join('; ')}`);
    }
    if (tool.idempotency === 'required' && !idempotencyKey) {
      throw new AdapterExecutionError(
        `Tool "${toolName}" is mutating and requires an idempotencyKey`,
        { reconciliationReference: null },
      );
    }

    // Idempotent replay: never call the backend twice for the same key.
    if (idempotencyKey) {
      const replay = this.idempotencyStore.get(this.adapter.id, toolName, idempotencyKey);
      if (replay) return replay;
    }

    const { filled: path, used } = fillPathTemplate(tool.path, params);
    const url = `${this.adapter.baseUrl}${path}`;
    const headers = {
      ...(this.adapter.headers || {}),
      ...(await resolveAuthHeaders(this.adapter, this.env, this.httpClient)),
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    let request;
    if (tool.method === 'GET' || tool.method === 'DELETE') {
      const query = Object.fromEntries(
        Object.entries(params).filter(([key]) => !used.has(key)),
      );
      request = { method: tool.method, url, params: query, headers, timeout: tool.timeoutMs };
    } else {
      const body = Object.fromEntries(Object.entries(params).filter(([key]) => !used.has(key)));
      request = { method: tool.method, url, data: body, headers, timeout: tool.timeoutMs };
    }

    const maxAttempts = tool.readOnly ? tool.retry.maxAttempts : 1;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.httpClient(request);
        const status = response.status;
        if (status >= 200 && status < 300) {
          const result = {
            outcome: 'completed',
            adapterId: this.adapter.id,
            tool: toolName,
            namespacedTool: tool.namespacedName,
            status,
            data: response.data,
            replayed: false,
          };
          this.idempotencyStore.put(this.adapter.id, toolName, idempotencyKey, result);
          return result;
        }
        // Non-2xx via a resolved response is a definitive backend failure.
        const failure = {
          outcome: 'failed',
          adapterId: this.adapter.id,
          tool: toolName,
          namespacedTool: tool.namespacedName,
          status,
          error: backendErrorMessage({ response }),
          replayed: false,
        };
        if (tool.readOnly && status >= 500 && attempt < maxAttempts) {
          lastError = failure;
          await sleep(200 * attempt);
          continue;
        }
        return failure;
      } catch (error) {
        if (error.response) {
          const status = error.response.status;
          const failure = {
            outcome: 'failed',
            adapterId: this.adapter.id,
            tool: toolName,
            namespacedTool: tool.namespacedName,
            status,
            error: backendErrorMessage(error),
            replayed: false,
          };
          if (tool.readOnly && status >= 500 && attempt < maxAttempts) {
            lastError = failure;
            await sleep(200 * attempt);
            continue;
          }
          return failure;
        }
        if (isUncertainError(error)) {
          const result = {
            outcome: 'uncertain',
            adapterId: this.adapter.id,
            tool: toolName,
            namespacedTool: tool.namespacedName,
            status: null,
            error: 'Backend response not received; the operation may or may not have been applied. Reconcile before retrying.',
            reconciliationReference: idempotencyKey || null,
            replayed: false,
          };
          this.idempotencyStore.put(this.adapter.id, toolName, idempotencyKey, result);
          return result;
        }
        // No response and no request sent: definitive failure, safe to retry.
        return {
          outcome: 'failed',
          adapterId: this.adapter.id,
          tool: toolName,
          namespacedTool: tool.namespacedName,
          status: null,
          error: backendErrorMessage(error),
          replayed: false,
        };
      }
    }
    return lastError;
  }

  /**
   * Reconcile an uncertain execution. If the tool declares a statusPath,
   * query it (the backend's own status is authoritative); otherwise return
   * uncertain with manual steps. Never re-executes the original mutation.
   */
  async reconcile(toolName, idempotencyKey) {
    if (!idempotencyKey) {
      throw new AdapterExecutionError('reconcile requires an idempotencyKey');
    }
    const stored = this.idempotencyStore.get(this.adapter.id, toolName, idempotencyKey);
    if (stored && stored.outcome === 'completed') return stored;
    const tool = this.findTool(toolName);
    if (!tool.statusPath) {
      return {
        outcome: 'uncertain',
        adapterId: this.adapter.id,
        tool: toolName,
        reconciliationReference: idempotencyKey,
        reason: 'no-status-endpoint',
        manualSteps: [
          'Do not retry the original call with a new idempotencyKey.',
          'Ask the backend owner to look up the operation by Idempotency-Key.',
          'Record the confirmed outcome in the orchestrator effect ledger before telling the customer.',
        ],
      };
    }
    const { filled } = fillPathTemplate(tool.statusPath, { idempotencyKey });
    const headers = {
      ...(this.adapter.headers || {}),
      ...(await resolveAuthHeaders(this.adapter, this.env, this.httpClient)),
    };
    const response = await this.httpClient({
      method: 'GET',
      url: `${this.adapter.baseUrl}${filled}`,
      headers,
      timeout: Math.min(tool.timeoutMs, 15000),
    });
    const status = (response.data && response.data.status) || 'unknown';
    if (status === 'completed') {
      const result = {
        outcome: 'completed',
        adapterId: this.adapter.id,
        tool: toolName,
        namespacedTool: tool.namespacedName,
        status: response.status,
        data: response.data,
        replayed: false,
      };
      this.idempotencyStore.put(this.adapter.id, toolName, idempotencyKey, result);
      return result;
    }
    if (status === 'failed') {
      return {
        outcome: 'failed',
        adapterId: this.adapter.id,
        tool: toolName,
        status: response.status,
        error: 'Backend reports the operation failed',
      };
    }
    return {
      outcome: 'uncertain',
      adapterId: this.adapter.id,
      tool: toolName,
      reconciliationReference: idempotencyKey,
      reason: `backend status is "${status}"`,
    };
  }

  async health() {
    if (!this.adapter.healthPath) {
      return { status: 'unknown', reason: 'no-health-path', adapterId: this.adapter.id };
    }
    const headers = {
      ...(this.adapter.headers || {}),
      ...(await resolveAuthHeaders(this.adapter, this.env, this.httpClient)),
    };
    try {
      const response = await this.httpClient({
        method: 'GET',
        url: `${this.adapter.baseUrl}${this.adapter.healthPath}`,
        headers,
        timeout: 5000,
      });
      return {
        status: response.status >= 200 && response.status < 300 ? 'healthy' : 'unhealthy',
        adapterId: this.adapter.id,
        backendStatus: response.status,
      };
    } catch (error) {
      return { status: 'unhealthy', adapterId: this.adapter.id, error: backendErrorMessage(error) };
    }
  }
}

module.exports = { GenericHttpAdapter, AdapterExecutionError };
