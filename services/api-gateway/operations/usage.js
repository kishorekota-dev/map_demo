const { createHash } = require('crypto');
const { OperationsError } = require('./store');
const { identifier, text, object } = require('../control-plane/config');

const eventIdentifier = (value) => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(value);
const dimensionKey = (value) => `${value.provider}:${value.service}:${value.metric}`;

function validateCostModel(body) {
  if (!object(body) || typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency)
    || !Number.isInteger(body.revision) || body.revision < 0 || !Array.isArray(body.rates) || body.rates.length > 200) {
    throw new OperationsError(400, 'Provide revision, a three-letter currency and at most 200 unit rates.');
  }
  const keys = new Set();
  for (const rate of body.rates) {
    if (!object(rate) || !identifier(rate.provider) || !identifier(rate.service) || !identifier(rate.metric)
      || !Number.isFinite(rate.unitPrice) || rate.unitPrice < 0 || rate.unitPrice > 1000000 || keys.has(dimensionKey(rate))) {
      throw new OperationsError(400, 'Each unique provider/service/metric needs a finite unitPrice between 0 and 1000000.');
    }
    keys.add(dimensionKey(rate));
  }
}

function mountUsageRoutes(router, { store, route, authorize, runtime, fingerprintActor }) {
  router.get('/cost-model', authorize('canPublish'), route(async (req, res) => {
    const model = await store.get('cost_model', 'default');
    res.json(model ? { ...model, configured: true } : { id: 'default', revision: 0, currency: 'USD', rates: [], configured: false });
  }));
  router.put('/cost-model', authorize('canPublish'), route(async (req, res) => {
    validateCostModel(req.body);
    const result = await store.transaction(async (tx) => {
      const model = await tx.put('cost_model', 'default', {
        currency: req.body.currency,
        rates: req.body.rates.map(({ provider, service, metric, unitPrice }) => ({ provider, service, metric, unitPrice })),
        updatedAt: new Date().toISOString(), updatedBy: fingerprintActor(req)
      }, req.body.revision);
      await tx.event({ type: 'usage.cost_model_updated', modelRevision: model.revision, currency: model.currency, rateCount: model.rates.length, actorHash: fingerprintActor(req) });
      return model;
    });
    res.json({ ...result, configured: true });
  }));
  router.post('/runtime/usage', runtime, route(async (req, res) => {
    const b = req.body;
    if (!object(b) || !eventIdentifier(b.eventId) || !text(b.sessionId, 200) || !text(b.interactionId, 200)
      || !identifier(b.provider) || !identifier(b.service) || !identifier(b.metric)
      || !Number.isFinite(b.units) || b.units < 0 || b.units > 1000000000
      || (b.version !== undefined && (!Number.isInteger(b.version) || b.version < 1))
      || (b.channel !== undefined && !['digital', 'ava', 'ivr'].includes(b.channel))) {
      throw new OperationsError(400, 'A usage event needs stable eventId, sessionId, interactionId, provider/service/metric and measured nonnegative units (maximum 1000000000).');
    }
    const input = { eventId: b.eventId, sessionId: b.sessionId, interactionId: b.interactionId, provider: b.provider, service: b.service, metric: b.metric, units: b.units, version: b.version ?? null, channel: b.channel ?? null, actorHash: fingerprintActor(req) };
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const id = createHash('sha256').update(b.eventId).digest('hex');
    let replayed = false;
    const result = await store.transaction(async (tx) => {
      const existing = await tx.get('usage', id);
      if (existing) {
        if (existing.requestDigest !== digest) throw new OperationsError(409, 'Usage event ID was already recorded with different measurements.');
        replayed = true; return existing;
      }
      const model = await tx.get('cost_model', 'default');
      const rate = model?.rates.find((entry) => dimensionKey(entry) === dimensionKey(input));
      const cost = rate ? Number((input.units * rate.unitPrice).toFixed(12)) : null;
      const record = await tx.put('usage', id, { ...input, requestDigest: digest, pricingStatus: rate ? 'priced' : 'unpriced', currency: rate ? model.currency : null, unitPrice: rate ? rate.unitPrice : null, cost, modelRevision: model?.revision || null, createdAt: new Date().toISOString() });
      await tx.event({ type: 'usage.recorded', usageId: id, interactionId: input.interactionId, sessionId: input.sessionId, provider: input.provider, service: input.service, metric: input.metric, units: input.units, pricingStatus: record.pricingStatus, actorHash: input.actorHash });
      return record;
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  }));
  router.get('/costs', authorize('canView'), route(async (req, res) => {
    const days = req.query.days === undefined ? 30 : typeof req.query.days === 'string' && /^\d+$/.test(req.query.days) ? Number(req.query.days) : NaN;
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new OperationsError(400, 'days must be an integer from 1 to 365.');
    const [groups, completion] = await Promise.all([
      store.query(`SELECT document->>'provider' AS provider, document->>'service' AS service, document->>'metric' AS metric,
        document->>'currency' AS currency, sum((document->>'units')::numeric) AS units,
        sum((document->>'cost')::numeric) AS priced_cost,
        count(*) FILTER (WHERE document->>'pricingStatus'='priced')::int AS priced_records,
        count(*) FILTER (WHERE document->>'pricingStatus'='unpriced')::int AS unpriced_records
        FROM servicing_operations_records WHERE tenant_id=$1 AND kind='usage' AND created_at>=NOW()-($2::int*INTERVAL '1 day')
        GROUP BY 1,2,3,4 ORDER BY 1,2,3,4`, [store.tenantId, days]),
      store.query(`SELECT count(DISTINCT (document->>'sessionId', document->>'interactionId'))::int AS completed
        FROM servicing_operations_events WHERE tenant_id=$1 AND document->>'type'='runtime.execution'
        AND document->>'stage'='conversation' AND document->>'outcome' IN ('succeeded','complete','completed')
        AND document->>'sessionId' IS NOT NULL AND document->>'interactionId' IS NOT NULL
        AND created_at>=NOW()-($2::int*INTERVAL '1 day')`, [store.tenantId, days])
    ]);
    const byDimension = groups.rows.map((row) => ({ provider: row.provider, service: row.service, metric: row.metric, currency: row.currency, units: Number(row.units), pricedCost: row.priced_cost === null ? null : Number(row.priced_cost), pricedRecords: row.priced_records, unpricedRecords: row.unpriced_records }));
    const totals = new Map();
    for (const row of byDimension) if (row.currency && row.pricedRecords) {
      const total = totals.get(row.currency) || { currency: row.currency, pricedCost: 0, pricedRecords: 0 };
      total.pricedCost += row.pricedCost; total.pricedRecords += row.pricedRecords; totals.set(row.currency, total);
    }
    const byCurrency = [...totals.values()].map((entry) => ({ ...entry, pricedCost: Number(entry.pricedCost.toFixed(12)) }));
    const pricedRecords = byDimension.reduce((sum, row) => sum + row.pricedRecords, 0);
    const unpricedRecords = byDimension.reduce((sum, row) => sum + row.unpricedRecords, 0);
    const completedInteractions = completion.rows[0].completed;
    const currency = byCurrency.length === 1 ? byCurrency[0].currency : null;
    const pricedCost = currency ? byCurrency[0].pricedCost : null;
    res.json({ windowDays: days, currency, pricedCost, pricedRecords, unpricedRecords, totalRecords: pricedRecords + unpricedRecords,
      completedInteractions, costPerCompletedInteraction: currency && completedInteractions > 0 && unpricedRecords === 0 ? Number((pricedCost / completedInteractions).toFixed(12)) : null,
      coverage: !pricedRecords && !unpricedRecords ? 'no_usage' : !pricedRecords ? 'unpriced' : unpricedRecords ? 'partial' : 'complete',
      byDimension, byCurrency, reportedUsageOnly: true,
      limitations: ['Costs use actual recorded units and configured unit rates; they are operational estimates, not vendor invoices.', 'Missing rates remain explicitly unpriced; price changes apply only to future usage events.', 'Completed interactions count distinct successful sessionId/interactionId pairs within the same time window.', 'Incomplete pricing or mixed currencies prevents a total cost-per-completed-interaction calculation.', 'Only successfully reported measurements are included; unavailable telemetry is not evidence of zero usage.'] });
  }));
}
module.exports = { mountUsageRoutes, validateCostModel };
