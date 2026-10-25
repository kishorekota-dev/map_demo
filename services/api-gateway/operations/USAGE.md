# Measured usage and configured costs

`usage.js` mounts into the authenticated operations router under
`/api/operations`. Usage is based on actual provider response metadata or measured
executed calls. The implementation never estimates token counts from prompt
length, counts simulated calls as executed, or substitutes zero for a missing
price.

## APIs

| Method | Route | Access |
| --- | --- | --- |
| GET | `/cost-model` | Administrator |
| PUT | `/cost-model` | Administrator |
| POST | `/runtime/usage` | Verified caller access token **and** trusted servicing service token |
| GET | `/costs?days=30` | Control-plane viewer or higher |

A cost model starts at revision 0 with no configured rates. Save:

```json
{
  "revision": 0,
  "currency": "USD",
  "rates": [
    {"provider": "openai", "service": "generation", "metric": "input_tokens", "unitPrice": 0.000003},
    {"provider": "mcp", "service": "tool_execution", "metric": "calls", "unitPrice": 0.01}
  ]
}
```

The example prices are illustrative configuration values, **not vendor prices**.
`unitPrice` is the price per one recorded unit. A price quoted per million tokens
must be divided by one million before configuring a per-token metric. There may
be at most 200 unique provider/service/metric combinations. All identifiers use
lowercase letters, numbers, underscores or hyphens. Currency is a three-letter
uppercase label; the service does not convert currencies.

Published model profiles emit measured `input_tokens`/`output_tokens` using the
configured provider ID, with service `generation`, `extraction` or
`recognition`, when the provider actually returns those fields. Configure
rates for those exact provider IDs, such as `mac-studio-qwen`, rather than assuming
the plugin type is the provider ID. Legacy configuration can still emit
`openai/generation`, `slm/extraction` or `recognition/intent_recognition`. Executed MCP adapter calls emit
`mcp/tool_execution/calls`; ledger replay does not increment the call count.

The runtime submits:

```text
{eventId,sessionId,interactionId,provider,service,metric,units,version?,channel?}
```

Use a stable event ID for retries, and a different ID for each measured metric of
an operation. Input and output tokens are separate measurements. All units must
be finite, nonnegative and at most one billion per event. Zero is accepted only
as an explicitly reported measurement. The caller identity and tenant come from
verified credentials, never request body fields.

The service stores usage as normalized operational records, alongside evidence
events. A matching retry returns the original measurement with `replayed:true`.
The same event ID with different actor, units or dimensions returns 409. The
lookup and insert are serialized across replicas in the existing operations
transaction.

## Pricing and reporting

Ingestion pins the matching configured rate, currency and cost-model revision to
the measurement. Cost is recorded units multiplied by that rate, rounded to
twelve decimal places. Updating the cost model affects future measurements only;
historical events are not silently repriced. Missing rates produce
`pricingStatus:"unpriced"` and `cost:null`, even if a rate is configured later.

The cost response includes:

```text
{windowDays,currency,pricedCost,pricedRecords,unpricedRecords,totalRecords,
 completedInteractions,costPerCompletedInteraction,coverage,byDimension,
 byCurrency,reportedUsageOnly,limitations}
```

`coverage` describes pricing coverage of received records: `no_usage`, `unpriced`,
`partial` or `complete`. Different currencies are reported separately in
`byCurrency`; they are never added into a meaningless total. The top-level
`pricedCost` is null when no records are priced or when multiple currencies exist.

The denominator for cost per completed servicing interaction is the number of
distinct recorded `(sessionId, interactionId)` pairs with a `runtime.execution` event at the
`conversation` stage and outcome `succeeded`, `complete` or `completed` in the same
window. Duplicate success events do not inflate that count. The numerator includes
recorded priced usage in the window, including usage spent on failed attempts.
The ratio is null when there are unpriced records, mixed currencies or no recorded
successful interactions.

These are operational cost estimates using administrator-configured rates, not
vendor invoices. Taxes, committed-use discounts, provider billing adjustments and
unreported telemetry are not inferred. `reportedUsageOnly:true` makes that scope
explicit: a telemetry outage is not evidence of zero consumption.

## Tests

`operations/__tests__/usage.test.js` covers authorization, rate validation,
optimistic model updates, concurrent measurement deduplication, rate snapshots,
unpriced records, completed-interaction counts and mixed currencies. Set
`TEST_OPERATIONS_DATABASE_URL` to a disposable PostgreSQL instance to run the
database cases.
