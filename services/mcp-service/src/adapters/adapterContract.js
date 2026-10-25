/**
 * Generic backend adapter contract (v1).
 *
 * A backend adapter is a server-side declaration of how the platform talks to
 * ONE company's backend system (CRM, ticketing, core banking, billing, ...).
 * It is NOT a plugin marketplace: adapters are declared in a server-side
 * config file read at startup, never registered through a public API, so a
 * caller cannot point the platform at an arbitrary endpoint or smuggle in
 * credentials. Service credentials always come from environment variables
 * named in the declaration; they are never accepted in a request body, never
 * logged, and never returned in any response.
 *
 * Existing banking tools (completeBankingTools) are unchanged. This framework
 * sits beside them so new backends do not require a new hard-coded tool
 * class per company.
 *
 * Naming: a tool is discovered as `<adapterId>_<toolName>` with `-` in the
 * adapter id converted to `_`, so tools from different adapters can never
 * collide with each other or with the existing un-prefixed banking tools.
 */

const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,99}$/;
const PATH_TEMPLATE_PATTERN = /^\/[A-Za-z0-9\-._~!$&'()*+,;=:@{}%/]*$/;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const AUTH_TYPES = new Set(['none', 'apiKey', 'bearer', 'basic', 'oauth2-client-credentials']);
const FORBIDDEN_STATIC_HEADERS = new Set(['authorization', 'x-api-key', 'cookie', 'set-cookie']);

class AdapterValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdapterValidationError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function namespacedToolName(adapterId, toolName) {
  return `${adapterId.replace(/-/g, '_')}_${toolName}`;
}

/**
 * Validate an adapter definition and return a normalized copy with defaults
 * applied. Throws AdapterValidationError on the first problem found. Pure:
 * no I/O, no environment access (credential presence is checked separately
 * by credentialResolver at execution time, so a definition can be validated
 * without its secrets being present).
 *
 * @param {object} definition raw adapter definition
 * @param {object} [env] environment used only for the production-https rule
 */
function validateAdapterDefinition(definition, env = process.env) {
  if (!isPlainObject(definition)) {
    throw new AdapterValidationError('Adapter definition must be an object');
  }
  const errors = [];
  const fail = (message) => errors.push(message);

  if (!ID_PATTERN.test(definition.id || '')) {
    fail('id must match /^[a-z][a-z0-9-]{1,63}$/ (lowercase, starts with a letter)');
  }
  if (typeof definition.name !== 'string' || !definition.name.trim()) {
    fail('name is required');
  }
  if (typeof definition.version !== 'string' || !definition.version.trim()) {
    fail('version is required');
  }

  // Base URL: http/https only, no embedded credentials, no trailing slash.
  let baseUrl = '';
  if (typeof definition.baseUrl !== 'string' || !definition.baseUrl.trim()) {
    fail('baseUrl is required');
  } else {
    baseUrl = definition.baseUrl.trim().replace(/\/+$/, '');
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      fail('baseUrl must be a valid URL');
    }
    if (parsed) {
      if (!['http:', 'https:'].includes(parsed.protocol)) fail('baseUrl must use http or https');
      if (parsed.username || parsed.password) fail('baseUrl must not embed credentials');
      if (env && env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
        fail('baseUrl must use https in production');
      }
    }
  }

  // Auth: credentials are referenced by environment variable name only.
  const auth = definition.auth || { type: 'none' };
  if (!isPlainObject(auth) || !AUTH_TYPES.has(auth.type)) {
    fail(`auth.type must be one of: ${[...AUTH_TYPES].join(', ')}`);
  } else if (auth.type === 'apiKey' || auth.type === 'bearer') {
    if (typeof auth.envVar !== 'string' || !auth.envVar.trim()) fail(`auth.envVar is required for ${auth.type}`);
    if (auth.headerName !== undefined && (typeof auth.headerName !== 'string' || !auth.headerName.trim())) {
      fail('auth.headerName must be a non-empty string when provided');
    }
  } else if (auth.type === 'basic') {
    if (typeof auth.envVarUsername !== 'string' || !auth.envVarUsername.trim()) fail('auth.envVarUsername is required for basic');
    if (typeof auth.envVarPassword !== 'string' || !auth.envVarPassword.trim()) fail('auth.envVarPassword is required for basic');
  } else if (auth.type === 'oauth2-client-credentials') {
    if (typeof auth.envVarClientId !== 'string' || !auth.envVarClientId.trim()) fail('auth.envVarClientId is required for oauth2-client-credentials');
    if (typeof auth.envVarClientSecret !== 'string' || !auth.envVarClientSecret.trim()) fail('auth.envVarClientSecret is required for oauth2-client-credentials');
    if (typeof auth.tokenUrl !== 'string' || !auth.tokenUrl.trim()) fail('auth.tokenUrl is required for oauth2-client-credentials');
  }

  // Static headers: literal values only, never a credential header.
  const headers = definition.headers || {};
  if (!isPlainObject(headers)) {
    fail('headers must be an object');
  } else {
    for (const [name, value] of Object.entries(headers)) {
      if (FORBIDDEN_STATIC_HEADERS.has(name.toLowerCase())) {
        fail(`headers must not include "${name}" — use auth instead`);
      }
      if (typeof value !== 'string') fail(`headers["${name}"] must be a string`);
    }
  }

  if (definition.healthPath !== undefined) {
    if (typeof definition.healthPath !== 'string' || !PATH_TEMPLATE_PATTERN.test(definition.healthPath)) {
      fail('healthPath must start with / and contain only URL-safe characters');
    }
  }

  // Tools.
  if (!Array.isArray(definition.tools) || definition.tools.length === 0) {
    fail('tools must be a non-empty array');
  }
  const seenToolNames = new Set();
  const tools = [];
  if (Array.isArray(definition.tools)) {
    for (const tool of definition.tools) {
      if (!isPlainObject(tool)) {
        fail('each tool must be an object');
        continue;
      }
      if (!TOOL_NAME_PATTERN.test(tool.name || '')) {
        fail(`tool name "${tool.name}" must match /^[a-z][a-z0-9_]{1,99}$/`);
        continue;
      }
      if (seenToolNames.has(tool.name)) {
        fail(`duplicate tool name "${tool.name}"`);
        continue;
      }
      seenToolNames.add(tool.name);
      if (typeof tool.description !== 'string' || !tool.description.trim()) {
        fail(`tool "${tool.name}" requires a description`);
      }
      if (!METHODS.has(tool.method)) {
        fail(`tool "${tool.name}" method must be one of: ${[...METHODS].join(', ')}`);
      }
      if (typeof tool.path !== 'string' || !PATH_TEMPLATE_PATTERN.test(tool.path)) {
        fail(`tool "${tool.name}" path must start with / and contain only URL-safe characters`);
      }
      if (tool.path.includes('..')) fail(`tool "${tool.name}" path must not contain ".."`);
      if (!isPlainObject(tool.inputSchema) || tool.inputSchema.type !== 'object' || !isPlainObject(tool.inputSchema.properties)) {
        fail(`tool "${tool.name}" inputSchema must be an object schema with properties`);
      }
      if (tool.inputSchema.required !== undefined && !Array.isArray(tool.inputSchema.required)) {
        fail(`tool "${tool.name}" inputSchema.required must be an array`);
      }
      const readOnly = tool.readOnly === true || tool.method === 'GET';
      // Mutating tools are idempotent by default; a caller must supply an
      // idempotencyKey, and the adapter forwards it as Idempotency-Key so
      // the backend can dedupe even if this process restarts.
      const idempotency = tool.idempotency || (readOnly ? 'optional' : 'required');
      if (!['required', 'optional'].includes(idempotency)) {
        fail(`tool "${tool.name}" idempotency must be "required" or "optional"`);
      }
      const timeoutMs = tool.timeoutMs === undefined ? 30000 : tool.timeoutMs;
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
        fail(`tool "${tool.name}" timeoutMs must be an integer between 1000 and 120000`);
      }
      const retry = tool.retry || {};
      const maxAttempts = retry.maxAttempts === undefined ? 1 : retry.maxAttempts;
      // Automatic retries are read-only only (see genericHttpAdapter): a
      // retried mutation could execute twice.
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
        fail(`tool "${tool.name}" retry.maxAttempts must be an integer between 1 and 3`);
      }
      if (tool.statusPath !== undefined && (typeof tool.statusPath !== 'string' || !PATH_TEMPLATE_PATTERN.test(tool.statusPath))) {
        fail(`tool "${tool.name}" statusPath must start with / and contain only URL-safe characters`);
      }
      tools.push({
        ...tool,
        readOnly,
        idempotency,
        timeoutMs,
        retry: { maxAttempts },
        namespacedName: namespacedToolName(definition.id, tool.name),
      });
    }
  }

  if (errors.length) {
    throw new AdapterValidationError(`Invalid adapter "${definition.id || 'unknown'}": ${errors.join('; ')}`);
  }
  return {
    ...definition,
    baseUrl,
    auth: { ...auth },
    headers: { ...headers },
    tools,
  };
}

