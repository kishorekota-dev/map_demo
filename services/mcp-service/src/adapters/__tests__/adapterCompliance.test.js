const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomBytes } = require("crypto");
const express = require("express");
const request = require("supertest");
const { GenericHttpAdapter } = require("../genericHttpAdapter");
const { validateAdapterDefinition } = require("../adapterContract");
const { AdapterRegistry } = require("../adapterRegistry");
const { loadAdaptersFromConfig } = require("../adapterLoader");
const { createAdapterApiRoutes } = require("../../routes/adapterApi.routes");
const logger = require("../../utils/logger");
jest.mock("../../utils/logger", () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));
const pilot = { NODE_ENV: "test", ADAPTER_PILOT_MUTATIONS_ENABLED: "true" };
function definition(auth = { type: "none" }) {
  return { id: "compliance-crm", name: "Synthetic compliance fixture", version: "1", baseUrl: "https://crm.example.invalid", auth,
    tools: [{ name: "create_case", description: "Create a synthetic case", method: "POST", path: "/cases", statusPath: "/cases/{idempotencyKey}",
      inputSchema: { type: "object", properties: { subject: { type: "string" } }, required: ["subject"] } },
    { name: "read_case", description: "Read a synthetic case", method: "GET", path: "/cases", inputSchema: { type: "object", properties: {} } }] };
}
const executor = (client, env = pilot, raw = definition()) => new GenericHttpAdapter(validateAdapterDefinition(raw, env), { env, httpClient: client });
beforeEach(() => jest.clearAllMocks());

test("completed results replay verbatim and caller changes do not corrupt the stored result", async () => {
  const client = jest.fn(async () => ({ status: 201, data: { caseId: "synthetic-case" } }));
  const adapter = executor(client);
  const first = await adapter.execute("create_case", { subject: "Synthetic request" }, { idempotencyKey: "completed" });
  const recorded = structuredClone(first);
  first.data.caseId = "caller-edited";
  expect(await adapter.execute("create_case", { subject: "Synthetic request" }, { idempotencyKey: "completed" })).toEqual(recorded);
  expect(client).toHaveBeenCalledTimes(1);
});

test("an authoritative failed reconciliation allows an explicit same-key retry without caching the failure", async () => {
  const client = jest.fn().mockRejectedValueOnce(Object.assign(new Error("Connection reset after send"), { dispatched: true }))
    .mockResolvedValueOnce({ status: 200, data: { status: "failed" } }).mockResolvedValueOnce({ status: 201, data: { caseId: "synthetic-case" } });
  const adapter = executor(client);
  expect((await adapter.execute("create_case", { subject: "Synthetic request" }, { idempotencyKey: "reconcile" })).outcome).toBe("uncertain");
  expect((await adapter.reconcile("create_case", "reconcile")).outcome).toBe("failed");
  expect((await adapter.execute("create_case", { subject: "Synthetic request" }, { idempotencyKey: "reconcile" })).outcome).toBe("completed");
  expect(client.mock.calls.map(([call]) => call.method)).toEqual(["POST", "GET", "POST"]);
});

test("reconciling an unknown failed operation does not poison a later same-key execution", async () => {
  const client = jest.fn().mockResolvedValueOnce({ status: 200, data: { status: "failed" } }).mockResolvedValueOnce({ status: 201, data: {} });
  const adapter = executor(client);
  expect((await adapter.reconcile("create_case", "unknown")).outcome).toBe("failed");
  expect((await adapter.execute("create_case", { subject: "Synthetic request" }, { idempotencyKey: "unknown" })).outcome).toBe("completed");
});

test("successful read and mutation payloads redact known environment credentials before replay", async () => {
  const value = randomBytes(32).toString("hex");
  const env = { ...pilot, COMPLIANCE_BACKEND_KEY: value };
  const client = jest.fn(async () => ({ status: 200, data: { nested: [{ echoed: `prefix ${value} suffix` }], normal: "Public case data" } }));
  const adapter = executor(client, env, definition({ type: "apiKey", envVar: "COMPLIANCE_BACKEND_KEY" }));
  const read = await adapter.execute("read_case", {});
  const created = await adapter.execute("create_case", { subject: "Synthetic request" }, { idempotencyKey: "redacted" });
  expect(JSON.stringify([read, created]).includes(value)).toBe(false);
  expect(created.data.normal).toBe("Public case data");
  expect(created.data.nested[0].echoed).toBe("prefix [redacted] suffix");
  expect(await adapter.execute("create_case", { subject: "Synthetic request" }, { idempotencyKey: "redacted" })).toEqual(created);
  expect(client).toHaveBeenCalledTimes(2);
});

