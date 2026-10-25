const { createHmac, createHash } = require("crypto");
const jwt = require("jsonwebtoken");
const { equal } = require("./auth");
const { resolveSecret } = require("./connectors");
const { OperationsError } = require("./store");
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function receiveWebhook(req, store, options = {}) {
  const env = options.env || process.env;
  const connection = await store.get("connection", req.params.id);
  if (!connection?.enabled || !connection.webhookSecretRef)
    throw new OperationsError(404, "Webhook is not configured.");
  const timestamp = req.get("X-Servicing-Timestamp");
  const eventId = req.get("X-Servicing-Event-Id");
  const signature = req.get("X-Servicing-Signature");
  if (
    !/^\d{10}$/.test(timestamp || "") ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    !/^[A-Za-z0-9._:-]{1,160}$/.test(eventId || "") ||
    !Buffer.isBuffer(req.rawBody)
  )
    throw new OperationsError(401, "A fresh signed webhook is required.");
  const expected = createHmac(
    "sha256",
    resolveSecret(connection.webhookSecretRef, env),
  )
    .update(`${timestamp}.${eventId}.`)
    .update(req.rawBody)
    .digest("hex");
  if (!equal(signature, expected))
    throw new OperationsError(401, "Invalid webhook signature.");
  if (
    !["case", "voice"].includes(connection.kind) ||
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  )
    throw new OperationsError(
      400,
      "This webhook requires a supported connector and JSON object event.",
    );
  // Authorize the customer before touching receipt/call state. Provider call IDs
  // and phone numbers are not sufficient identity for banking operations.
  let principal;
  if (connection.kind === "voice") {
    try {
      const bearer = req.get("Authorization");
      if (!bearer?.startsWith("Bearer ")) throw new Error();
      const claims = jwt.verify(
        bearer.slice(7),
        options.jwtSecret || env.JWT_SECRET,
        { algorithms: ["HS256"] },
      );
      if (
        require('../middleware/tokenScope').isQualityDelegation(claims) ||
        typeof claims.userId !== "string" ||
        !claims.userId ||
        claims.userId.length > 200 ||
        (claims.type && claims.type !== "access") ||
        (claims.tenantId !== undefined && claims.tenantId !== store.tenantId)
      )
        throw new Error();
      principal = claims;
    } catch {
      return {
        actions: [
          {
            type: "authenticate",
            reason: "A verified customer access token is required.",
          },
        ],
      };
    }
  }
  const receiptId = hash(`${connection.id}:${eventId}`);
  const digest = hash(req.rawBody);
  const previous = await store.transaction(async (tx) => {
    if (await tx.get("webhook_tombstone", receiptId))
      throw new OperationsError(
        409,
        "This retained webhook event cannot be repeated.",
      );
    const found = await tx.get("webhook", receiptId);
    if (found) {
      if (
        found.digest !== digest ||
        found.ownerId !== (principal?.userId || null)
      )
        throw new OperationsError(
          409,
          "Webhook event ID was reused with different input.",
        );
      if (found.status !== "completed")
        throw new OperationsError(
          409,
          "Webhook outcome is uncertain or processing; reconcile the session before resubmission.",
        );
      return found.response;
    }
    await tx.put("webhook", receiptId, {
      digest,
      ownerId: principal?.userId || null,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    return null;
  });
  if (previous) return previous;
  let response;
  if (connection.kind === "case")
    response = await caseCallback(store, connection, req.body);
  else if (connection.kind === "voice")
    response = await voiceCallback(store, connection, req, principal, options);
  else
    throw new OperationsError(400, "This connector does not receive webhooks.");
  await store.transaction(async (tx) => {
    const current = await tx.get("webhook", receiptId);
    await tx.put("webhook", receiptId, {
      ...current,
      status: "completed",
      response,
    });
  });
  return response;
}
async function caseCallback(store, connection, body) {
  if (
    body.type !== "case.updated" ||
    typeof body.operationId !== "string" ||
    !["in_progress", "completed", "failed"].includes(body.status) ||
    typeof body.externalId !== "string" ||
    !body.externalId ||
    body.externalId.length > 200
  )
    throw new OperationsError(400, "Invalid case callback.");
  return store.transaction(async (tx) => {
    const item = (
      await tx.find("case", { idempotencyKey: body.operationId })
    )[0];
    if (!item || item.connectorId !== connection.id)
      throw new OperationsError(404, "No matching connector case.");
    if (item.externalId && item.externalId !== body.externalId)
      throw new OperationsError(409, "Provider case reference does not match.");
    if (
      ["completed", "failed"].includes(item.status) &&
      item.status !== body.status
    )
      throw new OperationsError(
        409,
        "A terminal case cannot move to another status.",
      );
    await tx.put("case", item.id, {
      ...item,
      status: body.status,
      externalId: body.externalId,
      lastError: null,
      updatedAt: new Date().toISOString(),
    });
    await tx.event({
      type: "case.provider_updated",
      sessionId: item.sessionId,
      caseId: item.id,
      version: item.version,
      outcome: body.status,
      connectorId: connection.id,
    });
    return { accepted: true, caseId: item.id, status: body.status };
  });
}
async function voiceCallback(store, connection, req, principal, options) {
  const body = req.body;
  const env = options.env || process.env;
  if (
    !["voice.start", "voice.turn", "voice.interrupt", "voice.end"].includes(
      body.type,
    ) ||
    !/^[A-Za-z0-9._:-]{1,160}$/.test(body.callId || "")
  )
    throw new OperationsError(400, "Invalid voice event or callId.");
  const callId = hash(`${connection.id}:${body.callId}`);
  const upstream = async (path, input) => {
    const response = await (options.fetch || fetch)(
      `${env.CHAT_BACKEND_URL || "http://localhost:3006"}/api${path}`,
      {
        method: "POST",
        headers: {
          Authorization: req.get("Authorization"),
          "Content-Type": "application/json",
          "X-Interaction-ID": hash(
            `${connection.id}:${req.get("X-Servicing-Event-Id")}`,
          ),
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!response.ok)
      throw new OperationsError(
        502,
        "Chat backend rejected the voice operation; reconcile before replay.",
      );
    return response.json();
  };
  let call = await store.get("voice_call", callId);
  if (call && call.ownerId !== principal.userId)
    throw new OperationsError(403, "Call belongs to another customer.");
  if (body.type === "voice.start") {
    // Claim the provider call before a session can be created or a resume grant
    // consumed. Distinct webhook event IDs must not create duplicate sessions.
    const claim = await store.transaction(async (tx) => {
      if (await tx.get("voice_call_tombstone", callId))
        throw new OperationsError(
          409,
          "This retained call identifier cannot be started again.",
        );
      const current = await tx.get("voice_call", callId);
      if (current) {
        if (current.ownerId !== principal.userId)
          throw new OperationsError(403, "Call belongs to another customer.");
        return { created: false, call: current };
      }
      const pending = {
        sessionId: null,
        ownerId: principal.userId,
        connectionId: connection.id,
        createdAt: new Date().toISOString(),
        ended: false,
        status: "starting",
      };
      await tx.put("voice_call", callId, pending);
      return { created: true, call: pending };
    });
    if (!claim.created) {
      if (
        ["starting", "reconciliation_required"].includes(claim.call.status) ||
        !claim.call.sessionId
      )
        throw new OperationsError(
          409,
          "Call startup is processing or uncertain. Reconcile the existing call before another start.",
        );
      return {
        sessionId: claim.call.sessionId,
        actions: [
          {
            type: claim.call.ended ? "end" : "gather",
            input: ["speech", "dtmf"],
          },
        ],
      };
    }
    try {
      const created = body.resumeGrant
        ? await upstream("/sessions/resume", { grant: body.resumeGrant })
        : await upstream("/sessions", { metadata: { channel: "ivr" } });
      if (
        typeof created.sessionId !== "string" ||
        !created.sessionId ||
        created.sessionId.length > 200
      )
        throw new OperationsError(
          502,
          "Chat backend returned an invalid voice session.",
        );
      if (body.resumeGrant && created.channel !== "ivr")
        throw new OperationsError(400, "Resume grant must target IVR.");
      call = { ...claim.call, sessionId: created.sessionId, status: "active" };
      await store.transaction(async (tx) => {
        const current = await tx.get("voice_call", callId);
        if (
          current?.status !== "starting" ||
          current.ownerId !== principal.userId
        )
          throw new OperationsError(
            409,
            "Call startup changed before activation. Reconcile the call.",
          );
        await tx.put("voice_call", callId, call);
        await tx.event({
          type: "voice.started",
          sessionId: call.sessionId,
          channel: "ivr",
          connectorId: connection.id,
        });
      });
      return {
        sessionId: call.sessionId,
        actions: [{ type: "gather", input: ["speech", "dtmf"] }],
      };
    } catch (error) {
      await store
        .transaction(async (tx) => {
          const current = await tx.get("voice_call", callId);
          if (current?.status === "starting") {
            await tx.put("voice_call", callId, {
              ...current,
              status: "reconciliation_required",
              lastError:
                "Session creation or grant consumption may have occurred. Do not replay automatically.",
            });
            await tx.event({
              type: "voice.reconciliation_required",
              channel: "ivr",
              connectorId: connection.id,
            });
          }
        })
        .catch(() => {});
      throw error;
    }
  }
  if (
    !call ||
    call.ended ||
    !call.sessionId ||
    ["starting", "reconciliation_required"].includes(call.status)
  )
    throw new OperationsError(
      409,
      "Start an authenticated voice session first, or reconcile an uncertain startup.",
    );
  if (body.type === "voice.interrupt")
    return {
      sessionId: call.sessionId,
      actions: [
        { type: "stop_playback" },
        { type: "gather", input: ["speech", "dtmf"] },
      ],
    };
  if (body.type === "voice.end") {
    await store.transaction((tx) =>
      tx.put("voice_call", callId, {
        ...call,
        status: "ended",
        ended: true,
        endedAt: new Date().toISOString(),
      }),
    );
    return { sessionId: call.sessionId, actions: [{ type: "end" }] };
  }
  const content =
    typeof body.utterance === "string" ? body.utterance : body.digits;
  if (typeof content !== "string" || !content.trim() || content.length > 4000)
    throw new OperationsError(400, "Provide speech text or DTMF digits.");
  const result = await upstream(
    `/sessions/${encodeURIComponent(call.sessionId)}/messages`,
    { content, type: "text", metadata: { channel: "ivr" } },
  );
  const final = result.agentResult?.finalResponse;
  const spoken =
    typeof final === "string"
      ? final
      : final?.message ||
        final?.text ||
        result.response?.content ||
        "Please contact a customer service representative.";
  const metadata = result.agentResult?.metadata || final?.metadata || {};
  const actions = [{ type: "speak", text: String(spoken).slice(0, 12000) }];
  if (
    metadata.caseId ||
    metadata.requiresHuman ||
    metadata.controlPlane?.action === "human"
  )
    actions.push({
      type: "transfer",
      caseId: metadata.caseId || null,
      queue:
        metadata.queue || metadata.controlPlane?.queue || "general_servicing",
    });
  else actions.push({ type: "gather", input: ["speech", "dtmf"] });
  return { sessionId: call.sessionId, actions };
}
module.exports = { receiveWebhook };
