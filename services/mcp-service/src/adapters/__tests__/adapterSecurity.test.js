const http = require("http");
const fs = require("fs");
const { loadAdaptersFromConfig } = require("../adapterLoader");
const express = require("express");
const request = require("supertest");
const {
  validateAdapterDefinition,
  validateParameters,
  AdapterValidationError,
} = require("../adapterContract");
const { GenericHttpAdapter } = require("../genericHttpAdapter");
const { AdapterRegistry } = require("../adapterRegistry");
const { createSecureHttpClient } = require("../adapterNetwork");
const { resolveAuthHeaders, _tokenCache } = require("../credentialResolver");
const { createAdapterApiRoutes } = require("../../routes/adapterApi.routes");
const IdempotencyStore = require("../idempotencyStore");
const definition = () => ({
  id: "test-crm",
  name: "Fixture CRM",
  version: "1",
  baseUrl: "https://crm.example.invalid",
  auth: { type: "bearer", envVar: "ADAPTER_SECRET_CRM" },
  healthPath: "/health",
  tools: [
    {
      name: "read_record",
      description: "Read",
      method: "GET",
      path: "/records/{recordId}",
      inputSchema: {
        type: "object",
        properties: { recordId: { type: "string" } },
        required: ["recordId"],
      },
    },
    {
      name: "create_record",
      description: "Create",
      method: "POST",
      path: "/records",
      inputSchema: {
        type: "object",
        properties: { subject: { type: "string" } },
        required: ["subject"],
      },
      statusPath: "/status/{idempotencyKey}",
    },
  ],
});
const pilot = {
  NODE_ENV: "test",
  ADAPTER_PILOT_MUTATIONS_ENABLED: "true",
  ADAPTER_SECRET_CRM: "fixture-secret-value",
};
const args = { subject: "Synthetic fixture" };
const executor = (client, env = pilot, raw = definition()) =>
  new GenericHttpAdapter(validateAdapterDefinition(raw, env), {
    httpClient: client,
    env,
  });
const serviceEnv = {
  ...pilot,
  SERVICING_SERVICE_TOKEN: "s7YpK5uM3eW8oC2qA9dR6vF4nJ1hL0zB",
};
beforeEach(() => _tokenCache.clear());

test("malformed server JSON cannot leak parser content into startup errors", () => {
  const read = jest
    .spyOn(fs, "readFileSync")
    .mockReturnValue('{"adapters":tSYNTHETIC_SECRET_VALUE}');
  try {
    let caught;
    try {
      loadAdaptersFromConfig(new AdapterRegistry(), "/private/adapters.json");
    } catch (error) {
      caught = error;
    }
    expect(caught.message).toContain("not valid JSON");
    expect(caught.message).not.toContain("SYNTHETIC_SECRET_VALUE");
  } finally {
    read.mockRestore();
  }
});

