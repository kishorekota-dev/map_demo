const { randomUUID } = require("crypto");
const { requestConnector } = require("./connectors");
const { OperationsError } = require("./store");
const TERMINAL = ["completed", "failed"];
class FulfillmentWorker {
  constructor(store, options = {}) {
    this.store = store;
    this.request = options.request || requestConnector;
    this.env = options.env || process.env;
    this.busy = false;
  }
  async connection(tx, item) {
    const configured = item.connectorId || this.env.CASE_CONNECTOR_ID;
    const options = configured
      ? [await tx.get("connection", configured)].filter(Boolean)
      : await tx.find("connection", { kind: "case", enabled: true });
    if (
      options.length !== 1 ||
      !options[0].enabled ||
      options[0].kind !== "case"
    )
      return null;
    return options[0];
  }
  async recoverAndEscalate() {
    await this.store.transaction(async (tx) => {
      const expired = await tx.query(
        "UPDATE servicing_operations_jobs SET status='uncertain' WHERE tenant_id=$1 AND status='running' AND locked_at < NOW()-INTERVAL '2 minutes' RETURNING case_id",
        [this.store.tenantId],
      );
      for (const { case_id: id } of expired.rows) {
        const item = await tx.get("case", id);
        if (!item || TERMINAL.includes(item.status)) continue;
        await tx.put("case", id, {
          ...item,
          status: "reconciliation_required",
          lastError: "Worker lease expired after dispatch may have occurred.",
          updatedAt: new Date().toISOString(),
        });
        await tx.event({
          type: "case.reconciliation_required",
          caseId: id,
          sessionId: item.sessionId,
          version: item.version,
          reason: "worker_lease_expired",
        });
      }
      const overdue = await tx.query(
        "SELECT id,document FROM servicing_operations_records WHERE tenant_id=$1 AND kind='case' AND document->>'status' NOT IN ('completed','failed') AND (document->>'dueAt')::timestamptz < NOW() AND document->>'slaEscalatedAt' IS NULL LIMIT 100",
        [this.store.tenantId],
      );
      for (const { id, document: item } of overdue.rows) {
        const now = new Date().toISOString();
        await tx.put("case", id, {
          ...item,
          previousQueue: item.queue,
          queue: this.env.SLA_ESCALATION_QUEUE || "supervisor",
          slaEscalatedAt: now,
          updatedAt: now,
        });
        if (item.externalId) await tx.enqueue(id, "escalate");
        await tx.event({
          type: "case.sla_escalated",
          caseId: id,
          sessionId: item.sessionId,
          version: item.version,
          queue: this.env.SLA_ESCALATION_QUEUE || "supervisor",
        });
      }
    });
  }
  async runOnce() {
    if (this.busy) return false;
    this.busy = true;
    try {
      await this.recoverAndEscalate();
      const work = await this.store.transaction(async (tx) => {
        const result = await tx.query(
          "SELECT * FROM servicing_operations_jobs WHERE tenant_id=$1 AND status='queued' AND next_run_at<=NOW() ORDER BY next_run_at,id FOR UPDATE SKIP LOCKED LIMIT 1",
          [this.store.tenantId],
        );
        if (!result.rows[0]) return null;
        const job = result.rows[0];
        const item = await tx.get("case", job.case_id);
        if (!item || TERMINAL.includes(item.status)) {
          await tx.query(
            "UPDATE servicing_operations_jobs SET status='complete' WHERE tenant_id=$1 AND id=$2",
            [this.store.tenantId, job.id],
          );
          return null;
        }
        const connection = await this.connection(tx, item);
        if (!connection) {
          await tx.query(
            "UPDATE servicing_operations_jobs SET next_run_at=NOW()+INTERVAL '30 seconds' WHERE tenant_id=$1 AND id=$2",
            [this.store.tenantId, job.id],
          );
          await tx.put("case", item.id, {
            ...item,
            lastError: "No single enabled case connector is configured.",
            updatedAt: new Date().toISOString(),
          });
          return null;
        }
        const leaseId = randomUUID();
        await tx.query(
          "UPDATE servicing_operations_jobs SET status='running',attempts=attempts+1,locked_at=NOW(),lease_id=$3 WHERE tenant_id=$1 AND id=$2",
          [this.store.tenantId, job.id, leaseId],
        );
        await tx.put("case", item.id, {
          ...item,
          status: "in_progress",
          connectorId: connection.id,
          attempts: job.attempts + 1,
          updatedAt: new Date().toISOString(),
          lastError: null,
          pendingOperation: job.kind,
        });
        await tx.event({
          type: "case.dispatch_started",
          caseId: item.id,
          sessionId: item.sessionId,
          version: item.version,
          connectorId: connection.id,
          operationId: item.idempotencyKey,
        });
        return { job, item, connection, leaseId };
      });
      if (!work) return false;
      let response;
      let failure;
      try {
        const operationId =
          work.job.kind === "escalate"
            ? `${work.item.idempotencyKey}:escalation`
            : work.item.idempotencyKey;
        const path =
          work.job.kind === "escalate"
            ? `/cases/${encodeURIComponent(work.item.externalId)}/escalations`
            : "/cases";
        response = await this.request(work.connection, path, {
          env: this.env,
          method: "POST",
          headers: { "Idempotency-Key": operationId },
          body: {
            operationId,
            caseId: work.item.id,
            sessionId: work.item.sessionId,
            channel: work.item.channel,
            queue: work.item.queue,
            summary: work.item.summary,
            reference: work.item.reference,
            details: work.item.details || {},
            releaseVersion: work.item.version,
          },
        });
      } catch (error) {
        failure = error;
      }
      await this.store.transaction(async (tx) => {
        const lease = (
          await tx.query(
            "SELECT status,lease_id FROM servicing_operations_jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE",
            [this.store.tenantId, work.job.id],
          )
        ).rows[0];
        if (lease?.status !== "running" || lease.lease_id !== work.leaseId)
          return;
        const current = await tx.get("case", work.item.id);
        if (!current) return;
        // A signed callback can complete while the dispatch response is in flight.
        if (TERMINAL.includes(current.status)) {
          await tx.query(
            "UPDATE servicing_operations_jobs SET status='complete' WHERE tenant_id=$1 AND id=$2",
            [this.store.tenantId, work.job.id],
          );
          return;
        }
        let status = "reconciliation_required",
          jobStatus = "uncertain",
          message = "Provider outcome is unknown. Reconcile before retrying.";
        let externalId;
        const success =
          response?.status >= 200 &&
          response?.status < 300 &&
          typeof response.data?.externalId === "string" &&
          response.data.externalId.trim().length > 0 &&
          response.data.externalId.length <= 200 &&
          (work.job.kind !== "escalate" ||
            response.data.externalId === work.item.externalId) &&
          ["in_progress", "completed"].includes(response.data.status);
        if (success) {
          status = response.data.status;
          jobStatus = "complete";
          externalId = response.data.externalId;
          message = null;
        } else if (failure && failure.dispatched === false) {
          status = work.job.attempts < 4 ? "queued" : "failed";
          jobStatus = status === "queued" ? "queued" : "failed";
          message = "Provider connection failed before dispatch.";
        } else if ([400, 401, 403, 404, 422].includes(response?.status)) {
          status = "failed";
          jobStatus = "failed";
          message = `Provider rejected the request (${response.status}).`;
        }
        // A rejected queue update must not falsely close the underlying case.
        if (work.job.kind === "escalate" && status === "failed")
          status = "in_progress";
        await tx.put("case", current.id, {
          ...current,
          status,
          ...(externalId ? { externalId } : {}),
          lastError: message,
          ...(success ? { pendingOperation: null } : {}),
          updatedAt: new Date().toISOString(),
        });
        if (
          success &&
          work.job.kind === "create" &&
          current.slaEscalatedAt &&
          current.queue !== work.item.queue
        )
          await tx.enqueue(current.id, "escalate");
        await tx.query(
          "UPDATE servicing_operations_jobs SET status=$3,next_run_at=NOW()+($4::int * INTERVAL '1 second') WHERE tenant_id=$1 AND id=$2",
          [
            this.store.tenantId,
            work.job.id,
            jobStatus,
            Math.min(300, 2 ** (work.job.attempts + 1)),
          ],
        );
        await tx.event({
          type: `case.${status}`,
          caseId: current.id,
          sessionId: current.sessionId,
          version: current.version,
          operationId: current.idempotencyKey,
          outcome: status,
        });
      });
      return true;
    } finally {
      this.busy = false;
    }
  }
  async reconcile(id, input, actor) {
    if (
      !["completed", "retry", "failed"].includes(input.outcome) ||
      typeof input.note !== "string" ||
      !input.note.trim() ||
      input.note.length > 1000
    )
      throw new OperationsError(
        400,
        "Choose completed, retry or failed and provide an operator note.",
      );
    const item = await this.store.get("case", id);
    if (!item) throw new OperationsError(404, "Case not found.");
    if (TERMINAL.includes(item.status))
      throw new OperationsError(
        409,
        "Terminal case cannot be reconciled again.",
      );
    let outcome = input.outcome;
    let externalId = input.externalId;
    let proof = "manual_operator_decision";
    if (
      outcome === "completed" &&
      (typeof externalId !== "string" ||
        !externalId.trim() ||
        externalId.length > 200)
    )
      throw new OperationsError(
        400,
        "Completion requires an external reference.",
      );
    if (outcome === "retry") {
      if (item.status !== "reconciliation_required")
        throw new OperationsError(
          409,
          "Only an uncertain case can be retried after provider reconciliation.",
        );
      const connection = await this.store.transaction((tx) =>
        this.connection(tx, item),
      );
      if (!connection)
        throw new OperationsError(
          409,
          "Configure the original case connector before reconciliation.",
        );
      let lookup;
      const operationKey =
        item.pendingOperation === "escalate"
          ? `${item.idempotencyKey}:escalation`
          : item.idempotencyKey;
      try {
        lookup = await this.request(
          connection,
          `/cases/by-idempotency-key/${encodeURIComponent(operationKey)}`,
          { env: this.env },
        );
      } catch {
        throw new OperationsError(
          409,
          "Provider lookup failed. Case remains uncertain.",
        );
      }
      if (lookup.status === 404 && lookup.data?.authoritative === true) {
        outcome = "queued";
        proof = "provider_confirmed_absent";
      } else if (
        lookup.status === 200 &&
        typeof lookup.data?.externalId === "string" &&
        lookup.data.externalId.trim().length > 0 &&
        lookup.data.externalId.length <= 200 &&
        ["completed", "in_progress"].includes(lookup.data.status)
      ) {
        outcome = lookup.data.status;
        externalId = lookup.data.externalId;
        proof = "provider_confirmed_existing";
      } else
        throw new OperationsError(
          409,
          "Provider did not return an authoritative reconciliation result.",
        );
    }
    return this.store.transaction(async (tx) => {
      const current = await tx.get("case", id);
      if (current.revision !== item.revision)
        throw new OperationsError(
          409,
          "Case changed during reconciliation. Refresh.",
        );
      // Fence any in-flight worker before applying an operator decision.
      await tx.query(
        "UPDATE servicing_operations_jobs SET status='complete' WHERE tenant_id=$1 AND case_id=$2",
        [this.store.tenantId, id],
      );
      const updated = await tx.put("case", id, {
        ...current,
        status: outcome,
        externalId: externalId || current.externalId,
        lastError: null,
        resolutionNote: input.note.trim(),
        updatedAt: new Date().toISOString(),
      });
      if (outcome === "queued")
        await tx.enqueue(
          id,
          current.pendingOperation === "escalate" ? "escalate" : "create",
        );
      await tx.event({
        type: "case.reconciled",
        caseId: id,
        sessionId: current.sessionId,
        version: current.version,
        actorHash: actor,
        outcome,
        proof,
      });
      return updated;
    });
  }
  start() {
    if (!this.timer) {
      this.timer = setInterval(
        () =>
          this.runOnce().catch((e) =>
            console.error(
              "Fulfillment worker unavailable:",
              e.code || e.status || "worker_error",
            ),
          ),
        2000,
      );
      this.timer.unref();
    }
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
module.exports = { FulfillmentWorker };
