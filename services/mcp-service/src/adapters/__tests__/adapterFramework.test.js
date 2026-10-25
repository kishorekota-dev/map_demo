/**
 * Generic backend adapter framework tests.
 *
 * Pure modules + a fake HTTP client: no live backend, no network, no
 * credentials. The fake client records calls so replay and retry behaviour
 * is asserted on call counts, not on hope.
 */

const {
  validateAdapterDefinition,
  AdapterValidationError,
} = require("../adapterContract");
const {
  resolveAuthHeaders,
  AdapterAuthError,
} = require("../credentialResolver");
const { GenericHttpAdapter } = require("../genericHttpAdapter");
const { AdapterRegistry } = require("../adapterRegistry");
const IdempotencyStore = require("../idempotencyStore");

const DEFINITION = {
  id: "test-crm",
  name: "Test CRM",
  version: "1.0.0",
  baseUrl: "https://crm.test.example",
  auth: { type: "apiKey", envVar: "TEST_CRM_API_KEY" },
  healthPath: "/health",
  tools: [
    {
      name: "get_customer",
      description: "Read a customer",
      method: "GET",
      path: "/customers/{customerId}",
      inputSchema: {
        type: "object",
        properties: { customerId: { type: "string" } },
        required: ["customerId"],
      },
    },
    {
      name: "create_case",
      description: "Open a case",
      method: "POST",
      path: "/cases",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          subject: { type: "string" },
        },
        required: ["customerId", "subject"],
      },
      statusPath: "/cases/status/{idempotencyKey}",
    },
  ],
};

function fakeClientFactory(behavior) {
  const calls = [];
  const client = async (request) => {
    calls.push(request);
    return behavior(request, calls);
  };
  client.calls = calls;
  return client;
}

describe("adapter contract validation", () => {
  test("accepts a well-formed definition and namespaces tools", () => {
    const adapter = validateAdapterDefinition(DEFINITION, {
      NODE_ENV: "development",
    });
    expect(adapter.tools[0].namespacedName).toBe("test_crm_get_customer");
    expect(adapter.tools[1].readOnly).toBe(false);
    expect(adapter.tools[1].idempotency).toBe("required");
    expect(adapter.tools[0].readOnly).toBe(true);
  });

  test("rejects a baseUrl embedding credentials", () => {
    expect(() =>
      validateAdapterDefinition({
        ...DEFINITION,
        baseUrl: "https://user:pass@crm.example",
      }),
    ).toThrow(AdapterValidationError);
  });

  test("rejects http in production", () => {
    expect(() =>
      validateAdapterDefinition(
        { ...DEFINITION, baseUrl: "http://crm.example" },
        { NODE_ENV: "production" },
      ),
    ).toThrow(AdapterValidationError);
  });

  test("rejects a credential header smuggled in as a static header", () => {
    expect(() =>
      validateAdapterDefinition({
        ...DEFINITION,
        headers: { Authorization: "Bearer x" },
      }),
    ).toThrow(AdapterValidationError);
  });

  test("rejects duplicate tool names", () => {
    expect(() =>
      validateAdapterDefinition({
        ...DEFINITION,
        tools: [DEFINITION.tools[0], DEFINITION.tools[0]],
      }),
    ).toThrow(AdapterValidationError);
  });
});

describe("credential resolution", () => {
  test("apiKey resolves from env and a missing variable names the variable, not a value", async () => {
    const adapter = validateAdapterDefinition(DEFINITION, {});
    const headers = await resolveAuthHeaders(adapter, {
      TEST_CRM_API_KEY: "secret-123",
    });
    expect(headers).toEqual({ "X-Api-Key": "secret-123" });
    await expect(resolveAuthHeaders(adapter, {})).rejects.toThrow(
      AdapterAuthError,
    );
    await expect(resolveAuthHeaders(adapter, {})).rejects.toThrow(
      "TEST_CRM_API_KEY",
    );
  });
});

