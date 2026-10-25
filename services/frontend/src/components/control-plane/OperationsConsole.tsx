import { useEffect, useState } from "react";
import { operationsApi } from "@/services/servicingStudioService";
import {
  CostConsole,
  PrivacyConsole,
  VoiceRecoveryConsole,
} from "./OperationsGovernance";
import type {
  Analytics,
  Connection,
  ConnectionDefinition,
  ConsolePermissions,
  FinancialOperation,
  ExecutionCase,
  ExecutionEvent,
  IdentityMapping,
  OperationsStatus,
} from "@/types/servicingStudio";
import {
  ConsoleField as Field,
  JsonEvidence,
  StatusPill,
  downloadEvidence,
  formatDate,
  splitValues,
  useConsoleAction,
} from "./ConsoleElements";

export type OperationsSection = "connections" | "traces" | "operations";
const emptyConnection = (): Connection => ({
  id: "",
  name: "",
  kind: "case",
  baseUrl: "",
  credentialRef: "",
  webhookSecretRef: "",
  enabled: false,
  timeoutMs: 10000,
});
const emptyMapping = (): IdentityMapping => ({
  id: "",
  issuer: "",
  subject: "",
  userId: "",
  roles: ["customer"],
  enabled: true,
});

export default function OperationsConsole({
  section,
  permissions,
  configurationRevision,
  configurationDirty,
  onSynchronized,
}: {
  section: OperationsSection;
  permissions: ConsolePermissions;
  configurationRevision: number;
  configurationDirty: boolean;
  onSynchronized: () => void;
}) {
  const action = useConsoleAction();
  const [status, setStatus] = useState<OperationsStatus | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectorDefinitions, setConnectorDefinitions] = useState<ConnectionDefinition[]>([]);
  const [connection, setConnection] = useState<Connection>(emptyConnection);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    checkedAt: string;
    message: string;
  } | null>(null);
  const [events, setEvents] = useState<{
    items: ExecutionEvent[];
    total: number;
  }>({ items: [], total: 0 });
  const [cases, setCases] = useState<{ items: ExecutionCase[]; total: number }>(
    { items: [], total: 0 },
  );
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [conversationContext, setConversationContext] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [connectionPage, setConnectionPage] = useState({ offset: 0, total: 0 });
  const [mappingPage, setMappingPage] = useState({ offset: 0, total: 0 });
  const [auditCursor, setAuditCursor] = useState(0);
  const [auditHasMore, setAuditHasMore] = useState(true);
  const [sessionFilter, setSessionFilter] = useState("");
  const [eventOffset, setEventOffset] = useState(0);
  const [caseOffset, setCaseOffset] = useState(0);
  const [financialOperations, setFinancialOperations] = useState<
    FinancialOperation[] | null
  >(null);
  const [financial, setFinancial] = useState<FinancialOperation | null>(null);
  const [financialOutcome, setFinancialOutcome] = useState<
    "completed" | "failed"
  >("completed");
  const [financialReference, setFinancialReference] = useState("");
  const [financialNote, setFinancialNote] = useState("");
  const [selectedCase, setSelectedCase] = useState<ExecutionCase | null>(null);
  const [outcome, setOutcome] = useState<"completed" | "retry" | "failed">(
    "completed",
  );
  const [reconcileNote, setReconcileNote] = useState("");
  const [externalId, setExternalId] = useState("");
  const [mappings, setMappings] = useState<IdentityMapping[]>([]);
  const [mapping, setMapping] = useState<IdentityMapping>(emptyMapping);
  const [mappingRoles, setMappingRoles] = useState("customer");
  const [retentionDays, setRetentionDays] = useState(90);
  const [retentionResult, setRetentionResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [retentionPreviewDays, setRetentionPreviewDays] = useState<
    number | null
  >(null);
  const canAdmin = permissions.canPublish;

  const load = async () => {
    const nextStatus = await operationsApi.status();
    setStatus(nextStatus);
    if (section === "connections") {
      const [page, catalog] = await Promise.all([operationsApi.connections(connectionPage.offset), operationsApi.connectorCatalog()]);
      setConnections(page.items);
      setConnectorDefinitions(catalog.items);
      setConnectionPage({ ...connectionPage, total: page.total });
    }
    if (section === "traces") {
      const [nextEvents, nextCases, nextAnalytics] = await Promise.all([
        operationsApi.events(sessionFilter, eventOffset),
        operationsApi.cases(caseOffset),
        operationsApi.analytics(),
      ]);
      setEvents(nextEvents);
      setCases(nextCases);
      setAnalytics(nextAnalytics);
    }
    if (section === "operations" && canAdmin) {
      const page = await operationsApi.mappings(mappingPage.offset);
      setMappings(page.items);
      setMappingPage({ ...mappingPage, total: page.total });
    }
  };
  useEffect(() => {
    void action.run(load);
  }, [section]);

  return (
    <div className="cp-module">
      <div className="cp-section-intro cp-module-intro">
        <div>
          <h2>
            {section === "connections"
              ? "Connect the systems that serve your customers"
              : section === "traces"
                ? "Follow decisions through to execution"
                : "Operate a dedicated enterprise deployment"}
          </h2>
          <p>
            {section === "connections"
              ? "Enable declared case, voice, and knowledge integrations. Your deployment team manages endpoint and credential bindings; this console adjusts names, availability and timeouts."
              : section === "traces"
                ? "Inspect recorded events and connector-backed cases, including ambiguous outcomes that require reconciliation."
                : "Review identity, worker readiness, data retention, and exportable audit evidence."}
          </p>
        </div>
        <button
          className="cp-button cp-button--quiet"
          disabled={action.busy}
          onClick={() => void action.run(load)}
        >
          Refresh module
        </button>
      </div>
      {action.messages}
      {!status && action.busy && (
        <p className="cp-empty" role="status">
          Loading operations…
        </p>
      )}
      {status && (
        <div className="cp-operational-status">
          <StatusPill good={status.storage === "postgres"}>
            Storage: {status.storage}
          </StatusPill>
          <StatusPill
            good={status.workersEnabled}
            warning={!status.workersEnabled}
          >
            {status.workersEnabled ? "Workers enabled" : "Workers disabled"}
          </StatusPill>
          <StatusPill good={status.identity.configured}>
            {status.identity.configured
              ? "Enterprise identity configured"
              : "Local identity"}
          </StatusPill>
        </div>
      )}

      {section === "connections" && (
        <div className="cp-two-column">
          <section className="cp-panel">
            <div className="cp-panel-heading">
              <h3>Adapter connections</h3>
              <button
                className="cp-button cp-button--quiet"
                disabled={!canAdmin || action.busy || !connectorDefinitions.length}
                onClick={() => {
                  setConnection({ ...emptyConnection(), ...connectorDefinitions[0] });
                  setTestResult(null);
                }}
              >
                + New connection
              </button>
            </div>
            {connections.length ? (
              connections.map((entry) => (
                <button
                  className={`cp-selection-row${connection.id === entry.id ? " cp-selection-row--active" : ""}`}
                  key={entry.id}
                  onClick={() => {
                    setConnection({ ...entry });
                    setTestResult(entry.lastTest || null);
                  }}
                >
                  <span>
                    <strong>{entry.name}</strong>
                    <small>
                      {entry.kind} · {entry.baseUrl}
                    </small>
                  </span>
                  <StatusPill good={entry.enabled}>
                    {entry.enabled ? "Enabled" : "Disabled"}
                  </StatusPill>
                </button>
              ))
            ) : (
              <div className="cp-empty">
                <h3>No adapters configured</h3>
                <p>
                  Ask your deployment team to declare an integration, then select it here.
                </p>
              </div>
            )}
            <div className="cp-pagination">
              <button
                className="cp-button cp-button--quiet"
                disabled={action.busy || connectionPage.offset === 0}
                onClick={() =>
                  void action.run(async () => {
                    const offset = Math.max(0, connectionPage.offset - 50);
                    const page = await operationsApi.connections(offset);
                    setConnections(page.items);
                    setConnectionPage({ offset, total: page.total });
                  })
                }
              >
                Previous
              </button>
              <span>{connectionPage.total} connections</span>
              <button
                className="cp-button cp-button--quiet"
                disabled={
                  action.busy ||
                  connectionPage.offset + 50 >= connectionPage.total
                }
                onClick={() =>
                  void action.run(async () => {
                    const offset = connectionPage.offset + 50;
                    const page = await operationsApi.connections(offset);
                    setConnections(page.items);
                    setConnectionPage({ offset, total: page.total });
                  })
                }
              >
                Next
              </button>
            </div>
            <p className="cp-footnote">
              A configured connection is not a successful connection test.
              Health checks call the adapter's actual health endpoint.
            </p>
          </section>
          <section className="cp-panel">
            <div className="cp-panel-heading">
              <h3>
                {connection.revision !== undefined
                  ? "Edit connection"
                  : "New connection"}
              </h3>
              {connection.revision !== undefined && (
                <StatusPill>Revision {connection.revision}</StatusPill>
              )}
            </div>
            <fieldset
              className="cp-fieldset"
              disabled={!canAdmin || action.busy}
            >
              <div className="cp-form-grid">
                <Field label="Connection ID">
                  <select
                    value={connection.id}
                    disabled={connection.revision !== undefined}
                    onChange={(e) =>
                      setConnection({ ...emptyConnection(), ...connectorDefinitions.find(item => item.id === e.target.value) })
                    }
                  >
                    <option value="">Select a declared integration</option>
                    {connectorDefinitions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="Name">
                  <input
                    value={connection.name}
                    onChange={(e) =>
                      setConnection({ ...connection, name: e.target.value })
                    }
                  />
                </Field>
                <Field label="Adapter kind">
                  <select
                    value={connection.kind}
                    disabled
                  >
                    <option value="case">Case / fulfillment</option>
                    <option value="voice">Voice / IVR</option>
                    <option value="knowledge">Knowledge</option>
                  </select>
                </Field>
                <Field label="Request timeout (ms)">
                  <input
                    type="number"
                    min="1000"
                    max="60000"
                    value={connection.timeoutMs}
                    onChange={(e) =>
                      setConnection({
                        ...connection,
                        timeoutMs: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label="Adapter base URL"
                  wide
                  hint="Managed by your deployment team."
                >
                  <input
                    type="url"
                    value={connection.baseUrl}
                    readOnly
                  />
                </Field>
                <Field
                  label="Credential reference"
                  wide
                  hint="Server-declared environment variable reference."
                >
                  <input
                    value={connection.credentialRef || ""}
                    readOnly
                    autoComplete="off"
                    placeholder="env:CONNECTOR_SECRET_CRM_TOKEN"
                  />
                </Field>
                <Field
                  label="Webhook signing secret reference"
                  wide
                  hint="Server-declared environment variable reference."
                >
                  <input
                    value={connection.webhookSecretRef || ""}
                    readOnly
                    autoComplete="off"
                    placeholder="env:CONNECTOR_SECRET_CRM_WEBHOOK"
                  />
                </Field>
                <label className="cp-check">
                  <input
                    type="checkbox"
                    checked={connection.enabled}
                    onChange={(e) =>
                      setConnection({
                        ...connection,
                        enabled: e.target.checked,
                      })
                    }
                  />
                  Enable adapter
                </label>
              </div>
              <div className="cp-actions cp-add">
                <button
                  className="cp-button"
                  disabled={
                    !connection.id.trim() ||
                    !connection.name.trim() ||
                    !connection.baseUrl.trim()
                  }
                  onClick={() =>
                    void action.run(async () => {
                      await operationsApi.saveConnection(connection);
                      const next = (await operationsApi.connections()).items;
                      setConnections(next);
                      setConnection(
                        next.find((entry) => entry.id === connection.id) ||
                          connection,
                      );
                      action.setNotice(
                        "Connection configuration saved. Test the adapter to check connectivity.",
                      );
                    })
                  }
                >
                  Save connection
                </button>
                <button
                  className="cp-button cp-button--quiet"
                  disabled={
                    !connections.some((entry) => entry.id === connection.id)
                  }
                  onClick={() =>
                    void action.run(async () => {
                      const result = await operationsApi.testConnection(
                        connection.id,
                      );
                      setTestResult(result);
                      const page = await operationsApi.connections(
                        connectionPage.offset,
                      );
                      setConnections(page.items);
                      setConnection(
                        page.items.find(
                          (entry) => entry.id === connection.id,
                        ) || connection,
                      );
                    })
                  }
                >
                  Test saved connection
                </button>
                {connection.kind === "knowledge" && (
                  <button
                    className="cp-button cp-button--quiet"
                    disabled={
                      configurationDirty ||
                      !connection.enabled ||
                      !connections.some((entry) => entry.id === connection.id)
                    }
                    onClick={() =>
                      void action.run(async () => {
                        await operationsApi.syncConnection(
                          connection.id,
                          configurationRevision,
                        );
                        onSynchronized();
                        action.setNotice(
                          "Adapter documents imported as drafts. Review and publish them in Knowledge.",
                        );
                      })
                    }
                  >
                    Sync knowledge to drafts
                  </button>
                )}
              </div>
            </fieldset>
            {testResult && (
              <div
                className={`cp-alert ${testResult.ok ? "cp-alert--success" : "cp-alert--error"}`}
                role="status"
              >
                <strong>
                  {testResult.ok
                    ? "Adapter health check passed"
                    : "Adapter health check failed"}
                </strong>
                <span>{testResult.message}</span>
                <small>{formatDate(testResult.checkedAt)}</small>
              </div>
            )}
          </section>
        </div>
      )}

      {section === "traces" && (
        <>
          {status && (
            <div className="cp-stat-grid">
              <article>
                <span>Connector cases</span>
                <strong>{status.metrics.cases}</strong>
                <p>Durable execution records</p>
              </article>
              <article>
                <span>Open cases</span>
                <strong>{status.metrics.openCases}</strong>
                <p>Pending fulfillment</p>
              </article>
              <article>
                <span>Failed cases</span>
                <strong>{status.metrics.failedCases}</strong>
                <p>Review recorded outcomes</p>
              </article>
              <article>
                <span>Runtime events</span>
                <strong>{status.metrics.events}</strong>
                <p>Recorded evidence</p>
              </article>
            </div>
          )}
          <section className="cp-panel">
            <div className="cp-panel-heading">
              <h3>Execution traces</h3>
              <StatusPill>{events.total} events</StatusPill>
            </div>
            <div className="cp-inline-form">
              <Field label="Session ID">
                <input
                  value={sessionFilter}
                  onChange={(e) => setSessionFilter(e.target.value)}
                  placeholder="Filter by session, or leave empty"
                />
              </Field>
              <button
                className="cp-button cp-button--quiet"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    setEventOffset(0);
                    setEvents(await operationsApi.events(sessionFilter, 0));
                  })
                }
              >
                Apply filter
              </button>
              <button
                className="cp-button cp-button--quiet"
                disabled={
                  action.busy ||
                  !sessionFilter.trim() ||
                  !permissions.canOperate
                }
                onClick={() =>
                  void action.run(async () =>
                    setConversationContext(
                      await operationsApi.context(sessionFilter),
                    ),
                  )
                }
              >
                Inspect session context
              </button>
            </div>
            {conversationContext && (
              <JsonEvidence
                value={conversationContext}
                title="Authorized session context"
              />
            )}
            {events.items.length ? (
              <div className="cp-event-list">
                {events.items.map((event, index) => (
                  <article className="cp-event" key={event.id || index}>
                    <div>
                      <strong>
                        {String(
                          event.type || event.eventType || "Runtime event",
                        ).replace(/[._]/g, " ")}
                      </strong>
                      <span>
                        {formatDate(event.createdAt || event.timestamp)}
                      </span>
                    </div>
                    <p>
                      {event.sessionId || "No session"}
                      {event.channel ? ` · ${event.channel}` : ""}
                      {event.intent ? ` · ${event.intent}` : ""}
                    </p>
                    <JsonEvidence value={event} />
                  </article>
                ))}
              </div>
            ) : (
              <p className="cp-empty">No recorded events match this filter.</p>
            )}
            <div className="cp-pagination">
              <button
                className="cp-button cp-button--quiet"
                disabled={action.busy || eventOffset === 0}
                onClick={() =>
                  void action.run(async () => {
                    const offset = Math.max(0, eventOffset - 25);
                    setEvents(
                      await operationsApi.events(sessionFilter, offset),
                    );
                    setEventOffset(offset);
                  })
                }
              >
                Previous
              </button>
              <span>
                {events.total
                  ? `${eventOffset + 1}–${eventOffset + events.items.length} of ${events.total}`
                  : "0 events"}
              </span>
              <button
                className="cp-button cp-button--quiet"
                disabled={action.busy || eventOffset + 25 >= events.total}
                onClick={() =>
                  void action.run(async () => {
                    const offset = eventOffset + 25;
                    setEvents(
                      await operationsApi.events(sessionFilter, offset),
                    );
                    setEventOffset(offset);
                  })
                }
              >
                Next
              </button>
            </div>
          </section>
          <section className="cp-panel">
            <div className="cp-panel-heading">
              <h3>Connector fulfillment cases</h3>
              <StatusPill>{cases.total} cases</StatusPill>
            </div>
            {cases.items.length ? (
              <div className="cp-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Case / session</th>
                      <th>Channel / queue</th>
                      <th>Outcome</th>
                      <th>Attempts</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.items.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <strong>{entry.id}</strong>
                          <small>{entry.sessionId}</small>
                        </td>
                        <td>
                          {entry.channel}
                          <small>{entry.queue}</small>
                        </td>
                        <td>
                          <StatusPill
                            good={entry.status === "completed"}
                            warning={entry.status === "reconciliation_required"}
                          >
                            {entry.status.replace(/_/g, " ")}
                          </StatusPill>
                        </td>
                        <td>{entry.attempts}</td>
                        <td>
                          <button
                            className="cp-link"
                            onClick={() => {
                              setSelectedCase(entry);
                              setReconcileNote("");
                              setExternalId(entry.externalId || "");
                            }}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="cp-empty">No connector cases have been recorded.</p>
            )}
            <div className="cp-pagination">
              <button
                className="cp-button cp-button--quiet"
                disabled={action.busy || caseOffset === 0}
                onClick={() =>
                  void action.run(async () => {
                    const offset = Math.max(0, caseOffset - 25);
                    setCases(await operationsApi.cases(offset));
                    setCaseOffset(offset);
                  })
                }
              >
                Previous
              </button>
              <span>
                {cases.total
                  ? `${caseOffset + 1}–${caseOffset + cases.items.length} of ${cases.total}`
                  : "0 cases"}
              </span>
              <button
                className="cp-button cp-button--quiet"
                disabled={action.busy || caseOffset + 25 >= cases.total}
                onClick={() =>
                  void action.run(async () => {
                    const offset = caseOffset + 25;
                    setCases(await operationsApi.cases(offset));
                    setCaseOffset(offset);
                  })
                }
              >
                Next
              </button>
            </div>
          </section>
          {selectedCase && (
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>Reconcile {selectedCase.id}</h3>
                <StatusPill
                  warning={selectedCase.status === "reconciliation_required"}
                >
                  {selectedCase.status.replace(/_/g, " ")}
                </StatusPill>
              </div>
              <p>{selectedCase.summary}</p>
              {selectedCase.lastError && (
                <div className="cp-alert cp-alert--error">
                  {selectedCase.lastError}
                </div>
              )}
              <JsonEvidence
                value={selectedCase}
                title="Case execution details"
              />
              <fieldset
                className="cp-fieldset"
                disabled={
                  !permissions.canOperate ||
                  action.busy ||
                  selectedCase.status !== "reconciliation_required"
                }
              >
                <div className="cp-form-grid">
                  <Field label="Verified outcome">
                    <select
                      value={outcome}
                      onChange={(e) =>
                        setOutcome(e.target.value as typeof outcome)
                      }
                    >
                      <option value="completed">
                        Confirmed completed externally
                      </option>
                      <option value="failed">Confirmed failed</option>
                      <option value="retry">
                        Authorize retry after investigation
                      </option>
                    </select>
                  </Field>
                  <Field label="External case ID">
                    <input
                      value={externalId}
                      onChange={(e) => setExternalId(e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Reconciliation evidence"
                    wide
                    hint="Record how the external outcome was verified. A retry can call the adapter again."
                  >
                    <textarea
                      rows={3}
                      value={reconcileNote}
                      onChange={(e) => setReconcileNote(e.target.value)}
                    />
                  </Field>
                </div>
                <button
                  className="cp-button cp-add"
                  disabled={!reconcileNote.trim()}
                  onClick={() =>
                    void action.run(async () => {
                      await operationsApi.reconcile(
                        selectedCase.id,
                        outcome,
                        reconcileNote,
                        externalId,
                      );
                      setCases(await operationsApi.cases(caseOffset));
                      setSelectedCase(null);
                      setStatus(await operationsApi.status());
                      action.setNotice("Reconciliation recorded.");
                    })
                  }
                >
                  Record reconciliation
                </button>
              </fieldset>
            </section>
          )}
          <section className="cp-panel">
            <div className="cp-panel-heading">
              <div>
                <span className="cp-eyebrow">Financial action ledger</span>
                <h3>Uncertain financial operations</h3>
              </div>
              <button
                className="cp-button cp-button--quiet"
                disabled={action.busy || !permissions.canOperate}
                onClick={() =>
                  void action.run(async () =>
                    setFinancialOperations(
                      (await operationsApi.financialOperations()).operations,
                    ),
                  )
                }
              >
                Load financial operations
              </button>
            </div>
            <p>
              Inspect actions whose dispatched outcome could not be confirmed.
              Reconcile only after verifying the authoritative transaction
              outcome; this console never retries an uncertain financial action.
            </p>
            <p className="cp-footnote">
              Requires the servicing:operations:read scope. Resolution also
              requires servicing:operations:reconcile, or the wildcard scope.
            </p>
            {financialOperations &&
              (financialOperations.length ? (
                <div className="cp-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Operation</th>
                        <th>Session</th>
                        <th>Tool</th>
                        <th>Updated</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {financialOperations.map((entry) => (
                        <tr key={entry.operationId}>
                          <td>{entry.operationId}</td>
                          <td>{entry.sessionId}</td>
                          <td>{entry.tool}</td>
                          <td>{formatDate(entry.updatedAt)}</td>
                          <td>
                            <button
                              className="cp-link"
                              onClick={() => {
                                setFinancial(entry);
                                setFinancialNote("");
                                setFinancialReference("");
                              }}
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="cp-empty">
                  No unresolved financial operations were returned.
                </p>
              ))}
            {financial && (
              <fieldset
                className="cp-fieldset cp-add"
                disabled={action.busy || !permissions.canOperate}
              >
                <h3>Reconcile {financial.operationId}</h3>
                <div className="cp-form-grid cp-add">
                  <Field label="Verified financial outcome">
                    <select
                      value={financialOutcome}
                      onChange={(e) =>
                        setFinancialOutcome(
                          e.target.value as "completed" | "failed",
                        )
                      }
                    >
                      <option value="completed">Confirmed completed</option>
                      <option value="failed">Confirmed failed</option>
                    </select>
                  </Field>
                  <Field label="Authoritative evidence reference">
                    <input
                      value={financialReference}
                      onChange={(e) => setFinancialReference(e.target.value)}
                      placeholder="Transaction or investigation reference"
                    />
                  </Field>
                  <Field label="Financial reconciliation note" wide>
                    <textarea
                      rows={3}
                      value={financialNote}
                      onChange={(e) => setFinancialNote(e.target.value)}
                    />
                  </Field>
                </div>
                <button
                  className="cp-button"
                  disabled={!financialNote.trim() || !financialReference.trim()}
                  onClick={() =>
                    void action.run(async () => {
                      await operationsApi.reconcileFinancial(
                        financial.operationId,
                        financialOutcome,
                        financialReference,
                        financialNote,
                      );
                      setFinancialOperations(
                        (await operationsApi.financialOperations()).operations,
                      );
                      setFinancial(null);
                      action.setNotice(
                        "Financial reconciliation evidence recorded. No transaction was retried.",
                      );
                    })
                  }
                >
                  Record verified outcome
                </button>
              </fieldset>
            )}
          </section>
          {analytics && (
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>Servicing analytics</h3>
                <StatusPill>Recorded outcomes</StatusPill>
              </div>
              <p>
                Aggregates reflect captured runtime events. Empty results mean
                no matching observations have been collected.
              </p>
              <p className="cp-footnote">
                Observation window: {analytics.windowDays} days.
              </p>
              {analytics.items.length ? (
                <div className="cp-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Intent</th>
                        <th>Channel</th>
                        <th>Outcome</th>
                        <th>Count</th>
                        <th>Average duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.items.map((entry, index) => (
                        <tr key={index}>
                          <td>{entry.intent}</td>
                          <td>{entry.channel}</td>
                          <td>{entry.outcome}</td>
                          <td>{entry.count}</td>
                          <td>
                            {entry.averageDurationMs === null
                              ? "Not recorded"
                              : `${entry.averageDurationMs.toLocaleString()} ms`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="cp-empty">
                  No runtime outcomes recorded in this window.
                </p>
              )}
            </section>
          )}
        </>
      )}

      {section === "operations" && (
        <>
          <div className="cp-two-column">
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>Deployment readiness</h3>
                <StatusPill good={Boolean(status)}>
                  Dedicated enterprise
                </StatusPill>
              </div>
              {status ? (
                <dl className="cp-details">
                  <dt>Storage</dt>
                  <dd>{status.storage}</dd>
                  <dt>Workers</dt>
                  <dd>{status.workersEnabled ? "Enabled" : "Disabled"}</dd>
                  <dt>Identity</dt>
                  <dd>
                    {status.identity.configured
                      ? status.identity.issuer || "Configured"
                      : "Enterprise login is not configured"}
                  </dd>
                  <dt>Connections</dt>
                  <dd>{status.connectors}</dd>
                  <dt>Retention</dt>
                  <dd>{status.retentionDays} days</dd>
                </dl>
              ) : (
                <p className="cp-empty">Readiness is unavailable.</p>
              )}
              <p className="cp-footnote">
                Identity issuer settings, worker startup, and secret storage are
                deployment configuration. Readiness here reflects what the API
                reports.
              </p>
            </section>
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>Audit evidence export</h3>
                <StatusPill>Authenticated download</StatusPill>
              </div>
              <p>
                Download the recorded audit evidence chain for review and
                retention outside this console.
              </p>
              <button
                className="cp-button cp-button--quiet"
                disabled={action.busy || !canAdmin || !auditHasMore}
                onClick={() =>
                  void action.run(async () => {
                    const evidence =
                      await operationsApi.exportAudit(auditCursor);
                    downloadEvidence(
                      `servicing-audit-after-${auditCursor}-${new Date().toISOString().slice(0, 10)}.json`,
                      evidence,
                    );
                    setAuditHasMore(evidence.nextAfter !== null);
                    if (evidence.nextAfter !== null)
                      setAuditCursor(evidence.nextAfter);
                    action.setNotice(
                      evidence.nextAfter !== null
                        ? "Evidence batch downloaded. More records are available; download the next batch."
                        : "Evidence batch downloaded. No further records remain in this export.",
                    );
                  })
                }
              >
                {auditCursor
                  ? "Download next evidence batch"
                  : "Download evidence batch"}
              </button>
              <p className="cp-footnote">
                Each export preserves up to 1,000 evidence records, chain
                hashes, and its signature when signing is configured.{" "}
                {auditHasMore
                  ? "Continue downloading while more batches remain."
                  : "This export is complete."}
              </p>
              {auditCursor > 0 && (
                <button
                  className="cp-link"
                  onClick={() => {
                    setAuditCursor(0);
                    setAuditHasMore(true);
                  }}
                >
                  Restart export from first record
                </button>
              )}
            </section>
          </div>
          <section className="cp-panel">
            <div className="cp-panel-heading">
              <div>
                <span className="cp-eyebrow">Enterprise identity</span>
                <h3>Subject-to-account mappings</h3>
              </div>
              <button
                className="cp-button cp-button--quiet"
                disabled={!canAdmin || action.busy}
                onClick={() => {
                  setMapping(emptyMapping());
                  setMappingRoles("customer");
                }}
              >
                + New mapping
              </button>
            </div>
            <p>
              Bind a verified issuer and subject to a local servicing account.
              Roles are granted by the server from this mapping after enterprise
              sign-in.
            </p>
            {!canAdmin && (
              <p className="cp-inline-note">
                Administrator access is required to inspect or edit identity
                mappings.
              </p>
            )}
            {mappings.length > 0 && (
              <div className="cp-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Identity</th>
                      <th>Local account</th>
                      <th>Roles</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappings.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          <button
                            className="cp-link"
                            onClick={() => {
                              setMapping({ ...entry });
                              setMappingRoles(entry.roles.join(", "));
                            }}
                          >
                            {entry.subject}
                          </button>
                          <small>{entry.issuer}</small>
                        </td>
                        <td>{entry.userId}</td>
                        <td>{entry.roles.join(", ")}</td>
                        <td>{entry.enabled ? "Enabled" : "Disabled"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="cp-pagination">
              <button
                className="cp-button cp-button--quiet"
                disabled={action.busy || mappingPage.offset === 0}
                onClick={() =>
                  void action.run(async () => {
                    const offset = Math.max(0, mappingPage.offset - 50);
                    const page = await operationsApi.mappings(offset);
                    setMappings(page.items);
                    setMappingPage({ offset, total: page.total });
                  })
                }
              >
                Previous
              </button>
              <span>{mappingPage.total} mappings</span>
              <button
                className="cp-button cp-button--quiet"
                disabled={
                  action.busy || mappingPage.offset + 50 >= mappingPage.total
                }
                onClick={() =>
                  void action.run(async () => {
                    const offset = mappingPage.offset + 50;
                    const page = await operationsApi.mappings(offset);
                    setMappings(page.items);
                    setMappingPage({ offset, total: page.total });
                  })
                }
              >
                Next
              </button>
            </div>
            <fieldset
              className="cp-fieldset cp-add"
              disabled={!canAdmin || action.busy}
            >
              <div className="cp-form-grid">
                <Field label="Mapping ID">
                  <input
                    value={mapping.id}
                    onChange={(e) =>
                      setMapping({ ...mapping, id: e.target.value })
                    }
                  />
                </Field>
                <Field label="Local user ID">
                  <input
                    value={mapping.userId}
                    onChange={(e) =>
                      setMapping({ ...mapping, userId: e.target.value })
                    }
                  />
                </Field>
                <Field label="Verified issuer URL">
                  <input
                    type="url"
                    value={mapping.issuer}
                    onChange={(e) =>
                      setMapping({ ...mapping, issuer: e.target.value })
                    }
                  />
                </Field>
                <Field label="Exact subject identifier">
                  <input
                    value={mapping.subject}
                    onChange={(e) =>
                      setMapping({ ...mapping, subject: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Authorized roles"
                  wide
                  hint="Comma-separated server-supported roles; for example customer, control_plane_viewer, control_plane_editor, control_plane_operator, or control_plane_admin."
                >
                  <input
                    value={mappingRoles}
                    onChange={(e) => setMappingRoles(e.target.value)}
                  />
                </Field>
                <label className="cp-check">
                  <input
                    type="checkbox"
                    checked={mapping.enabled}
                    onChange={(e) =>
                      setMapping({ ...mapping, enabled: e.target.checked })
                    }
                  />
                  Allow this identity mapping
                </label>
              </div>
              <button
                className="cp-button cp-add"
                disabled={
                  !mapping.id.trim() ||
                  !mapping.userId.trim() ||
                  !mapping.issuer.trim() ||
                  !mapping.subject.trim()
                }
                onClick={() =>
                  void action.run(async () => {
                    const saved = await operationsApi.saveMapping({
                      ...mapping,
                      roles: splitValues(mappingRoles),
                    });
                    setMapping(saved);
                    setMappings(
                      (await operationsApi.mappings(mappingPage.offset)).items,
                    );
                    action.setNotice(
                      "Identity mapping saved. New enterprise sign-ins use the updated mapping.",
                    );
                  })
                }
              >
                Save mapping
              </button>
            </fieldset>
          </section>
          <section className="cp-panel">
            <div className="cp-panel-heading">
              <h3>Retention maintenance</h3>
              <StatusPill>Administrator</StatusPill>
            </div>
            <p>
              Preview records eligible for deletion before applying retention.
              The API enforces protected evidence and retention rules.
            </p>
            <div className="cp-inline-form">
              <Field label="Retain records for (days)">
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={retentionDays}
                  disabled={!canAdmin || action.busy}
                  onChange={(e) => {
                    setRetentionDays(Number(e.target.value));
                    setRetentionPreviewDays(null);
                    setRetentionResult(null);
                  }}
                />
              </Field>
              <button
                className="cp-button cp-button--quiet"
                disabled={!canAdmin || action.busy || retentionDays < 1}
                onClick={() =>
                  void action.run(async () => {
                    setRetentionResult(
                      await operationsApi.retention(retentionDays, true),
                    );
                    setRetentionPreviewDays(retentionDays);
                  })
                }
              >
                Preview eligible records
              </button>
              <button
                className="cp-button"
                disabled={
                  !canAdmin ||
                  action.busy ||
                  retentionPreviewDays !== retentionDays
                }
                onClick={() =>
                  void action.run(async () => {
                    setRetentionResult(
                      await operationsApi.retention(retentionDays, false),
                    );
                    setRetentionPreviewDays(null);
                    setStatus(await operationsApi.status());
                    action.setNotice("Retention maintenance completed.");
                  })
                }
              >
                Apply retention
              </button>
            </div>
            {retentionResult && (
              <JsonEvidence value={retentionResult} title="Retention result" />
            )}
          </section>
        </>
      )}
      {section === "traces" && (
        <>
          <VoiceRecoveryConsole permissions={permissions} />
          <CostConsole permissions={permissions} />
        </>
      )}
      {section === "operations" && (
        <>
          <CostConsole permissions={permissions} edit />
          <PrivacyConsole permissions={permissions} />
        </>
      )}
    </div>
  );
}
