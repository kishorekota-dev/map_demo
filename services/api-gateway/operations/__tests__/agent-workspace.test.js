const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const { OperationsStore } = require("../store");
const { createOperationsRouter } = require("..");
const { presentCase, nextSteps } = require("../agent-workspace");
const { ControlPlaneStore } = require("../../control-plane/store");

const principal = {
  actor: "operator-a",
  permissions: { canView: true, canOperate: true, canPublish: false },
};
const fixture = (id = randomUUID(), overrides = {}) => ({
  id,
  ownerId: "private-customer",
  sessionId: "session-fixture",
  reference: "service-fixture",
  summary:
    "Replacement delivery for person@example.invalid reference 123456789",
  details: { accountNumber: "sensitive-account", balance: 84000 },
  idempotencyKey: `fixture-${id}`,
  requestDigest: "private-request-digest",
  channel: "digital",
  queue: "support",
  journeyId: "support",
  version: 1,
  status: "queued",
  revision: 1,
  dueAt: "2020-01-01T00:00:00Z",
  createdAt: "2020-01-01T00:00:00Z",
  updatedAt: "2020-01-01T00:00:00Z",
  ...overrides,
});

test("agent context is an explicit allowlist with redacted text and no raw customer, banking or provider fields", () => {
  const result = presentCase(
    fixture("case-fixture", {
      lastError: "provider secret",
      externalId: "external-private",
    }),
    principal,
    true,
  );
  expect(JSON.stringify(result)).not.toMatch(
    /private-customer|sensitive-account|84000|private-request-digest|person@|123456789|provider secret|external-private/,
  );
  expect(result.summary).toContain("[email]");
  expect(result.summary).toContain("[number]");
  expect(result.actions).toMatchObject({ canClaim: true, canResolve: false });
});
test("uncertain provider outcomes always require evidence-based reconciliation", () => {
  expect(
    nextSteps(
      fixture("case-fixture", { status: "reconciliation_required" }),
    )[0],
  ).toMatchObject({ id: "reconcile" });
  expect(
    nextSteps(fixture("case-fixture", { status: "failed" })).some(
      (step) => step.id === "failed",
    ),
  ).toBe(true);
});

const databaseUrl =
  process.env.TEST_OPERATIONS_DATABASE_URL ||
  process.env.TEST_CONTROL_PLANE_DATABASE_URL;
