const { createHash } = require('crypto');
const db = require('../database');
const { verifyProof, requestDigest, KEY } = require('./mutationProof');
const operationId = (tenant, principal, key) => createHash('sha256').update(JSON.stringify([tenant, principal, key])).digest('hex');
const trustedErrors = new WeakSet();
const failure = (status, code, message) => { const error = Object.assign(new Error(message), { status, code }); trustedErrors.add(error); return error; };
function identity(req) {
  const principal = String(req.user?.userId || req.user?.id || '');
  const tenant = req.user?.tenantId || process.env.DEPLOYMENT_TENANT_ID || 'default-enterprise';
  if (!principal) throw failure(401, 'AUTHENTICATION_REQUIRED', 'Verified customer identity is required');
  const key = req.get('Idempotency-Key');
  if (typeof key !== 'string' || !KEY.test(key)) throw failure(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A bounded Idempotency-Key header is required');
  return { principal, tenant, key, id: operationId(tenant, principal, key) };
}
function send(res, response, sendBody) {
  res.status(response.status).type('application/json');
  return sendBody.call(res, response.body);
}
async function durableMutation(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  res.set('Cache-Control', 'no-store');
  const sendBody = res.send;
  const transport = Object.fromEntries(['send', 'end', 'write', 'writeHead', 'flushHeaders'].map(name => [name, res[name]]));
  const deliver = response => { Object.assign(res, transport); return send(res, response, sendBody); };
  let captured = false; let closed = false; let timer;
  let scope;
  const responseFor = body => {
    const value = body && typeof body === 'object' && !Array.isArray(body) ? { ...body, outcome: res.statusCode >= 400 || body.success === false ? 'failed' : 'completed' } : body;
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded) > 1048576) throw failure(503, 'MUTATION_RESPONSE_TOO_LARGE', 'Mutation response exceeds its limit');
    return { status: res.statusCode, body: encoded };
  };
  try {
    scope = identity(req);
    const path = req.originalUrl.split('?')[0];
    if (req.originalUrl.includes('?')) throw failure(400, 'MUTATION_QUERY_UNSUPPORTED', 'Mutation arguments must use the JSON body');
    const hash = requestDigest({ method: req.method, path, body: req.body || {} });
    const response = await db.transaction(async client => {
      await client.query("SET LOCAL lock_timeout='15s'");
      await client.query("SET LOCAL statement_timeout='25s'");
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`banking-mutation:${scope.id}`]);
      const previous = (await client.query('SELECT request_hash,response_status,response_body FROM banking_mutation_results WHERE operation_id=$1 AND tenant_id=$2 AND principal_id=$3', [scope.id, scope.tenant, scope.principal])).rows[0];
      if (previous) {
        if (previous.request_hash !== hash) throw failure(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency-Key is bound to different request arguments');
        return { status: previous.response_status, body: previous.response_body };
      }
      if (!verifyProof(req.get('X-Servicing-Confirmation'), { scope: 'banking_http', principalId: scope.principal, tenantId: scope.tenant,
        key: scope.key, method: req.method, path, body: req.body || {} })) throw failure(403, 'CONFIRMATION_REQUIRED', 'Verified confirmation of this exact request is required');
      const result = await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(failure(503, 'MUTATION_TIMEOUT', 'Banking mutation did not complete in time')), 30000);
        for (const name of Object.keys(transport)) res[name] = () => {
          if (!closed) reject(failure(503, 'MUTATION_RESPONSE_UNSUPPORTED', 'Banking mutations must produce a terminal JSON response'));
          return res;
        };
        res.json = body => {
          if (closed || captured) return res;
          captured = true;
          try { resolve(responseFor(body)); } catch (error) { reject(error); }
          return res;
        };
        next();
      });
      clearTimeout(timer);
      if (result.status >= 400 || JSON.parse(result.body)?.success === false) throw Object.assign(failure(result.status >= 400 ? result.status : 502, 'BACKEND_REJECTED', 'Banking mutation was rejected'), { response: { ...result, status: result.status >= 400 ? result.status : 502 } });
      if (result.status < 200 || result.status >= 300 || result.status === 202) throw failure(503, 'MUTATION_RESPONSE_UNSUPPORTED', 'Banking mutation did not produce a terminal response');
      await client.query('INSERT INTO banking_mutation_results(operation_id,tenant_id,principal_id,request_hash,response_status,response_body) VALUES($1,$2,$3,$4,$5,$6)', [scope.id, scope.tenant, scope.principal, hash, result.status, result.body]);
      return result;
    });
    closed = true;
    return deliver(response);
  } catch (error) {
    closed = true;
    clearTimeout(timer);
    if (error.transactionOutcome === 'uncertain') return deliver({ status: 202, body: JSON.stringify({ success: false, outcome: 'uncertain',
      reconciliationReference: scope.key, reconcilePath: `/api/v1/mutation-status/${encodeURIComponent(scope.key)}`, code: 'RECONCILIATION_REQUIRED' }) });
    const trusted = trustedErrors.has(error);
    if (trusted && error.response) return deliver(error.response);
    const status = trusted && [400, 401, 403, 409, 503].includes(error.status) ? error.status : 503;
    return deliver({ status, body: JSON.stringify({ success: false, outcome: 'failed', code: trusted ? error.code : 'BANKING_UNAVAILABLE', error: trusted ? error.message : 'Banking mutation is unavailable' }) });
  }
}
async function mutationStatus(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    req.headers['idempotency-key'] = req.params.key;
    const scope = identity(req);
    const result = await db.transaction(async client => {
      const locked = (await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired', [`banking-mutation:${scope.id}`])).rows[0].acquired;
      if (!locked) return { status: 202, body: { success: false, outcome: 'uncertain', reconciliationReference: scope.key, reason: 'in_progress' } };
      const row = (await client.query('SELECT response_status,response_body FROM banking_mutation_results WHERE operation_id=$1 AND tenant_id=$2 AND principal_id=$3', [scope.id, scope.tenant, scope.principal])).rows[0];
      return row ? { status: 200, body: { success: true, outcome: 'completed', responseStatus: row.response_status, result: JSON.parse(row.response_body) } }
        : { status: 404, body: { success: false, outcome: 'failed', authoritative: true, found: false } };
    });
    return res.status(result.status).json(result.body);
  } catch (error) { return res.status(trustedErrors.has(error) ? error.status : 503).json({ success: false, outcome: 'uncertain', error: 'Banking outcome lookup is unavailable' }); }
}
module.exports = { durableMutation, mutationStatus, operationId };
