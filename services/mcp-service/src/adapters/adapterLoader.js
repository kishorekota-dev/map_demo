/**
 * Load generic backend adapters from a server-side config file at startup.
 *
 * The file path comes from ADAPTERS_CONFIG_PATH. If it is unset, no generic
 * adapters are registered and the service starts exactly as before (banking
 * tools only). If it is set but the file is missing, startup fails loudly
 * rather than silently running without the backends an operator expected.
 * If the file exists but a definition is invalid, startup fails loudly
 * rather than running with a partial adapter set.
 *
 * File shape:
 *   { "adapters": [ <adapter definition, see adapterContract.js>, ... ] }
 *
 * See adapters.example.json at the service root for a commented example.
 * Do not point ADAPTERS_CONFIG_PATH at a file served from the web or at a
 * path a request handler can write to.
 */

const fs = require("fs");
const logger = require("../utils/logger");

function loadAdaptersFromConfig(registryInstance, configPath) {
  if (!configPath) {
    logger.info(
      "No ADAPTERS_CONFIG_PATH set; no generic backend adapters registered",
    );
    return { registered: [], errors: [] };
  }
  let raw;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to read adapters config at ${configPath}: ${error.message}`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Adapters config at ${configPath} is not valid JSON`);
  }
  if (!parsed || !Array.isArray(parsed.adapters)) {
    throw new Error(
      `Adapters config at ${configPath} must be an object with an "adapters" array`,
    );
  }
  const registered = [];
  for (const definition of parsed.adapters) {
    const sanitized = registryInstance.register(definition);
    registered.push(sanitized.id);
  }
  logger.info("Generic backend adapters loaded from config", {
    configPath,
    registered,
  });
  return { registered, errors: [] };
}

module.exports = { loadAdaptersFromConfig };
