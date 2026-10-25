const { readFileSync } = require("fs");
const { join } = require("path");
const { randomUUID, createHash } = require("crypto");
const { Pool } = require("pg");

class OperationsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bounded = (value, fallback, max) =>
  Number.isInteger(Number(value)) && Number(value) >= 0
    ? Math.min(Number(value), max)
    : fallback;
const page = (query = {}) => ({
  limit: bounded(query.limit, 50, 200),
  offset: bounded(query.offset, 0, 100000),
});
class OperationsStore {
  constructor(options = {}) {
    this.tenantId =
      options.tenantId ||
      process.env.DEPLOYMENT_TENANT_ID ||
      "default-enterprise";
    const connectionString =
      options.databaseUrl ||
      process.env.OPERATIONS_DATABASE_URL ||
      process.env.CONTROL_PLANE_DATABASE_URL ||
      process.env.DATABASE_URL;
    this.configured = !!(options.pool || connectionString);
    this.pool =
      options.pool ||
      (connectionString
        ? new Pool({
            connectionString,
            max: 5,
            connectionTimeoutMillis: 5000,
            statement_timeout: 15000,
          })
        : null);
    this.manageSchema =
      options.manageSchema ?? process.env.OPERATIONS_MANAGE_SCHEMA !== "false";
    this.pool?.on("error", (e) =>
      console.error(
        "Operations database unavailable:",
        e.code || "database_error",
      ),
    );
  }
  async initialize() {
    if (!this.pool)
      throw new OperationsError(
        503,
        "Configure OPERATIONS_DATABASE_URL for durable operations.",
      );
    if (!this.ready)
      this.ready = (async () => {
        const client = await this.pool.connect();
        try {
          await client.query("BEGIN");
          if (this.manageSchema) {
            await client.query("SELECT pg_advisory_xact_lock(714936,1)");
            await client.query(readFileSync(join(__dirname, "schema.sql"), "utf8"));
          }
          await client.query("SELECT tenant_id,kind,id FROM servicing_operations_records LIMIT 0");
          await client.query("SELECT kind,lease_id,status FROM servicing_operations_jobs LIMIT 0");
          await client.query("SELECT seq,hash FROM servicing_operations_events LIMIT 0");
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        } finally {
          client.release();
        }
      })().catch((e) => {
        this.ready = null;
        throw e;
      });
    return this.ready;
  }
  async query(sql, args = []) {
    await this.initialize();
    return this.pool.query(sql, args);
  }
  async transaction(fn) {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serializes local registry/idempotency/evidence writes across gateway replicas.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,714936))",
        [this.tenantId],
      );
      const result = await fn(this.context(client));
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  context(client) {
    const tenant = this.tenantId;
    return {
      query: (sql, args) => client.query(sql, args),
      get: async (kind, id) =>
        (
          await client.query(
            "SELECT document,revision FROM servicing_operations_records WHERE tenant_id=$1 AND kind=$2 AND id=$3",
            [tenant, kind, id],
          )
        ).rows.map((r) => ({ ...r.document, revision: Number(r.revision) }))[0],
      find: async (kind, match = {}, limit = 200) =>
        (
          await client.query(
            "SELECT document,revision FROM servicing_operations_records WHERE tenant_id=$1 AND kind=$2 AND document @> $3::jsonb ORDER BY updated_at DESC,id LIMIT $4",
            [tenant, kind, JSON.stringify(match), limit],
          )
        ).rows.map((r) => ({ ...r.document, revision: Number(r.revision) })),
      put: async (kind, id, document, revision) => {
        const current = (
          await client.query(
            "SELECT revision FROM servicing_operations_records WHERE tenant_id=$1 AND kind=$2 AND id=$3 FOR UPDATE",
            [tenant, kind, id],
          )
        ).rows[0];
        if (
          revision !== undefined &&
          Number(current?.revision || 0) !== revision
        )
          throw new OperationsError(
            409,
            "Record changed. Refresh before saving.",
          );
        const next = Number(current?.revision || 0) + 1;
        await client.query(
          "INSERT INTO servicing_operations_records(tenant_id,kind,id,revision,document) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(tenant_id,kind,id) DO UPDATE SET document=EXCLUDED.document,revision=EXCLUDED.revision,updated_at=NOW()",
          [
            tenant,
            kind,
            id,
            next,
            JSON.stringify({ ...document, id, revision: next }),
          ],
        );
        return { ...document, id, revision: next };
      },
      remove: (kind, id) =>
        client.query(
          "DELETE FROM servicing_operations_records WHERE tenant_id=$1 AND kind=$2 AND id=$3",
          [tenant, kind, id],
        ),
      event: async (document) => {
        const previous =
          (
            await client.query(
              "SELECT hash FROM servicing_operations_events WHERE tenant_id=$1 ORDER BY seq DESC LIMIT 1",
              [tenant],
            )
          ).rows[0]?.hash || "0".repeat(64);
        const record = {
          ...document,
          id: randomUUID(),
          tenantId: tenant,
          timestamp: new Date().toISOString(),
        };
        // Hash canonical serialized bytes; retain these bytes for portable verification.
        const payload = JSON.stringify(record);
        const hash = createHash("sha256")
          .update(previous + "\n" + payload)
          .digest("hex");
        await client.query(
          "INSERT INTO servicing_operations_events(tenant_id,id,document,previous_hash,hash) VALUES($1,$2,$3::jsonb,$4,$5)",
          [
            tenant,
            record.id,
            JSON.stringify({ ...record, payload }),
            previous,
            hash,
          ],
        );
        return { ...record, previousHash: previous, hash };
      },
      enqueue: (caseId, kind = "create") =>
        client.query(
          "INSERT INTO servicing_operations_jobs(tenant_id,id,case_id,kind) VALUES($1,$2,$3,$4)",
          [tenant, randomUUID(), caseId, kind],
        ),
    };
  }
  async get(kind, id) {
    await this.initialize();
    return this.context(this.pool).get(kind, id);
  }
  async list(kind, query = {}, match = {}) {
    const { limit, offset } = page(query);
    const args = [this.tenantId, kind, JSON.stringify(match)];
    const [result, count] = await Promise.all([
      this.query(
        "SELECT document,revision FROM servicing_operations_records WHERE tenant_id=$1 AND kind=$2 AND document @> $3::jsonb ORDER BY updated_at DESC,id LIMIT $4 OFFSET $5",
        [...args, limit, offset],
      ),
      this.query(
        "SELECT count(*) FROM servicing_operations_records WHERE tenant_id=$1 AND kind=$2 AND document @> $3::jsonb",
        args,
      ),
    ]);
    return {
      items: result.rows.map((r) => ({
        ...r.document,
        revision: Number(r.revision),
      })),
      total: Number(count.rows[0].count),
      limit,
      offset,
    };
  }
  async events(query = {}) {
    const { limit, offset } = page(query);
    const args = [this.tenantId, query.sessionId || null];
    const [result, count] = await Promise.all([
      this.query(
        "SELECT seq,document,previous_hash,hash FROM servicing_operations_events WHERE tenant_id=$1 AND ($2::text IS NULL OR document->>'sessionId'=$2) ORDER BY seq DESC LIMIT $3 OFFSET $4",
        [...args, limit, offset],
      ),
      this.query(
        "SELECT count(*) FROM servicing_operations_events WHERE tenant_id=$1 AND ($2::text IS NULL OR document->>'sessionId'=$2)",
        args,
      ),
    ]);
    return {
      items: result.rows.map((r) => ({
        ...r.document,
        sequence: Number(r.seq),
        previousHash: r.previous_hash,
        hash: r.hash,
      })),
      total: Number(count.rows[0].count),
      limit,
      offset,
    };
  }
  async close() {
    await this.pool?.end();
  }
}
module.exports = { OperationsStore, OperationsError, page };