describe("generic HTTP execution", () => {
  function makeAdapter(client) {
    const adapter = validateAdapterDefinition(DEFINITION, {});
    return new GenericHttpAdapter(adapter, {
      httpClient: client,
      idempotencyStore: new IdempotencyStore(),
      env: {
        NODE_ENV: "test",
        ADAPTER_PILOT_MUTATIONS_ENABLED: "true",
        TEST_CRM_API_KEY: "secret-123",
      },
    });
  }

  test("GET fills path templates and sends the rest as query params", async () => {
    const client = fakeClientFactory(async () => ({
      status: 200,
      data: { id: "c1" },
    }));
    const executor = makeAdapter(client);
    const result = await executor.execute("get_customer", { customerId: "c1" });
    expect(result.outcome).toBe("completed");
    expect(result.data).toEqual({ id: "c1" });
    expect(client.calls[0].url).toBe("https://crm.test.example/customers/c1");
    expect(client.calls[0].headers["X-Api-Key"]).toBe("secret-123");
  });

  test("mutating tools require an idempotencyKey and forward it as a header", async () => {
    const client = fakeClientFactory(async () => ({
      status: 201,
      data: { caseId: "k1" },
    }));
    const executor = makeAdapter(client);
    await expect(
      executor.execute("create_case", { customerId: "c1", subject: "Help" }),
    ).rejects.toThrow("require an idempotencyKey");
    const result = await executor.execute(
      "create_case",
      { customerId: "c1", subject: "Help" },
      { idempotencyKey: "key-1" },
    );
    expect(result.outcome).toBe("completed");
    expect(client.calls[0].headers["Idempotency-Key"]).toBe("key-1");
  });

  test("a second call with the same idempotencyKey replays without calling the backend", async () => {
    const client = fakeClientFactory(async () => ({
      status: 201,
      data: { caseId: "k1" },
    }));
    const executor = makeAdapter(client);
    const first = await executor.execute(
      "create_case",
      { customerId: "c1", subject: "Help" },
      { idempotencyKey: "key-1" },
    );
    const second = await executor.execute(
      "create_case",
      { customerId: "c1", subject: "Help" },
      { idempotencyKey: "key-1" },
    );
    expect(first.outcome).toBe("completed");
    expect(second).toEqual(first);
    expect(second.data).toEqual({ caseId: "k1" });
    expect(client.calls).toHaveLength(1);
  });

  test("a timeout is uncertain, not failed, and is replayed as uncertain", async () => {
    const timeoutError = new Error("timeout");
    timeoutError.code = "ECONNABORTED";
    timeoutError.request = {};
    const client = fakeClientFactory(async () => {
      throw timeoutError;
    });
    const executor = makeAdapter(client);
    const result = await executor.execute(
      "create_case",
      { customerId: "c1", subject: "Help" },
      { idempotencyKey: "key-9" },
    );
    expect(result.outcome).toBe("uncertain");
    expect(result.reconciliationReference).toBe("key-9");
    // A second attempt with the same key must not re-execute blindly.
    const replay = await executor.execute(
      "create_case",
      { customerId: "c1", subject: "Help" },
      { idempotencyKey: "key-9" },
    );
    expect(replay.outcome).toBe("uncertain");
    expect(replay).toEqual(result);
    expect(client.calls).toHaveLength(1);
  });

  test("a definitive backend failure is not cached and raw errors do not escape", async () => {
    const error = new Error("bad request");
    error.response = {
      status: 400,
      data: { message: "subject required by backend" },
    };
    const client = fakeClientFactory(async () => {
      throw error;
    });
    const executor = makeAdapter(client);
    const result = await executor.execute(
      "create_case",
      { customerId: "c1", subject: "Help" },
      { idempotencyKey: "key-2" },
    );
    expect(result.outcome).toBe("failed");
    expect(result.status).toBe(400);
    expect(result.error).not.toContain("subject required by backend");
    // A definitive rejection permits an explicit same-key retry.
    await executor.execute(
      "create_case",
      { customerId: "c1", subject: "Help" },
      { idempotencyKey: "key-2" },
    );
    expect(client.calls).toHaveLength(2);
  });

  test("reconcile uses the status endpoint instead of re-executing the mutation", async () => {
    const client = fakeClientFactory(async (request) => {
      if (request.url.includes("/cases/status/"))
        return { status: 200, data: { status: "completed", caseId: "k7" } };
      return { status: 201, data: { caseId: "k7" } };
    });
    const executor = makeAdapter(client);
    const reconciled = await executor.reconcile("create_case", "key-7");
    expect(reconciled.outcome).toBe("completed");
    expect(reconciled.data.caseId).toBe("k7");
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].url).toBe(
      "https://crm.test.example/cases/status/key-7",
    );
  });

  test("reconcile without a status endpoint returns manual steps, not a retry", async () => {
    const adapter = validateAdapterDefinition(
      {
        ...DEFINITION,
        tools: [{ ...DEFINITION.tools[1], statusPath: undefined }],
      },
      {},
    );
    const client = fakeClientFactory(async () => ({ status: 201, data: {} }));
    const executor = new GenericHttpAdapter(adapter, {
      httpClient: client,
      env: { TEST_CRM_API_KEY: "k" },
    });
    const result = await executor.reconcile("create_case", "key-8");
    expect(result.outcome).toBe("uncertain");
    expect(result.reason).toBe("no-status-endpoint");
    expect(result.manualSteps.length).toBeGreaterThan(0);
    expect(client.calls).toHaveLength(0);
  });
});

describe("registry", () => {
  test("registers adapters, lists namespaced tools, and rejects duplicates", () => {
    const registry = new AdapterRegistry({ env: { TEST_CRM_API_KEY: "k" } });
    registry.register(DEFINITION);
    expect(registry.listTools().map((t) => t.name)).toContain(
      "test_crm_get_customer",
    );
    expect(() => registry.register(DEFINITION)).toThrow("already registered");
  });
});
