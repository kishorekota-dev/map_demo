const {
  validateBaseUrl,
  privateAddress,
  resolveSecret,
  requestConnector,
} = require("../connectors");
const { createReferenceAdapter } = require("../reference-adapter/server");
describe("provider-neutral connector boundary", () => {
  test("production requires allowlisted HTTPS and blocks credentials/private destinations", () => {
    const env = {
      NODE_ENV: "production",
      CONNECTOR_ALLOWED_HOSTS: "api.example.com",
    };
    expect(() => validateBaseUrl("http://api.example.com", env)).toThrow(
      "HTTPS",
    );
    expect(() => validateBaseUrl("https://other.example.com", env)).toThrow(
      "not in",
    );
    expect(() =>
      validateBaseUrl("https://secret:token@api.example.com", env),
    ).toThrow("HTTPS");
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "169.254.169.254",
      "172.18.0.1",
      "192.168.1.1",
      "::1",
      "fd01::1",
      "::ffff:127.0.0.1",
    ])
      expect(privateAddress(ip)).toBe(true);
    expect(privateAddress("8.8.8.8")).toBe(false);
  });
  test("secrets are resolved only from constrained references", () => {
    expect(
      resolveSecret("env:CONNECTOR_SECRET_DEMO", {
        CONNECTOR_SECRET_DEMO: "secret",
      }),
    ).toBe("secret");
    expect(() =>
      resolveSecret("env:JWT_SECRET", { JWT_SECRET: "never" }),
    ).toThrow();
    expect(() => resolveSecret("plaintext")).toThrow();
  });
  test("real HTTP reference contract verifies idempotency and authoritative lookup", async () => {
    const server = createReferenceAdapter({ token: "reference-secret" }).listen(
      0,
      "127.0.0.1",
    );
    await new Promise((resolve) => server.once("listening", resolve));
    try {
      const env = {
        NODE_ENV: "test",
        CONNECTOR_ALLOW_LOCAL: "true",
        CONNECTOR_SECRET_REFERENCE: "reference-secret",
      };
      const connection = {
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        credentialRef: "env:CONNECTOR_SECRET_REFERENCE",
        timeoutMs: 2000,
      };
      expect(
        (await requestConnector(connection, "/health", { env })).data.status,
      ).toBe("ok");
      const options = {
        env,
        method: "POST",
        headers: { "Idempotency-Key": "stable" },
        body: { operationId: "stable", summary: "Example" },
      };
      const first = await requestConnector(connection, "/cases", options);
      const second = await requestConnector(connection, "/cases", options);
      expect(second.data.externalId).toBe(first.data.externalId);
      expect(
        (
          await requestConnector(
            connection,
            "/cases/by-idempotency-key/missing",
            { env },
          )
        ).data.authoritative,
      ).toBe(true);
      expect(
        (
          await requestConnector(connection, "/cases", {
            ...options,
            body: { operationId: "stable", summary: "Changed" },
          })
        ).status,
      ).toBe(409);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
