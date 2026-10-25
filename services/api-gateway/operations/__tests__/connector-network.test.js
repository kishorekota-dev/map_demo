const http = require("http");
const { privateAddress, requestConnector } = require("../connectors");

describe("connector network isolation and deadlines", () => {
  test.each([
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:a00:1",
    "::ffff:c0a8:101",
    "0:0:0:0:0:0:0:1",
    "2002:7f00:1::",
    "64:ff9b::7f00:1",
    "fe80::1",
    "fc00::1",
    "198.18.0.1",
    "192.0.2.1",
  ])("rejects restricted address %s", (ip) => {
    expect(privateAddress(ip)).toBe(true);
  });
  test.each(["8.8.8.8", "2606:4700:4700::1111", "::ffff:808:808"])(
    "allows public address %s",
    (ip) => {
      expect(privateAddress(ip)).toBe(false);
    },
  );
  test("marks URL, DNS and private-address rejection as definitely not dispatched", async () => {
    const env = {
      NODE_ENV: "production",
      CONNECTOR_ALLOWED_HOSTS: "provider.example",
    };
    await expect(
      requestConnector(
        { baseUrl: "https://evil.example", timeoutMs: 100 },
        "/health",
        { env },
      ),
    ).rejects.toMatchObject({ dispatched: false });
    await expect(
      requestConnector(
        { baseUrl: "https://provider.example", timeoutMs: 100 },
        "/health",
        {
          env,
          lookup: async () => {
            throw Object.assign(new Error("lookup failed"), {
              code: "ENOTFOUND",
            });
          },
        },
      ),
    ).rejects.toMatchObject({ dispatched: false, code: "ENOTFOUND" });
    await expect(
      requestConnector(
        { baseUrl: "https://provider.example", timeoutMs: 100 },
        "/health",
        { env, lookup: async () => [{ address: "::ffff:7f00:1", family: 6 }] },
      ),
    ).rejects.toMatchObject({ dispatched: false, status: 400 });
  });
  test("bounds a DNS lookup that never returns", async () => {
    const started = Date.now();
    await expect(
      requestConnector(
        { baseUrl: "https://provider.example", timeoutMs: 30 },
        "/health",
        {
          env: {
            NODE_ENV: "production",
            CONNECTOR_ALLOWED_HOSTS: "provider.example",
          },
          lookup: () => new Promise(() => {}),
        },
      ),
    ).rejects.toMatchObject({ dispatched: false, code: "ETIMEDOUT" });
    expect(Date.now() - started).toBeLessThan(1000);
  });
  test("a provider that continuously trickles data still reaches the total deadline", async () => {
    let interval;
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      interval = setInterval(() => res.write(" "), 5);
      res.on("close", () => clearInterval(interval));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      await expect(
        requestConnector(
          {
            baseUrl: `http://127.0.0.1:${server.address().port}`,
            timeoutMs: 40,
          },
          "/health",
          { env: { NODE_ENV: "test", CONNECTOR_ALLOW_LOCAL: "true" } },
        ),
      ).rejects.toMatchObject({ dispatched: true });
    } finally {
      clearInterval(interval);
      await new Promise((resolve) => server.close(resolve));
    }
  });
  test.each([400, 503])('mutation HTTP %s is definitive even with a malformed unfinished response body', async status => {
    const server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => { res.writeHead(status); res.write('<invalid-json>'); });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const response = await requestConnector({ baseUrl: `http://127.0.0.1:${server.address().port}`, timeoutMs: 500 }, '/cases',
        { env: { NODE_ENV: 'test', CONNECTOR_ALLOW_LOCAL: 'true' }, method: 'POST', headers: { 'Idempotency-Key': 'rejected-request' }, body: { operationId: 'rejected-request' } });
      expect(response).toEqual({ status, data: {} });
    } finally { await new Promise(resolve => server.close(resolve)); }
  });
});