/**
 * Validate tool parameters against its inputSchema. Same checks as the
 * banking tool validator: required presence, primitive type, enum
 * membership, numeric minimum. Deterministic and dependency-free.
 */
function validateParameters(tool, parameters) {
  const schema = tool.inputSchema || {};
  const props = schema.properties || {};
  const required = schema.required || [];
  const errors = [];
  for (const field of required) {
    if (parameters[field] === undefined || parameters[field] === null || parameters[field] === '') {
      errors.push(`missing required field "${field}"`);
    }
  }
  for (const [field, rule] of Object.entries(props)) {
    const value = parameters[field];
    if (value === undefined || value === null) continue;
    if (rule.type === 'number') {
      if (typeof value !== 'number' || Number.isNaN(value)) errors.push(`"${field}" must be a number`);
      else if (rule.minimum !== undefined && value < rule.minimum) errors.push(`"${field}" must be >= ${rule.minimum}`);
    } else if (rule.type === 'string' && typeof value !== 'string') {
      errors.push(`"${field}" must be a string`);
    } else if (rule.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`"${field}" must be a boolean`);
    } else if (rule.type === 'integer' && !Number.isInteger(value)) {
      errors.push(`"${field}" must be an integer`);
    }
    if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
      errors.push(`"${field}" must be one of: ${rule.enum.join(', ')}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Public view of an adapter: no credential values, only their names. */
function sanitizeAdapter(adapter) {
  return {
    id: adapter.id,
    name: adapter.name,
    version: adapter.version,
    baseUrl: adapter.baseUrl,
    authType: adapter.auth.type,
    healthPath: adapter.healthPath || null,
    tools: adapter.tools.map((tool) => ({
      name: tool.name,
      namespacedName: tool.namespacedName,
      description: tool.description,
      method: tool.method,
      path: tool.path,
      readOnly: tool.readOnly,
      idempotency: tool.idempotency,
      inputSchema: tool.inputSchema,
      statusPath: tool.statusPath || null,
    })),
  };
}

module.exports = {
  AdapterValidationError,
  validateAdapterDefinition,
  validateParameters,
  namespacedToolName,
  sanitizeAdapter,
};
