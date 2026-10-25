const express = require("express");
const jwt = require("jsonwebtoken");
const { randomBytes, createHash, createPublicKey } = require("crypto");
const { resolveSecret } = require("../operations/connectors");
const { equal } = require("../operations/auth");
const { OperationsError } = require("../operations/store");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const route = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
function cookies(req) {
  return Object.fromEntries(
    (req.get("Cookie") || "")
      .split(";")
      .map((v) => v.trim().split(/=(.*)/s).slice(0, 2))
      .filter((v) => v.length === 2),
  );
}
function identityConfiguration(env) {
  const fields = [
    "OIDC_ISSUER",
    "OIDC_CLIENT_ID",
    "OIDC_AUTHORIZATION_ENDPOINT",
    "OIDC_TOKEN_ENDPOINT",
    "OIDC_JWKS_URI",
    "OIDC_REDIRECT_URI",
    "FRONTEND_URL",
  ];
  if (!fields.every((k) => env[k])) return null;
  for (const field of fields.filter((k) => k !== "OIDC_CLIENT_ID")) {
    let url;
    try {
      url = new URL(env[field]);
    } catch {
      throw new OperationsError(503, `Invalid ${field} configuration.`);
    }
    if (
      url.username ||
      url.password ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          env.NODE_ENV !== "production" &&
          env.OIDC_ALLOW_LOCAL === "true" &&
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        ))
    )
      throw new OperationsError(
        503,
        "Identity endpoints require HTTPS; localhost HTTP is development-only.",
      );
  }
  return {
    issuer: env.OIDC_ISSUER,
    clientId: env.OIDC_CLIENT_ID,
    authorization: env.OIDC_AUTHORIZATION_ENDPOINT,
    token: env.OIDC_TOKEN_ENDPOINT,
    jwks: env.OIDC_JWKS_URI,
    redirect: env.OIDC_REDIRECT_URI,
    frontend: new URL(env.FRONTEND_URL).origin,
  };
}
function createIdentityRouter(options) {
  const router = express.Router();
  const store = options.store;
  const env = options.env || process.env;
  const secret = options.jwtSecret || env.JWT_SECRET;
  const fetcher = options.fetch || fetch;
  let cachedKeys = null;
  let keysUntil = 0;
  const cookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/identity",
  };
  const clear = (res, name) => res.clearCookie(name, cookieOptions);
  const config = () => {
    const result = identityConfiguration(env);
    if (!result || !secret)
      throw new OperationsError(503, "Enterprise identity is not configured.");
    return result;
  };
  async function jsonResponse(response) {
    if (!response.ok)
      throw new OperationsError(401, "Identity provider rejected the request.");
    let body = "";
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        let chunk = await reader.read();
        while (!chunk.done) {
          const { value } = chunk;
          size += value.length;
          if (size > 1024 * 1024) {
            await reader.cancel();
            throw new OperationsError(
              401,
              "Identity provider response exceeds limit.",
            );
          }
          chunks.push(Buffer.from(value));
          chunk = await reader.read();
        }
        body = Buffer.concat(chunks).toString("utf8");
      } finally {
        reader.releaseLock();
      }
    } else {
      body = await response.text();
      if (Buffer.byteLength(body) > 1024 * 1024)
        throw new OperationsError(
          401,
          "Identity provider response exceeds limit.",
        );
    }
    try {
      return JSON.parse(body);
    } catch {
      throw new OperationsError(401, "Identity provider response is invalid.");
    }
  }
  async function verifyIdToken(token, nonce, settings) {
    const decoded = jwt.decode(token, { complete: true });
    if (
      !decoded ||
      decoded.header.alg !== "RS256" ||
      typeof decoded.header.kid !== "string" ||
      decoded.header.kid.length > 200
    )
      throw new OperationsError(401, "Unsupported identity token.");
    async function refresh() {
      const response = await fetcher(settings.jwks, {
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      const result = await jsonResponse(response);
      if (!Array.isArray(result.keys) || result.keys.length > 100)
        throw new OperationsError(401, "Invalid signing key set.");
      cachedKeys = result.keys;
      keysUntil = Date.now() + 300000;
    }
    if (!cachedKeys || Date.now() >= keysUntil) await refresh();
    let jwk = cachedKeys.find(
      (k) =>
        k.kid === decoded.header.kid &&
        k.kty === "RSA" &&
        (!k.use || k.use === "sig") &&
        (!k.alg || k.alg === "RS256"),
    );
    if (!jwk) {
      await refresh();
      jwk = cachedKeys.find(
        (k) =>
          k.kid === decoded.header.kid &&
          k.kty === "RSA" &&
          (!k.use || k.use === "sig") &&
          (!k.alg || k.alg === "RS256"),
      );
    }
    if (!jwk) throw new OperationsError(401, "Unknown identity signing key.");
    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    if (publicKey.asymmetricKeyDetails?.modulusLength < 2048)
      throw new OperationsError(401, "Identity signing key is too small.");
    const claims = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: settings.issuer,
      audience: settings.clientId,
      clockTolerance: 30,
    });
    if (
      !equal(claims.nonce, nonce) ||
      typeof claims.sub !== "string" ||
      !claims.sub ||
      claims.sub.length > 200 ||
      !Number.isInteger(claims.exp) ||
      !Number.isInteger(claims.iat) ||
      claims.iat > Date.now() / 1000 + 30 ||
      (Array.isArray(claims.aud) &&
        claims.aud.length > 1 &&
        claims.azp !== settings.clientId) ||
      (claims.azp !== undefined && claims.azp !== settings.clientId)
    )
      throw new OperationsError(
        401,
        "Identity token claims failed validation.",
      );
    return claims;
  }
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  router.get("/config", (_req, res) => {
    try {
      const c = identityConfiguration(env);
      res.json({
        enabled: !!(c && secret && store.configured),
        loginUrl: "/api/identity/login",
      });
    } catch {
      res.json({ enabled: false, loginUrl: "/api/identity/login" });
    }
  });
  router.get(
    "/login",
    route(async (_req, res) => {
      const settings = config();
      const state = random(),
        verifier = random(),
        nonce = random(),
        browser = random();
      await store.transaction(async (tx) => {
        await tx.query(
          "DELETE FROM servicing_operations_records WHERE tenant_id=$1 AND kind='oidc_transaction' AND updated_at<NOW()-INTERVAL '10 minutes'",
          [store.tenantId],
        );
        await tx.put("oidc_transaction", hash(state), {
          verifier,
          nonce,
          browserHash: hash(browser),
          expiresAt: Date.now() + 300000,
          consumed: false,
        });
      });
      res.cookie("servicing_oidc_state", browser, {
        ...cookieOptions,
        maxAge: 300000,
      });
      const target = new URL(settings.authorization);
      target.searchParams.set("response_type", "code");
      target.searchParams.set("client_id", settings.clientId);
      target.searchParams.set("redirect_uri", settings.redirect);
      target.searchParams.set("scope", "openid profile");
      target.searchParams.set("state", state);
      target.searchParams.set("nonce", nonce);
      target.searchParams.set(
        "code_challenge",
        createHash("sha256").update(verifier).digest("base64url"),
      );
      target.searchParams.set("code_challenge_method", "S256");
      res.redirect(target.toString());
    }),
  );
  router.get(
    "/callback",
    route(async (req, res) => {
      const settings = config();
      if (
        typeof req.query.state !== "string" ||
        typeof req.query.code !== "string" ||
        req.query.state.length > 200 ||
        req.query.code.length > 4000
      )
        throw new OperationsError(
          401,
          "Identity callback requires code and state.",
        );
      const transaction = await store.transaction(async (tx) => {
        const current = await tx.get("oidc_transaction", hash(req.query.state));
        const browser = cookies(req).servicing_oidc_state;
        if (
          !current ||
          current.consumed ||
          current.expiresAt < Date.now() ||
          !browser ||
          !equal(current.browserHash, hash(browser))
        )
          throw new OperationsError(
            401,
            "Identity login expired or state did not match.",
          );
        await tx.put("oidc_transaction", current.id, {
          ...current,
          consumed: true,
          verifier: null,
          nonce: null,
        });
        return current;
      });
      clear(res, "servicing_oidc_state");
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: req.query.code,
        redirect_uri: settings.redirect,
        client_id: settings.clientId,
        code_verifier: transaction.verifier,
      });
      if (env.OIDC_CLIENT_SECRET_REF)
        body.set(
          "client_secret",
          resolveSecret(env.OIDC_CLIENT_SECRET_REF, env),
        );
      const tokenResponse = await jsonResponse(
        await fetcher(settings.token, {
          method: "POST",
          redirect: "error",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
          signal: AbortSignal.timeout(10000),
        }),
      );
      const claims = await verifyIdToken(
        tokenResponse.id_token,
        transaction.nonce,
        settings,
      );
      const mapping = (
        await store.list(
          "identity",
          { limit: 1 },
          { issuer: settings.issuer, subject: claims.sub, enabled: true },
        )
      ).items[0];
      if (!mapping)
        throw new OperationsError(
          403,
          "This enterprise identity has no enabled servicing role mapping.",
        );
      const session = random();
      await store.transaction(async (tx) => {
        await tx.put("identity_session", hash(session), {
          mappingId: mapping.id,
          expiresAt: Date.now() + 8 * 3600000,
        });
        await tx.event({ type: "identity.login", mappingId: mapping.id });
      });
      res.cookie("servicing_enterprise_session", session, {
        ...cookieOptions,
        maxAge: 8 * 3600000,
      });
      res.redirect(`${settings.frontend}/auth?enterprise=1`);
    }),
  );
  router.get(
    "/session",
    route(async (req, res) => {
      config();
      const sessionId = cookies(req).servicing_enterprise_session;
      if (!sessionId)
        throw new OperationsError(401, "No enterprise browser session.");
      const session = await store.get("identity_session", hash(sessionId));
      if (!session || session.expiresAt < Date.now())
        throw new OperationsError(401, "Enterprise browser session expired.");
      // Resolve every refresh against the current administrator-managed mapping,
      // so disablement/role changes take effect without a new IdP sign-in.
      const mapping = await store.get("identity", session.mappingId);
      if (!mapping?.enabled)
        throw new OperationsError(
          403,
          "Enterprise identity mapping is disabled.",
        );
      const roles = mapping.roles;
      const permissions = roles.includes("control_plane_admin")
        ? ["*"]
        : roles.includes("control_plane_operator")
          ? [
              "servicing:context:read",
              "servicing:operations:read",
              "servicing:operations:reconcile",
            ]
          : [];
      const claims = {
        userId: mapping.userId,
        username: mapping.userId,
        roles,
        permissions,
        tenantId: store.tenantId,
        type: "access",
      };
      res.json({
        accessToken: jwt.sign(claims, secret, {
          algorithm: "HS256",
          expiresIn: "5m",
        }),
        expiresIn: 300,
        user: {
          userId: mapping.userId,
          username: mapping.userId,
          roles,
          permissions,
        },
      });
    }),
  );
  router.post(
    "/logout",
    route(async (req, res) => {
      const origin = req.get("Origin");
      const allowed = identityConfiguration(env)?.frontend;
      if (origin && origin !== allowed)
        throw new OperationsError(403, "Logout origin is not allowed.");
      const session = cookies(req).servicing_enterprise_session;
      if (session)
        await store.transaction((tx) =>
          tx.remove("identity_session", hash(session)),
        );
      clear(res, "servicing_enterprise_session");
      clear(res, "servicing_oidc_state");
      res.json({ loggedOut: true });
    }),
  );
  router.use((error, _req, res, _next) =>
    res
      .status(error.status || 401)
      .json({
        error: error.status
          ? error.message
          : "Enterprise identity verification failed.",
      }),
  );
  return router;
}
module.exports = { createIdentityRouter, identityConfiguration };