(databaseUrl ? describe : describe.skip)("durable agent workspace", () => {
  let store, configStore, router, app, tenant;
  const secret = "agent-workspace-fixture-signing-key";
  const auth = (
    actor = "operator-a",
    role = "control_plane_operator",
    tokenTenant = tenant,
  ) =>
    `Bearer ${jwt.sign({ userId: actor, roles: [role], type: "access", tenantId: tokenTenant }, secret)}`;
  const call = (method, path, body, actor, role, tokenTenant) =>
    request(app)[method](`/api/operations${path}`)
      .set("Authorization", auth(actor, role, tokenTenant))
      .send(body);
  const create = async (overrides) => {
    const item = fixture(randomUUID(), overrides);
    return store.transaction((tx) => tx.put("case", item.id, item));
  };
  const claim = (item) =>
    call("post", `/agent/cases/${item.id}/claim`, {
      revision: 0,
      caseRevision: item.revision,
      note: "Taking ownership",
    });
  const updateInput = (item) => ({
    revision: item.work.revision,
    caseRevision: item.caseRevision,
    note: "Provided published guidance",
    status: "waiting",
    disposition: "follow_up_required",
    citations: [],
  });
  beforeEach(async () => {
    tenant = `agent-test-${randomUUID()}`;
    store = new OperationsStore({ databaseUrl, tenantId: tenant });
    await store.initialize();
    configStore = new ControlPlaneStore({ file: null, tenantId: tenant });
    await configStore.read();
    router = createOperationsRouter({
      store,
      configStore,
      env: { JWT_SECRET: secret, NODE_ENV: "test" },
    });
    app = express();
    app.use(express.json());
    app.use("/api/operations", router);
  });
  afterEach(async () => {
    router.worker.stop();
    for (const table of [
      "servicing_operations_jobs",
      "servicing_operations_events",
      "servicing_operations_records",
    ])
      await store.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenant]);
    await store.close();
  });

  test("enforces tenant and signed roles, and filters queue oversight without exposing raw case payloads", async () => {
    const first = await create();
    await create({ queue: "specialists", channel: "ivr", status: "completed" });
    await call("get", "/agent/cases", undefined, "customer", "customer").expect(
      403,
    );
    await call(
      "get",
      "/agent/cases",
      undefined,
      "operator",
      "control_plane_operator",
      "different-tenant",
    ).expect(403);
    const result = await call(
      "get",
      "/agent/cases?queue=support&channel=digital&assignment=unassigned&overdue=true",
    ).expect(200);
    expect(result.body.total).toBe(1);
    expect(result.body.queueSummary).toEqual([
      {
        queue: "support",
        total: 1,
        unassigned: 1,
        waiting: 0,
        uncertain: 0,
        overdue: 1,
      },
    ]);
    expect(JSON.stringify(result.body)).not.toContain("sensitive-account");
    const detail = await call(
      "get",
      `/agent/cases/${first.id}`,
      undefined,
      "viewer",
      "control_plane_viewer",
    ).expect(200);
    expect(detail.body.item.actions.canClaim).toBe(false);
    await call(
      "post",
      `/agent/cases/${first.id}/claim`,
      { revision: 0, caseRevision: 1, note: "claim" },
      "viewer",
      "control_plane_viewer",
    ).expect(403);
    await call("get", "/agent/cases?status=unknown").expect(400);
  });

  test("two operators racing to claim produce one owner and no lost assignment", async () => {
    const item = await create();
    const attempts = await Promise.all(
      ["operator-a", "operator-b"].map((actor) =>
        call(
          "post",
          `/agent/cases/${item.id}/claim`,
          { revision: 0, caseRevision: 1, note: "Taking ownership" },
          actor,
        ),
      ),
    );
    expect(attempts.map((result) => result.status).sort()).toEqual([200, 409]);
    const current = await store.get("case", item.id);
    expect(current.agentWork.revision).toBe(1);
    expect(current.agentWork.history).toHaveLength(1);
    expect(current.status).toBe("queued");
    expect(current.details.accountNumber).toBe("sensitive-account");
    expect(
      (await store.events()).items.filter(
        (event) => event.type === "agent.case.claim",
      ),
    ).toHaveLength(1);
  });

  test("only the owner can update; supervisor can release with revisions but cannot impersonate another owner", async () => {
    const item = (await claim(await create()).expect(200)).body.item;
    await call(
      "patch",
      `/agent/cases/${item.id}/work`,
      updateInput(item),
      "operator-b",
    ).expect(403);
    await call(
      "post",
      `/agent/cases/${item.id}/release`,
      { revision: 1, caseRevision: item.caseRevision, note: "Takeover" },
      "operator-b",
    ).expect(403);
    await call(
      "patch",
      `/agent/cases/${item.id}/work`,
      updateInput(item),
      "supervisor",
      "control_plane_admin",
    ).expect(403);
    const released = await call(
      "post",
      `/agent/cases/${item.id}/release`,
      {
        revision: 1,
        caseRevision: item.caseRevision,
        note: "Operator unavailable; returning to queue",
      },
      "supervisor",
      "control_plane_admin",
    ).expect(200);
    expect(released.body.item.work).toMatchObject({
      assigned: false,
      status: "unclaimed",
      revision: 2,
    });
    await call("post", `/agent/cases/${item.id}/claim`, {
      revision: 2,
      caseRevision: released.body.item.caseRevision,
      note: "Claim",
      assignee: "other-person",
    }).expect(400);
  });

  test("rejects stale provider state, uncertain closure and false success; permits truthful terminal disposition", async () => {
    let item = (await claim(await create()).expect(200)).body.item;
    await store.transaction(async (tx) => {
      const current = await tx.get("case", item.id);
      await tx.put("case", item.id, {
        ...current,
        status: "reconciliation_required",
      });
    });
    await call(
      "patch",
      `/agent/cases/${item.id}/work`,
      updateInput(item),
    ).expect(409);
    item = (await call("get", `/agent/cases/${item.id}`).expect(200)).body.item;
    await call("patch", `/agent/cases/${item.id}/work`, {
      ...updateInput(item),
      status: "resolved",
      disposition: "information_provided",
    }).expect(409);
    await call("patch", `/agent/cases/${item.id}/work`, {
      ...updateInput(item),
      disposition: "service_completed",
    }).expect(409);
    await store.transaction(async (tx) => {
      const current = await tx.get("case", item.id);
      await tx.put("case", item.id, { ...current, status: "failed" });
    });
    item = (await call("get", `/agent/cases/${item.id}`).expect(200)).body.item;
    await call("patch", `/agent/cases/${item.id}/work`, {
      ...updateInput(item),
      status: "resolved",
      disposition: "service_completed",
    }).expect(409);
    const resolved = await call("patch", `/agent/cases/${item.id}/work`, {
      ...updateInput(item),
      status: "resolved",
      disposition: "unable_to_complete",
    }).expect(200);
    expect(resolved.body.item.executionStatus).toBe("failed");
    await call(
      "patch",
      `/agent/cases/${item.id}/work`,
      updateInput(resolved.body.item),
    ).expect(409);
  });

  test("knowledge search and citations require permitted current published versions and reject stale or expired evidence", async () => {
    const document = {
      id: "replacement-guide",
      title: "Replacement delivery",
      content: "Replacement delivery takes five working days.",
      source: "https://help.example/replacement",
      allowedRoles: ["control_plane_operator"],
      status: "published",
      version: 1,
      expiresAt: null,
    };
    await configStore.update(
      1,
      "fixture",
      "test.knowledge",
      async (_state, records) => {
        for (const record of [
          document,
          { ...document, id: "restricted", allowedRoles: ["fraud_team"] },
          { ...document, id: "expired", expiresAt: "2000-01-01T00:00:00Z" },
          { ...document, id: "draft", status: "draft" },
        ])
          await records.put("knowledge_published", record.id, record);
      },
    );
    const item = (await claim(await create()).expect(200)).body.item;
    const found = await call(
      "get",
      `/agent/cases/${item.id}/knowledge?query=replacement`,
    ).expect(200);
    expect(found.body.matches.map((match) => match.id)).toEqual([
      "replacement-guide",
    ]);
    await call("patch", `/agent/cases/${item.id}/work`, {
      ...updateInput(item),
      citations: [{ id: "restricted", version: 1 }],
    }).expect(409);
    await call("patch", `/agent/cases/${item.id}/work`, {
      ...updateInput(item),
      citations: [{ id: document.id, version: 2 }],
    }).expect(409);
    const saved = await call("patch", `/agent/cases/${item.id}/work`, {
      ...updateInput(item),
      citations: [{ id: document.id, version: 1 }],
    }).expect(200);
    expect(saved.body.item.work.history.at(-1).citations).toEqual([
      { id: document.id, version: 1, title: document.title },
    ]);
    await configStore.update(
      2,
      "fixture",
      "test.expired",
      async (_state, records) =>
        records.put("knowledge_published", document.id, {
          ...document,
          expiresAt: "2000-01-01T00:00:00Z",
        }),
    );
    await call("patch", `/agent/cases/${item.id}/work`, {
      ...updateInput(saved.body.item),
      citations: [{ id: document.id, version: 1 }],
    }).expect(409);
  });

  test("notes are redacted, evidence excludes note content, durable restart preserves work and privacy removes it with the case", async () => {
    const item = (
      await claim(await create({ status: "completed" })).expect(200)
    ).body.item;
    await call("patch", `/agent/cases/${item.id}/work`, {
      ...updateInput(item),
      note: "Contact person@example.invalid reference 123456789",
      status: "resolved",
      disposition: "service_completed",
    }).expect(200);
    const reread = new OperationsStore({ databaseUrl, tenantId: tenant });
    try {
      expect(
        (await reread.get("case", item.id)).agentWork.history.at(-1).note,
      ).toBe("Contact [email] reference [number]");
    } finally {
      await reread.close();
    }
    const events = await store.events();
    expect(JSON.stringify(events)).not.toContain("Contact");
    expect(events.items[0].noteDigest).toHaveLength(64);
    await call(
      "post",
      "/privacy/subjects/private-customer/erase",
      { dryRun: false },
      "admin",
      "control_plane_admin",
    ).expect(200);
    await call("get", `/agent/cases/${item.id}`).expect(404);
    expect(await store.get("case", item.id)).toBeUndefined();
    expect(await store.get("case_tombstone", item.id)).not.toHaveProperty(
      "agentWork",
    );
  });
});
