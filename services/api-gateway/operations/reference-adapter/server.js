// Local contract fixture, deliberately not a production case management system.
// npm package dependencies are inherited from the gateway. No vendor SDK needed.
const express = require("express");
const { randomUUID, createHmac } = require("crypto");
const { equal } = require("../auth");
function createReferenceAdapter(options = {}) {
  const app = express();
  const cases = options.cases || new Map();
  const token = options.token || process.env.CONNECTOR_SECRET_REFERENCE;
  app.use(express.json({ limit: "256kb" }));
  app.use((req, res, next) =>
    token && equal(req.get("Authorization"), `Bearer ${token}`)
      ? next()
      : res.status(401).json({ error: "Adapter authentication required." }),
  );
  app.get("/health", (_req, res) =>
    res.json({
      status: "ok",
      contractVersion: "1",
      capabilities: ["case", "knowledge"],
    }),
  );
  app.post("/cases", (req, res) => {
    const key = req.get("Idempotency-Key");
    if (!key || key !== req.body.operationId)
      return res
        .status(400)
        .json({ error: "Stable operationId and Idempotency-Key required." });
    const previous = cases.get(key);
    const digest = JSON.stringify(req.body);
    if (previous) {
      if (previous.digest !== digest)
        return res.status(409).json({ error: "Idempotency conflict." });
      return res.json(previous.result);
    }
    const result = {
      externalId: `reference-${randomUUID()}`,
      status: "in_progress",
    };
    cases.set(key, { digest, result });
    res.status(201).json(result);
  });
  app.get("/cases/by-idempotency-key/:key", (req, res) => {
    const item = cases.get(req.params.key);
    res
      .status(item ? 200 : 404)
      .json(item ? item.result : { authoritative: true, found: false });
  });
  app.post("/cases/:externalId/escalations", (req, res) => {
    const key = req.get("Idempotency-Key");
    if (!key || key !== req.body.operationId)
      return res
        .status(400)
        .json({ error: "Stable escalation operation key required." });
    const existing = cases.get(key);
    if (existing) return res.json(existing.result);
    if (
      !Array.from(cases.values()).some(
        (item) => item.result.externalId === req.params.externalId,
      )
    )
      return res.status(404).json({ error: "Case not found." });
    const result = {
      externalId: req.params.externalId,
      status: "in_progress",
      queue: req.body.queue,
    };
    cases.set(key, { digest: JSON.stringify(req.body), result });
    res.json(result);
  });
  app.get("/documents", (_req, res) =>
    res.json({
      documents: options.documents || [
        {
          id: "servicing-reference",
          title: "Reference servicing policy",
          content:
            "Contact customer support to request assistance with your servicing case.",
          source: "https://example.com/reference-policy",
          allowedRoles: ["customer"],
          expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
          status: "draft",
        },
      ],
    }),
  );
  app.locals.cases = cases;
  return app;
}
function signWebhook(
  secret,
  eventId,
  body,
  timestamp = String(Math.floor(Date.now() / 1000)),
) {
  const raw = JSON.stringify(body);
  return {
    raw,
    headers: {
      "Content-Type": "application/json",
      "X-Servicing-Timestamp": timestamp,
      "X-Servicing-Event-Id": eventId,
      "X-Servicing-Signature": createHmac("sha256", secret)
        .update(`${timestamp}.${eventId}.${raw}`)
        .digest("hex"),
    },
  };
}
if (require.main === module) {
  if (!process.env.CONNECTOR_SECRET_REFERENCE)
    throw new Error(
      "Set CONNECTOR_SECRET_REFERENCE for the local reference adapter.",
    );
  createReferenceAdapter().listen(
    Number(process.env.REFERENCE_ADAPTER_PORT || 3099),
    "127.0.0.1",
    () => console.log("Reference adapter listening on loopback only."),
  );
}
module.exports = { createReferenceAdapter, signWebhook };
