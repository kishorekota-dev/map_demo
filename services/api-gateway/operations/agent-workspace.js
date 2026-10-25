const { createHash, randomUUID } = require("crypto");
const { OperationsError } = require("./store");
const { authorize, actorHash } = require("./auth");
const { text, identifier } = require("../control-plane/config");

const HANDLING = ["unclaimed", "in_progress", "waiting", "resolved"];
const EXECUTION = [
  "queued",
  "in_progress",
  "completed",
  "failed",
  "reconciliation_required",
];
const DISPOSITIONS = [
  "information_provided",
  "follow_up_required",
  "escalated",
  "service_completed",
  "unable_to_complete",
];
const clean = (value, max = 1000) =>
  String(value || "")
    .slice(0, max)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b\d{6,}\b/g, "[number]");
const rolesFor = (principal) => [
  ...new Set(
    [principal.claims.role, ...(Array.isArray(principal.claims.roles) ? principal.claims.roles : [])]
      .filter((role) => typeof role === "string")
      .map((role) => role.toLowerCase()),
  ),
];
const publishedFor = (record, roles) =>
  record?.status === "published" &&
  (!record.expiresAt || Date.parse(record.expiresAt) > Date.now()) &&
  record.allowedRoles?.some((role) => role === "*" || roles.includes(role));
const safeSource = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};
const workFor = (item) =>
  item.agentWork || {
    revision: 0,
    assignee: null,
    status: "unclaimed",
    disposition: null,
    history: [],
  };

function presentCase(item, principal, detail = false) {
  const work = workFor(item);
  const mine = work.assignee === principal.actor;
  const canOperate = principal.permissions.canOperate;
  return {
    id: item.id,
    caseRevision: item.revision,
    sessionId: clean(item.sessionId, 200),
    channel: item.channel,
    reference: clean(item.reference, 200),
    summary: clean(item.summary),
    queue: clean(item.queue, 120),
    journeyId: clean(item.journeyId, 120),
    releaseVersion: item.version,
    executionStatus: item.status,
    dueAt: item.dueAt || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    overdue:
      !["completed", "failed"].includes(item.status) &&
      Date.parse(item.dueAt) < Date.now(),
    work: {
      revision: work.revision,
      status: work.status,
      disposition: work.disposition,
      assigned: !!work.assignee,
      assignee: work.assignee ? clean(work.assignee, 200) : null,
      mine,
      updatedAt: work.updatedAt || null,
      ...(detail
        ? {
            history: (work.history || []).slice(-50).map((entry) => ({
              id: entry.id,
              timestamp: entry.timestamp,
              action: entry.action,
              status: entry.status,
              disposition: entry.disposition || null,
              actor: clean(entry.actor, 200),
              note: clean(entry.note),
              citations: (entry.citations || []).map((citation) => ({
                id: citation.id,
                version: citation.version,
                title: clean(citation.title, 200),
              })),
              evidenceId: entry.evidenceId,
            })),
          }
        : {}),
    },
    actions: {
      canClaim: canOperate && !work.assignee && work.status !== "resolved",
      canEdit: canOperate && mine && work.status !== "resolved",
      canRelease:
        canOperate &&
        !!work.assignee &&
        work.status !== "resolved" &&
        (mine || principal.permissions.canPublish),
      canResolve:
        canOperate &&
        mine &&
        work.status !== "resolved" &&
        ["completed", "failed"].includes(item.status),
    },
  };
}

function nextSteps(item) {
  const work = workFor(item);
  if (item.status === "reconciliation_required")
    return [
      {
        id: "reconcile",
        title: "Verify the external outcome",
        detail:
          "The provider outcome is uncertain. An authorized operator must reconcile it using provider evidence in Identity & operations. Do not repeat the action or mark handling resolved.",
      },
    ];
  if (work.status === "resolved")
    return [
      {
        id: "closed",
        title: "Handling disposition recorded",
        detail:
          "The provider result and agent disposition remain separate evidence. Review the history before opening any new request.",
      },
    ];
  const steps = [
    {
      id: "ownership",
      title: work.assignee
        ? "Review the assigned case"
        : "Claim this case before making changes",
      detail:
        "Use the case summary, pinned journey and approved knowledge. Additional banking information requires the customer-authorized banking flow.",
    },
  ];
  if (item.status === "failed")
    steps.push({
      id: "failed",
      title: "Record an accurate failure disposition",
      detail:
        "The provider reports failure. Escalate or record unable to complete; do not describe the service as completed.",
    });
  else if (item.status === "completed")
    steps.push({
      id: "complete",
      title: "Record the customer service outcome",
      detail:
        "The provider reports completion. Record what was communicated and the approved sources used.",
    });
  else
    steps.push({
      id: "follow-up",
      title: "Track the outstanding provider work",
      detail:
        "Execution remains open. Record a follow-up or escalation and wait for an authoritative outcome before resolving handling.",
    });
  return steps;
}