test("reconciliation redacts the OAuth token actually dispatched without fetching a second token", async () => {
  const value = randomBytes(32).toString("hex");
  const env = { ...pilot, COMPLIANCE_CLIENT_ID: randomBytes(24).toString("hex"), COMPLIANCE_CLIENT_SECRET: randomBytes(32).toString("hex") };
  const client = jest.fn(async (call) => call.url.endsWith("/token")
    ? { status: 200, data: { access_token: value } }
    : { status: 200, data: { status: "completed", echoed: call.headers.Authorization } });
  const adapter = executor(client, env, definition({ type: "oauth2-client-credentials", tokenUrl: "https://identity.example.invalid/token", envVarClientId: "COMPLIANCE_CLIENT_ID", envVarClientSecret: "COMPLIANCE_CLIENT_SECRET" }));
  const result = await adapter.reconcile("create_case", "oauth-reconcile");
  expect(result.outcome).toBe("completed");
  expect(JSON.stringify(result).includes(value)).toBe(false);
  expect(client).toHaveBeenCalledTimes(2);
});

test("provider payload processing is bounded and cannot expose unprocessed credential values", async () => {
  const value = randomBytes(32).toString("hex");
  const env = { ...pilot, COMPLIANCE_BACKEND_KEY: value };
  let data = { echoed: value };
  for (let depth = 0; depth < 65; depth++) data = { nested: data };
  const adapter = executor(jest.fn(async () => ({ status: 200, data })), env, definition({ type: "bearer", envVar: "COMPLIANCE_BACKEND_KEY" }));
  const result = await adapter.execute("create_case", { subject: "Synthetic request" }, { idempotencyKey: "bounded" });
  expect(result.outcome).toBe("uncertain");
  expect(JSON.stringify(result).includes(value)).toBe(false);
});

test("startup rejects missing credential references and unknown configuration fields without provider calls", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "adapter-compliance-"));
  const file = path.join(directory, "adapters.json");
  const client = jest.fn();
  const registry = new AdapterRegistry({ env: pilot, httpClient: client });
  try {
    fs.writeFileSync(file, JSON.stringify({ adapters: [definition({ type: "bearer", envVar: "COMPLIANCE_MISSING_CREDENTIAL" })] }));
    expect(() => loadAdaptersFromConfig(registry, file)).toThrow("COMPLIANCE_MISSING_CREDENTIAL");
    expect(registry.listAdapters()).toEqual([]);
    fs.writeFileSync(file, JSON.stringify({ adapters: [], unexpected: true }));
    expect(() => loadAdaptersFromConfig(registry, file)).toThrow("adapters");
    expect(client).not.toHaveBeenCalled();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("execution logs contain operational enums instead of caller text and arbitrary parameter keys", async () => {
  const env = { ...pilot, SERVICING_SERVICE_TOKEN: randomBytes(32).toString("hex") };
  const registry = new AdapterRegistry({ env, httpClient: jest.fn(async () => ({ status: 201, data: {} })) });
  registry.register(definition());
  const app = express(); app.use(express.json()); app.use("/api/adapters", createAdapterApiRoutes(registry, env));
  let server;
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  const callerText = "private-person@example.invalid";
  try {
    await request(server).post("/api/adapters/compliance-crm/tools/create_case/execute")
      .set("X-Servicing-Service-Token", env.SERVICING_SERVICE_TOKEN)
      .send({ parameters: { [callerText]: "Invalid argument" }, idempotencyKey: "invalid", sessionId: "caller-private-id" }).expect(400);
    const logs = JSON.stringify([logger.info.mock.calls, logger.error.mock.calls]);
    expect(logs.includes(callerText)).toBe(false);
    expect(logs.includes("caller-private-id")).toBe(false);
    expect(logs.includes(env.SERVICING_SERVICE_TOKEN)).toBe(false);
    expect(logger.info).toHaveBeenCalledWith("Executing generic adapter tool", { operation: "execute" });
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("argument validation errors cannot echo caller text used as an undeclared field name", async () => {
  const sensitive = randomBytes(32).toString("hex");
  const adapter = executor(jest.fn());
  let error;
  try { await adapter.execute("create_case", { [sensitive]: "Invalid field" }, { idempotencyKey: "invalid-fields" }); } catch (caught) { error = caught; }
  expect(error.status).toBe(400);
  expect(error.message.includes(sensitive)).toBe(false);
});
