/** Rollout observations come only from persisted authenticated runtime events.
 * This worker never accepts browser-supplied counters or cohort identifiers. */
class RolloutMonitor {
  constructor(store, configStore, options = {}) {
    this.store = store;
    this.configStore = configStore;
    this.env = options.env || process.env;
    this.fetch = options.fetch || fetch;
    this.busy = false;
  }
  async runOnce() {
    if (this.busy || !this.configStore || !this.env.SERVICING_SERVICE_TOKEN)
      return;
    this.busy = true;
    try {
      const state = await this.configStore.read();
      const policy = state.studio?.rolloutPolicy;
      if (!policy?.enabled) return;
      const windowEnd = new Date();
      const windowStart = new Date(
        windowEnd.getTime() - policy.windowMinutes * 60000,
      );
      for (const environment of state.studio.environments) {
        if (!environment.candidateVersion || !environment.canaryPercent)
          continue;
        const result = await this.store.query(
          "SELECT count(*)::int AS sample_count,count(*) FILTER(WHERE outcome IN ('failed','reconciliation_required'))::int AS failure_count FROM (SELECT DISTINCT ON (document->>'sessionId',document->>'interactionId') document->>'outcome' AS outcome FROM servicing_operations_events WHERE tenant_id=$1 AND document->>'type'='runtime.execution' AND document->>'stage'='conversation' AND document->>'outcome' IN ('succeeded','failed','reconciliation_required') AND document->>'environment'=$2 AND document->>'cohort'='canary' AND document->>'version'=$3 AND created_at BETWEEN $4 AND $5 ORDER BY document->>'sessionId',document->>'interactionId',seq DESC) AS observations",
          [
            this.store.tenantId,
            environment.id,
            String(environment.candidateVersion),
            windowStart,
            windowEnd,
          ],
        );
        const { sample_count: sampleCount, failure_count: failureCount } =
          result.rows[0];
        if (sampleCount < policy.minSamples) continue;
        const base =
          this.env.CONTROL_PLANE_INTERNAL_URL ||
          `http://127.0.0.1:${this.env.PORT || 3001}/api/control-plane`;
        const response = await this.fetch(`${base}/runtime/rollout/observe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Servicing-Service-Token": this.env.SERVICING_SERVICE_TOKEN,
          },
          body: JSON.stringify({
            environment: environment.id,
            candidateVersion: environment.candidateVersion,
            sampleCount,
            failureCount,
            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("Rollout observation rejected");
      }
    } finally {
      this.busy = false;
    }
  }
  start() {
    if (!this.timer) {
      this.timer = setInterval(
        () =>
          this.runOnce().catch(() =>
            console.error("Rollout monitor unavailable."),
          ),
        30000,
      );
      this.timer.unref();
    }
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
module.exports = { RolloutMonitor };
