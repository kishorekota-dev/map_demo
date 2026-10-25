const express = require("express");
const request = require("supertest");
const jwt = require("jsonwebtoken");
const { generateKeyPairSync, randomUUID, randomBytes, createHash } = require("crypto");
const { OperationsStore } = require("../store");
const { createIdentityRouter } = require("../../identity");
const databaseUrl =
  process.env.TEST_OPERATIONS_DATABASE_URL ||
  process.env.TEST_CONTROL_PLANE_DATABASE_URL;
(databaseUrl ? describe : describe.skip)("enterprise OIDC code flow", () => {
  let store, app, env, fetcher, keys, claims, tokenExchange;
  beforeAll(() => {
    keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  });
  beforeEach(async () => {
    store = new OperationsStore({
      databaseUrl,
      tenantId: `identity-${randomUUID()}`,
    });
    await store.initialize();
    env = {
      NODE_ENV: "test",
      JWT_SECRET: "local-signing-test-only",
      OIDC_CLIENT_SECRET_REF: "env:OIDC_CLIENT_SECRET",
      OIDC_CLIENT_SECRET: randomBytes(32).toString("hex"),
      OIDC_ISSUER: "https://id.example.com",
      OIDC_CLIENT_ID: "servicing",
      OIDC_AUTHORIZATION_ENDPOINT: "https://id.example.com/authorize",
      OIDC_TOKEN_ENDPOINT: "https://id.example.com/token",
      OIDC_JWKS_URI: "https://id.example.com/keys",
      OIDC_REDIRECT_URI: "https://app.example.com/api/identity/callback",
      FRONTEND_URL: "https://app.example.com",
    };
    claims = { sub: "mapped-subject", nonce: "filled-from-login" };
    const jwk = {
      ...keys.publicKey.export({ format: "jwk" }),
      kid: "key-1",
      use: "sig",
      alg: "RS256",
    };
    fetcher = jest.fn(async (url, options) => {
      if (url === env.OIDC_JWKS_URI)
        return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
      tokenExchange = new URLSearchParams(options.body);
      const token = jwt.sign(claims, keys.privateKey, {
        algorithm: "RS256",
        keyid: "key-1",
        issuer: env.OIDC_ISSUER,
        audience: env.OIDC_CLIENT_ID,
        expiresIn: "5m",
      });
      return new Response(JSON.stringify({ id_token: token }), { status: 200 });
    });
    app = express();
    app.use(express.json());
    app.use(
      "/api/identity",
      createIdentityRouter({ store, env, fetch: fetcher }),
    );
    await store.transaction((tx) =>
      tx.put("identity", "operator", {
        issuer: env.OIDC_ISSUER,
        subject: "mapped-subject",
        userId: "local-banking-user",
        roles: ["control_plane_operator"],
        enabled: true,
      }),
    );
  });
  afterEach(async () => {
    await store.query(
      "DELETE FROM servicing_operations_events WHERE tenant_id=$1",
      [store.tenantId],
    );
    await store.query(
      "DELETE FROM servicing_operations_records WHERE tenant_id=$1",
      [store.tenantId],
    );
    await store.close();
  });
  async function login() {
    const response = await request(app).get("/api/identity/login");
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.location);
    claims.nonce = redirect.searchParams.get("nonce");
    return {
      redirect,
      cookie: response.headers["set-cookie"][0].split(";")[0],
    };
  }
  test("valid PKCE callback creates mapped local access token without external role trust", async () => {
    const { redirect, cookie } = await login();
    claims.roles = ["admin"];
    const response = await request(app)
      .get("/api/identity/callback")
      .query({
        code: "provider-code",
        state: redirect.searchParams.get("state"),
      })
      .set("Cookie", cookie);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      "https://app.example.com/auth?enterprise=1",
    );
    expect(
      createHash("sha256")
        .update(tokenExchange.get("code_verifier"))
        .digest("base64url"),
    ).toBe(redirect.searchParams.get("code_challenge"));
    expect(tokenExchange.get("redirect_uri")).toBe(env.OIDC_REDIRECT_URI);
    expect(tokenExchange.get("client_secret") === env.OIDC_CLIENT_SECRET).toBe(true);
    expect(JSON.stringify(response.body).includes(env.OIDC_CLIENT_SECRET)).toBe(false);
    const sessionCookie = response.headers["set-cookie"]
      .find((v) => v.startsWith("servicing_enterprise_session="))
      .split(";")[0];
    const session = await request(app)
      .get("/api/identity/session")
      .set("Cookie", sessionCookie);
    expect(session.status).toBe(200);
    const local = jwt.verify(session.body.accessToken, env.JWT_SECRET);
    expect(local.roles).toEqual(["control_plane_operator"]);
    expect(local.userId).toBe("local-banking-user");
    expect(local.permissions).toEqual([
      "servicing:context:read",
      "servicing:operations:read",
      "servicing:operations:reconcile",
    ]);
    expect(local.exp - local.iat).toBe(300);
    const replay = await request(app)
      .get("/api/identity/callback")
      .query({
        code: "provider-code",
        state: redirect.searchParams.get("state"),
      })
      .set("Cookie", cookie);
    expect(replay.status).toBe(401);
    await store.transaction(async (tx) => {
      const mapping = await tx.get("identity", "operator");
      await tx.put("identity", "operator", { ...mapping, enabled: false });
    });
    expect(
      (
        await request(app)
          .get("/api/identity/session")
          .set("Cookie", sessionCookie)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/identity/logout")
          .set("Origin", env.FRONTEND_URL)
          .set("Cookie", sessionCookie)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get("/api/identity/session")
          .set("Cookie", sessionCookie)
      ).status,
    ).toBe(401);
  });
  test("browser state mismatch does not consume legitimate login; nonce mismatch denies token", async () => {
    const { redirect, cookie } = await login();
    const query = {
      code: "provider-code",
      state: redirect.searchParams.get("state"),
    };
    expect(
      (
        await request(app)
          .get("/api/identity/callback")
          .query(query)
          .set("Cookie", "servicing_oidc_state=attacker")
      ).status,
    ).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
    claims.nonce = "wrong-nonce";
    expect(
      (
        await request(app)
          .get("/api/identity/callback")
          .query(query)
          .set("Cookie", cookie)
      ).status,
    ).toBe(401);
  });
  test("unmapped subject is denied and configured issuer is fixed server-side", async () => {
    const { redirect, cookie } = await login();
    claims.sub = "unknown";
    expect(
      (
        await request(app)
          .get("/api/identity/callback")
          .query({
            code: "provider-code",
            state: redirect.searchParams.get("state"),
            issuer: "https://attacker.example.com",
          })
          .set("Cookie", cookie)
      ).status,
    ).toBe(403);
    expect(
      fetcher.mock.calls.every(([url]) =>
        url.startsWith("https://id.example.com/"),
      ),
    ).toBe(true);
  });
});

test("OIDC credential references and explicitly enabled identity fail startup on invalid settings", () => {
  const options = { store: {}, env: { AUTH_PROVIDER: "oidc" } };
  expect(() => createIdentityRouter(options)).toThrow("Complete the server-owned OIDC configuration");
  for (const ref of ["file:oidc", "env:UNRELATED_SECRET", "env:OIDC_CLIENT_SECRET"]) {
    expect(() => createIdentityRouter({ store: {}, env: { OIDC_CLIENT_SECRET_REF: ref } })).toThrow("environment value");
  }
});
