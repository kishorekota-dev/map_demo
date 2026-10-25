/** Administrative adapter transport. Production execution is GET-only.
 * Mutations are non-production pilots until governed action/effect-ledger integration exists.
 */
const { createHash } = require("crypto");
const { validateParameters } = require("./adapterContract");
const { resolveAuthHeaders, credentialValues } = require("./credentialResolver");
const { createSecureHttpClient } = require("./adapterNetwork");
const IdempotencyStore = require("./idempotencyStore");
class AdapterExecutionError extends Error {
  constructor(message, { status = 400 } = {}) {
    super(message);
    this.name = "AdapterExecutionError";
    this.status = status;
  }
}
function fillPathTemplate(path, parameters) {
  const used = new Set();
  const filled = path.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, name) => {
    const value = parameters[name];
    if (
      value === undefined ||
      value === null ||
      !["string", "number"].includes(typeof value)
    )
      throw new AdapterExecutionError(
        `Missing scalar path parameter "${name}"`,
      );
    const text = String(value);
    if (
      !text ||
      [".", ".."].includes(text) ||
      /[\\/%]/.test(text) ||
      [...text].some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      )
    )
      throw new AdapterExecutionError(`Invalid path parameter "${name}"`);
    used.add(name);
    return encodeURIComponent(text);
  });
  return { filled, used };
}
function keyValid(key) {
  return (
    typeof key === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(key)
  );
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === "object"
    ? Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, canonical(value[key])]),
      )
    : value;
}
const fingerprint = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bounded = (request) => ({
  ...request,
  maxRedirects: 0,
  proxy: false,
  maxContentLength: 1048576,
  maxBodyLength: 65536,
});
const definitiveFailure = (status) => Number.isInteger(status) && status >= 400 && status < 600;
function redactCredentialData(data, values) {
  const secrets = [...new Set(values.filter((value) => typeof value === "string" && value.length))]
    .sort((a, b) => b.length - a.length);
  const redact = (value) => secrets.reduce((text, secret) => text.split(secret).join("[redacted]"), value);
  let nodes = 0;
  const visit = (value, depth = 0) => {
    if (++nodes > 100000 || depth > 64)
      throw Object.assign(new Error("Adapter response exceeds safe processing limits"), { dispatched: true });
    if (typeof value === "string") return redact(value);
    if (typeof value === "number" && secrets.includes(String(value))) return "[redacted]";
    if (Array.isArray(value)) return value.map((entry) => visit(entry, depth + 1));
    if (value && typeof value === "object") return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [redact(key), visit(entry, depth + 1)]),
    );
    return value;
  };
  return visit(data);
}
class GenericHttpAdapter {
  constructor(
    adapter,
    {
      httpClient,
      idempotencyStore = new IdempotencyStore(),
      env = process.env,
    } = {},
  ) {
    this.adapter = adapter;
    this.httpClient = httpClient || createSecureHttpClient(env);
    this.idempotencyStore = idempotencyStore;
    this.env = env;
  }
  findTool(toolName) {
    const tool = this.adapter.tools.find((item) => item.name === toolName);
    if (!tool)
      throw new AdapterExecutionError("Tool not found", { status: 404 });
    return tool;
  }
  pilotOnly(tool) {
    if (
      !tool.readOnly &&
      (this.env.NODE_ENV === "production" ||
        this.env.ADAPTER_PILOT_MUTATIONS_ENABLED !== "true")
    )
      throw new AdapterExecutionError(
        "Generic mutations require governed action integration; only explicitly enabled non-production pilots are permitted",
        { status: 403 },
      );
  }
  reconciliation(toolName, idempotencyKey) {
    return {
      reconciliationReference: idempotencyKey,
      reconciliationPath: `/api/adapters/${this.adapter.id}/reconcile`,
      reconciliationTool: toolName,
    };
  }
  async execute(toolName, parameters = {}, { idempotencyKey = null } = {}) {
    const tool = this.findTool(toolName);
    this.pilotOnly(tool);
    const validation = validateParameters(tool, parameters);
    if (!validation.valid)
      throw new AdapterExecutionError(
        "Invalid arguments. Check the registered tool schema.",
      );
    if (tool.idempotency === "required" && !idempotencyKey)
      throw new AdapterExecutionError(
        "Mutating tools require an idempotencyKey",
      );
    if (idempotencyKey !== null && !keyValid(idempotencyKey))
      throw new AdapterExecutionError("Invalid idempotencyKey");
    const { filled, used } = fillPathTemplate(tool.path, parameters);
    const url = this.adapter.baseUrl + filled;
    if (new URL(url).origin !== new URL(this.adapter.baseUrl).origin)
      throw new AdapterExecutionError(
        "Adapter path must remain on its configured origin",
      );
    return this.idempotencyStore.execute(
      this.adapter.id,
      toolName,
      idempotencyKey,
      fingerprint(parameters),
      async () => {
        const authHeaders = await resolveAuthHeaders(this.adapter, this.env, this.httpClient);
        const credentials = credentialValues(this.adapter, this.env, authHeaders);
        const headers = {
          ...this.adapter.headers,
          ...authHeaders,
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        };
        const values = Object.fromEntries(
          Object.entries(parameters).filter(([key]) => !used.has(key)),
        );
        if (
          ["GET", "DELETE"].includes(tool.method) &&
          Object.values(values).some(
            (value) => value !== null && typeof value === "object",
          )
        )
          throw new AdapterExecutionError("Query parameters must be scalars");
        const request = bounded({
          method: tool.method,
          url,
          headers,
          timeout: tool.timeoutMs,
          ...(["GET", "DELETE"].includes(tool.method)
            ? { params: values }
            : { data: values }),
        });
        const base = {
          adapterId: this.adapter.id,
          tool: toolName,
          namespacedTool: tool.namespacedName,
          replayed: false,
        };
        for (
          let attempt = 1;
          attempt <= (tool.readOnly ? tool.retry.maxAttempts : 1);
          attempt++
        ) {
          try {
            const response = await this.httpClient(request);
            if (
              response.status >= 200 &&
              response.status < 300 &&
              (tool.readOnly || response.status !== 202)
            )
              return {
                ...base,
                outcome: "completed",
                status: response.status,
                data: redactCredentialData(response.data, credentials),
              };
            if (!tool.readOnly && definitiveFailure(response.status))
              return {
                ...base,
                outcome: "failed",
                status: response.status,
                error: "Backend rejected the request. An explicit retry may use the same key.",
              };
            if (!tool.readOnly)
              return {
                ...base,
                outcome: "uncertain",
                status: response.status,
                ...this.reconciliation(toolName, idempotencyKey),
                error:
                  "Backend did not confirm a terminal outcome. Reconcile before retrying.",
              };
            if (response.status >= 500 && attempt < tool.retry.maxAttempts) {
              await sleep(200 * attempt);
              continue;
            }
            return {
              ...base,
              outcome: "failed",
              status: response.status,
              error: "Backend did not complete the read request.",
            };
          } catch (error) {
            if (!tool.readOnly) {
              const failed = definitiveFailure(error.response?.status)
                || (error.dispatched === false && !error.response);
              return {
                ...base,
                outcome: failed ? "failed" : "uncertain",
                status: error.response?.status || null,
                ...(failed ? {} : this.reconciliation(toolName, idempotencyKey)),
                error: failed
                  ? "Backend request failed. An explicit retry may use the same key."
                  : "Backend completion is unconfirmed. Check the backend outcome before retrying.",
              };
            }
            if (attempt < tool.retry.maxAttempts) {
              await sleep(200 * attempt);
              continue;
            }
            return {
              ...base,
              outcome: "failed",
              status: error.response?.status || null,
              error: "Adapter read transport is unavailable.",
            };
          }
        }
      },
    );
  }
  async reconcile(toolName, idempotencyKey) {
    const tool = this.findTool(toolName);
    if (!keyValid(idempotencyKey))
      throw new AdapterExecutionError("Invalid idempotencyKey");
    if (
      this.idempotencyStore.inFlight(this.adapter.id, toolName, idempotencyKey)
    )
      return {
        outcome: "uncertain",
        adapterId: this.adapter.id,
        tool: toolName,
        ...this.reconciliation(toolName, idempotencyKey),
        reason: "execution-in-progress",
      };
    const stored = this.idempotencyStore.get(
      this.adapter.id,
      toolName,
      idempotencyKey,
    );
    if (stored && ["completed", "failed"].includes(stored.outcome))
      return stored;
    if (!tool.statusPath)
      return {
        outcome: "uncertain",
        adapterId: this.adapter.id,
        tool: toolName,
        ...this.reconciliation(toolName, idempotencyKey),
        reason: "no-status-endpoint",
        manualSteps: [
          "Do not retry the original call with a new key.",
          "Use the backend authoritative operation record and reconcile through its owning service.",
        ],
      };
    const { filled } = fillPathTemplate(tool.statusPath, { idempotencyKey });
    try {
      const authHeaders = await resolveAuthHeaders(this.adapter, this.env, this.httpClient);
      const headers = {
        ...this.adapter.headers,
        ...authHeaders,
      };
      const credentials = credentialValues(this.adapter, this.env, authHeaders);
      const response = await this.httpClient(
        bounded({
          method: "GET",
          url: this.adapter.baseUrl + filled,
          headers,
          timeout: Math.min(tool.timeoutMs, 15000),
        }),
      );
      if (
        response.status >= 200 &&
        response.status < 300 &&
        ["completed", "failed"].includes(response.data?.status)
      ) {
        const result = {
          outcome: response.data.status,
          adapterId: this.adapter.id,
          tool: toolName,
          namespacedTool: tool.namespacedName,
          status: response.status,
          data: redactCredentialData(response.data, credentials),
          replayed: false,
        };
        this.idempotencyStore.put(
          this.adapter.id,
          toolName,
          idempotencyKey,
          result,
        );
        return result;
      }
    } catch {
      /* Unknown status stays uncertain; no raw backend error escapes. */
    }
    return {
      outcome: "uncertain",
      adapterId: this.adapter.id,
      tool: toolName,
      ...this.reconciliation(toolName, idempotencyKey),
      reason: "backend-outcome-unconfirmed",
    };
  }
  async health() {
    if (!this.adapter.healthPath)
      return {
        status: "unknown",
        reason: "no-health-path",
        adapterId: this.adapter.id,
      };
    try {
      const headers = {
        ...this.adapter.headers,
        ...(await resolveAuthHeaders(this.adapter, this.env, this.httpClient)),
      };
      const response = await this.httpClient(
        bounded({
          method: "GET",
          url: this.adapter.baseUrl + this.adapter.healthPath,
          headers,
          timeout: 5000,
        }),
      );
      return {
        status:
          response.status >= 200 && response.status < 300
            ? "healthy"
            : "unhealthy",
        adapterId: this.adapter.id,
        backendStatus: response.status,
      };
    } catch {
      return {
        status: "unhealthy",
        adapterId: this.adapter.id,
        error: "Adapter health transport unavailable.",
      };
    }
  }
}
module.exports = { GenericHttpAdapter, AdapterExecutionError, keyValid };
