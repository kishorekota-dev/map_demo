const { createHmac, createHash, randomUUID } = require("crypto");
const jwt = require("jsonwebtoken");
const { OperationsStore } = require("../store");
const { receiveWebhook } = require("../webhooks");

const url =
  process.env.TEST_OPERATIONS_DATABASE_URL ||
  process.env.TEST_CONTROL_PLANE_DATABASE_URL;
const SECRET = "webhook-concurrency-test-secret";
const WEBHOOK_SECRET = "provider-signature-secret";
(url ? describe : describe.skip)(
  "signed voice concurrency and ownership",
  () => {
    let store;
    const env = {
      CONNECTOR_SECRET_VOICE_TEST: WEBHOOK_SECRET,
      JWT_SECRET: SECRET,
    };
    beforeEach(async () => {
      store = new OperationsStore({
        databaseUrl: url,
        tenantId: `voice-concurrency-${randomUUID()}`,
      });
      await store.transaction((tx) =>
        tx.put("connection", "voice-provider", {
          kind: "voice",
          enabled: true,
          webhookSecretRef: "env:CONNECTOR_SECRET_VOICE_TEST",
        }),
      );
    });
    afterEach(async () => {
      try {
        await store.query(
          "DELETE FROM servicing_operations_records WHERE tenant_id=$1",
          [store.tenantId],
        );
        await store.query(
          "DELETE FROM servicing_operations_events WHERE tenant_id=$1",
          [store.tenantId],
        );
        await store.query(
          "DELETE FROM servicing_operations_jobs WHERE tenant_id=$1",
          [store.tenantId],
        );
      } finally {
        await store.close();
      }
    });
    function event(eventId, body, owner = "customer-a") {
      const rawBody = Buffer.from(JSON.stringify(body));
      const timestamp = String(Math.floor(Date.now() / 1000));
      const token = jwt.sign(
        { userId: owner, tenantId: store.tenantId, type: "access" },
        SECRET,
        { expiresIn: "10m" },
      );
      const headers = {
        "X-Servicing-Timestamp": timestamp,
        "X-Servicing-Event-Id": eventId,
        "X-Servicing-Signature": createHmac("sha256", WEBHOOK_SECRET)
          .update(`${timestamp}.${eventId}.`)
          .update(rawBody)
          .digest("hex"),
        Authorization: `Bearer ${token}`,
      };
      return {
        params: { id: "voice-provider" },
        body,
        rawBody,
        get: (key) => headers[key],
      };
    }
    test("claims a call before dispatch so concurrent distinct event IDs create only one session", async () => {
      let start;
      let finish;
      const started = new Promise((resolve) => {
        start = resolve;
      });
      const response = new Promise((resolve) => {
        finish = resolve;
      });
      const fetcher = jest.fn(async () => {
        start();
        await response;
        return {
          ok: true,
          json: async () => ({ sessionId: "session-one", channel: "ivr" }),
        };
      });
      const body = { type: "voice.start", callId: "provider-call-one" };
      const first = receiveWebhook(event("event-one", body), store, {
        env,
        fetch: fetcher,
      });
      await started;
      await expect(
        receiveWebhook(event("event-two", body), store, {
          env,
          fetch: fetcher,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(fetcher).toHaveBeenCalledTimes(1);
      finish();
      const completed = await first;
      expect(completed.sessionId).toBe("session-one");
      expect(
        await receiveWebhook(event("event-one", body), store, {
          env,
          fetch: fetcher,
        }),
      ).toEqual(completed);
      expect(
        (
          await receiveWebhook(event("event-three", body), store, {
            env,
            fetch: fetcher,
          })
        ).sessionId,
      ).toBe("session-one");
      expect(fetcher).toHaveBeenCalledTimes(1);
      await expect(
        receiveWebhook(event("event-one", body, "customer-b"), store, {
          env,
          fetch: fetcher,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        receiveWebhook(event("another-owner", body, "customer-b"), store, {
          env,
          fetch: fetcher,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
    test("uncertain startup never creates or resumes again automatically", async () => {
      const fetcher = jest.fn(async () => {
        throw new Error(
          "Provider timeout after session creation may have occurred",
        );
      });
      const body = {
        type: "voice.start",
        callId: "uncertain-call",
        resumeGrant: "one-use-grant",
      };
      await expect(
        receiveWebhook(event("first-uncertain", body), store, {
          env,
          fetch: fetcher,
        }),
      ).rejects.toThrow("timeout");
      await expect(
        receiveWebhook(event("retry-uncertain", body), store, {
          env,
          fetch: fetcher,
        }),
      ).rejects.toMatchObject({ status: 409 });
      const callId = createHash("sha256")
        .update("voice-provider:uncertain-call")
        .digest("hex");
      expect((await store.get("voice_call", callId)).status).toBe(
        "reconciliation_required",
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
    test("retained event and call tombstones prevent replay after operational data removal", async () => {
      const eventId = createHash("sha256")
        .update("voice-provider:retained-event")
        .digest("hex");
      const callId = createHash("sha256")
        .update("voice-provider:retained-call")
        .digest("hex");
      await store.transaction(async (tx) => {
        await tx.put("webhook_tombstone", eventId, { retained: true });
        await tx.put("voice_call_tombstone", callId, { retained: true });
      });
      const fetcher = jest.fn();
      await expect(
        receiveWebhook(
          event("retained-event", {
            type: "voice.start",
            callId: "fresh-call",
          }),
          store,
          { env, fetch: fetcher },
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        receiveWebhook(
          event("fresh-event", {
            type: "voice.start",
            callId: "retained-call",
          }),
          store,
          { env, fetch: fetcher },
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(fetcher).not.toHaveBeenCalled();
    });
  },
);
