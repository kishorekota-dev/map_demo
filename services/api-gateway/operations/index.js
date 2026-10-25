const express = require("express");
const { randomUUID, createHash, createPrivateKey, sign } = require("crypto");
const { readFileSync } = require("fs");
const { OperationsStore, OperationsError } = require("./store");
const { authenticate, authorize, equal, actorHash } = require("./auth");
const { validateBaseUrl, requestConnector } = require("./connectors");
const { FulfillmentWorker } = require("./worker");
const { receiveWebhook } = require("./webhooks");
const { retainOperations } = require("./maintenance");
const { RolloutMonitor } = require("./rollout-monitor");
const { mountUsageRoutes } = require("./usage");
const { computeOutcomeMetrics, OUTCOME_EVENT_LIMIT } = require("./outcomeAnalytics");
const { validateKnowledgeBatch } = require("./knowledgeValidation");
const { mountAgentRoutes } = require("./agent-workspace");
const { identifier, text } = require("../control-plane/config");

const safeText = (value, max = 1000) =>
  String(value || "")
    .slice(0, max)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b\d{6,}\b/g, "[number]");
const route = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res)).catch(next);
function createOperationsRouter(options = {}) {
  const router = express.Router();
  const env = options.env || process.env;
  const store = options.store || new OperationsStore(options);
  const secret = options.jwtSecret || env.JWT_SECRET;
  const worker =
    options.worker ||
    new FulfillmentWorker(store, { env, request: options.request });
  const monitor = new RolloutMonitor(store, options.configStore, {
    env,
    fetch: options.fetch,
  });
  const request = options.request || requestConnector;
  const fingerprintActor = (req) =>
    actorHash(req.principal.actor, env.AUDIT_ACTOR_HASH_KEY || secret);
  const runtime = (req, res, next) =>
    equal(req.get("X-Servicing-Service-Token"), env.SERVICING_SERVICE_TOKEN)
      ? next()
      : res
          .status(403)
          .json({ error: "Trusted runtime service identity is required." });
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.post(
    "/webhooks/:id",
    route(async (req, res) =>
      res.json(
        await receiveWebhook(req, store, {
          env,
          jwtSecret: secret,
          fetch: options.fetch,
        }),
      ),
    ),
  );
  router.use(authenticate(secret, store.tenantId));
  mountAgentRoutes(router, { store, configStore: options.configStore, env: { ...env, JWT_SECRET: secret } });
  router.get(
    "/status",
    authorize("canView"),
    route(async (req, res) => {
      const metrics = await store.query(
        "SELECT count(*)::int AS cases,count(*) FILTER(WHERE document->>'status' NOT IN ('completed','failed'))::int AS open_cases,count(*) FILTER(WHERE document->>'status'='failed')::int AS failed_cases FROM servicing_operations_records WHERE tenant_id=$1 AND kind='case'",
        [store.tenantId],
      );
      const connections = await store.list("connection", { limit: 0 });
      const events = await store.events({ limit: 0 });
      res.json({
        storage: "postgres",
        workersEnabled: env.FULFILLMENT_WORKER_ENABLED === "true",
        identity: {
          configured: !!(
            env.OIDC_ISSUER &&
            env.OIDC_CLIENT_ID &&
            env.OIDC_AUTHORIZATION_ENDPOINT &&
            env.OIDC_TOKEN_ENDPOINT &&
            env.OIDC_JWKS_URI &&
            env.OIDC_REDIRECT_URI
          ),
          issuer: env.OIDC_ISSUER || null,
        },
        retentionDays: Number(env.OPERATIONS_RETENTION_DAYS || 90),
        connectors: connections.total,
        metrics: {
          cases: metrics.rows[0].cases,
          openCases: metrics.rows[0].open_cases,
          failedCases: metrics.rows[0].failed_cases,
          events: events.total,
        },
        permissions: req.principal.permissions,
      });
    }),
  );
  router.get(
    "/connections",
    authorize("canView"),
    route(async (req, res) =>
      res.json(await store.list("connection", req.query)),
    ),
  );
  router.put(
    "/connections/:id",
    authorize("canPublish"),
    route(async (req, res) => {
      const b = req.body;
      if (
        !identifier(req.params.id) ||
        !text(b.name, 120) ||
        !["case", "voice", "knowledge"].includes(b.kind) ||
        typeof b.enabled !== "boolean" ||
        !Number.isInteger(b.timeoutMs) ||
        b.timeoutMs < 1000 ||
        b.timeoutMs > 60000
      )
        throw new OperationsError(
          400,
          "Provide id, name, kind, enabled and timeoutMs (1000–60000).",
        );
      validateBaseUrl(b.baseUrl, env);
      for (const value of [b.credentialRef, b.webhookSecretRef])
        if (
          value &&
          (typeof value !== "string" ||
            value.length > 300 ||
            !/^(env:CONNECTOR_SECRET_[A-Z0-9_]+|file:[A-Za-z0-9_./-]+)$/.test(
              value,
            ))
        )
          throw new OperationsError(
            400,
            "Credentials must use server-managed secret references.",
          );
      const result = await store.transaction(async (tx) => {
        const current = await tx.get("connection", req.params.id);
        if (current && !Number.isInteger(b.revision))
          throw new OperationsError(
            409,
            "Provide the current connector revision.",
          );
        const item = await tx.put(
          "connection",
          req.params.id,
          {
            name: b.name.trim(),
            kind: b.kind,
            baseUrl: b.baseUrl.replace(/\/$/, ""),
            credentialRef: b.credentialRef || null,
            webhookSecretRef: b.webhookSecretRef || null,
            enabled: b.enabled,
            timeoutMs: b.timeoutMs,
            lastTest: null,
          },
          b.revision ?? 0,
        );
        await tx.event({
          type: "connection.updated",
          connectorId: item.id,
          actorHash: fingerprintActor(req),
        });
        return item;
      });
      res.json(result);
    }),
  );
  router.post(
    "/connections/:id/test",
    authorize("canPublish"),
    route(async (req, res) => {
      const connection = await store.get("connection", req.params.id);
      if (!connection) throw new OperationsError(404, "Connector not found.");
      let ok = false;
      try {
        const result = await request(connection, "/health", { env });
        ok = result.status === 200 && result.data.status === "ok";
      } catch {
        // A failed health request is represented by the explicit failed result.
      }
      const result = {
        ok,
        checkedAt: new Date().toISOString(),
        message: ok
          ? "Provider health contract passed."
          : "Provider health contract failed; check host, secret reference and service availability.",
      };
      await store.transaction(async (tx) => {
        const current = await tx.get("connection", connection.id);
        if (current.revision !== connection.revision)
          throw new OperationsError(409, "Connector changed during test.");
        await tx.put("connection", connection.id, {
          ...current,
          lastTest: result,
        });
        await tx.event({
          type: "connection.tested",
          connectorId: connection.id,
          outcome: ok ? "passed" : "failed",
          actorHash: fingerprintActor(req),
        });
      });
      res.json(result);
    }),
  );
  router.post(
    "/connections/:id/sync",
    authorize("canPublish"),
    route(async (req, res) => {
      const connection = await store.get("connection", req.params.id);
      if (!connection?.enabled || connection.kind !== "knowledge")
        throw new OperationsError(400, "Enable a knowledge connector first.");
      const result = await request(connection, "/documents", { env });
      if (
        result.status !== 200 ||
        !Array.isArray(result.data.documents) ||
        !result.data.documents.length ||
        result.data.documents.length > 50
      )
        throw new OperationsError(
          502,
          "Provider must return 1–50 documents; synchronize larger collections in batches.",
        );
      const validation = validateKnowledgeBatch(result.data.documents);
      if (!validation.valid) throw new OperationsError(422, "Knowledge connector returned invalid or sensitive content. Review source documents before importing.");
      const gateway =
        env.CONTROL_PLANE_INTERNAL_URL ||
        `http://127.0.0.1:${env.PORT || 3001}/api/control-plane`;
      const response = await (options.fetch || fetch)(
        `${gateway}/studio/knowledge/import`,
        {
          method: "POST",
          headers: {
            Authorization: req.get("Authorization"),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            revision: req.body.revision,
            documents: result.data.documents.map((d) => ({
              ...d,
              status: "draft",
            })),
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new OperationsError(
          response.status,
          body.error || "Knowledge import rejected.",
        );
      await store.transaction((tx) =>
        tx.event({
          type: "knowledge.synced",
          connectorId: connection.id,
          actorHash: fingerprintActor(req),
          count: result.data.documents.length,
        }),
      );
      res.json(body);
    }),
  );
  router.post(
    "/runtime/events",
    runtime,
    route(async (req, res) => {
      const b = req.body;
      if (
        !text(b.sessionId, 200) ||
        !text(b.interactionId, 200) ||
        (b.stage !== "reconciliation" &&
          (!Number.isInteger(b.version) ||
            !["digital", "ava", "ivr"].includes(b.channel) ||
            !identifier(b.intent))) ||
        !identifier(b.stage) ||
        !identifier(b.outcome)
      )
        throw new OperationsError(
          400,
          "An event requires sessionId, interactionId, version, channel, intent, stage and outcome.",
        );
      const metadata = {};
      for (const key of [
        "tool",
        "reason",
        "caseId",
        "recognitionMethod",
        "recognitionSource",
        "reconciliationReference",
        "confidence",
        "workflowStatus",
        "confirmationRequired",
        "confirmationVerified",
      ])
        if (["string", "boolean", "number"].includes(typeof b.metadata?.[key]))
          metadata[key] =
            typeof b.metadata[key] === "string"
              ? safeText(b.metadata[key], 200)
              : b.metadata[key];
      const event = await store.transaction((tx) =>
        tx.event({
          type: "runtime.execution",
          sessionId: b.sessionId,
          interactionId: b.interactionId,
          version: b.version ?? null,
          channel: b.channel ?? null,
          intent: b.intent ?? null,
          stage: b.stage,
          outcome: b.outcome,
          environment: ["development", "staging", "production"].includes(
            b.environment,
          )
            ? b.environment
            : null,
          cohort: ["canary", "stable"].includes(b.cohort) ? b.cohort : null,
          operationId:
            typeof b.operationId === "string"
              ? b.operationId.slice(0, 200)
              : null,
          durationMs: Number.isFinite(b.durationMs)
            ? Math.max(0, Math.min(b.durationMs, 86400000))
            : null,
          metadata,
          actorHash: fingerprintActor(req),
        }),
      );
      res.status(201).json({ id: event.id, hash: event.hash });
    }),
  );
  router.post(
    "/runtime/cases",
    runtime,
    route(async (req, res) => {
      const b = req.body;
      if (
        !text(b.sessionId, 200) ||
        !text(b.idempotencyKey, 160) ||
        !text(b.reference, 200) ||
        !text(b.summary, 1000) ||
        !Number.isInteger(b.version) ||
        !["digital", "ava", "ivr"].includes(b.channel)
      )
        throw new OperationsError(
          400,
          "A case requires session, idempotency key, reference, summary, pinned version and channel.",
        );
      const state = await options.configStore?.read();
      const release = state?.releases.find((r) => r.version === b.version);
      if (!release)
        throw new OperationsError(
          409,
          "Pinned control-plane release was not found.",
        );
      const journey = release.config.journeys.find(
        (j) =>
          j.enabled &&
          j.channels.includes(b.channel) &&
          j.intents.includes(b.intent || "general_inquiry") &&
          (!b.journeyId || j.id === b.journeyId),
      );
      const channel = release.config.channels.find((c) => c.id === b.channel);
      if (!journey || !channel?.enabled)
        throw new OperationsError(
          400,
          "The pinned release does not enable this journey and channel.",
        );
      const intent = release.config.intents.find(
        (i) => i.id === (b.intent || "general_inquiry"),
      );
      if (!intent?.enabled)
        throw new OperationsError(400, "The pinned intent is not enabled.");
      const allowedFields = new Set([
        ...(intent?.requiredData || []),
        ...(intent?.optionalData || []),
      ]);
      const details = b.details === undefined ? {} : b.details;
      if (
        !details ||
        typeof details !== "object" ||
        Array.isArray(details) ||
        JSON.stringify(details).length > 16384 ||
        Object.entries(details).some(
          ([key, value]) =>
            !allowedFields.has(key) ||
            /(token|password|secret|authorization|userid|tenantid)/i.test(
              key,
            ) ||
            (value !== null &&
              !["string", "number", "boolean"].includes(typeof value)) ||
            String(value).length > 2000 ||
            (typeof value === "number" && !Number.isFinite(value)),
        )
      )
        throw new OperationsError(
          400,
          "Case details must use governed intent fields and bounded scalar values.",
        );
      for (const [key, value] of Object.entries(details)) {
        const schema = intent?.fieldSchemas?.[key];
        if (!schema || value === null) continue;
        if (
          typeof value !== schema.type ||
          (schema.enum && !schema.enum.includes(value)) ||
          (typeof value === "number" &&
            ((schema.min !== undefined && value < schema.min) ||
              (schema.max !== undefined && value > schema.max))) ||
          (typeof value === "string" &&
            ((schema.minLength !== undefined &&
              value.length < schema.minLength) ||
              (schema.maxLength !== undefined &&
                value.length > schema.maxLength)))
        )
          throw new OperationsError(
            400,
            `Case field ${key} does not meet the published input contract.`,
          );
      }
      const identity = {
        ownerId: req.principal.actor,
        sessionId: b.sessionId,
        version: b.version,
        channel: b.channel,
        journeyId: journey.id,
        reference: safeText(b.reference, 200),
        summary: safeText(b.summary),
        details,
      };
      const digest = createHash("sha256")
        .update(JSON.stringify(identity))
        .digest("hex");
      const item = await store.transaction(async (tx) => {
        const tombstone = (
          await tx.find("case_tombstone", { idempotencyKey: b.idempotencyKey })
        )[0];
        if (tombstone)
          throw new OperationsError(
            409,
            "This action was already retained after closure; it cannot be dispatched again.",
          );
        const existing = (
          await tx.find("case", { idempotencyKey: b.idempotencyKey })
        )[0];
        if (existing) {
          if (existing.requestDigest !== digest)
            throw new OperationsError(
              409,
              "Idempotency key was used with different details.",
            );
          return existing;
        }
        const now = new Date();
        const id = randomUUID();
        const created = await tx.put("case", id, {
          ...identity,
          idempotencyKey: b.idempotencyKey,
          requestDigest: digest,
          status: "queued",
          queue: channel.mode === "human" ? channel.queue : journey.queue,
          slaMinutes: journey.slaMinutes,
          dueAt: new Date(
            now.getTime() + journey.slaMinutes * 60000,
          ).toISOString(),
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          attempts: 0,
          externalId: null,
          lastError: null,
        });
        await tx.enqueue(id);
        await tx.event({
          type: "case.created",
          caseId: id,
          sessionId: b.sessionId,
          version: b.version,
          channel: b.channel,
          intent: b.intent || "general_inquiry",
          actorHash: fingerprintActor(req),
        });
        return created;
      });
      res.status(201).json(item);
    }),
  );
  router.get(
    "/cases",
    authorize("canView"),
    route(async (req, res) => {
      const result = await store.list(
        "case",
        req.query,
        req.query.sessionId ? { sessionId: req.query.sessionId } : {},
      );
      if (!req.principal.permissions.canOperate)
        result.items = result.items.map(
          ({
            ownerId,
            details,
            idempotencyKey,
            requestDigest,
            resolutionNote,
            ...summary
          }) => summary,
        );
      res.json(result);
    }),
  );
  router.post(
    "/cases/:id/reconcile",
    authorize("canOperate"),
    route(async (req, res) =>
      res.json(
        await worker.reconcile(req.params.id, req.body, fingerprintActor(req)),
      ),
    ),
  );
  router.get(
    "/voice-calls",
    authorize("canOperate"),
    route(async (req, res) =>
      res.json(await store.list("voice_call", req.query)),
    ),
  );
  router.post(
    "/voice-calls/:id/abandon",
    authorize("canOperate"),
    route(async (req, res) => {
      if (!text(req.body.note, 1000) || !text(req.body.reference, 200))
        throw new OperationsError(
          400,
          "Provide an operator note and provider evidence reference.",
        );
      const item = await store.transaction(async (tx) => {
        const call = await tx.get("voice_call", req.params.id);
        if (!call) throw new OperationsError(404, "Voice call not found.");
        if (!["starting", "reconciliation_required"].includes(call.status))
          throw new OperationsError(
            409,
            "Only an uncertain startup can be abandoned. End active calls through the provider.",
          );
        if (
          call.status === "starting" &&
          Date.now() - Date.parse(call.createdAt) < 120000
        )
          throw new OperationsError(
            409,
            "Wait for the in-flight startup deadline before reconciliation.",
          );
        const ended = await tx.put("voice_call", call.id, {
          ...call,
          ended: true,
          status: "ended",
          endedAt: new Date().toISOString(),
          resolution: {
            note: safeText(req.body.note),
            reference: safeText(req.body.reference, 200),
          },
        });
        await tx.event({
          type: "voice.abandoned",
          callId: call.id,
          sessionId: call.sessionId,
          actorHash: fingerprintActor(req),
        });
        return ended;
      });
      res.json(item);
    }),
  );
  router.get(
    "/events",
    authorize("canView"),
    route(async (req, res) => res.json(await store.events(req.query))),
  );
  router.get(
    "/analytics",
    authorize("canView"),
    route(async (req, res) => {
      const result = await store.query(
        "SELECT document->>'intent' AS intent,document->>'channel' AS channel,document->>'outcome' AS outcome,count(*)::int AS count,round(avg(NULLIF(document->>'durationMs','')::numeric),2) AS average_duration_ms FROM servicing_operations_events WHERE tenant_id=$1 AND document->>'type'='runtime.execution' AND created_at>=NOW()-INTERVAL '30 days' GROUP BY 1,2,3 ORDER BY count DESC",
        [store.tenantId],
      );
      const outcomes = await store.query(
        "SELECT document->>'version' AS version,document->>'environment' AS environment,document->>'cohort' AS cohort,count(*)::int AS interactions,count(*) FILTER(WHERE document->>'outcome' IN ('complete','completed','succeeded'))::int AS completed,count(*) FILTER(WHERE document->>'outcome' IN ('failed','error','reconciliation_required'))::int AS failed,count(DISTINCT document->>'actorHash')::int AS customers,percentile_cont(0.95) WITHIN GROUP(ORDER BY (document->>'durationMs')::double precision) AS p95_ms FROM servicing_operations_events WHERE tenant_id=$1 AND document->>'type'='runtime.execution' AND document->>'stage'='conversation' AND created_at>=NOW()-INTERVAL '30 days' GROUP BY 1,2,3",
        [store.tenantId],
      );
      const repeats = await store.query(
        "SELECT count(*)::int AS repeat_customers FROM (SELECT document->>'actorHash' FROM servicing_operations_events WHERE tenant_id=$1 AND document->>'type'='case.created' AND created_at>=NOW()-INTERVAL '30 days' GROUP BY document->>'actorHash' HAVING count(DISTINCT document->>'sessionId')>1) AS repeats",
        [store.tenantId],
      );
      res.json({
        windowDays: 30,
        items: result.rows.map((r) => ({
          intent: r.intent,
          channel: r.channel,
          outcome: r.outcome,
          count: r.count,
          averageDurationMs:
            r.average_duration_ms === null
              ? null
              : Number(r.average_duration_ms),
        })),
        versions: outcomes.rows,
        repeatContactCustomers: repeats.rows[0].repeat_customers,
        costPerCompletedService: null,
        costStatus:
          "Provider usage and billing rates must be configured; no inferred cost.",
      });
    }),
  );
  router.get(
    "/privacy/subjects/:userId",
    authorize("canPublish"),
    route(async (req, res) => {
      const cases = await store.list("case", req.query, {
        ownerId: req.params.userId,
      });
      const mappings = await store.list("identity", req.query, {
        userId: req.params.userId,
      });
      res.json({
        subject: req.params.userId,
        cases,
        mappings,
        scope:
          "Operational cases and enterprise mappings. Chat transcripts and banking records require their owning-service retention policy.",
      });
    }),
  );
  router.post(
    "/privacy/subjects/:userId/erase",
    authorize("canPublish"),
    route(async (req, res) => {
      if (typeof req.body.dryRun !== "boolean")
        throw new OperationsError(
          400,
          "An explicit dryRun boolean is required.",
        );
      const response = await store.transaction(async (tx) => {
        const items = await tx.find(
          "case",
          { ownerId: req.params.userId },
          10001,
        );
        if (items.length > 10000)
          throw new OperationsError(
            409,
            "Subject exceeds the bounded erasure batch; use the database maintenance runbook.",
          );
        const calls = await tx.query(
          "SELECT EXISTS(SELECT 1 FROM servicing_operations_records WHERE tenant_id=$1 AND kind='voice_call' AND document->>'ownerId'=$2 AND document->>'ended' IS DISTINCT FROM 'true') AS active",
          [store.tenantId, req.params.userId],
        );
        if (calls.rows[0].active)
          throw new OperationsError(
            409,
            "End active voice sessions before erasing operational customer details.",
          );
        if (
          items.some((item) => !["completed", "failed"].includes(item.status))
        )
          throw new OperationsError(
            409,
            "Resolve open cases before erasing operational customer details.",
          );
        if (!req.body.dryRun) {
          for (const item of items) {
            await tx.put("case_tombstone", item.id, {
              idempotencyKey: item.idempotencyKey,
              status: item.status,
              retainedAt: new Date().toISOString(),
            });
            await tx.remove("case", item.id);
          }
          await tx.query(
            "DELETE FROM servicing_operations_records WHERE tenant_id=$1 AND kind='identity_session' AND document->>'mappingId' IN (SELECT id FROM servicing_operations_records WHERE tenant_id=$1 AND kind='identity' AND document->>'userId'=$2)",
            [store.tenantId, req.params.userId],
          );
          await tx.query(
            "DELETE FROM servicing_operations_records WHERE tenant_id=$1 AND kind='identity' AND document->>'userId'=$2",
            [store.tenantId, req.params.userId],
          );
          await tx.query(
            "UPDATE servicing_operations_records SET kind=kind||'_tombstone',document=jsonb_build_object('id',id,'digest',document->>'digest','status','retained') WHERE tenant_id=$1 AND kind IN ('voice_call','webhook') AND document->>'ownerId'=$2",
            [store.tenantId, req.params.userId],
          );
          await tx.event({
            type: "privacy.subject_erased",
            subjectHash: actorHash(
              req.params.userId,
              env.AUDIT_ACTOR_HASH_KEY || secret,
            ),
            caseCount: items.length,
            actorHash: fingerprintActor(req),
          });
        }
        return {
          dryRun: req.body.dryRun,
          caseCount: items.length,
          evidenceRetained: true,
          scope:
            "Operations only; coordinate chat and banking retention separately.",
        };
      });
      res.json(response);
    }),
  );
  router.get(
    "/identity/mappings",
    authorize("canPublish"),
    route(async (req, res) =>
      res.json(await store.list("identity", req.query)),
    ),
  );
  router.put(
    "/identity/mappings/:id",
    authorize("canPublish"),
    route(async (req, res) => {
      const b = req.body;
      const allowed = [
        "customer",
        "control_plane_viewer",
        "control_plane_editor",
        "control_plane_operator",
        "control_plane_admin",
      ];
      if (
        !identifier(req.params.id) ||
        b.issuer !== env.OIDC_ISSUER ||
        !text(b.subject, 200) ||
        !text(b.userId, 200) ||
        !Array.isArray(b.roles) ||
        b.roles.length > 5 ||
        !b.roles.length ||
        !b.roles.every((r) => allowed.includes(r)) ||
        typeof b.enabled !== "boolean"
      )
        throw new OperationsError(
          400,
          "Map the configured issuer and subject to a local user and supported servicing roles.",
        );
      const item = await store.transaction(async (tx) => {
        const current = await tx.get("identity", req.params.id);
        if (current && !Number.isInteger(b.revision))
          throw new OperationsError(409, "Provide the mapping revision.");
        const record = await tx.put(
          "identity",
          req.params.id,
          {
            issuer: b.issuer,
            subject: b.subject,
            userId: b.userId,
            roles: [...new Set(b.roles)],
            enabled: b.enabled,
          },
          b.revision ?? 0,
        );
        await tx.event({
          type: "identity.mapping_updated",
          mappingId: record.id,
          actorHash: fingerprintActor(req),
        });
        return record;
      });
      res.json(item);
    }),
  );
  router.post(
    "/maintenance/retention",
    authorize("canPublish"),
    route(async (req, res) => {
      res.json(await retainOperations(store, req.body, fingerprintActor(req)));
    }),
  );
  router.get(
    "/audit/export",
    authorize("canPublish"),
    route(async (req, res) => {
      const after = Number(req.query.after || 0);
      if (!Number.isSafeInteger(after) || after < 0)
        throw new OperationsError(400, "after must be a nonnegative sequence.");
      const result = await store.query(
        "SELECT seq,document,previous_hash,hash FROM servicing_operations_events WHERE tenant_id=$1 AND seq>$2 ORDER BY seq LIMIT 1001",
        [store.tenantId, after],
      );
      const rows = result.rows.slice(0, 1000);
      const bundle = {
        format: "servicing-evidence-v1",
        tenantId: store.tenantId,
        exportedAt: new Date().toISOString(),
        items: rows.map((r) => ({
          ...r.document,
          sequence: Number(r.seq),
          previousHash: r.previous_hash,
          hash: r.hash,
        })),
        nextAfter: result.rows.length > 1000 ? Number(rows.at(-1).seq) : null,
      };
      const payload = JSON.stringify(bundle);
      const digest = createHash("sha256").update(payload).digest("hex");
      const signingKey = env.AUDIT_SIGNING_KEY_FILE
        ? createPrivateKey(readFileSync(env.AUDIT_SIGNING_KEY_FILE))
        : null;
      if (signingKey && signingKey.asymmetricKeyType !== "rsa")
        throw new OperationsError(
          503,
          "Evidence export signing requires an RSA private key.",
        );
      const signature = signingKey
        ? sign("sha256", Buffer.from(payload), signingKey).toString("base64")
        : null;
      res
        .set(
          "Content-Disposition",
          'attachment; filename="servicing-evidence.json"',
        )
        .json({
          ...bundle,
          payload,
          digest,
          signature,
          signatureAlgorithm: signature ? "RSA-SHA256" : null,
        });
    }),
  );
  mountUsageRoutes(router, {
    store,
    env,
    route,
    authorize,
    runtime,
    fingerprintActor,
  });
  // Outcome analytics: FCR, containment and channel breakdown from the
  // same event stream as /analytics. Kept as a separate endpoint so a
  // query problem here cannot break the existing /analytics response.
  router.get(
    "/analytics/outcomes",
    authorize("canView"),
    route(async (req, res) => {
      const days = req.query.days === undefined ? 30 : Number(req.query.days);
      if ((req.query.days !== undefined && typeof req.query.days !== "string") || !Number.isInteger(days) || days < 1 || days > 365) {
        throw new OperationsError(400, "days must be an integer from 1 to 365.");
      }
      const windowEnd = new Date().toISOString();
      const windowStart = new Date(Date.parse(windowEnd) - days * 86400000).toISOString();
      const rows = await store.query(
        "SELECT seq,document->>'sessionId' AS session_id,document->>'interactionId' AS interaction_id,document->>'actorHash' AS actor_hash,document->>'channel' AS channel,document->>'intent' AS intent,document->>'outcome' AS outcome,document->>'stage' AS stage,document->>'type' AS type,document->>'kind' AS kind,created_at FROM servicing_operations_events WHERE tenant_id=$1 AND (document->>'type' IN ('case.created','live.agent.started','live.agent.transferred') OR (document->>'type'='runtime.execution' AND document->>'stage'='conversation')) AND created_at>=$2::timestamptz AND created_at<=$3::timestamptz ORDER BY created_at,seq LIMIT $4",
        [store.tenantId, windowStart, windowEnd, OUTCOME_EVENT_LIMIT + 1],
      );
      if (rows.rows.length > OUTCOME_EVENT_LIMIT) throw new OperationsError(422, "Outcome window exceeds 50000 events. Choose fewer days; partial metrics are not reported.");
      const events = rows.rows.map((r) => ({
        sessionId: r.session_id,
        interactionId: r.interaction_id,
        sequence: Number(r.seq),
        actorHash: r.actor_hash,
        channel: r.channel,
        intent: r.intent,
        outcome: r.outcome,
        stage: r.stage,
        type: r.type,
        kind: r.kind,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      }));
      res.json({ windowDays: days, windowStart, eventCount: events.length, ...computeOutcomeMetrics(events, { windowEnd }) });
    }),
  );
  router.use((error, _req, res, _next) => {
    if (error.code === "23505")
      return res
        .status(409)
        .json({ error: "A record with this identity already exists." });
    res.status(error.status || 503).json({
      error: error.status
        ? error.message
        : "Operations service is unavailable.",
    });
  });
  if (env.FULFILLMENT_WORKER_ENABLED === "true" && store.configured) {
    worker.start();
    monitor.start();
  }
  router.store = store;
  router.worker = worker;
  router.close = async () => {
    worker.stop();
    monitor.stop();
    await store.close();
  };
  return router;
}
module.exports = { createOperationsRouter, safeText };
