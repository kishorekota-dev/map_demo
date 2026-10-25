const express = require("express");
const supertest = require("supertest");
const jwt = require("jsonwebtoken");
const { randomUUID, createHash, randomBytes } = require("crypto");
const { issueProof } = require('../mutationProof');
const { OperationsStore } = require("../store");
const { createOperationsRouter } = require("..");
const { FulfillmentWorker } = require("../worker");
const { defaultConfig } = require("../../control-plane/config");
const { signWebhook: signPublicWebhook } = require("../reference-adapter/server");
const signWebhook = (key, eventId, body) => signPublicWebhook(key, eventId, body,
  `https://example.com/api/operations/webhooks/${body.type.startsWith('voice.') ? 'voice-reference' : 'reference'}`);
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
        SERVICING_SERVICE_TOKEN: randomBytes(32).toString('hex'),
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
        connectorDefinitions: ['case', 'voice'].map(kind => ({
          id: kind === 'voice' ? 'voice-reference' : 'reference', name: 'Reference', kind,
          baseUrl: 'http://127.0.0.1:3099', credentialRef: 'env:CONNECTOR_SECRET_REFERENCE',
          webhookSecretRef: 'env:CONNECTOR_SECRET_REFERENCE',
          webhookPublicUrl: `https://example.com/api/operations/webhooks/${kind === 'voice' ? 'voice-reference' : 'reference'}`,
        })),
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
        .set('X-Servicing-Confirmation', issueProof({ scope: 'servicing_case', principalId: 'customer-1', tenantId: tenant,
          key: body.idempotencyKey, method: 'POST', path: '/runtime/cases', body }, env))
        .send(body);
    }
    async function connection(kind = "case") {
      const result = await api()
        .put(`/api/operations/connections/${kind === 'voice' ? 'voice-reference' : 'reference'}`)
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
    test('case creation requires an unexpired confirmation bound to the original actor, key and body', async () => {
      const body = caseInput();
      const submit = proof => {
        const pending = api().post('/api/operations/runtime/cases').set('Authorization', auth('customer'))
          .set('X-Servicing-Service-Token', env.SERVICING_SERVICE_TOKEN);
        if (proof) pending.set('X-Servicing-Confirmation', proof);
        return pending.send(body);
      };
      const binding = { scope: 'servicing_case', principalId: 'customer-1', tenantId: tenant,
        key: body.idempotencyKey, method: 'POST', path: '/runtime/cases', body };
      await submit().expect(403);
      await submit(issueProof({ ...binding, principalId: 'another-customer' }, env)).expect(403);
      await submit(issueProof({ ...binding, body: { ...body, summary: 'A different request' } }, env)).expect(403);
      await submit(issueProof(binding, env, Date.now() - 600000)).expect(403);
      expect((await store.list('case')).total).toBe(0);
      await submit(issueProof(binding, env)).expect(201);
    });
    test('definitive provider failures never auto-retry and an explicit exact-key retry dispatches once', async () => {
      await connection();
      const failures = [400, 503, 'before-dispatch'];
      for (const [index, failure] of failures.entries()) {
        const body = { ...caseInput(), idempotencyKey: `explicit-retry-${index}` };
        const created = await createCase(body);
        if (failure === 'before-dispatch') request.mockRejectedValueOnce(Object.assign(new Error('Fixture preflight rejection'), { dispatched: false }));
        else request.mockResolvedValueOnce({ status: failure, data: {} });
        const before = request.mock.calls.length;
        await router.worker.runOnce();
        expect((await store.get('case', created.body.id))).toMatchObject({ status: 'failed', definitiveFailure: true });
        await router.worker.runOnce();
        expect(request.mock.calls.length - before).toBe(1);
        await createCase(body);
        await router.worker.runOnce();
        expect(request.mock.calls.length - before).toBe(2);
        expect(request.mock.calls.slice(before).map(call => call[2].headers['Idempotency-Key'])).toEqual([body.idempotencyKey, body.idempotencyKey]);
      }
    });
    test.each(['definitive', 'uncertain'])('SLA routing cannot change provider arguments on an explicit %s retry', async failureKind => {
      await connection(); const body = caseInput(); const created = await createCase(body);
      request.mockImplementationOnce(async () => {
        await store.transaction(async tx => { const item = await tx.get('case', created.body.id);
          await tx.put('case', item.id, { ...item, queue: 'supervisor', slaEscalatedAt: new Date().toISOString() }); });
        if (failureKind === 'uncertain') throw Object.assign(new Error('Fixture lost acknowledgement'), { dispatched: true });
        return { status: 503, data: {} };
      });
      await router.worker.runOnce();
      const original = request.mock.calls[0][2]; expect(original.body.queue).toBe('general_servicing');
      const view = await api().get('/api/operations/cases').set('Authorization', auth('control_plane_viewer'));
      expect(view.body.items[0]).not.toHaveProperty('outboundRequests');
      if (failureKind === 'uncertain') {
        request.mockResolvedValueOnce({ status: 404, data: { authoritative: true } });
        await api().post(`/api/operations/cases/${created.body.id}/reconcile`).set('Authorization', auth('control_plane_operator'))
          .send({ outcome: 'retry', note: 'Provider confirms original operation absent' }).expect(200);
      } else await createCase(body);
      await router.worker.runOnce();
      const repeated = request.mock.calls.filter(call => call[1] === '/cases');
      expect(repeated).toHaveLength(2); expect(repeated[1][2].body).toEqual(original.body);
      expect(repeated[1][2].headers).toEqual(original.headers); expect(repeated[1][2].method).toBe(original.method);
      await router.worker.runOnce();
      const escalation = request.mock.calls.at(-1); expect(escalation[1]).toBe('/cases/case-external/escalations');
      expect(escalation[2].body.queue).toBe('supervisor'); expect(escalation[2].headers['Idempotency-Key']).toBe(`${body.idempotencyKey}:escalation`);
    });
    test('a definitively failed escalation can be explicitly retried with its original proof and provider request', async () => {
      await connection(); const body = caseInput(); const created = await createCase(body); await router.worker.runOnce();
      await store.transaction(async tx => { const item = await tx.get('case', created.body.id); await tx.put('case', item.id, { ...item, dueAt: new Date(Date.now() - 1000).toISOString() }); });
      request.mockResolvedValueOnce({ status: 503, data: {} }); await router.worker.runOnce();
      expect(await store.get('case', created.body.id)).toMatchObject({ status: 'in_progress', pendingOperation: 'escalate', definitiveFailure: true });
      const first = request.mock.calls[1]; await router.worker.runOnce(); expect(request).toHaveBeenCalledTimes(2);
      await api().post('/api/operations/runtime/cases').set('Authorization', auth('customer')).set('X-Servicing-Service-Token', env.SERVICING_SERVICE_TOKEN).send(body).expect(403);
      expect((await createCase({ ...body, summary: 'Different request' })).status).toBe(409);
      expect((await createCase(body)).status).toBe(201); await router.worker.runOnce();
      const repeated = request.mock.calls[2]; expect(repeated[1]).toBe(first[1]); expect(repeated[2].body).toEqual(first[2].body); expect(repeated[2].headers).toEqual(first[2].headers);
      expect(await store.get('case', created.body.id)).toMatchObject({ status: 'in_progress', definitiveFailure: false, pendingOperation: null });
    });
    test('legacy previously dispatched operations without pinned arguments fail closed before retry', async () => {
      await connection(); const body = caseInput(); const created = await createCase(body);
      request.mockResolvedValueOnce({ status: 503, data: {} }); await router.worker.runOnce();
      await store.transaction(async tx => { const item = await tx.get('case', created.body.id); delete item.outboundRequests; await tx.put('case', item.id, item); });
      await createCase(body); await router.worker.runOnce(); expect(request).toHaveBeenCalledTimes(1);
      expect(await store.get('case', created.body.id)).toMatchObject({ status: 'reconciliation_required' });
      await api().post(`/api/operations/cases/${created.body.id}/reconcile`).set('Authorization', auth('control_plane_operator'))
        .send({ outcome: 'retry', note: 'Do not invent missing original arguments' }).expect(409);
      expect(request).toHaveBeenCalledTimes(1);
    });
    test('the idempotency identity includes the resolved intent even within the same journey', async () => {
      expect((await createCase()).status).toBe(201);
      expect((await createCase({ ...caseInput(), intent: 'help' })).status).toBe(409);
    });
    test("two workers dispatch once; signed callback is deduplicated and terminal state protected", async () => {
      await connection();
      const created = await createCase();
      const worker2 = new FulfillmentWorker(store, { env, request, connectorCatalog: router.connectorCatalog });
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
    test.each(['http503', 'timeout'])('a signed in-progress create callback outranks a later %s response', async outcome => {
      await connection(); const created = await createCase();
      request.mockImplementationOnce(async () => {
        const signed = signWebhook(env.CONNECTOR_SECRET_REFERENCE, 'accepted-during-create', { type: 'case.updated', operationId: 'case-key', externalId: 'case-accepted', status: 'in_progress' });
        await api().post('/api/operations/webhooks/reference').set(signed.headers).send(signed.raw).expect(200);
        if (outcome === 'timeout') throw Object.assign(new Error('Fixture lost acknowledgement'), { dispatched: true });
        return { status: 503, data: {} };
      });
      await router.worker.runOnce();
      expect(await store.get('case', created.body.id)).toMatchObject({ status: 'in_progress', externalId: 'case-accepted', pendingOperation: null, definitiveFailure: false, lastError: null });
      expect((await store.query('SELECT status FROM servicing_operations_jobs WHERE tenant_id=$1', [tenant])).rows).toEqual([{ status: 'complete' }]);
      await router.worker.runOnce(); expect(request).toHaveBeenCalledTimes(1);
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
            : url.endsWith("/sessions/voice-session") ? { session: { metadata: { channel: "ivr" } } } : {
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
        connectorDefinitions: router.connectorCatalog.list(),
      });
      const voiceApp = express();
      voiceApp.use(
        express.json({
          verify: (req, _res, b) => {
            req.rawBody = b;
          },
        }),
      );
      voiceApp.use("/api/operations", voiceRouter);
      const start = signWebhook("reference-secret", "voice-start", {
        type: "voice.start",
        callId: "call-1",
      });
      const anonymous = await supertest(voiceApp)
        .post("/api/operations/webhooks/voice-reference")
        .set(start.headers)
        .send(start.raw);
      expect(anonymous.body.actions[0].type).toBe("authenticate");
      expect(fetcher).not.toHaveBeenCalled();
      expect(
        (
          await supertest(voiceApp)
            .post("/api/operations/webhooks/voice-reference")
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
          .post("/api/operations/webhooks/voice-reference")
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
      expect(fetcher).toHaveBeenCalledTimes(3);
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
