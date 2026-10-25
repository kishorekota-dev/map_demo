/** Server-owned adapter declarations; this validates the supported bounded schema subset. */
const { validateEndpoint } = require("./adapterNetwork");
const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,99}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]{0,127}$/;
const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const FORBIDDEN_FIELDS = new Set(["__proto__", "prototype", "constructor"]);
const HEADER = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const FORBIDDEN_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "cookie",
  "set-cookie",
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-connection",
  "idempotency-key",
]);
class AdapterValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AdapterValidationError";
  }
}
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const only = (value, allowed) =>
  object(value) && Object.keys(value).every((key) => allowed.includes(key));
const text = (value, max) =>
  typeof value === "string" && !!value.trim() && value.length <= max;
const field = (name) => FIELD.test(name) && !FORBIDDEN_FIELDS.has(name);
function namespacedToolName(adapterId, toolName) {
  return `${adapterId.replace(/-/g, "_")}_${toolName}`;
}
function validPath(path, allowedFields = []) {
  if (
    typeof path !== "string" ||
    path.length > 2000 ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\?#\s]/.test(path)
  )
    return false;
  if (
    [...path.matchAll(/\{([^{}]*)\}/g)].some(
      (match) => !allowedFields.includes(match[1]),
    )
  )
    return false;
  const rendered = path.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, "value");
  if (/[{}]/.test(rendered)) return false;
  try {
    return rendered.split("/").every((segment) => {
      const decoded = decodeURIComponent(segment);
      return (
        ![".", ".."].includes(decoded) &&
        !/[\\/%?#\s]/.test(decoded) &&
        ![...decoded].some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        )
      );
    });
  } catch {
    return false;
  }
}
function validHeader(name, value, auth = false) {
  return (
    typeof name === "string" &&
    name.length <= 100 &&
    HEADER.test(name) &&
    !(auth
      ? new Set([
          "host",
          "connection",
          "content-length",
          "transfer-encoding",
          "cookie",
          "set-cookie",
          "proxy-authorization",
          "idempotency-key",
        ]).has(name.toLowerCase())
      : FORBIDDEN_HEADERS.has(name.toLowerCase())) &&
    (value === undefined ||
      (typeof value === "string" &&
        value.length <= 2000 &&
        !/[\r\n\0]/.test(value)))
  );
}
function validateSchema(schema, depth = 0) {
  if (
    depth > 5 ||
    !object(schema) ||
    (schema.description !== undefined && !text(schema.description, 2000))
  )
    return false;
  const primitive = ["string", "number", "integer", "boolean", "null"];
  if (schema.type === "object") {
    if (
      !only(schema, [
        "type",
        "properties",
        "required",
        "additionalProperties",
        "description",
      ]) ||
      !object(schema.properties) ||
      Object.keys(schema.properties).length > 64 ||
      schema.additionalProperties === true
    )
      return false;
    if (
      schema.additionalProperties !== undefined &&
      schema.additionalProperties !== false
    )
      return false;
    const required = schema.required === undefined ? [] : schema.required;
    return (
      Array.isArray(required) &&
      new Set(required).size === required.length &&
      required.every(
        (name) => field(name) && Object.hasOwn(schema.properties, name),
      ) &&
      Object.entries(schema.properties).every(
        ([name, rule]) => field(name) && validateSchema(rule, depth + 1),
      )
    );
  }
  if (schema.type === "array")
    return (
      only(schema, ["type", "items", "minItems", "maxItems", "description"]) &&
      validateSchema(schema.items, depth + 1) &&
      (schema.minItems === undefined ||
        (Number.isInteger(schema.minItems) &&
          schema.minItems >= 0 &&
          schema.minItems <= 100)) &&
      (schema.maxItems === undefined ||
        (Number.isInteger(schema.maxItems) &&
          schema.maxItems >= (schema.minItems || 0) &&
          schema.maxItems <= 100))
    );
  if (
    !primitive.includes(schema.type) ||
    !only(schema, [
      "type",
      "enum",
      "minimum",
      "maximum",
      "minLength",
      "maxLength",
      "description",
    ])
  )
    return false;
  if (
    schema.enum !== undefined &&
    (!Array.isArray(schema.enum) ||
      !schema.enum.length ||
      schema.enum.length > 100 ||
      schema.enum.some(
        (value) =>
          !["string", "number", "boolean"].includes(typeof value) &&
          value !== null,
      ))
  )
    return false;
  for (const bound of ["minimum", "maximum"])
    if (
      schema[bound] !== undefined &&
      (!["number", "integer"].includes(schema.type) ||
        !Number.isFinite(schema[bound]))
    )
      return false;
  if (
    schema.minimum !== undefined &&
    schema.maximum !== undefined &&
    schema.minimum > schema.maximum
  )
    return false;
  for (const bound of ["minLength", "maxLength"])
    if (
      schema[bound] !== undefined &&
      (schema.type !== "string" ||
        !Number.isInteger(schema[bound]) ||
        schema[bound] < 0 ||
        schema[bound] > 4000)
    )
      return false;
  return !(
    schema.minLength !== undefined &&
    schema.maxLength !== undefined &&
    schema.minLength > schema.maxLength
  );
}
function validateAdapterDefinition(definition, env = process.env) {
  const fail = (message) => {
    throw new AdapterValidationError(`Invalid adapter definition: ${message}`);
  };
  if (
    !only(definition, [
      "id",
      "name",
      "version",
      "baseUrl",
      "auth",
      "headers",
      "healthPath",
      "tools",
    ]) ||
    !ID_PATTERN.test(definition.id || "") ||
    definition.id === "banking" ||
    !text(definition.name, 120) ||
    !text(definition.version, 100)
  )
    fail("provide supported fields, id, name and version");
  let url;
  try {
    url = validateEndpoint(definition.baseUrl, env);
  } catch (error) {
    fail(error.message);
  }
  const baseUrl = url.toString().replace(/\/+$/, "");
  const auth = definition.auth || { type: "none" };
  const authFields = {
    none: ["type"],
    apiKey: ["type", "envVar", "headerName"],
    bearer: ["type", "envVar"],
    basic: ["type", "envVarUsername", "envVarPassword"],
    "oauth2-client-credentials": [
      "type",
      "envVarClientId",
      "envVarClientSecret",
      "tokenUrl",
      "scope",
    ],
  };
  if (
    !object(auth) ||
    !Object.hasOwn(authFields, auth.type) ||
    !only(auth, authFields[auth.type])
  )
    fail("unsupported auth definition");
  for (const name of authFields[auth.type].filter((name) =>
    name.startsWith("envVar"),
  ))
    if (!ENV_NAME.test(auth[name] || ""))
      fail("credentials must reference valid environment names");
  if (
    auth.type === "apiKey" &&
    !validHeader(auth.headerName || "X-Api-Key", undefined, true)
  )
    fail("invalid API-key header");
  if (auth.type === "oauth2-client-credentials") {
    try {
      validateEndpoint(auth.tokenUrl, env);
    } catch (error) {
      fail(error.message);
    }
    if (auth.scope !== undefined && !text(auth.scope, 2000))
      fail("invalid OAuth scope");
  }
  const headers = definition.headers || {};
  if (
    !object(headers) ||
    Object.keys(headers).length > 20 ||
    new Set(Object.keys(headers).map((name) => name.toLowerCase())).size !==
      Object.keys(headers).length ||
    (auth.type === "apiKey" &&
      Object.keys(headers).some(
        (name) =>
          name.toLowerCase() === (auth.headerName || "X-Api-Key").toLowerCase(),
      )) ||
    Object.entries(headers).some(([name, value]) => !validHeader(name, value))
  )
    fail(
      "static headers must be bounded and cannot override transport/credential headers",
    );
  if (definition.healthPath !== undefined && !validPath(definition.healthPath))
    fail("invalid healthPath");
  if (
    !Array.isArray(definition.tools) ||
    !definition.tools.length ||
    definition.tools.length > 100
  )
    fail("provide 1–100 tools");
  const names = new Set();
  const tools = definition.tools.map((tool) => {
    if (
      !only(tool, [
        "name",
        "description",
        "method",
        "path",
        "readOnly",
        "idempotency",
        "inputSchema",
        "timeoutMs",
        "retry",
        "statusPath",
      ]) ||
      !TOOL_NAME_PATTERN.test(tool.name || "") ||
      names.has(tool.name) ||
      !text(tool.description, 2000)
    )
      fail("invalid or duplicate tool name/description");
    names.add(tool.name);
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(tool.method))
      fail("unsupported tool method");
    if (!validateSchema(tool.inputSchema) || tool.inputSchema.type !== "object")
      fail(
        "invalid inputSchema; only the documented bounded schema subset is supported",
      );
    const fields = Object.entries(tool.inputSchema.properties)
      .filter(([, rule]) => ["string", "number", "integer"].includes(rule.type))
      .map(([name]) => name);
    if (
      !validPath(tool.path, fields) ||
      (tool.statusPath !== undefined &&
        (!validPath(tool.statusPath, ["idempotencyKey"]) ||
          !tool.statusPath.includes("{idempotencyKey}")))
    )
      fail("invalid path template");
    if (tool.readOnly !== undefined && typeof tool.readOnly !== "boolean")
      fail("readOnly must be a boolean");
    if (
      (tool.method !== "GET" && tool.readOnly === true) ||
      (tool.method === "GET" && tool.readOnly === false)
    )
      fail("only GET tools are readOnly");
    const readOnly = tool.method === "GET";
    const idempotency =
      tool.idempotency || (readOnly ? "optional" : "required");
    if (
      !["required", "optional"].includes(idempotency) ||
      (!readOnly && idempotency !== "required")
    )
      fail("mutations require idempotency");
    const timeoutMs = tool.timeoutMs === undefined ? 30000 : tool.timeoutMs;
    const retry = tool.retry || {};
    const maxAttempts = retry.maxAttempts === undefined ? 1 : retry.maxAttempts;
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1000 ||
      timeoutMs > 120000 ||
      !only(retry, ["maxAttempts"]) ||
      !Number.isInteger(maxAttempts) ||
      maxAttempts < 1 ||
      maxAttempts > 3 ||
      (!readOnly && maxAttempts !== 1)
    )
      fail("invalid timeout/retry; mutations cannot auto-retry");
    return {
      ...tool,
      readOnly,
      idempotency,
      timeoutMs,
      retry: { maxAttempts },
      namespacedName: namespacedToolName(definition.id, tool.name),
    };
  });
  return JSON.parse(
    JSON.stringify({ ...definition, baseUrl, auth, headers, tools }),
  );
}
function validateParameters(tool, parameters) {
  const errors = [];
  function visit(schema, value, path) {
    if (schema.type === "object") {
      if (!object(value)) {
        errors.push(`${path} must be an object`);
        return;
      }
      for (const key of Object.keys(value))
        if (!Object.hasOwn(schema.properties, key))
          errors.push(`${path}.${key} is not a declared field`);
      for (const key of schema.required || [])
        if (
          !Object.hasOwn(value, key) ||
          value[key] === undefined ||
          value[key] === null ||
          value[key] === ""
        )
          errors.push(`${path}.${key} is required`);
      for (const [key, rule] of Object.entries(schema.properties))
        if (Object.hasOwn(value, key))
          visit(rule, value[key], `${path}.${key}`);
    } else if (schema.type === "array") {
      if (
        !Array.isArray(value) ||
        value.length > (schema.maxItems ?? 100) ||
        value.length < (schema.minItems || 0)
      ) {
        errors.push(`${path} must be a bounded array`);
        return;
      }
      value.forEach((item, index) =>
        visit(schema.items, item, `${path}.${index}`),
      );
    } else {
      const valid =
        schema.type === "null"
          ? value === null
          : schema.type === "integer"
            ? Number.isSafeInteger(value)
            : schema.type === "number"
              ? typeof value === "number" && Number.isFinite(value)
              : typeof value === schema.type;
      if (!valid) {
        errors.push(`${path} has an invalid type`);
        return;
      }
      if (
        typeof value === "string" &&
        (value.length > (schema.maxLength ?? 4000) ||
          value.length < (schema.minLength || 0))
      )
        errors.push(`${path} has an invalid length`);
      if (
        typeof value === "number" &&
        ((schema.minimum !== undefined && value < schema.minimum) ||
          (schema.maximum !== undefined && value > schema.maximum))
      )
        errors.push(`${path} is outside numeric bounds`);
      if (schema.enum && !schema.enum.includes(value))
        errors.push(`${path} is outside the declared enum`);
    }
  }
  visit(tool.inputSchema, parameters, "parameters");
  try {
    if (Buffer.byteLength(JSON.stringify(parameters)) > 65536)
      errors.push("parameters exceed 64KiB");
  } catch {
    errors.push("parameters must be JSON data");
  }
  return { valid: !errors.length, errors };
}
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
  validPath,
};
