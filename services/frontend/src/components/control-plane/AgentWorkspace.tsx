import { useEffect, useState } from "react";
import {
  agentWorkspaceApi as api,
  type AgentCaseDetail,
  type AgentCaseList,
  type AgentCitation,
  type AgentDisposition,
  type AgentFilters,
  type AgentKnowledge,
  type HandlingStatus,
} from "@/services/agentWorkspaceService";
import {
  ConsoleField as Field,
  StatusPill,
  formatDate,
  useConsoleAction,
} from "./ConsoleElements";
import "./AgentWorkspace.css";

const label = (value: string) => value.replace(/_/g, " ");
const dispositions: AgentDisposition[] = [
  "information_provided",
  "follow_up_required",
  "escalated",
  "service_completed",
  "unable_to_complete",
];

export default function AgentWorkspace({
  onNavigate,
}: {
  onNavigate?: (section: "traces" | "operations" | "fulfillment") => void;
}) {
  const action = useConsoleAction();
  const [list, setList] = useState<AgentCaseList | null>(null);
  const [filters, setFilters] = useState<AgentFilters>({
    assignment: "all",
    offset: 0,
  });
  const [detail, setDetail] = useState<AgentCaseDetail | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] =
    useState<Exclude<HandlingStatus, "unclaimed">>("in_progress");
  const [disposition, setDisposition] = useState<AgentDisposition>(
    "information_provided",
  );
  const [citations, setCitations] = useState<AgentCitation[]>([]);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledge, setKnowledge] = useState<AgentKnowledge | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingCase, setPendingCase] = useState<string | null>(null);
  const [activeEvidence, setActiveEvidence] = useState<string | null>(null);
  const selected = detail?.item;

  const refreshList = async (next = filters) => {
    setList(await api.list(next));
  };
  useEffect(() => {
    void action.run(() => refreshList());
  }, []);
  const openCase = async (id: string) => {
    const next = await api.detail(id);
    setDetail(next);
    setNote("");
    setCitations([]);
    setKnowledge(null);
    setKnowledgeQuery("");
    setDirty(false);
    setPendingCase(null);
    setActiveEvidence(null);
    setStatus(
      next.item.work.status === "unclaimed"
        ? "in_progress"
        : next.item.work.status,
    );
    setDisposition(next.item.work.disposition || "information_provided");
  };
  const selectCase = (id: string) => {
    if (selected?.id === id) return;
    if (dirty) setPendingCase(id);
    else void action.run(() => openCase(id));
  };
  const refresh = async () => {
    await refreshList();
    if (selected) setDetail(await api.detail(selected.id));
  };
  const changeFilter = (key: keyof AgentFilters, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value, offset: 0 }));
  };
  const applyFilters = async () => {
    const next = { ...filters, offset: 0 };
    setFilters(next);
    await refreshList(next);
  };
  const mutate = async (kind: "claim" | "release" | "update") => {
    if (!selected) return;
    const result =
      kind === "claim"
        ? await api.claim(selected, note)
        : kind === "release"
          ? await api.release(selected, note)
          : await api.update(selected.id, {
              revision: selected.work.revision,
              caseRevision: selected.caseRevision,
              note,
              status,
              disposition,
              citations: citations.map(({ id, version }) => ({ id, version })),
            });
    setDetail((previous) =>
      previous ? { ...previous, item: result.item } : previous,
    );
    setNote("");
    setCitations([]);
    setDirty(false);
    setStatus(
      result.item.work.status === "unclaimed"
        ? "in_progress"
        : result.item.work.status,
    );
    setDisposition(result.item.work.disposition || "information_provided");
    const results = await Promise.allSettled([
      api.detail(selected.id),
      api.list(filters),
    ]);
    if (results[0].status === "fulfilled") setDetail(results[0].value);
    if (results[1].status === "fulfilled") setList(results[1].value);
    action.setNotice(
      `Agent handling saved. Provider execution was not changed.${results.some((result) => result.status === "rejected") ? " Some panels could not refresh; use Refresh workspace to reload them." : ""}`,
    );
  };
  const total = (key: "unassigned" | "waiting" | "uncertain" | "overdue") =>
    list?.queueSummary.reduce((sum, queue) => sum + queue[key], 0) || 0;
  const canWrite =
    selected &&
    (selected.actions.canClaim ||
      selected.actions.canEdit ||
      selected.actions.canRelease);

  return (
    <div className="cp-module aw-workspace">
      <div className="cp-section-intro cp-module-intro">
        <div>
          <h2>A complete view of the work in your queue</h2>
          <p>
            Claim a servicing case, consult approved knowledge, and record what
            happens next. Provider execution and agent handling remain separate.
          </p>
        </div>
        <button
          className="cp-button cp-button--quiet"
          disabled={action.busy}
          onClick={() => void action.run(refresh)}
        >
          Refresh workspace
        </button>
      </div>
      {action.messages}
      {!list && (
        <p className="cp-empty" role="status">
          {action.busy
            ? "Loading agent workspace…"
            : "Workspace data is unavailable. Refresh to try again."}
        </p>
      )}
      {list && (
        <>
          {!list.permissions.canOperate && (
            <div className="cp-alert" role="status">
              Read-only access. A servicing operator role is required to claim
              or update work.
            </div>
          )}
          <div className="aw-metrics" aria-label="Filtered queue totals">
            {[
              [list.total, "Matching cases"],
              [total("unassigned"), "Unassigned"],
              [total("waiting"), "Waiting"],
              [total("overdue"), "Overdue"],
              [total("uncertain"), "Uncertain outcome"],
            ].map(([value, name]) => (
              <div key={name}>
                <strong>{value}</strong>
                <span>{name}</span>
              </div>
            ))}
          </div>
          <form
            className="cp-panel aw-filters"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(applyFilters);
            }}
          >
            <Field label="Queue">
              <select
                value={filters.queue || ""}
                onChange={(event) => changeFilter("queue", event.target.value)}
              >
                <option value="">All queues</option>
                {list.queues.map((queue) => (
                  <option key={queue}>{queue}</option>
                ))}
              </select>
            </Field>
            <Field label="Channel">
              <select
                value={filters.channel || ""}
                onChange={(event) =>
                  changeFilter("channel", event.target.value)
                }
              >
                <option value="">All channels</option>
                {["digital", "ava", "ivr"].map((channel) => (
                  <option key={channel}>{channel}</option>
                ))}
              </select>
            </Field>
            <Field label="Assignment">
              <select
                value={filters.assignment || "all"}
                onChange={(event) =>
                  changeFilter("assignment", event.target.value)
                }
              >
                <option value="all">Everyone</option>
                <option value="mine">Assigned to me</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </Field>
            <Field label="Agent handling">
              <select
                value={filters.status || ""}
                onChange={(event) => changeFilter("status", event.target.value)}
              >
                <option value="">All handling states</option>
                {["unclaimed", "in_progress", "waiting", "resolved"].map(
                  (value) => (
                    <option key={value} value={value}>
                      {label(value)}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Provider execution">
              <select
                value={filters.executionStatus || ""}
                onChange={(event) =>
                  changeFilter("executionStatus", event.target.value)
                }
              >
                <option value="">All execution states</option>
                {[
                  "queued",
                  "in_progress",
                  "completed",
                  "failed",
                  "reconciliation_required",
                ].map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="SLA">
              <select
                value={filters.overdue || "false"}
                onChange={(event) =>
                  changeFilter("overdue", event.target.value)
                }
              >
                <option value="false">All cases</option>
                <option value="true">Overdue only</option>
              </select>
            </Field>
            <button className="cp-button" disabled={action.busy}>
              Apply filters
            </button>
          </form>
          {pendingCase && (
            <div className="cp-alert aw-unsaved" role="alert">
              <p>You have an unsaved handling note or disposition.</p>
              <div>
                <button
                  className="cp-button cp-button--quiet"
                  onClick={() => setPendingCase(null)}
                >
                  Keep editing
                </button>
                <button
                  className="cp-button"
                  onClick={() => void action.run(() => openCase(pendingCase))}
                >
                  Discard edits and open case
                </button>
              </div>
            </div>
          )}
          <div className="aw-layout">
            <section className="cp-panel aw-inbox" aria-label="Case queue">
              <div className="cp-panel-heading">
                <h3>Case queue</h3>
                <span>{list.total} matching</span>
              </div>
              {!list.items.length && (
                <p className="cp-empty">
                  No cases match these filters. Connector-backed runtime
                  requests appear here once recorded.
                </p>
              )}
              <div className="aw-case-list">
                {list.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`aw-case ${selected?.id === item.id ? "aw-case--selected" : ""}`}
                    disabled={action.busy}
                    onClick={() => selectCase(item.id)}
                    aria-pressed={selected?.id === item.id}
                  >
                    <div>
                      <strong>{item.reference || item.id}</strong>
                      <StatusPill warning={item.overdue}>
                        {item.channel.toUpperCase()}
                      </StatusPill>
                    </div>
                    <p>{item.summary}</p>
                    <div>
                      <span>{item.queue}</span>
                      <span>
                        {item.work.mine
                          ? "Assigned to you"
                          : item.work.assigned
                            ? "Assigned"
                            : "Unassigned"}
                      </span>
                    </div>
                    <small>
                      Handling: {label(item.work.status)} · Execution:{" "}
                      {label(item.executionStatus)}
                    </small>
                    <small className={item.overdue ? "aw-overdue" : ""}>
                      Due {formatDate(item.dueAt)}
                    </small>
                  </button>
                ))}
              </div>
              <div className="aw-pagination">
                <button
                  className="cp-button cp-button--quiet"
                  disabled={action.busy || list.offset === 0}
                  onClick={() =>
                    void action.run(async () => {
                      const next = {
                        ...filters,
                        offset: Math.max(0, list.offset - list.limit),
                      };
                      setFilters(next);
                      await refreshList(next);
                    })
                  }
                >
                  Previous
                </button>
                <span>
                  {list.total
                    ? `${list.offset + 1}–${list.offset + list.items.length}`
                    : "0"}{" "}
                  of {list.total}
                </span>
                <button
                  className="cp-button cp-button--quiet"
                  disabled={
                    action.busy || list.offset + list.limit >= list.total
                  }
                  onClick={() =>
                    void action.run(async () => {
                      const next = {
                        ...filters,
                        offset: list.offset + list.limit,
                      };
                      setFilters(next);
                      await refreshList(next);
                    })
                  }
                >
                  Next
                </button>
              </div>
              <details className="aw-oversight">
                <summary>Queue oversight</summary>
                {list.queueSummary.map((queue) => (
                  <div key={queue.queue}>
                    <strong>{queue.queue}</strong>
                    <span>
                      {queue.total} cases · {queue.unassigned} unassigned ·{" "}
                      {queue.overdue} overdue
                    </span>
                  </div>
                ))}
                <small>
                  Totals reflect the applied filters. At most 100 queue groups
                  are displayed.
                </small>
              </details>
            </section>
            <div className="aw-detail">
              {!detail && (
                <section className="cp-panel cp-empty">
                  <h3>Select a case to begin</h3>
                  <p>
                    Review the case context, provider outcome, approved guidance
                    and assignment in one place.
                  </p>
                </section>
              )}
              {detail && selected && (
                <>
                  <section className="cp-panel" aria-label="Case context">
                    <div className="cp-panel-heading">
                      <div>
                        <span className="cp-eyebrow">
                          Case context · release {selected.releaseVersion}
                        </span>
                        <h3>{selected.reference || selected.id}</h3>
                      </div>
                      <StatusPill
                        warning={
                          selected.executionStatus === "reconciliation_required"
                        }
                        good={selected.executionStatus === "completed"}
                      >
                        {label(selected.executionStatus)}
                      </StatusPill>
                    </div>
                    <p className="aw-summary">{selected.summary}</p>
                    <dl className="aw-context">
                      <div>
                        <dt>Queue / channel</dt>
                        <dd>
                          {selected.queue} / {selected.channel}
                        </dd>
                      </div>
                      <div>
                        <dt>Pinned journey</dt>
                        <dd>
                          {detail.journey?.name ||
                            "Release context unavailable"}
                        </dd>
                      </div>
                      <div>
                        <dt>Assigned operator</dt>
                        <dd>
                          {selected.work.mine
                            ? "You"
                            : selected.work.assignee || "Unassigned"}
                        </dd>
                      </div>
                      <div>
                        <dt>Due</dt>
                        <dd className={selected.overdue ? "aw-overdue" : ""}>
                          {formatDate(selected.dueAt)}
                        </dd>
                      </div>
                      <div>
                        <dt>Case identifier</dt>
                        <dd>{selected.id}</dd>
                      </div>
                      <div>
                        <dt>Session reference</dt>
                        <dd>{selected.sessionId}</dd>
                      </div>
                    </dl>
                    <p>{detail.contextScope}</p>
                    <div className="aw-next-steps">
                      {detail.nextSteps.map((step) => (
                        <div key={step.id}>
                          <strong>{step.title}</strong>
                          <p>{step.detail}</p>
                        </div>
                      ))}
                    </div>
                    {onNavigate && (
                      <div className="aw-actions">
                        <button
                          className="cp-button cp-button--quiet"
                          onClick={() => onNavigate("traces")}
                        >
                          Open execution traces
                        </button>
                        {selected.executionStatus ===
                          "reconciliation_required" && (
                          <button
                            className="cp-button cp-button--quiet"
                            onClick={() => onNavigate("operations")}
                          >
                            Open reconciliation
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                  <section className="cp-panel" aria-label="Approved knowledge">
                    <div className="cp-panel-heading">
                      <h3>Approved knowledge</h3>
                      <span className="cp-eyebrow">Published sources</span>
                    </div>
                    <form
                      className="aw-search"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void action.run(async () =>
                          setKnowledge(
                            await api.knowledge(selected.id, knowledgeQuery),
                          ),
                        );
                      }}
                    >
                      <Field
                        label="Search guidance"
                        hint="Search by service or policy. Your signed roles determine accessible sources."
                      >
                        <input
                          value={knowledgeQuery}
                          maxLength={1000}
                          onChange={(event) =>
                            setKnowledgeQuery(event.target.value)
                          }
                          placeholder="e.g. replacement card delivery"
                        />
                      </Field>
                      <button
                        className="cp-button cp-button--quiet"
                        disabled={action.busy || !knowledgeQuery.trim()}
                      >
                        Search
                      </button>
                    </form>
                    {knowledge && (
                      <>
                        <p>{knowledge.scope}</p>
                        {!knowledge.matches.length && (
                          <p className="cp-empty">
                            No permitted, current published source matched.
                            Escalate through your approved process rather than
                            inventing guidance.
                          </p>
                        )}
                        {knowledge.matches.map((document) => (
                          <article
                            key={`${document.id}-${document.version}`}
                            className="aw-knowledge"
                          >
                            <div>
                              <h4>{document.title}</h4>
                              <StatusPill>
                                Version {document.version}
                              </StatusPill>
                            </div>
                            <p>{document.content}</p>
                            {document.truncated && (
                              <small>
                                Excerpt limited to 6,000 characters. Review the
                                full approved source before use.
                              </small>
                            )}
                            <div>
                              {document.sourceUrl ? (
                                <a
                                  href={document.sourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Open approved source ↗
                                </a>
                              ) : (
                                <span>{document.source}</span>
                              )}
                              <button
                                className="cp-button cp-button--quiet"
                                disabled={
                                  !selected.actions.canEdit ||
                                  citations.some(
                                    (citation) =>
                                      citation.id === document.id &&
                                      citation.version === document.version,
                                  ) ||
                                  citations.length >= 5
                                }
                                onClick={() => {
                                  setCitations((previous) => [
                                    ...previous,
                                    {
                                      id: document.id,
                                      version: document.version,
                                      title: document.title,
                                    },
                                  ]);
                                  setDirty(true);
                                }}
                              >
                                Cite in handling note
                              </button>
                            </div>
                          </article>
                        ))}
                      </>
                    )}
                  </section>
                  <section className="cp-panel" aria-label="Agent handling">
                    <div className="cp-panel-heading">
                      <h3>Agent handling</h3>
                      <StatusPill good={selected.work.status === "resolved"}>
                        {label(selected.work.status)}
                      </StatusPill>
                    </div>
                    {selected.work.status === "resolved" ? (
                      <p>
                        The recorded disposition is final. This does not change
                        or retry the provider operation.
                      </p>
                    ) : (
                      <>
                        {!selected.actions.canEdit && (
                          <p>
                            {selected.work.assigned
                              ? "Only the assigned operator can update handling. Administrators may release an assignment with a reason."
                              : "Claim this case to record a handling status and disposition."}
                          </p>
                        )}
                        <fieldset
                          className="cp-fieldset"
                          disabled={!canWrite || action.busy}
                        >
                          <div className="cp-form-grid">
                            <Field label="Handling status">
                              <select
                                value={status}
                                disabled={!selected.actions.canEdit}
                                onChange={(event) => {
                                  setStatus(
                                    event.target.value as typeof status,
                                  );
                                  setDirty(true);
                                }}
                              >
                                <option value="in_progress">In progress</option>
                                <option value="waiting">Waiting</option>
                                <option
                                  value="resolved"
                                  disabled={!selected.actions.canResolve}
                                >
                                  Resolved
                                </option>
                              </select>
                            </Field>
                            <Field label="Disposition">
                              <select
                                value={disposition}
                                disabled={!selected.actions.canEdit}
                                onChange={(event) => {
                                  setDisposition(
                                    event.target.value as AgentDisposition,
                                  );
                                  setDirty(true);
                                }}
                              >
                                {dispositions.map((value) => (
                                  <option
                                    key={value}
                                    value={value}
                                    disabled={
                                      value === "service_completed" &&
                                      selected.executionStatus !== "completed"
                                    }
                                  >
                                    {label(value)}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <Field
                              label="Handling note / assignment reason"
                              wide
                              hint="Required. Record the decision and follow-up; do not paste account data, passwords or customer identifiers. Email addresses and long numbers are redacted."
                            >
                              <textarea
                                rows={4}
                                maxLength={1000}
                                value={note}
                                onChange={(event) => {
                                  setNote(event.target.value);
                                  setDirty(true);
                                }}
                              />
                            </Field>
                          </div>
                          {!!citations.length && (
                            <div className="aw-citations">
                              <strong>Cited guidance</strong>
                              {citations.map((citation) => (
                                <div key={`${citation.id}-${citation.version}`}>
                                  <span>
                                    {citation.title || citation.id} · v
                                    {citation.version}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`Remove citation ${citation.title || citation.id}`}
                                    onClick={() => {
                                      setCitations((previous) =>
                                        previous.filter(
                                          (value) => value !== citation,
                                        ),
                                      );
                                      setDirty(true);
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="aw-actions">
                            {selected.actions.canClaim && (
                              <button
                                className="cp-button"
                                disabled={!note.trim()}
                                onClick={() =>
                                  void action.run(() => mutate("claim"))
                                }
                              >
                                Claim for me
                              </button>
                            )}
                            {selected.actions.canEdit && (
                              <button
                                className="cp-button"
                                disabled={!note.trim()}
                                onClick={() =>
                                  void action.run(() => mutate("update"))
                                }
                              >
                                Save handling
                              </button>
                            )}
                            {selected.actions.canRelease && (
                              <button
                                className="cp-button cp-button--quiet"
                                disabled={!note.trim()}
                                onClick={() =>
                                  void action.run(() => mutate("release"))
                                }
                              >
                                {selected.work.mine
                                  ? "Release to queue"
                                  : "Release assignment as supervisor"}
                              </button>
                            )}
                          </div>
                        </fieldset>
                        {!selected.actions.canResolve && (
                          <p>
                            Handling can be resolved only after the provider
                            reports completed or failed. Unknown outcomes
                            require reconciliation.
                          </p>
                        )}
                      </>
                    )}
                    <div className="aw-history">
                      <h4>Handling history</h4>
                      {!selected.work.history?.length && (
                        <p>No agent handling recorded.</p>
                      )}
                      {[...(selected.work.history || [])]
                        .reverse()
                        .map((entry) => (
                          <article key={entry.id}>
                            <div>
                              <strong>
                                {label(entry.action)} · {label(entry.status)}
                              </strong>
                              <time>{formatDate(entry.timestamp)}</time>
                            </div>
                            <small>
                              {entry.actor}
                              {entry.disposition
                                ? ` · ${label(entry.disposition)}`
                                : ""}
                            </small>
                            <p>{entry.note}</p>
                            {entry.citations.map((citation) => (
                              <small key={`${citation.id}-${citation.version}`}>
                                Source: {citation.title || citation.id} · v
                                {citation.version}
                              </small>
                            ))}
                            <a
                              href="#aw-case-evidence"
                              onClick={() =>
                                setActiveEvidence(entry.evidenceId)
                              }
                            >
                              Review recorded action evidence
                            </a>
                          </article>
                        ))}
                      <small>
                        Most recent 50 handling entries; content follows case
                        retention. Evidence export retains action digests.
                      </small>
                    </div>
                  </section>
                  <section
                    id="aw-case-evidence"
                    className="cp-panel aw-evidence"
                    aria-label="Case evidence"
                  >
                    <div className="cp-panel-heading">
                      <h3>Case evidence</h3>
                      <span>Latest 25 actions</span>
                    </div>
                    {!detail.evidence.length && (
                      <p>No case events have been recorded.</p>
                    )}
                    {activeEvidence &&
                      !detail.evidence.some(
                        (event) => event.id === activeEvidence,
                      ) && (
                        <p>
                          The selected action predates this recent window. Use
                          the administrator evidence export to locate ID{" "}
                          {activeEvidence}.
                        </p>
                      )}
                    {detail.evidence.map((event) => (
                      <article
                        key={event.id}
                        className={
                          event.id === activeEvidence
                            ? "aw-evidence--selected"
                            : ""
                        }
                      >
                        <strong>{event.type}</strong>
                        <time>{formatDate(event.timestamp)}</time>
                        <span>
                          {event.outcome || event.status || "Recorded"}
                        </span>
                        <code>{event.id}</code>
                      </article>
                    ))}
                  </section>
                </>
              )}
            </div>
          </div>
          <p className="aw-scope">
            {list.scope} Manual work items remain in Fulfillment.
            {onNavigate && (
              <button
                className="cp-button cp-button--quiet"
                onClick={() => onNavigate("fulfillment")}
              >
                Open manual fulfillment
              </button>
            )}
          </p>
        </>
      )}
    </div>
  );
}
