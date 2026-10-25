/**
 * Registry of generic backend adapters.
 *
 * Adapters are registered from a server-side config file at startup (see
 * adapterLoader.js) or programmatically (tests, service wiring). There is
 * deliberately no route that registers an adapter from a request body:
 * allowing a caller to declare an arbitrary baseUrl would let it redirect
 * the platform's service credentials and customer data to any host.
 *
 * The default export is a process-wide singleton shared by the HTTP routes
 * and the startup loader. Tests should construct their own
 * AdapterRegistry instances instead of touching the singleton.
 */

const {
  validateAdapterDefinition,
  sanitizeAdapter,
} = require("./adapterContract");
const { GenericHttpAdapter } = require("./genericHttpAdapter");
const IdempotencyStore = require("./idempotencyStore");
const logger = require("../utils/logger");

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
class AdapterRegistry {
  constructor({ httpClient = null, env = process.env } = {}) {
    this.adapters = new Map();
    this.httpClient = httpClient; // null => bounded native HTTP transport
    this.env = env;
    this.idempotencyStore = new IdempotencyStore();
  }

  register(definition) {
    const adapter = freeze(validateAdapterDefinition(definition, this.env));
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Adapter already registered: ${adapter.id}`);
    }
    // Tool names must be unique across adapters once namespaced.
    const existingNamespaced = new Set();
    for (const existing of this.adapters.values()) {
      for (const tool of existing.definition.tools)
        existingNamespaced.add(tool.namespacedName);
    }
    for (const tool of adapter.tools) {
      if (existingNamespaced.has(tool.namespacedName)) {
        throw new Error(
          `Namespaced tool already registered: ${tool.namespacedName}`,
        );
      }
    }
    const options = { idempotencyStore: this.idempotencyStore, env: this.env };
    if (this.httpClient) options.httpClient = this.httpClient;
    this.adapters.set(adapter.id, {
      definition: adapter,
      executor: new GenericHttpAdapter(adapter, options),
    });
    logger.info("Generic backend adapter registered", {
      toolCount: adapter.tools.length,
    });
    return sanitizeAdapter(adapter);
  }

  getAdapter(adapterId) {
    const entry = this.adapters.get(adapterId);
    return entry ? entry.definition : null;
  }

  listAdapters() {
    return [...this.adapters.values()].map((entry) =>
      sanitizeAdapter(entry.definition),
    );
  }

  listTools() {
    const tools = [];
    for (const entry of this.adapters.values()) {
      for (const tool of entry.definition.tools) {
        tools.push({
          adapterId: entry.definition.id,
          name: tool.namespacedName,
          description: tool.description,
          inputSchema: tool.inputSchema,
          readOnly: tool.readOnly,
          idempotency: tool.idempotency,
        });
      }
    }
    return tools;
  }

  executor(adapterId) {
    const entry = this.adapters.get(adapterId);
    if (!entry)
      throw Object.assign(new Error("Adapter not found"), { status: 404 });
    return entry.executor;
  }

  clear() {
    this.adapters.clear();
    this.idempotencyStore.clear();
  }
}

const registry = new AdapterRegistry();

module.exports = { AdapterRegistry, registry };