function filters(query, actor) {
  const allowed = [
    "queue",
    "channel",
    "status",
    "assignment",
    "overdue",
    "executionStatus",
    "limit",
    "offset",
  ];
  if (Object.keys(query).some((key) => !allowed.includes(key)))
    throw new OperationsError(400, "Unsupported agent workspace filter.");
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100000
  )
    throw new OperationsError(400, "Use limit 1–50 and a nonnegative offset.");
  if (
    (query.queue && !text(query.queue, 120)) ||
    (query.channel && !["digital", "ava", "ivr"].includes(query.channel)) ||
    (query.status && !HANDLING.includes(query.status)) ||
    (query.executionStatus && !EXECUTION.includes(query.executionStatus)) ||
    (query.assignment &&
      !["all", "mine", "unassigned"].includes(query.assignment)) ||
    (query.overdue !== undefined && !["true", "false"].includes(query.overdue))
  )
    throw new OperationsError(400, "Invalid agent workspace filter.");
  return {
    limit,
    offset,
    values: [
      query.queue || null,
      query.channel || null,
      query.status || null,
      query.assignment || "all",
      actor,
      query.overdue === "true",
      query.executionStatus || null,
    ],
  };
}

function mountAgentRoutes(router, { store, configStore, env = process.env }) {
  const route = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res)).catch(next);
  const getCase = async (id) => {
    if (!text(id, 200))
      throw new OperationsError(400, "A bounded case identifier is required.");
    const item = await store.get("case", id);
    if (!item)
      throw new OperationsError(404, "Case not found in this deployment.");
    return item;
  };
  router.get(
    "/agent/cases",
    authorize("canView"),
    route(async (req, res) => {
      const filter = filters(req.query, req.principal.actor);
      const values = [store.tenantId, ...filter.values];
      const where = `tenant_id=$1 AND kind='case'
      AND ($2::text IS NULL OR document->>'queue'=$2)
      AND ($3::text IS NULL OR document->>'channel'=$3)
      AND ($4::text IS NULL OR COALESCE(document#>>'{agentWork,status}','unclaimed')=$4)
      AND ($5='all' OR ($5='mine' AND document#>>'{agentWork,assignee}'=$6) OR ($5='unassigned' AND document#>>'{agentWork,assignee}' IS NULL))
      AND (NOT $7::boolean OR (document->>'status' NOT IN ('completed','failed') AND (document->>'dueAt')::timestamptz<NOW()))
      AND ($8::text IS NULL OR document->>'status'=$8)`;
      const [listed, grouped, queues] = await Promise.all([
        store.query(
          `SELECT document,revision FROM servicing_operations_records WHERE ${where} ORDER BY (document->>'dueAt')::timestamptz ASC NULLS LAST,id LIMIT $9 OFFSET $10`,
          [...values, filter.limit, filter.offset],
        ),
        store.query(
          `SELECT document->>'queue' AS queue,count(*)::int AS total,
        count(*) FILTER(WHERE document#>>'{agentWork,assignee}' IS NULL)::int AS unassigned,
        count(*) FILTER(WHERE COALESCE(document#>>'{agentWork,status}','unclaimed')='waiting')::int AS waiting,
        count(*) FILTER(WHERE document->>'status'='reconciliation_required')::int AS uncertain,
        count(*) FILTER(WHERE document->>'status' NOT IN ('completed','failed') AND (document->>'dueAt')::timestamptz<NOW())::int AS overdue
        FROM servicing_operations_records WHERE ${where} GROUP BY document->>'queue' ORDER BY queue LIMIT 100`,
          values,
        ),
        store.query(
          "SELECT DISTINCT document->>'queue' AS queue FROM servicing_operations_records WHERE tenant_id=$1 AND kind='case' ORDER BY queue LIMIT 100",
          [store.tenantId],
        ),
      ]);
      // Count independently of the bounded queue-group display.
      const count = await store.query(
        `SELECT count(*)::int AS total FROM servicing_operations_records WHERE ${where}`,
        values,
      );
      res.json({
        items: listed.rows.map((row) =>
          presentCase(
            { ...row.document, revision: Number(row.revision) },
            req.principal,
          ),
        ),
        total: count.rows[0].total,
        limit: filter.limit,
        offset: filter.offset,
        queues: queues.rows.map((row) => clean(row.queue, 120)),
        queueSummary: grouped.rows,
        permissions: req.principal.permissions,
        scope:
          "Durable servicing cases. Live chat/media delivery remains in the configured channel provider and agent console.",
      });
    }),
  );

  router.get(
    "/agent/cases/:id",
    authorize("canView"),
    route(async (req, res) => {
      const item = await getCase(req.params.id);
      const [state, events] = await Promise.all([
        configStore?.read(),
        store.query(
          "SELECT document,seq FROM servicing_operations_events WHERE tenant_id=$1 AND document->>'caseId'=$2 ORDER BY seq DESC LIMIT 25",
          [store.tenantId, item.id],
        ),
      ]);
      const release = state?.releases.find(
        (entry) => entry.version === item.version,
      );
      const journey = release?.config.journeys.find(
        (entry) => entry.id === item.journeyId,
      );
      res.json({
        item: presentCase(item, req.principal, true),
        journey: journey
          ? {
              id: journey.id,
              name: clean(journey.name, 120),
              fulfillment: journey.fulfillment,
              slaMinutes: journey.slaMinutes,
              releaseVersion: release.version,
            }
          : null,
        nextSteps: nextSteps(item),
        evidence: events.rows.map((row) => ({
          id: row.document.id,
          sequence: Number(row.seq),
          type: clean(row.document.type, 100),
          timestamp: row.document.timestamp,
          outcome: clean(row.document.outcome, 100) || null,
          status: clean(row.document.status, 100) || null,
        })),
        contextScope:
          "Case routing, redacted summary and execution evidence only. No bank balances, raw intent fields, customer identifiers or conversation transcript are retrieved.",
      });
    }),
  );

  router.get(
    "/agent/cases/:id/knowledge",
    authorize("canView"),
    route(async (req, res) => {
      await getCase(req.params.id);
      if (!text(req.query.query, 1000))
        throw new OperationsError(
          400,
          "Enter a knowledge query of up to 1000 characters.",
        );
      if (!configStore?.searchKnowledge)
        throw new OperationsError(
          503,
          "Approved knowledge retrieval is unavailable.",
        );
      const terms = [
        ...new Set(
          req.query.query
            .normalize("NFKC")
            .toLowerCase()
            .match(/[\p{L}\p{N}]+/gu) || [],
        ),
      ]
        .filter((term) => term.length > 1)
        .slice(0, 30);
      const matches = terms.length
        ? await configStore.searchKnowledge(
            terms,
            rolesFor(req.principal),
            5,
            new Date().toISOString(),
          )
        : [];
      res.json({
        matches: matches.map((record) => ({
          id: record.id,
          title: record.title,
          version: record.version,
          content: record.content.slice(0, 6000),
          truncated: record.content.length > 6000,
          source: record.source,
          sourceUrl: safeSource(record.source),
        })),
        scope:
          "Published, unexpired knowledge permitted for your signed roles. Lexical retrieval; no model or banking tool is invoked.",
      });
    }),
  );

  const mutate = (action) =>
    route(async (req, res) => {
      const b = req.body;
      const keys =
        action === "update"
          ? [
              "revision",
              "caseRevision",
              "status",
              "disposition",
              "note",
              "citations",
            ]
          : ["revision", "caseRevision", "note"];
      if (
        !text(req.params.id, 200) ||
        !b ||
        Array.isArray(b) ||
        Object.keys(b).some((key) => !keys.includes(key)) ||
        !Number.isInteger(b.revision) ||
        b.revision < 0 ||
        !Number.isInteger(b.caseRevision) ||
        b.caseRevision < 1 ||
        !text(b.note, 1000)
      )
        throw new OperationsError(
          400,
          "Provide the current handling revision, caseRevision and a note (up to 1000 characters).",
        );
      if (
        action === "update" &&
        (!["in_progress", "waiting", "resolved"].includes(b.status) ||
          !DISPOSITIONS.includes(b.disposition) ||
          !Array.isArray(b.citations) ||
          b.citations.length > 5 ||
          b.citations.some(
            (citation) =>
              !citation ||
              Object.keys(citation).some(
                (key) => !["id", "version"].includes(key),
              ) ||
              !identifier(citation.id) ||
              !Number.isInteger(citation.version) ||
              citation.version < 1,
          ))
      )
        throw new OperationsError(
          400,
          "Provide a handling status, supported disposition and up to five published knowledge citations.",
        );
      const result = await store.transaction(async (tx) => {
        const item = await tx.get("case", req.params.id);
        if (!item)
          throw new OperationsError(404, "Case not found in this deployment.");
        const work = workFor(item);
        if (item.revision !== b.caseRevision || work.revision !== b.revision)
          throw new OperationsError(
            409,
            "Case or assignment changed. Refresh before saving; your note has not been applied.",
          );
        if (work.status === "resolved")
          throw new OperationsError(
            409,
            "Resolved handling is immutable. Review the recorded disposition.",
          );
        if (action === "claim" && work.assignee)
          throw new OperationsError(409, "This case is already assigned.");
        if (
          action !== "claim" &&
          work.assignee !== req.principal.actor &&
          !(
            action === "release" &&
            req.principal.permissions.canPublish &&
            work.assignee
          )
        )
          throw new OperationsError(
            403,
            "Only the assigned operator can update this work; an administrator may release an assignment.",
          );
        if (
          b.status === "resolved" &&
          !["completed", "failed"].includes(item.status)
        )
          throw new OperationsError(
            409,
            "Provider execution is still open or uncertain. Record follow-up or escalation; reconcile the outcome before resolving handling.",
          );
        if (
          b.disposition === "service_completed" &&
          item.status !== "completed"
        )
          throw new OperationsError(
            409,
            "Service completed requires authoritative provider completion.",
          );
        if (
          b.status === "resolved" &&
          ["follow_up_required", "escalated"].includes(b.disposition)
        )
          throw new OperationsError(
            400,
            "Outstanding follow-up or escalation must remain in progress or waiting.",
          );
        const citations = [];
        for (const citation of b.citations || []) {
          const record = await configStore?.getRecord(
            "knowledge_published",
            citation.id,
          );
          if (
            !publishedFor(record, rolesFor(req.principal)) ||
            record.version !== citation.version
          )
            throw new OperationsError(
              409,
              "A cited knowledge version is no longer published, permitted or current. Search again before saving.",
            );
          citations.push({
            id: record.id,
            version: record.version,
            title: clean(record.title, 200),
          });
        }
        const timestamp = new Date().toISOString();
        const status =
          action === "claim"
            ? "in_progress"
            : action === "release"
              ? "unclaimed"
              : b.status;
        const note = clean(b.note.trim());
        const evidence = await tx.event({
          type: `agent.case.${action}`,
          caseId: item.id,
          sessionId: item.sessionId,
          status,
          disposition: action === "update" ? b.disposition : null,
          noteDigest: createHash("sha256").update(note).digest("hex"),
          citations: citations.map(({ id, version }) => ({ id, version })),
          actorHash: actorHash(
            req.principal.actor,
            env.AUDIT_ACTOR_HASH_KEY || env.JWT_SECRET,
          ),
        });
        const entry = {
          id: randomUUID(),
          timestamp,
          action,
          status,
          disposition: action === "update" ? b.disposition : null,
          note,
          actor: req.principal.actor,
          citations,
          evidenceId: evidence.id,
        };
        const next = await tx.put(
          "case",
          item.id,
          {
            ...item,
            agentWork: {
              revision: work.revision + 1,
              assignee: action === "release" ? null : req.principal.actor,
              status,
              disposition: action === "update" ? b.disposition : null,
              updatedAt: timestamp,
              history: [...(work.history || []), entry].slice(-50),
            },
          },
          item.revision,
        );
        return presentCase(next, req.principal, true);
      });
      res.json({ item: result });
    });
  router.post(
    "/agent/cases/:id/claim",
    authorize("canOperate"),
    mutate("claim"),
  );
  router.post(
    "/agent/cases/:id/release",
    authorize("canOperate"),
    mutate("release"),
  );
  router.patch(
    "/agent/cases/:id/work",
    authorize("canOperate"),
    mutate("update"),
  );
}
module.exports = { mountAgentRoutes, presentCase, nextSteps };