describe("server declaration validation", () => {
  test.each([
    (raw) => {
      raw.baseUrl += "?api_key=secret";
    },
    (raw) => {
      raw.baseUrl += "#fragment";
    },
    (raw) => {
      raw.auth = { type: "bearer", envVar: "KEY", token: "literal-secret" };
    },
    (raw) => {
      raw.auth = {
        type: "oauth2-client-credentials",
        envVarClientId: "CLIENT",
        envVarClientSecret: "SECRET",
        tokenUrl: "http://identity.example.invalid/token",
      };
    },
    (raw) => {
      raw.headers = { Host: "another.example.invalid" };
    },
    (raw) => {
      raw.headers = { "X-Header": "bad\r\nInjected: data" };
    },
    (raw) => {
      raw.auth = { type: "apiKey", envVar: "KEY", headerName: "X-Custom-Key" };
      raw.headers = { "x-custom-key": "literal" };
    },
    (raw) => {
      raw.headers = { "X-Header": "one", "x-header": "two" };
    },
    (raw) => {
      raw.auth.headerName = "Host";
      raw.auth.type = "apiKey";
    },
    (raw) => {
      raw.tools[0].path = "/%2e%2e/secret";
    },
    (raw) => {
      raw.tools[0].path = "/%252e%252e/secret";
    },
    (raw) => {
      raw.tools[0].path = "/records/{undeclared}";
    },
    (raw) => {
      raw.healthPath = "/../../secret";
    },
    (raw) => {
      raw.tools[1].statusPath = "/%2fsecret";
    },
    (raw) => {
      raw.tools[1].statusPath = "/unbound-status";
    },
    (raw) => {
      raw.tools[0].inputSchema = undefined;
    },
    (raw) => {
      raw.tools[0].inputSchema.required = "recordId";
    },
    (raw) => {
      raw.tools[0].inputSchema.required = false;
    },
    (raw) => {
      raw.tools[0].inputSchema.properties.recordId.type = "unsupported";
    },
    (raw) => {
      raw.tools[1].readOnly = true;
    },
    (raw) => {
      raw.tools[1].idempotency = "optional";
    },
    (raw) => {
      raw.tools[1].retry = { maxAttempts: 2 };
    },
    (raw) => {
      raw.id = "banking";
      raw.tools[0].name = "get_accounts";
    },
  ])(
    "rejects unsafe or unsupported declarations before any request (%#)",
    (mutate) => {
      const raw = definition();
      mutate(raw);
      expect(() =>
        validateAdapterDefinition(raw, { NODE_ENV: "production" }),
      ).toThrow(AdapterValidationError);
    },
  );
  test("validates nested arguments, rejects undeclared fields and numeric/length violations", () => {
    const raw = definition();
    raw.tools[1].inputSchema = {
      type: "object",
      properties: {
        context: {
          type: "object",
          properties: {
            count: { type: "integer", minimum: 1, maximum: 5 },
            label: { type: "string", maxLength: 4 },
          },
          required: ["count"],
        },
      },
      required: ["context"],
    };
    const tool = validateAdapterDefinition(raw, pilot).tools[1];
    expect(
      validateParameters(tool, { context: { count: 2, label: "good" } }).valid,
    ).toBe(true);
    for (const value of [
      { context: { count: 9 } },
      { context: { count: 2, label: "too long" } },
      { context: { count: Infinity } },
      { context: { count: 2, credential: "secret" } },
      { context: null },
    ])
      expect(validateParameters(tool, value).valid).toBe(false);
  });
  test("registry rejects ambiguous underscore namespaces across adapters", () => {
    const registry = new AdapterRegistry({ env: pilot });
    const first = definition();
    first.id = "ab-cd";
    first.tools = [{ ...first.tools[0], name: "ef" }];
    registry.register(first);
    const second = definition();
    second.id = "ab";
    second.tools = [{ ...second.tools[0], name: "cd_ef" }];
    expect(() => registry.register(second)).toThrow(
      "Namespaced tool already registered",
    );
    const third = definition();
    third.id = "another";
    registry.register(third);
    expect(registry.listAdapters()).toHaveLength(2);
  });
});

