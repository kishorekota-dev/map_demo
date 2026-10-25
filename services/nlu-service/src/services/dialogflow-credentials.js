const { createPrivateKey } = require('crypto');

// Explicit server environment credentials only. Do not pass arbitrary JSON
// options, token endpoints, key files, or ambient ADC through to the SDK.
function clientOptions(dialogflow, env = process.env) {
  if (typeof dialogflow.projectId !== 'string' || !/^[a-z][a-z0-9-]{4,62}[a-z0-9]$/.test(dialogflow.projectId)) {
    throw new Error('DIALOGFLOW_PROJECT_ID is required and must be a valid project identifier.');
  }
  const raw = env.DIALOGFLOW_CREDENTIALS_JSON;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 32768) {
    throw new Error('DIALOGFLOW_CREDENTIALS_JSON must contain server environment service-account credentials.');
  }
  let credentials;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || parsed.type !== 'service_account' ||
        typeof parsed.client_email !== 'string' || parsed.client_email.length > 254 ||
        !/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.iam\.gserviceaccount\.com$/.test(parsed.client_email) ||
        typeof parsed.private_key !== 'string' || parsed.private_key.length > 16384 ||
        createPrivateKey(parsed.private_key).asymmetricKeyType !== 'rsa') {
      throw new Error('Invalid credentials');
    }
    credentials = { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch (_error) {
    throw new Error('DIALOGFLOW_CREDENTIALS_JSON must contain valid service-account JSON and an RSA private key.');
  }
  return { projectId: dialogflow.projectId, credentials };
}

function unavailableError() {
  const error = new Error('Dialogflow provider is unavailable.');
  error.code = 'DIALOGFLOW_UNAVAILABLE';
  error.status = 503;
  return error;
}

function safeProviderResult(value, secretValues = []) {
  let remaining = 100000;
  const redact = text => secretValues.filter(Boolean).reduce((result, secret) => result.split(secret).join('[REDACTED]'), text);
  const visit = (item, depth) => {
    if (--remaining < 0 || depth > 64) throw unavailableError();
    if (typeof item === 'string') return redact(item);
    if (!item || typeof item !== 'object') return item;
    if (Array.isArray(item)) return item.map(child => visit(child, depth + 1));
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [redact(key), visit(child, depth + 1)]));
  };
  return visit(value, 0);
}

module.exports = { clientOptions, unavailableError, safeProviderResult };
