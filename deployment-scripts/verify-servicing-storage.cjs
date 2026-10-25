// A bounded, non-production PostgreSQL write/read probe. No provider calls.
const { randomUUID, createHash } = require('crypto');
const { performance } = require('perf_hooks');
const { OperationsStore } = require('../services/api-gateway/operations/store');
async function main() {
  const databaseUrl = process.env.TEST_OPERATIONS_DATABASE_URL;
  if (!databaseUrl) throw new Error('Set TEST_OPERATIONS_DATABASE_URL to a disposable database.');
  const count = Number(process.env.SERVICING_STORAGE_PROBE_COUNT || 200);
  if (!Number.isInteger(count) || count < 20 || count > 5000) throw new Error('Probe count must be 20–5000.');
  const tenantId = `storage-probe-${randomUUID()}`;
  const store = new OperationsStore({ databaseUrl, tenantId });
  try {
    await store.initialize();
    const latencies = []; const started = performance.now();
    for (let offset = 0; offset < count; offset += 20) {
      await Promise.all(Array.from({ length: Math.min(20, count - offset) }, async (_, index) => {
        const before = performance.now();
        await store.transaction(tx => tx.event({ type: 'probe', sessionId: `synthetic-${offset + index}`, outcome: 'succeeded' }));
        latencies.push(performance.now() - before);
      }));
    }
    const elapsedMs = performance.now() - started;
    const result = await store.query('SELECT document,hash,previous_hash FROM servicing_operations_events WHERE tenant_id=$1 ORDER BY seq', [tenantId]);
    let previous = '0'.repeat(64);
    for (const event of result.rows) {
      if (event.previous_hash !== previous || event.hash !== createHash('sha256').update(previous + '\n' + event.document.payload).digest('hex')) throw new Error('Evidence chain mismatch.');
      previous = event.hash;
    }
    const page = await store.events({ limit: 25, offset: 25 });
    if (page.total !== count || page.items.length !== 25) throw new Error('Pagination count mismatch.');
    latencies.sort((a,b) => a-b);
    console.log(JSON.stringify({ scope: 'synthetic local storage probe; not production capacity or SLA', records: count, concurrency: 20,
      elapsedMs: Math.round(elapsedMs), writesPerSecond: Number((count / elapsedMs * 1000).toFixed(1)),
      p95WriteMs: Number(latencies[Math.floor(latencies.length * .95)].toFixed(2)), chainVerified: true, paginationVerified: true }, null, 2));
  } finally {
    await store.query('DELETE FROM servicing_operations_events WHERE tenant_id=$1', [tenantId]).catch(() => {});
    await store.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