describe("mutation and replay boundaries", () => {
  test("production mutations stay blocked even when pilot flag is true; pilot is opt-in elsewhere", async () => {
    const client = jest.fn();
    await expect(
      executor(client, { ...pilot, NODE_ENV: "production" }).execute(
        "create_record",
        args,
        { idempotencyKey: "one" },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      executor(client, {
        ...pilot,
        ADAPTER_PILOT_MUTATIONS_ENABLED: "false",
      }).execute("create_record", args, { idempotencyKey: "one" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(client).not.toHaveBeenCalled();
  });
  test("concurrent calls share one dispatch and keys cannot replay different arguments", async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const client = jest.fn(async () => {
      await gate;
      return { status: 201, data: { id: "fixture" } };
    });
    const adapter = executor(client);
    const first = adapter.execute("create_record", args, {
      idempotencyKey: "same-key",
    });
    const second = adapter.execute(
      "create_record",
      { ...args },
      { idempotencyKey: "same-key" },
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(client).toHaveBeenCalledTimes(1);
    const pendingReconcile = await adapter.reconcile(
      "create_record",
      "same-key",
    );
    expect(pendingReconcile.reason).toBe("execution-in-progress");
    release();
    expect((await first).outcome).toBe("completed");
    expect((await second).replayed).toBe(true);
    await expect(
      adapter.execute(
        "create_record",
        { subject: "Different" },
        { idempotencyKey: "same-key" },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(client).toHaveBeenCalledTimes(1);
  });
  test.each([500, 503, 202])(
    "HTTP %s does not prove mutation completed or rolled back",
    async (status) => {
      const client = jest.fn(async () => ({
        status,
        data: { message: "credential=fixture-secret-value" },
      }));
      const adapter = executor(client);
      const result = await adapter.execute("create_record", args, {
        idempotencyKey: "error-key",
      });
      expect(result.outcome).toBe("uncertain");
      expect(JSON.stringify(result)).not.toContain("fixture-secret-value");
      expect(
        (
          await adapter.execute("create_record", args, {
            idempotencyKey: "error-key",
          })
        ).replayed,
      ).toBe(true);
      expect(client).toHaveBeenCalledTimes(1);
    },
  );
  test("unknown post-dispatch errors remain uncertain without raw error leakage", async () => {
    const client = jest.fn(async () => {
      throw new Error("api-key=fixture-secret-value");
    });
    const adapter = executor(client);
    const result = await adapter.execute("create_record", args, {
      idempotencyKey: "unknown",
    });
    expect(result.outcome).toBe("uncertain");
    expect(JSON.stringify(result)).not.toContain("fixture-secret-value");
  });
  test("readonly network errors retry within the declared limit", async () => {
    const raw = definition();
    raw.tools[0].retry = { maxAttempts: 2 };
    const client = jest
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce({ status: 200, data: { id: "fixture" } });
    const result = await executor(client, pilot, raw).execute("read_record", {
      recordId: "fixture",
    });
    expect(result.outcome).toBe("completed");
    expect(client).toHaveBeenCalledTimes(2);
    expect(client.mock.calls[0][0]).toMatchObject({
      maxRedirects: 0,
      proxy: false,
      maxContentLength: 1048576,
      maxBodyLength: 65536,
    });
  });
  test.each(["..", ".", "a/b", "a\\b", "%2e%2e", "\r\n"])(
    "routing values cannot traverse or escape paths (%#)",
    async (recordId) => {
      const client = jest.fn();
      await expect(
        executor(client).execute("read_record", { recordId }),
      ).rejects.toThrow();
      expect(client).not.toHaveBeenCalled();
    },
  );
  test("optional path fields cannot collapse to a collection route", async () => {
    const raw = definition();
    raw.tools[0].inputSchema.required = [];
    const client = jest.fn();
    await expect(
      executor(client, pilot, raw).execute("read_record", { recordId: "" }),
    ).rejects.toThrow("Invalid path parameter");
    expect(client).not.toHaveBeenCalled();
  });
  test("idempotency cache refuses overflow before dispatch and keys are unambiguous", async () => {
    const store = new IdempotencyStore({ maxEntries: 1 });
    const call = jest.fn(async () => ({ outcome: "completed" }));
    await store.execute("ab", "cd", "one", "fingerprint", call);
    await expect(
      store.execute("ab", "cd", "two", "fingerprint", call),
    ).rejects.toMatchObject({ status: 503 });
    expect(call).toHaveBeenCalledTimes(1);
    expect(store._key("a:b", "c", "d")).not.toBe(store._key("a", "b:c", "d"));
  });
});

describe("OAuth credential isolation", () => {
  const oauth = (scope) => ({
    auth: {
      type: "oauth2-client-credentials",
      envVarClientId: "CLIENT_ID",
      envVarClientSecret: "CLIENT_SECRET",
      tokenUrl: "https://identity.example.invalid/token",
      scope,
    },
  });
  test("cache binds actual credentials and scope; removed/rotated secrets do not reuse old tokens", async () => {
    const client = jest.fn(async () => ({
      status: 200,
      data: {
        access_token: `token-${client.mock.calls.length}`,
        expires_in: 3600,
      },
    }));
    const one = { CLIENT_ID: "client-a", CLIENT_SECRET: "secret-a" };
    const token1 = await resolveAuthHeaders(oauth("read"), one, client);
    expect(await resolveAuthHeaders(oauth("read"), one, client)).toEqual(
      token1,
    );
    expect(await resolveAuthHeaders(oauth("write"), one, client)).not.toEqual(
      token1,
    );
    expect(
      await resolveAuthHeaders(
        oauth("read"),
        { ...one, CLIENT_SECRET: "secret-b" },
        client,
      ),
    ).not.toEqual(token1);
    await expect(
      resolveAuthHeaders(oauth("read"), { CLIENT_ID: "client-a" }, client),
    ).rejects.toThrow("credential missing");
    expect(client).toHaveBeenCalledTimes(3);
  });
  test("short and unspecified token lifetime never becomes an invented60-second cache", async () => {
    let now = 1000;
    const clock = jest.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const client = jest.fn(async () => ({
        status: 200,
        data: { access_token: "token", expires_in: 1 },
      }));
      const env = { CLIENT_ID: "id", CLIENT_SECRET: "secret" };
      await resolveAuthHeaders(oauth("read"), env, client);
      now += 2000;
      await resolveAuthHeaders(oauth("read"), env, client);
      expect(client).toHaveBeenCalledTimes(2);
      const missingExpiry = jest.fn(async () => ({
        status: 200,
        data: { access_token: "token" },
      }));
      await resolveAuthHeaders(oauth("other"), env, missingExpiry);
      await resolveAuthHeaders(oauth("other"), env, missingExpiry);
      expect(missingExpiry).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  });
  test("OAuth redirects/error responses cannot masquerade as issued tokens", async () => {
    const client = jest.fn(async () => ({
      status: 302,
      data: { access_token: "not-issued" },
    }));
    await expect(
      resolveAuthHeaders(
        oauth("read"),
        { CLIENT_ID: "id", CLIENT_SECRET: "secret" },
        client,
      ),
    ).rejects.toThrow("valid access_token");
    expect(client.mock.calls[0][0]).toMatchObject({
      maxRedirects: 0,
      proxy: false,
    });
  });
});

describe("native egress", () => {
  test("rejects restricted DNS before opening a socket, including IPv4-mapped loopback", async () => {
    for (const address of [
      "127.0.0.1",
      "169.254.169.254",
      "::ffff:7f00:1",
      "10.1.2.3",
    ]) {
      const client = createSecureHttpClient(
        { NODE_ENV: "production" },
        {
          lookup: jest.fn(async () => [
            { address, family: address.includes(":") ? 6 : 4 },
          ]),
        },
      );
      await expect(
        client({ url: "https://fixture.example.invalid/read", timeout: 1000 }),
      ).rejects.toMatchObject({
        code: "ADAPTER_NETWORK_RESTRICTED",
        dispatched: false,
      });
    }
  });
  test("pins one resolution and never follows redirects with service credentials", async () => {
    const seen = [];
    const server = http.createServer((req, res) => {
      seen.push(req.url);
      res.writeHead(302, { Location: "/credential-collector" });
      res.end("{}");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const lookup = jest.fn(async () => [{ address: "127.0.0.1", family: 4 }]);
      const client = createSecureHttpClient(
        { NODE_ENV: "test", ADAPTER_ALLOW_LOCAL: "true" },
        { lookup },
      );
      const result = await client({
        url: `http://dns-fixture.invalid:${server.address().port}/read`,
        headers: { Authorization: "Bearer synthetic" },
        timeout: 1000,
      });
      expect(result.status).toBe(302);
      expect(seen).toEqual(["/read"]);
      expect(lookup).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  test("response size limits stop unbounded provider data", async () => {
    const server = http.createServer((_req, res) =>
      res.end("x".repeat(1048577)),
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const client = createSecureHttpClient({
        NODE_ENV: "test",
        ADAPTER_ALLOW_LOCAL: "true",
      });
      await expect(
        client({
          url: `http://127.0.0.1:${server.address().port}/read`,
          timeout: 1000,
        }),
      ).rejects.toMatchObject({
        code: "ADAPTER_RESPONSE_TOO_LARGE",
        dispatched: true,
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("private service API", () => {
  function app(env = serviceEnv) {
    const registry = new AdapterRegistry({
      env,
      httpClient: jest.fn(async () => ({
        status: 200,
        data: { fixture: true },
      })),
    });
    registry.register(definition());
    const app = express();
    app.use(express.json({ limit: "64kb" }));
    app.use("/api/adapters", createAdapterApiRoutes(registry, env));
    return app;
  }
  test("development gate is mandatory, customer bearer is insufficient, identity can be rotated", async () => {
    const api = app();
    await request(api).get("/api/adapters").expect(401);
    await request(api)
      .get("/api/adapters")
      .set("Authorization", "Bearer customer-token")
      .expect(401);
    const result = await request(api)
      .get("/api/adapters")
      .set("X-Servicing-Service-Token", serviceEnv.SERVICING_SERVICE_TOKEN)
      .expect(200);
    expect(JSON.stringify(result.body)).not.toContain("fixture-secret-value");
    expect(result.headers["cache-control"]).toBe("no-store");
    await request(app({ ...serviceEnv, SERVICING_SERVICE_TOKEN: undefined }))
      .get("/api/adapters")
      .expect(503);
  });
  test("adapter POST accepts only bounded JSON bodies", async () => {
    await request(app())
      .post("/api/adapters/test-crm/tools/read_record/execute")
      .set("X-Servicing-Service-Token", serviceEnv.SERVICING_SERVICE_TOKEN)
      .type("form")
      .send({ parameters: "value" })
      .expect(415);
    await request(app())
      .post("/api/adapters/test-crm/tools/read_record/execute")
      .set("X-Servicing-Service-Token", serviceEnv.SERVICING_SERVICE_TOKEN)
      .send({ parameters: { recordId: "x".repeat(65536) } })
      .expect(413);
  });
  test("production API denies mutations and request credential injection", async () => {
    const api = app({ ...serviceEnv, NODE_ENV: "production" });
    await request(api)
      .post("/api/adapters/test-crm/tools/create_record/execute")
      .set("X-Servicing-Service-Token", serviceEnv.SERVICING_SERVICE_TOKEN)
      .send({ parameters: args, idempotencyKey: "one" })
      .expect(403);
    await request(api)
      .post("/api/adapters/test-crm/tools/read_record/execute")
      .set("X-Servicing-Service-Token", serviceEnv.SERVICING_SERVICE_TOKEN)
      .send({ parameters: { recordId: "one" }, auth: { token: "caller" } })
      .expect(400);
    await request(api)
      .post("/api/adapters/test-crm/tools/read_record/execute")
      .set("X-Servicing-Service-Token", serviceEnv.SERVICING_SERVICE_TOKEN)
      .send({ parameters: { recordId: "one" } })
      .expect(200);
  });
});
