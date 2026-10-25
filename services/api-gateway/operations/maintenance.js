const { createHash } = require("crypto");
const { OperationsError } = require("./store");
const tombstoneId = (key) => createHash("sha256").update(key).digest("hex");
async function retainOperations(store, { days, dryRun }, actor) {
  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 3650 ||
    typeof dryRun !== "boolean"
  )
    throw new OperationsError(
      400,
      "Provide days (1–3650) and an explicit dryRun boolean.",
    );
  return store.transaction(async (tx) => {
    const found = await tx.query(
      "SELECT kind,count(*)::int AS count FROM servicing_operations_records WHERE tenant_id=$1 AND updated_at<NOW()-($2::int*INTERVAL '1 day') AND ((kind='case' AND document->>'status' IN ('completed','failed')) OR (kind='voice_call' AND document->>'ended'='true') OR kind IN ('webhook','oidc_transaction','identity_session')) GROUP BY kind",
      [store.tenantId, days],
    );
    if (!dryRun) {
      // Retain minimal non-content idempotency tombstones. Deleting a completed
      // case must never make an old runtime retry dispatch the action again.
      await tx.query(
        "INSERT INTO servicing_operations_records(tenant_id,kind,id,document) SELECT tenant_id,'case_tombstone',id,jsonb_build_object('id',id,'idempotencyKey',document->>'idempotencyKey','status',document->>'status','retainedAt',NOW()) FROM servicing_operations_records WHERE tenant_id=$1 AND kind='case' AND document->>'status' IN ('completed','failed') AND updated_at<NOW()-($2::int*INTERVAL '1 day') ON CONFLICT(tenant_id,kind,id) DO NOTHING",
        [store.tenantId, days],
      );
      await tx.query(
        "DELETE FROM servicing_operations_jobs WHERE tenant_id=$1 AND status IN ('complete','failed') AND created_at<NOW()-($2::int*INTERVAL '1 day')",
        [store.tenantId, days],
      );
      // Webhook receipts also remain as tombstones after response/customer data
      // removal, preventing a signed replay from repeating an old voice turn.
      await tx.query(
        "UPDATE servicing_operations_records SET kind='webhook_tombstone',document=jsonb_build_object('id',id,'digest',document->>'digest','status','retained') WHERE tenant_id=$1 AND kind='webhook' AND updated_at<NOW()-($2::int*INTERVAL '1 day')",
        [store.tenantId, days],
      );
      await tx.query(
        "UPDATE servicing_operations_records SET kind='voice_call_tombstone',document=jsonb_build_object('id',id,'status','retained') WHERE tenant_id=$1 AND kind='voice_call' AND updated_at<NOW()-($2::int*INTERVAL '1 day') AND document->>'ended'='true'",
        [store.tenantId, days],
      );
      await tx.query(
        "DELETE FROM servicing_operations_records WHERE tenant_id=$1 AND updated_at<NOW()-($2::int*INTERVAL '1 day') AND ((kind='case' AND document->>'status' IN ('completed','failed')) OR kind IN ('oidc_transaction','identity_session'))",
        [store.tenantId, days],
      );
      await tx.event({
        type: "maintenance.retention",
        days,
        counts: found.rows,
        actorHash: actor || null,
      });
    }
    return {
      dryRun,
      days,
      records: found.rows,
      evidenceRetained: true,
      idempotencyTombstonesRetained: true,
    };
  });
}
module.exports = { retainOperations, tombstoneId };
