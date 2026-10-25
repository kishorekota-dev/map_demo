const express = require("express");
const supertest = require("supertest");
const jwt = require("jsonwebtoken");
const { randomUUID, createHash } = require("crypto");
const { OperationsStore } = require("../store");
const { createOperationsRouter } = require("..");
const { FulfillmentWorker } = require("../worker");
const { defaultConfig } = require("../../control-plane/config");
const { signWebhook } = require("../reference-adapter/server");
const databaseUrl =
  process.env.TEST_OPERATIONS_DATABASE_URL ||
  process.env.TEST_CONTROL_PLANE_DATABASE_URL;
(databaseUrl ? describe : describe.skip)(
  "durable operations integration",
  () => {
    let store, app, router, env, request, tenant, version, auth;
    const secret = "operations-jwt-test-only";
    beforeEach(async () => {
      tenant = `operations-${randomUUID()}`;
      store = new OperationsStore({ databaseUrl, tenantId: tenant });
      await store.initialize();
      env = {
        NODE_ENV: "test",
        CONNECTOR_ALLOW_LOCAL: "true",
        CONNECTOR_SECRET_REFERENCE: "reference-secret",
        SERVICING_SERVICE_TOKEN: "runtime-service-test",
        OIDC_ISSUER: "https://id.example.com",
        JWT_SECRET: secret,
      };
      request = jest.fn(async () => ({
        status: 201,
        data: { externalId: "case-external", status: "in_progress" },
      }));
      const config = defaultConfig();
      config.channels.find((c) => c.id === "ivr").enabled = true;
      version = { version: 1, config };
      router = createOperationsRouter({
        store,
        env,
        request,
        jwtSecret: secret,
        configStore: { read: async () => ({ releases: [version] }) },
      });
      app = express();
      app.use(
        express.json({
          verify: (req, _res, b) => {
            req.rawBody = Buffer.from(b);
          },
        }),
      );
      app.use("/api/operations", router);
      auth = (role) =>
        "Bearer " +
        jwt.sign(
          {
            userId: role === "customer" ? "customer-1" : role,
            roles: [role],
            tenantId: tenant,
            type: "access",
          },
          secret,
          { expiresIn: "1h" },
        );
    });
    afterEach(async () => {
      router.worker.stop();
      await store.query(
        "DELETE FROM servicing_operations_jobs WHERE tenant_id=$1",
        [tenant],
      );
      await store.query(
        "DELETE FROM servicing_operations_events WHERE tenant_id=$1",
        [tenant],
      );
      await store.query(
        "DELETE FROM servicing_operations_records WHERE tenant_id=$1",
        [tenant],
      );
      await store.close();
    });
    const api = () => supertest(app);
    const caseInput = () => ({
      sessionId: "session-1",
      version: 1,
      channel: "digital",
      intent: "general_inquiry",
      journeyId: "support",
      queue: "attacker-queue",
      summary: "Customer assistance",
      reference: "interaction-1",
      idempotencyKey: "case-key",
    });
    async function createCase(body = caseInput()) {
      return api()
        .post("/api/operations/runtime/cases")
        .set("Authorization", auth("customer"))
        .set("X-Servicing-Service-Token", env.SERVICING_SERVICE_TOKEN)
        .send(body);
    }
    async function connection(kind = "case") {
      const result = await api()
        .put("/api/operations/connections/reference")
        .set("Authorization", auth("control_plane_admin"))
        .send({
          name: "Reference",
          kind,
          baseUrl: "http://127.0.0.1:3099",
          credentialRef: "env:CONNECTOR_SECRET_REFERENCE",
          webhookSecretRef: "env:CONNECTOR_SECRET_REFERENCE",
          enabled: true,
          timeoutMs: 2000,
        });
      expect(result.status).toBe(200);
      return result.body;
    }
    test("runtime requires trusted service plus user identity; operator authoring is bounded", async () => {
      expect(
        (
          await api()
            .post("/api/operations/runtime/cases")
            .set("Authorization", auth("customer"))
            .send(caseInput())
        ).status,
      ).toBe(403);
      expect(
        (
          await api()
            .get("/api/operations/cases")
            .set("Authorization", auth("customer"))
        ).status,
      ).toBe(403);
      const refresh =
        "Bearer " + jwt.sign({ userId: "customer-1", type: "refresh" }, secret);
      expect(
        (
          await api()
            .get("/api/operations/status")
            .set("Authorization", refresh)
        ).status,
      ).toBe(401);
      expect(
        (
          await api()
            .get("/api/operations/status")
            .set(
              "Authorization",
              "Bearer " +
                jwt.sign(
                  {
                    userId: "x",
                    roles: ["control_plane_admin"],
                    tenantId: "another",
                  },
                  secret,
                ),
            )
        ).status,
      ).toBe(403);
      const saved = await connection();
      expect(
        (
          await api()
            .put("/api/operations/connections/reference")
            .set("Authorization", auth("control_plane_admin"))
            .send({ ...saved, name: "changed", revision: 0 })
        ).status,
      ).toBe(409);
      const evidence = await api()
        .post("/api/operations/runtime/events")
        .set("Authorization", auth("customer"))
        .set("X-Servicing-Service-Token", env.SERVICING_SERVICE_TOKEN)
        .send({
          sessionId: "evidence-session",
          interactionId: "evidence-message",
          version: 1,
          channel: "digital",
          intent: "transfer_funds",
          stage: "authorization",
          outcome: "confirmed",
          metadata: {
            confirmationRequired: true,
            confirmationVerified: true,
            recognitionSource: "lexical",
            authorization: "must-never-be-stored",
          },
        });
      expect(evidence.status).toBe(201);
      const stored = (await store.events({ sessionId: "evidence-session" }))
        .items[0];
      expect(stored.metadata).toEqual({
        confirmationRequired: true,
        confirmationVerified: true,
        recognitionSource: "lexical",
      });
    });
    test("parallel idempotent creation uses pinned queue and one job; modified retries conflict", async () => {
      const responses = await Promise.all([
        createCase(),
        createCase(),
        createCase(),
      ]);
      expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
      expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
      expect(responses[0].body.queue).toBe("general_servicing");
      expect(
        (
          await store.query(
            "SELECT * FROM servicing_operations_jobs WHERE tenant_id=$1",
            [tenant],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (await createCase({ ...caseInput(), summary: "Different" })).status,
      ).toBe(409);
      expect(
        (
          await createCase({
            ...caseInput(),
            idempotencyKey: "bad-fields",
            details: { token: "secret" },
          })
        ).status,
      ).toBe(400);
    });
    test("two workers dispatch once; signed callback is deduplicated and terminal state protected", async () => {
      await connection();
      const created = await createCase();
      const worker2 = new FulfillmentWorker(store, { env, request });
      await Promise.all([router.worker.runOnce(), worker2.runOnce()]);
      expect(request).toHaveBeenCalledTimes(1);
      expect((await store.get("case", created.body.id)).status).toBe(
        "in_progress",
      );
      const signed = signWebhook("reference-secret", "callback-1", {
        type: "case.updated",
        operationId: "case-key",
        externalId: "case-external",
        status: "completed",
      });
      const invoke = () =>
        api()
          .post("/api/operations/webhooks/reference")
          .set(signed.headers)
          .send(signed.raw);
      expect((await invoke()).status).toBe(200);
      expect((await invoke()).status).toBe(200);
      expect((await store.get("case", created.body.id)).status).toBe(
        "completed",
      );
      const bad = signWebhook("reference-secret", "callback-2", {
        type: "case.updated",
        operationId: "case-key",
        externalId: "case-external",
        status: "in_progress",
      });
      expect(
        (
          await api()
            .post("/api/operations/webhooks/reference")
            .set(bad.headers)
            .send(bad.raw)
        ).status,
      ).toBe(409);
    });
    test("ambiguous dispatch blocks retry until provider confirms absent; lease recovery is conservative", async () => {
      await connection();
      const created = await createCase();
      request.mockRejectedValueOnce(
        Object.assign(new Error("timeout"), { dispatched: true }),
      );
      await router.worker.runOnce();
      expect((await store.get("case", created.body.id)).status).toBe(
        "reconciliation_required",
      );
      await router.worker.runOnce();
      expect(request).toHaveBeenCalledTimes(1);
      request.mockResolvedValueOnce({
        status: 404,
        data: { authoritative: true },
      });
      const recovered = await api()
        .post(`/api/operations/cases/${created.body.id}/reconcile`)
        .set("Authorization", auth("control_plane_operator"))
        .send({ outcome: "retry", note: "Provider confirms absent" });
      expect(recovered.status).toBe(200);
      expect(recovered.body.status).toBe("queued");
      await store.query(
        "UPDATE servicing_operations_jobs SET status='running',locked_at=NOW()-INTERVAL '3 minutes' WHERE tenant_id=$1 AND status='queued'",
        [tenant],
      );
      await router.worker.recoverAndEscalate();
      expect((await store.get("case", created.body.id)).status).toBe(
        "reconciliation_required",
      );
    });
    test("SLA queue escalates; evidence hash chain verifies and retention preserves unresolved work", async () => {
      const created = await createCase();
      await store.transaction(async (tx) => {
        const item = await tx.get("case", created.body.id);
        await tx.put("case", item.id, {
          ...item,
          dueAt: new Date(Date.now() - 60000).toISOString(),
        });
      });
      await router.worker.recoverAndEscalate();
      expect((await store.get("case", created.body.id)).queue).toBe(
        "supervisor",
      );
      const exported = await api()
        .get("/api/operations/audit/export")
        .set("Authorization", auth("control_plane_admin"));
      expect(exported.status).toBe(200);
      let previous = "0".repeat(64);
      for (const event of exported.body.items) {
        expect(event.previousHash).toBe(previous);
        expect(event.hash).toBe(
          createHash("sha256")
            .update(previous + "\n" + event.payload)
            .digest("hex"),
        );
        previous = event.hash;
      }
      await store.query(
        "UPDATE servicing_operations_records SET updated_at=NOW()-INTERVAL '365 days' WHERE tenant_id=$1 AND kind='case'",
        [tenant],
      );
      const retention = await api()
        .post("/api/operations/maintenance/retention")
        .set("Authorization", auth("control_plane_admin"))
        .send({ days: 90, dryRun: false });
      expect(retention.status).toBe(200);
      expect(await store.get("case", created.body.id)).toBeDefined();
    });
    test("voice requires both signed provider event and authenticated customer; replay cannot repeat turns", async () => {
      await connection("voice");
      const fetcher = jest.fn(async (url) => ({
        ok: true,
        json: async () =>
          url.endsWith("/sessions")
            ? { sessionId: "voice-session" }
            : {
                response: { content: "Your request was received." },
                agentResult: {
                  metadata: { caseId: "case-reference", queue: "support" },
                },
              },
      }));
      const voiceRouter = createOperationsRouter({
        store,
        env,
        request,
        jwtSecret: secret,
        fetch: fetcher,
      });
      const voiceApp = express();
      voiceApp.use(
        express.json({
          verify: (req, _res, b) => {
            req.rawBody = b;
          },
        }),
      );
      voiceApp.use("/ops", voiceRouter);
      const start = signWebhook("reference-secret", "voice-start", {
        type: "voice.start",
        callId: "call-1",
      });
      const anonymous = await supertest(voiceApp)
        .post("/ops/webhooks/reference")
        .set(start.headers)
        .send(start.raw);
      expect(anonymous.body.actions[0].type).toBe("authenticate");
      expect(fetcher).not.toHaveBeenCalled();
      expect(
        (
          await supertest(voiceApp)
            .post("/ops/webhooks/reference")
            .set(start.headers)
            .set("Authorization", auth("customer"))
            .send(start.raw)
        ).status,
      ).toBe(200);
      const turn = signWebhook("reference-secret", "voice-turn", {
        type: "voice.turn",
        callId: "call-1",
        utterance: "Please help",
      });
      const invoke = () =>
        supertest(voiceApp)
          .post("/ops/webhooks/reference")
          .set(turn.headers)
          .set("Authorization", auth("customer"))
          .send(turn.raw);
      const response = await invoke();
      expect(response.status).toBe(200);
      expect(response.body.actions.map((a) => a.type)).toEqual([
        "speak",
        "transfer",
      ]);
      await invoke();
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
    test("SLA dispatches an idempotent provider queue escalation and retention keeps replay protection", async () => {
      await connection();
      const created = await createCase();
      await router.worker.runOnce();
      await store.transaction(async (tx) => {
        const item = await tx.get("case", created.body.id);
        await tx.put("case", item.id, {
          ...item,
          dueAt: new Date(Date.now() - 1000).toISOString(),
        });
      });
      await router.worker.runOnce();
      expect(request.mock.calls[1][1]).toBe("/cases/case-external/escalations");
      expect(request.mock.calls[1][2].headers["Idempotency-Key"]).toBe(
        "case-key:escalation",
      );
      await store.transaction(async (tx) => {
        const item = await tx.get("case", created.body.id);
        await tx.put("case", item.id, { ...item, status: "completed" });
      });
      await store.query(
        "UPDATE servicing_operations_records SET updated_at=NOW()-INTERVAL '365 days' WHERE tenant_id=$1 AND kind='case'",
        [tenant],
      );
      expect(
        (
          await api()
            .post("/api/operations/maintenance/retention")
            .set("Authorization", auth("control_plane_admin"))
            .send({ days: 90, dryRun: false })
        ).status,
      ).toBe(200);
      expect(await store.get("case", created.body.id)).toBeUndefined();
      expect((await createCase()).status).toBe(409);
    });
    test("case routes enforce the pinned intent journey and hide customer details from viewers", async () => {
      expect(
        (await createCase({ ...caseInput(), intent: "transfer_funds" })).status,
      ).toBe(400);
      expect(
        (await createCase({ ...caseInput(), intent: "unregistered" })).status,
      ).toBe(400);
      const input = {
        ...caseInput(),
        intent: "complaint",
        details: { description: "Private customer data" },
      };
      version.config.intents
        .find((intent) => intent.id === "complaint")
        .optionalData.push("description");
      const created = await createCase(input);
      expect(created.status).toBe(201);
      const viewed = await api()
        .get("/api/operations/cases")
        .set("Authorization", auth("control_plane_viewer"));
      expect(viewed.body.items[0]).not.toHaveProperty("details");
      expect(viewed.body.items[0]).not.toHaveProperty("ownerId");
      const operated = await api()
        .get("/api/operations/cases")
        .set("Authorization", auth("control_plane_operator"));
      expect(operated.body.items[0].details.description).toBe(
        "Private customer data",
      );
    });
    test("subject erasure removes all mappings and sessions, preserves replay protection and blocks active work", async () => {
      const created = await createCase();
      const erase = (dryRun) =>
        api()
          .post("/api/operations/privacy/subjects/customer-1/erase")
          .set("Authorization", auth("control_plane_admin"))
          .send({ dryRun });
      expect((await erase(true)).status).toBe(409);
      await store.transaction(async (tx) => {
        const item = await tx.get("case", created.body.id);
        await tx.put("case", item.id, { ...item, status: "completed" });
        await tx.put("voice_call", "active-call", {
          ownerId: "customer-1",
          ended: false,
        });
      });
      expect((await erase(false)).status).toBe(409);
      await store.transaction(async (tx) => {
        await tx.put("voice_call", "active-call", {
          ownerId: "customer-1",
          ended: true,
        });
        await tx.query(
          "INSERT INTO servicing_operations_records(tenant_id,kind,id,document) SELECT $1,'identity','subject-map-'||n,jsonb_build_object('id','subject-map-'||n,'issuer','https://id.example.com','subject','customer-subject-'||n,'userId','customer-1','enabled',true) FROM generate_series(1,205) AS n",
          [tenant],
        );
        await tx.query(
          "INSERT INTO servicing_operations_records(tenant_id,kind,id,document) SELECT $1,'identity_session','subject-session-'||n,jsonb_build_object('mappingId','subject-map-'||n) FROM generate_series(1,205) AS n",
          [tenant],
        );
      });
      expect((await erase(true)).status).toBe(200);
      expect((await store.list("identity", { limit: 0 })).total).toBe(205);
      expect((await erase(false)).status).toBe(200);
      expect((await store.list("identity", { limit: 0 })).total).toBe(0);
      expect((await store.list("identity_session", { limit: 0 })).total).toBe(
        0,
      );
      expect(await store.get("voice_call", "active-call")).toBeUndefined();
      expect(
        await store.get("voice_call_tombstone", "active-call"),
      ).toBeDefined();
      expect((await createCase()).status).toBe(409);
    });
  },
);
