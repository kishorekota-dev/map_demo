import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import controlApi, { ControlPlaneError } from "@/services/controlPlaneService";
import type {
  ChannelId,
  ControlPlaneState,
  ModelProfile,
  RoutingDecision,
  ServicingConfig,
  ServicingIntent,
  WorkStatus,
} from "@/types/controlPlane";
import "./ControlPlanePage.css";
import OperationsConsole from "@/components/control-plane/OperationsConsole";
import DesignStudioConsole from "@/components/control-plane/DesignStudioConsole";
import { JsonEvidence } from "@/components/control-plane/ConsoleElements";
import RecognitionEditor from "@/components/control-plane/RecognitionEditor";
import IntentContractEditor from "@/components/control-plane/IntentContractEditor";
import ReleaseDiff from "@/components/control-plane/ReleaseDiff";
import ModelProviderConsole from "@/components/control-plane/ModelProviderConsole";

type Section =
  | "overview"
  | "channels"
  | "intents"
  | "models"
  | "journeys"
  | "fulfillment"
  | "releases"
  | "connections"
  | "evaluations"
  | "knowledge"
  | "traces"
  | "environments"
  | "operations";
const sections: Array<{ id: Section; label: string; detail: string }> = [
  { id: "overview", label: "Overview", detail: "Service readiness" },
  { id: "channels", label: "Channels", detail: "Digital · AVA · IVR" },
  { id: "intents", label: "Intents & prompts", detail: "Conversation design" },
  {
    id: "models",
    label: "Models & providers",
    detail: "Model routing and readiness",
  },
  {
    id: "journeys",
    label: "Journeys & queues",
    detail: "Routing and fulfillment",
  },
  {
    id: "fulfillment",
    label: "Fulfillment",
    detail: "Work and service levels",
  },
  {
    id: "releases",
    label: "Releases & audit",
    detail: "Governance and history",
  },
  {
    id: "connections",
    label: "Connections",
    detail: "Provider-neutral adapters",
  },
  {
    id: "evaluations",
    label: "Tests & evaluations",
    detail: "Conversation quality gates",
  },
  { id: "knowledge", label: "Knowledge", detail: "Sources and access" },
  {
    id: "traces",
    label: "Execution traces",
    detail: "Cases and runtime evidence",
  },
  {
    id: "environments",
    label: "Environments & approvals",
    detail: "Governed promotion",
  },
  {
    id: "operations",
    label: "Identity & operations",
    detail: "Enterprise administration",
  },
];
const statusLabels: Record<WorkStatus, string> = {
  queued: "Queued",
  in_progress: "In progress",
  waiting: "Waiting",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};
const transitions: Record<WorkStatus, WorkStatus[]> = {
  queued: ["in_progress", "cancelled"],
  in_progress: ["waiting", "completed", "failed", "cancelled"],
  waiting: ["in_progress", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};
const decisionReasons: Record<string, string> = {
  automated: "This intent will follow the automated servicing workflow.",
  channel_disabled: "This channel is disabled in the selected configuration.",
  intent_disabled: "This intent is disabled in the selected configuration.",
  journey_disabled: "The matching servicing journey is disabled.",
  channel_requires_human:
    "The channel routes requests to its human fulfillment queue.",
  journey_requires_human: "The matching journey requires human fulfillment.",
  fulfillment_disabled:
    "Automated fulfillment is disabled because this intent has no tools enabled.",
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const lines = (value: string): string[] =>
  value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
const date = (value?: string) =>
  value ? new Date(value).toLocaleString() : "—";
const pretty = (value: unknown) => JSON.stringify(value, null, 2);

function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={`cp-field${wide ? " cp-field--wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id?: string;
              "aria-describedby"?: string;
            }>,
            { id, "aria-describedby": hint ? `${id}-hint` : undefined },
          )
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}

function ArrayField({
  label,
  value,
  onChange,
  hint,
  rows = 3,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
  rows?: number;
}) {
  // Keep trailing line breaks while editing so entries can be typed naturally.
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => {
    setText(value.join("\n"));
  }, [value]);
  return (
    <Field label={label} hint={hint || "One value per line."}>
      <textarea
        rows={rows}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onChange(lines(text))}
      />
    </Field>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  return <span className={`cp-badge cp-badge--${tone}`}>{children}</span>;
}

function IntentEditor({
  intent,
  onChange,
  queuesHint,
  profiles,
}: {
  intent: ServicingIntent;
  onChange: (patch: Partial<ServicingIntent>) => void;
  queuesHint: string;
  profiles: ModelProfile[];
}) {
  return (
    <>
      <div className="cp-panel-heading">
        <div>
          <span className="cp-eyebrow">Intent configuration</span>
          <h3>{intent.name}</h3>
          <code>{intent.id}</code>
        </div>
        <label className="cp-check">
          <input
            type="checkbox"
            checked={intent.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          Enabled
        </label>
      </div>
      <div className="cp-form-grid">
        <Field label="Display name">
          <input
            value={intent.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field>
        <Field label="Description">
          <input
            value={intent.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </Field>
        <ArrayField
          label="Recognition phrases"
          value={intent.patterns}
          onChange={(patterns) => onChange({ patterns })}
          hint="Literal phrases, one per line. No executable code or regular expressions."
          rows={5}
        />
        <ArrayField
          label="Tool mappings"
          value={intent.tools}
          onChange={(tools) => onChange({ tools })}
          hint={queuesHint}
          rows={5}
        />
        <ArrayField
          label="Required entities"
          value={intent.requiredData}
          onChange={(requiredData) => onChange({ requiredData })}
          hint="Required collection fields. Tool contract requirements are validated on save."
        />
        <ArrayField
          label="Optional entities"
          value={intent.optionalData}
          onChange={(optionalData) => onChange({ optionalData })}
        />
        <label className="cp-check cp-field--wide">
          <input
            type="checkbox"
            checked={intent.needsConfirmation}
            onChange={(e) => onChange({ needsConfirmation: e.target.checked })}
          />
          Ask for confirmation before fulfillment
        </label>
        <Field
          label="Generation model profile"
          wide
          hint="Optional override for this intent’s generated responses. Extraction and recognition follow the shared model routes. Model-assisted servicing must be enabled in the published configuration."
        >
          <select
            value={intent.llmProfileId || ""}
            onChange={(event) =>
              onChange({ llmProfileId: event.target.value || undefined })
            }
          >
            <option value="">Use the shared generation profile</option>
            {intent.llmProfileId &&
              !profiles.some(
                (profile) => profile.id === intent.llmProfileId,
              ) && (
                <option value={intent.llmProfileId}>
                  {intent.llmProfileId} · Missing profile
                </option>
              )}
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name || profile.id}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="System prompt"
          wide
          hint="Sets the assistant's instructions for this intent. Existing tool authorization and transaction confirmation remain enforced."
        >
          <textarea
            className="cp-prompt"
            rows={12}
            value={intent.systemPrompt}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
            spellCheck={false}
          />
        </Field>
        <Field
          label="User prompt template"
          wide
          hint="Supported placeholders: {{question}}, {{userId}}, {{context}}. Prompts apply where the existing workflow uses model generation; authoritative tool responses stay deterministic."
        >
          <textarea
            className="cp-prompt"
            rows={6}
            value={intent.userPromptTemplate}
            onChange={(e) => onChange({ userPromptTemplate: e.target.value })}
            spellCheck={false}
          />
        </Field>
        <IntentContractEditor intent={intent} onChange={onChange} />
      </div>
    </>
  );
}

export default function ControlPlanePage() {
  const [state, setState] = useState<ControlPlaneState | null>(null);
  const [draft, setDraft] = useState<ServicingConfig | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState(0);
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState<{
    valid: boolean;
    errors: string[];
  } | null>(null);
  const [search, setSearch] = useState("");
  const [intentId, setIntentId] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [rollbackVersion, setRollbackVersion] = useState("");
  const [rawConfig, setRawConfig] = useState("");
  const [rawEdited, setRawEdited] = useState(false);
  const [simChannel, setSimChannel] = useState<ChannelId>("digital");
  const [simIntent, setSimIntent] = useState("balance_inquiry");
  const [simUtterance, setSimUtterance] = useState("");
  const [customIntentId, setCustomIntentId] = useState("");
  const [customIntentName, setCustomIntentName] = useState("");
  const [customIntentBase, setCustomIntentBase] = useState("service_request");
  const [simSource, setSimSource] = useState<"draft" | "published">("draft");
  const [decision, setDecision] = useState<RoutingDecision | null>(null);
  const [workFilter, setWorkFilter] = useState("open");
  const [selectedWork, setSelectedWork] = useState("");
  const [workStatus, setWorkStatus] = useState<WorkStatus>("in_progress");
  const [workAssignee, setWorkAssignee] = useState("");
  const [workNote, setWorkNote] = useState("");
  const [newWork, setNewWork] = useState({
    journeyId: "",
    channel: "digital" as ChannelId,
    reference: "",
    summary: "",
    idempotencyKey: crypto.randomUUID(),
  });

  const dirty = Boolean(
    state && draft && JSON.stringify(state.draft) !== JSON.stringify(draft),
  );
  const unpublished = Boolean(
    state &&
      draft &&
      JSON.stringify(state.published.config) !== JSON.stringify(draft),
  );
  const editable = Boolean(state?.permissions.canEdit && !busy);
  const selectedIntent =
    draft?.intents.find((intent) => intent.id === intentId) ||
    draft?.intents[0];
  const filteredIntents = useMemo(
    () =>
      draft?.intents.filter((intent) =>
        `${intent.id} ${intent.name} ${intent.description}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ) || [],
    [draft, search],
  );
  const activeWork = state?.workItems.find((item) => item.id === selectedWork);
  const changes = useMemo(() => {
    if (!state || !draft) return [];
    const result: string[] = [];
    (["channels", "intents", "journeys", "queues"] as const).forEach(
      (group) => {
        const before = state.published.config[group];
        draft[group].forEach((entry) => {
          const original = before.find(
            (candidate) => candidate.id === entry.id,
          );
          if (JSON.stringify(original) !== JSON.stringify(entry))
            result.push(`${group}: ${entry.name || entry.id}`);
        });
        before
          .filter(
            (entry) =>
              !draft[group].some((candidate) => candidate.id === entry.id),
          )
          .forEach((entry) => result.push(`Removed ${group}: ${entry.id}`));
      },
    );
    if (
      state.published.config.prompts?.extractionSystem !==
      draft.prompts?.extractionSystem
    )
      result.push("Shared prompt: entity extraction system");
    if (
      state.published.config.prompts?.extractionInstructions !==
      draft.prompts?.extractionInstructions
    )
      result.push("Shared prompt: entity extraction instructions");
    for (const field of [
      "clarificationText",
      "handoffText",
      "unavailableText",
      "dataCollectionText",
    ] as const) {
      if (state.published.config.prompts?.[field] !== draft.prompts?.[field])
        result.push(`Customer response: ${field}`);
    }
    if (
      JSON.stringify(state.published.config.recognition) !==
      JSON.stringify(draft.recognition)
    )
      result.push("Recognition policy");
    if (
      state.published.config.prompts?.recognitionSystem !==
      draft.prompts?.recognitionSystem
    )
      result.push("Shared prompt: intent recognition");
    if (
      JSON.stringify(state.published.config.llm) !== JSON.stringify(draft.llm)
    )
      result.push("Model profiles and task routing");
    return result;
  }, [state, draft]);

  const acceptState = (next: ControlPlaneState) => {
    setState(next);
    setDraft(clone(next.draft));
    setRawConfig(pretty(next.draft));
    setRawEdited(false);
    setValidation(null);
    setDecision(null);
  };
  const showError = (value: unknown) => {
    const failure =
      value instanceof Error
        ? value
        : new Error("The request could not be completed.");
    setError(
      failure.message +
        (failure instanceof ControlPlaneError && failure.details.length
          ? ` ${failure.details.join(" ")}`
          : ""),
    );
    setErrorStatus(failure instanceof ControlPlaneError ? failure.status : 0);
  };
  const refresh = async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      acceptState(await controlApi.state());
    } catch (failure) {
      showError(failure);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!dirty && !rawEdited) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, rawEdited]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setErrorStatus(0);
    setNotice("");
    try {
      await action();
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  };
  const mutateDraft = (next: ServicingConfig) => {
    setDraft(next);
    setValidation(null);
    setDecision(null);
    if (!rawEdited) setRawConfig(pretty(next));
  };
  const changeIntent = (patch: Partial<ServicingIntent>) => {
    if (draft && selectedIntent)
      mutateDraft({
        ...draft,
        intents: draft.intents.map((intent) =>
          intent.id === selectedIntent.id ? { ...intent, ...patch } : intent,
        ),
      });
  };
  const save = () =>
    run(async () => {
      if (!state || !draft) return;
      acceptState(await controlApi.saveDraft(state.revision, draft));
      setNotice(
        "Draft saved. Publish a release to apply these changes to servicing.",
      );
    });

  if (loading && !state)
    return (
      <div className="cp-loading" role="status">
        <span className="cp-loading-dot" />
        Loading servicing workspace…
      </div>
    );
  if (!state || !draft)
    return (
      <section className="cp-access">
        <span className="cp-eyebrow">Servicing control plane</span>
        <h1>
          {errorStatus === 403
            ? "Operator access required"
            : "Workspace unavailable"}
        </h1>
        <p>{error || "Could not load configuration."}</p>
        {errorStatus === 403 && (
          <p>
            Your signed account role must allow control-plane access. Customer
            access does not grant administration permissions.
          </p>
        )}
        <div className="cp-actions">
          <button className="cp-button" onClick={() => void refresh()}>
            Try again
          </button>
          <Link to="/chat">Return to chat</Link>
        </div>
      </section>
    );

  const openWork = state.workItems.filter(
    (item) => !["completed", "failed", "cancelled"].includes(item.status),
  );
  const overdue = openWork.filter(
    (item) => item.dueAt && new Date(item.dueAt).getTime() < Date.now(),
  );
  const visibleWork = state.workItems.filter(
    (item) =>
      workFilter === "all" ||
      (workFilter === "open"
        ? !["completed", "failed", "cancelled"].includes(item.status)
        : item.status === workFilter),
  );
  const currentSection = sections.find((entry) => entry.id === section)!;

  return (
    <div className="cp-shell">
      <aside className="cp-sidebar">
        <div className="cp-workspace">
          <span className="cp-workspace-mark" aria-hidden="true">
            S
          </span>
          <div>
            <strong>Servicing studio</strong>
            <small>Control plane</small>
          </div>
        </div>
        <div className="cp-tenant">
          <span className="cp-eyebrow">Workspace</span>
          <strong>{state.tenant.name}</strong>
          <small>{state.tenant.id}</small>
        </div>
        <nav aria-label="Control plane sections">
          {sections.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              className={
                section === entry.id
                  ? "cp-nav-item cp-nav-item--active"
                  : "cp-nav-item"
              }
              aria-current={section === entry.id ? "page" : undefined}
              onClick={() => setSection(entry.id)}
            >
              <span className="cp-nav-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{entry.label}</strong>
                <small>{entry.detail}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="cp-sidebar-footer">
          <span className="cp-live-dot" />
          Published release <strong>v{state.published.version}</strong>
          <small>One servicing policy across your channels.</small>
        </div>
      </aside>

      <div className="cp-content">
        <header className="cp-page-header">
          <div>
            <span className="cp-eyebrow">
              Customer servicing / {currentSection.detail}
            </span>
            <h1>{currentSection.label}</h1>
            <p>
              Design the experience. Govern the release. Follow through on
              fulfillment.
            </p>
          </div>
          <button
            className="cp-button cp-button--quiet"
            disabled={busy || loading}
            onClick={() => void refresh()}
          >
            {dirty || rawEdited ? "Discard edits & reload" : "Refresh"}
          </button>
        </header>

        <div className="cp-release-bar">
          <div>
            <Badge tone={dirty || rawEdited ? "amber" : "green"}>
              {dirty || rawEdited ? "Unsaved changes" : "Draft saved"}
            </Badge>
            <span>Draft revision {state.revision}</span>
            <span className="cp-release-divider" />
            <span>Live v{state.published.version}</span>
            {unpublished && (
              <span className="cp-muted">Changes awaiting publication</span>
            )}
          </div>
          <div className="cp-actions">
            <button
              className="cp-button cp-button--quiet"
              disabled={busy || rawEdited}
              onClick={() =>
                void run(async () => {
                  setValidation(await controlApi.validate(draft));
                })
              }
            >
              Validate draft
            </button>
            <button
              className="cp-button"
              disabled={!editable || !dirty || rawEdited}
              onClick={() => void save()}
            >
              {busy ? "Working…" : "Save draft"}
            </button>
          </div>
        </div>

        {error && (
          <div className="cp-alert cp-alert--error" role="alert">
            <strong>
              {errorStatus === 409
                ? "The workspace changed while you were editing."
                : "Unable to complete the action."}
            </strong>
            <span>{error}</span>
            {errorStatus === 409 && (
              <span>
                Your edits are preserved. Copy the draft JSON below before
                reloading to reconcile with the latest revision.
              </span>
            )}
          </div>
        )}
        {state.capabilities?.runtimeEnforcementEnabled === false && (
          <div className="cp-alert cp-alert--pending" role="status">
            <strong>
              Runtime enforcement is not enabled for this deployment.
            </strong>
            <span>
              You can design and publish configuration here. Enable the
              control-plane runtime connection in the deployment before these
              releases affect customer servicing.
            </span>
          </div>
        )}
        {notice && (
          <div className="cp-alert cp-alert--success" role="status">
            {notice}
          </div>
        )}
        {validation && (
          <div
            className={`cp-alert ${validation.valid ? "cp-alert--success" : "cp-alert--error"}`}
            role="status"
          >
            <strong>
              {validation.valid
                ? "Draft validation passed."
                : "Resolve these configuration issues before saving or publishing."}
            </strong>
            {validation.errors.length > 0 && (
              <ul>
                {validation.errors.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {section === "overview" && (
          <>
            <section className="cp-hero">
              <div>
                <span className="cp-eyebrow">
                  A connected servicing experience
                </span>
                <h2>
                  Every conversation.
                  <br />
                  One operating model.
                </h2>
                <p>
                  Configure channels, shape individual intents and prompts, and
                  manage the work that turns a conversation into a completed
                  service.
                </p>
                <button
                  className="cp-button cp-button--light"
                  onClick={() => setSection("intents")}
                >
                  Open conversation design <span aria-hidden="true">↗</span>
                </button>
              </div>
              <div className="cp-flow" aria-label="Servicing architecture">
                <div>
                  Digital <span>AVA</span> IVR
                </div>
                <span className="cp-flow-line" />
                <strong>Intent + channel policy</strong>
                <span className="cp-flow-line" />
                <div>
                  AI workflow <span>Human queue</span>
                </div>
                <span className="cp-flow-line" />
                <strong>Fulfillment + audit</strong>
              </div>
            </section>
            <div className="cp-stat-grid">
              <article>
                <span>Published channels</span>
                <strong>
                  {
                    state.published.config.channels.filter(
                      (channel) => channel.enabled,
                    ).length
                  }
                  <small> / 3</small>
                </strong>
                <p>Policy enabled</p>
              </article>
              <article>
                <span>Intent catalog</span>
                <strong>{draft.intents.length}</strong>
                <p>
                  {draft.intents.filter((intent) => intent.enabled).length}{" "}
                  enabled in draft
                </p>
              </article>
              <article>
                <span>Open fulfillment</span>
                <strong>{openWork.length}</strong>
                <p>{overdue.length} beyond service target</p>
              </article>
              <article>
                <span>Release changes</span>
                <strong>{changes.length}</strong>
                <p>Entries changed since publication</p>
              </article>
            </div>
            <div className="cp-two-column">
              <section className="cp-panel">
                <div className="cp-panel-heading">
                  <h3>Channel readiness</h3>
                  <button
                    className="cp-link"
                    onClick={() => setSection("channels")}
                  >
                    Configure →
                  </button>
                </div>
                {state.published.config.channels.map((channel) => (
                  <div className="cp-list-row" key={channel.id}>
                    <div>
                      <strong>{channel.name}</strong>
                      <small>
                        {channel.id === "ivr"
                          ? "Telephony adapter required"
                          : channel.id === "ava"
                            ? "Virtual assistant policy"
                            : "Existing digital chat"}
                      </small>
                    </div>
                    <Badge tone={channel.enabled ? "green" : "neutral"}>
                      {channel.enabled ? "Policy enabled" : "Disabled"}
                    </Badge>
                  </div>
                ))}
                <p className="cp-footnote">
                  Channel settings control routing. Enabling IVR does not
                  connect a phone provider, speech service, or webhook.
                </p>
              </section>
              <section className="cp-panel">
                <div className="cp-panel-heading">
                  <h3>Release governance</h3>
                  <Badge>v{state.published.version}</Badge>
                </div>
                <p>
                  All prompt, intent, channel, and journey changes are saved as
                  a draft. Publication creates an immutable release for the
                  runtime.
                </p>
                <dl className="cp-details">
                  <dt>Published</dt>
                  <dd>{date(state.published.publishedAt)}</dd>
                  <dt>Published by</dt>
                  <dd>{state.published.publishedBy || "System"}</dd>
                  <dt>Your access</dt>
                  <dd>
                    {state.permissions.canPublish
                      ? "Administrator"
                      : state.permissions.canEdit
                        ? "Editor"
                        : state.permissions.canOperate
                          ? "Operator"
                          : "Viewer"}
                  </dd>
                </dl>
                <button
                  className="cp-button cp-button--quiet"
                  onClick={() => setSection("releases")}
                >
                  Review changes & releases
                </button>
              </section>
            </div>
          </>
        )}

        {section === "channels" && (
          <>
            <div className="cp-section-intro">
              <h2>Meet customers where they are</h2>
              <p>
                Set the servicing mode, fallback queue, and response budget for
                each channel. These settings take effect after publication.
              </p>
            </div>
            <fieldset
              disabled={!editable}
              className="cp-fieldset cp-channel-grid"
            >
              {draft.channels.map((channel) => (
                <section className="cp-panel cp-channel" key={channel.id}>
                  <div className="cp-panel-heading">
                    <span className="cp-channel-symbol" aria-hidden="true">
                      {channel.id === "digital"
                        ? "◈"
                        : channel.id === "ava"
                          ? "✳"
                          : "≋"}
                    </span>
                    <label className="cp-check">
                      <input
                        type="checkbox"
                        checked={channel.enabled}
                        onChange={(e) =>
                          mutateDraft({
                            ...draft,
                            channels: draft.channels.map((entry) =>
                              entry.id === channel.id
                                ? { ...entry, enabled: e.target.checked }
                                : entry,
                            ),
                          })
                        }
                      />
                      Enabled
                    </label>
                  </div>
                  <h3>{channel.name}</h3>
                  <p>
                    {channel.id === "ivr"
                      ? "Voice and telephony servicing policy."
                      : channel.id === "ava"
                        ? "Automated virtual assistant servicing."
                        : "Web and digital conversation servicing."}
                  </p>
                  <div className="cp-form-grid cp-form-grid--single">
                    <Field label="Display name">
                      <input
                        value={channel.name}
                        onChange={(e) =>
                          mutateDraft({
                            ...draft,
                            channels: draft.channels.map((entry) =>
                              entry.id === channel.id
                                ? { ...entry, name: e.target.value }
                                : entry,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Servicing mode">
                      <select
                        value={channel.mode}
                        onChange={(e) =>
                          mutateDraft({
                            ...draft,
                            channels: draft.channels.map((entry) =>
                              entry.id === channel.id
                                ? {
                                    ...entry,
                                    mode: e.target.value as
                                      | "automated"
                                      | "human",
                                  }
                                : entry,
                            ),
                          })
                        }
                      >
                        <option value="automated">Automated workflow</option>
                        <option value="human">Human fulfillment</option>
                      </select>
                    </Field>
                    <Field label="Fallback queue">
                      <select
                        value={channel.queue}
                        onChange={(e) =>
                          mutateDraft({
                            ...draft,
                            channels: draft.channels.map((entry) =>
                              entry.id === channel.id
                                ? { ...entry, queue: e.target.value }
                                : entry,
                            ),
                          })
                        }
                      >
                        {draft.queues.map((queue) => (
                          <option key={queue.id} value={queue.id}>
                            {queue.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label="Adapter response budget (seconds)"
                      hint="Published for channel adapters. Does not cancel an existing workflow."
                    >
                      <input
                        type="number"
                        min="5"
                        max="120"
                        value={channel.timeoutSeconds}
                        onChange={(e) =>
                          mutateDraft({
                            ...draft,
                            channels: draft.channels.map((entry) =>
                              entry.id === channel.id
                                ? {
                                    ...entry,
                                    timeoutSeconds: Number(e.target.value),
                                  }
                                : entry,
                            ),
                          })
                        }
                      />
                    </Field>
                  </div>
                  {channel.id === "ivr" && (
                    <div className="cp-inline-note">
                      Provider integration required for live calls.
                    </div>
                  )}
                </section>
              ))}
            </fieldset>
          </>
        )}

        {section === "models" && (
          <ModelProviderConsole
            config={draft}
            published={state.published.config}
            onChange={mutateDraft}
            editable={editable}
          />
        )}

        {section === "intents" && (
          <>
            <div className="cp-section-intro">
              <h2>Fine-tune every conversation</h2>
              <p>
                Every configured intent has its own recognition phrases, entity
                requirements, tools, and prompts. Select an intent to edit its
                complete configuration.
              </p>
            </div>
            <details className="cp-panel cp-shared-prompts">
              <summary>Create a custom servicing intent</summary>
              <p>
                Build a custom intent from an established banking recipe, a
                service request, or knowledge retrieval. Existing tool and
                confirmation contracts remain enforced.
              </p>
              <fieldset className="cp-fieldset" disabled={!editable}>
                <div className="cp-form-grid">
                  <Field label="New intent ID">
                    <input
                      value={customIntentId}
                      onChange={(e) => setCustomIntentId(e.target.value)}
                      placeholder="update_contact_details"
                    />
                  </Field>
                  <Field label="New intent name">
                    <input
                      value={customIntentName}
                      onChange={(e) => setCustomIntentName(e.target.value)}
                      placeholder="Update contact details"
                    />
                  </Field>
                  <Field label="Base recipe">
                    <select
                      value={customIntentBase}
                      onChange={(e) => setCustomIntentBase(e.target.value)}
                    >
                      <option value="service_request">Service request</option>
                      <option value="knowledge_search">
                        Knowledge retrieval
                      </option>
                      {draft.intents
                        .filter((entry) => !entry.baseIntent)
                        .map((entry) => (
                          <option value={entry.id} key={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>
                <button
                  className="cp-button cp-add"
                  disabled={
                    !/^[a-z][a-z0-9_]{0,63}$/.test(customIntentId) ||
                    !customIntentName.trim() ||
                    draft.intents.some((entry) => entry.id === customIntentId)
                  }
                  onClick={() => {
                    const base = draft.intents.find(
                      (entry) => entry.id === customIntentBase,
                    );
                    const intent: ServicingIntent = {
                      id: customIntentId,
                      baseIntent: customIntentBase,
                      name: customIntentName.trim(),
                      description: `Customer servicing: ${customIntentName.trim()}`,
                      enabled: true,
                      patterns: [],
                      requiredData: [...(base?.requiredData || [])],
                      optionalData: [...(base?.optionalData || [])],
                      tools: [...(base?.tools || [])],
                      needsConfirmation: base?.needsConfirmation || false,
                      systemPrompt:
                        base?.systemPrompt ||
                        "Assist the customer with this servicing request using the approved workflow and authoritative knowledge. Ask for missing information before proceeding.",
                      userPromptTemplate:
                        base?.userPromptTemplate ||
                        "User question: {{question}}\nUser ID: {{userId}}\nContext: {{context}}",
                    };
                    mutateDraft({
                      ...draft,
                      intents: [...draft.intents, intent],
                    });
                    setIntentId(intent.id);
                    setCustomIntentId("");
                    setCustomIntentName("");
                  }}
                >
                  Add to draft catalog
                </button>
              </fieldset>
            </details>
            <RecognitionEditor
              config={draft}
              onChange={mutateDraft}
              disabled={!editable}
            />
            <details className="cp-panel cp-shared-prompts">
              <summary>Shared prompts · Extraction & recognition</summary>
              <p>
                Configure the system instructions and extraction guidance used
                by the shared data extractor and model-based recognizer across
                intents. Required JSON schemas and safety constraints remain
                enforced by the runtime.
              </p>
              <fieldset className="cp-fieldset" disabled={!editable}>
                <div className="cp-form-grid">
                  <Field
                    label="Entity extraction system prompt"
                    hint="Shared instructions for structured entity extraction."
                  >
                    <textarea
                      className="cp-prompt"
                      rows={10}
                      maxLength={16000}
                      value={draft.prompts?.extractionSystem || ""}
                      onChange={(e) =>
                        mutateDraft({
                          ...draft,
                          prompts: {
                            ...draft.prompts,
                            extractionSystem: e.target.value,
                          },
                        })
                      }
                      spellCheck={false}
                    />
                  </Field>
                  <Field
                    label="Entity extraction instructions"
                    hint="Guidance for identifying values and handling incomplete information."
                  >
                    <textarea
                      className="cp-prompt"
                      rows={10}
                      maxLength={16000}
                      value={draft.prompts?.extractionInstructions || ""}
                      onChange={(e) =>
                        mutateDraft({
                          ...draft,
                          prompts: {
                            ...draft.prompts,
                            extractionInstructions: e.target.value,
                          },
                        })
                      }
                      spellCheck={false}
                    />
                  </Field>
                  <Field
                    label="Intent recognition system prompt"
                    wide
                    hint="Optional instructions for model-based recognition. Leave blank for the runtime default; the approved intent catalog and output schema remain enforced."
                  >
                    <textarea
                      className="cp-prompt"
                      rows={8}
                      maxLength={16000}
                      value={draft.prompts?.recognitionSystem || ""}
                      onChange={(event) =>
                        mutateDraft({
                          ...draft,
                          prompts: {
                            ...draft.prompts,
                            recognitionSystem: event.target.value || undefined,
                          },
                        })
                      }
                      spellCheck={false}
                    />
                  </Field>
                </div>
              </fieldset>
            </details>
            <details className="cp-panel cp-shared-prompts">
              <summary>
                Customer response wording · Clarification, handoff & collection
              </summary>
              <p>
                Customize plain-text customer messages used by the servicing
                runtime. Leave a field empty to use its established default.
              </p>
              <fieldset className="cp-fieldset" disabled={!editable}>
                <div className="cp-form-grid">
                  {(
                    [
                      ["clarificationText", "Clarification message"],
                      ["handoffText", "Human handoff message"],
                      ["unavailableText", "Unavailable service message"],
                      ["dataCollectionText", "Data collection introduction"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <textarea
                        rows={4}
                        maxLength={2000}
                        value={draft.prompts[key] || ""}
                        onChange={(e) =>
                          mutateDraft({
                            ...draft,
                            prompts: {
                              ...draft.prompts,
                              [key]: e.target.value || undefined,
                            },
                          })
                        }
                        placeholder="Use the established message"
                      />
                    </Field>
                  ))}
                </div>
              </fieldset>
            </details>
            <div className="cp-intent-layout">
              <aside className="cp-intent-catalog">
                <label className="cp-search">
                  <span className="sr-only">Search intents</span>
                  <input
                    type="search"
                    placeholder="Search intents…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className="cp-catalog-count">
                  {filteredIntents.length} of {draft.intents.length} intents
                </div>
                <div className="cp-intent-list">
                  {filteredIntents.map((intent) => (
                    <button
                      key={intent.id}
                      className={
                        selectedIntent?.id === intent.id
                          ? "cp-intent-item cp-intent-item--selected"
                          : "cp-intent-item"
                      }
                      onClick={() => setIntentId(intent.id)}
                      aria-pressed={selectedIntent?.id === intent.id}
                    >
                      <span
                        className={`cp-intent-dot${intent.enabled ? " cp-intent-dot--enabled" : ""}`}
                      />
                      <span>
                        <strong>{intent.name}</strong>
                        <small>{intent.id}</small>
                      </span>
                    </button>
                  ))}
                  {!filteredIntents.length && (
                    <p className="cp-empty">No matching intents.</p>
                  )}
                </div>
              </aside>
              <section className="cp-panel cp-intent-editor">
                <fieldset className="cp-fieldset" disabled={!editable}>
                  {selectedIntent ? (
                    <IntentEditor
                      key={selectedIntent.id}
                      intent={selectedIntent}
                      onChange={changeIntent}
                      profiles={draft.llm?.profiles || []}
                      queuesHint={`Supported tools: ${state.capabilities?.intentCatalog?.find((entry) => entry.id === selectedIntent.id)?.allowedTools.join(", ") || "No tools for this intent"}. Tool contract safeguards remain enforced.`}
                    />
                  ) : (
                    <p>No intents are configured.</p>
                  )}
                </fieldset>
              </section>
            </div>
          </>
        )}

        {section === "journeys" && (
          <>
            <div className="cp-section-intro">
              <h2>Connect intent to fulfillment</h2>
              <p>
                Group intents into service journeys, choose where they are
                available, and define the responsible queue and service target.
              </p>
            </div>
            <fieldset className="cp-fieldset" disabled={!editable}>
              <div className="cp-journeys">
                {draft.journeys.map((journey, index) => {
                  const update = (patch: Partial<typeof journey>) =>
                    mutateDraft({
                      ...draft,
                      journeys: draft.journeys.map((entry, at) =>
                        at === index ? { ...entry, ...patch } : entry,
                      ),
                    });
                  return (
                    <section className="cp-panel" key={index}>
                      <div className="cp-panel-heading">
                        <h3>{journey.name || "New journey"}</h3>
                        <div className="cp-actions">
                          <label className="cp-check">
                            <input
                              type="checkbox"
                              checked={journey.enabled}
                              onChange={(e) =>
                                update({ enabled: e.target.checked })
                              }
                            />
                            Enabled
                          </label>
                          <button
                            className="cp-link cp-link--danger"
                            onClick={() =>
                              mutateDraft({
                                ...draft,
                                journeys: draft.journeys.filter(
                                  (_, at) => at !== index,
                                ),
                              })
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="cp-form-grid">
                        <Field label="Journey ID">
                          <input
                            value={journey.id}
                            onChange={(e) => update({ id: e.target.value })}
                          />
                        </Field>
                        <Field label="Name">
                          <input
                            value={journey.name}
                            onChange={(e) => update({ name: e.target.value })}
                          />
                        </Field>
                        <ArrayField
                          label="Included intents"
                          value={journey.intents}
                          onChange={(intents) => update({ intents })}
                          hint="Canonical intent IDs, one per line."
                        />
                        <div className="cp-field">
                          <span>Available channels</span>
                          <div className="cp-choice-group">
                            {draft.channels.map((channel) => (
                              <label className="cp-check" key={channel.id}>
                                <input
                                  type="checkbox"
                                  checked={journey.channels.includes(
                                    channel.id,
                                  )}
                                  onChange={(e) =>
                                    update({
                                      channels: e.target.checked
                                        ? [...journey.channels, channel.id]
                                        : journey.channels.filter(
                                            (id) => id !== channel.id,
                                          ),
                                    })
                                  }
                                />
                                {channel.name}
                              </label>
                            ))}
                          </div>
                        </div>
                        <Field label="Fulfillment mode">
                          <select
                            value={journey.fulfillment}
                            onChange={(e) =>
                              update({
                                fulfillment: e.target.value as
                                  | "automated"
                                  | "human",
                              })
                            }
                          >
                            <option value="automated">
                              Automated workflow
                            </option>
                            <option value="human">Human fulfillment</option>
                          </select>
                        </Field>
                        <Field label="Responsible queue">
                          <select
                            value={journey.queue}
                            onChange={(e) => update({ queue: e.target.value })}
                          >
                            {draft.queues.map((queue) => (
                              <option key={queue.id} value={queue.id}>
                                {queue.name}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Service target (minutes)">
                          <input
                            type="number"
                            min="1"
                            value={journey.slaMinutes}
                            onChange={(e) =>
                              update({ slaMinutes: Number(e.target.value) })
                            }
                          />
                        </Field>
                      </div>
                    </section>
                  );
                })}
              </div>
              <button
                className="cp-button cp-button--quiet cp-add"
                onClick={() =>
                  mutateDraft({
                    ...draft,
                    journeys: [
                      ...draft.journeys,
                      {
                        id: "",
                        name: "",
                        enabled: true,
                        intents: [],
                        channels: ["digital"],
                        fulfillment: "human",
                        queue: draft.queues[0]?.id || "",
                        slaMinutes: 60,
                      },
                    ],
                  })
                }
              >
                + Add journey
              </button>
              <section className="cp-panel">
                <div className="cp-panel-heading">
                  <div>
                    <span className="cp-eyebrow">Work ownership</span>
                    <h3>Fulfillment queues</h3>
                  </div>
                  <button
                    className="cp-button cp-button--quiet"
                    onClick={() =>
                      mutateDraft({
                        ...draft,
                        queues: [...draft.queues, { id: "", name: "" }],
                      })
                    }
                  >
                    + Add queue
                  </button>
                </div>
                {draft.queues.map((queue, index) => (
                  <div className="cp-queue-row" key={index}>
                    <Field label="Queue ID">
                      <input
                        value={queue.id}
                        onChange={(e) =>
                          mutateDraft({
                            ...draft,
                            queues: draft.queues.map((entry, at) =>
                              at === index
                                ? { ...entry, id: e.target.value }
                                : entry,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Display name">
                      <input
                        value={queue.name}
                        onChange={(e) =>
                          mutateDraft({
                            ...draft,
                            queues: draft.queues.map((entry, at) =>
                              at === index
                                ? { ...entry, name: e.target.value }
                                : entry,
                            ),
                          })
                        }
                      />
                    </Field>
                    <button
                      className="cp-link cp-link--danger"
                      onClick={() =>
                        mutateDraft({
                          ...draft,
                          queues: draft.queues.filter((_, at) => at !== index),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </section>
            </fieldset>
          </>
        )}

        {(section === "channels" ||
          section === "journeys" ||
          section === "intents") && (
          <section className="cp-panel cp-simulation">
            <div className="cp-panel-heading">
              <div>
                <span className="cp-eyebrow">Routing preview</span>
                <h3>Test a servicing decision</h3>
              </div>
              <Badge>No customer action</Badge>
            </div>
            <p>
              Preview routing against the saved draft or the published release.
              Save local edits before testing the draft.
            </p>
            <Field
              label="Sample customer utterance"
              hint="Enter text to test recognition and routing. Leave blank to test the selected canonical intent."
            >
              <input
                value={simUtterance}
                onChange={(e) => {
                  setSimUtterance(e.target.value);
                  setDecision(null);
                }}
                placeholder="I need to replace my card"
              />
            </Field>
            <div className="cp-sim-form">
              <Field label="Channel">
                <select
                  value={simChannel}
                  onChange={(e) => {
                    setSimChannel(e.target.value as ChannelId);
                    setDecision(null);
                  }}
                >
                  {draft.channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Intent">
                <select
                  value={simIntent}
                  onChange={(e) => {
                    setSimIntent(e.target.value);
                    setDecision(null);
                  }}
                >
                  {draft.intents.map((intent) => (
                    <option key={intent.id} value={intent.id}>
                      {intent.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Configuration">
                <select
                  value={simSource}
                  onChange={(e) => {
                    setSimSource(e.target.value as "draft" | "published");
                    setDecision(null);
                  }}
                >
                  <option value="draft">Saved draft</option>
                  <option value="published">Published release</option>
                </select>
              </Field>
              <button
                className="cp-button"
                disabled={
                  busy || (simSource === "draft" && (dirty || rawEdited))
                }
                onClick={() =>
                  void run(async () =>
                    setDecision(
                      simUtterance.trim()
                        ? await controlApi.previewUtterance(
                            simChannel,
                            simUtterance,
                            simSource,
                          )
                        : await controlApi.simulate(
                            simChannel,
                            simIntent,
                            simSource,
                          ),
                    ),
                  )
                }
              >
                Test routing
              </button>
            </div>
            {decision && (
              <div className="cp-decision" role="status">
                <Badge
                  tone={decision.action === "disabled" ? "amber" : "green"}
                >
                  {decision.action === "automated"
                    ? "Automated workflow"
                    : decision.action === "human"
                      ? "Human fulfillment"
                      : decision.action === "clarify"
                        ? "Clarification needed"
                        : "Service unavailable"}
                </Badge>
                <p>{decisionReasons[decision.reason] || decision.reason}</p>
                {decision.recognition && (
                  <JsonEvidence
                    value={decision.recognition}
                    title="Recognition evidence"
                  />
                )}
                <p className="cp-footnote">
                  This contract simulation does not test model providers or
                  generated answer quality. Use Models & providers for a
                  synthetic connection check.
                </p>
                {decision.configuredModelProfiles &&
                  Object.keys(decision.configuredModelProfiles).length > 0 && (
                    <JsonEvidence
                      title="Configured model routes · Not executed"
                      value={decision.configuredModelProfiles}
                    />
                  )}
                <dl className="cp-details">
                  <dt>Journey</dt>
                  <dd>{decision.journeyId || "Default routing"}</dd>
                  <dt>Queue</dt>
                  <dd>{decision.queue || "—"}</dd>
                  <dt>Service target</dt>
                  <dd>
                    {decision.slaMinutes
                      ? `${decision.slaMinutes} minutes`
                      : "—"}
                  </dd>
                </dl>
              </div>
            )}
          </section>
        )}

        {section === "fulfillment" && (
          <>
            <div className="cp-section-intro">
              <h2>Follow every request through</h2>
              <p>
                Track human fulfillment against the published journey policy.
                Updating a work item records its operational status; it does not
                execute a banking transaction.
              </p>
            </div>
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>
                  Work queue{" "}
                  <span className="cp-count">{visibleWork.length}</span>
                </h3>
                <label className="cp-filter">
                  <span className="sr-only">Filter work items</span>
                  <select
                    value={workFilter}
                    onChange={(e) => setWorkFilter(e.target.value)}
                  >
                    <option value="open">Open work</option>
                    <option value="all">All work</option>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {visibleWork.length ? (
                <div className="cp-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Request</th>
                        <th>Channel / queue</th>
                        <th>Status</th>
                        <th>Service target</th>
                        <th>Owner</th>
                        <th>
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleWork.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.reference}</strong>
                            <small>{item.summary}</small>
                          </td>
                          <td>
                            {item.channel.toUpperCase()}
                            <small>{item.queue}</small>
                          </td>
                          <td>
                            <Badge
                              tone={
                                item.status === "completed"
                                  ? "green"
                                  : item.status === "failed"
                                    ? "red"
                                    : "neutral"
                              }
                            >
                              {statusLabels[item.status]}
                            </Badge>
                          </td>
                          <td>
                            {date(item.dueAt)}
                            {overdue.some((entry) => entry.id === item.id) && (
                              <small className="cp-overdue">Overdue</small>
                            )}
                          </td>
                          <td>{item.assignee || "Unassigned"}</td>
                          <td>
                            <button
                              className="cp-link"
                              onClick={() => {
                                setSelectedWork(item.id);
                                setWorkStatus(
                                  transitions[item.status][0] || item.status,
                                );
                                setWorkAssignee(item.assignee || "");
                                setWorkNote("");
                              }}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="cp-empty cp-empty--large">
                  <span aria-hidden="true">✓</span>
                  <h3>No {workFilter === "open" ? "open " : ""}work items</h3>
                  <p>
                    Service requests will appear here when they are added to
                    fulfillment.
                  </p>
                </div>
              )}
            </section>
            <div className="cp-two-column">
              <section className="cp-panel">
                <div className="cp-panel-heading">
                  <h3>Create a service request</h3>
                  <Badge>Published policy</Badge>
                </div>
                <fieldset
                  className="cp-fieldset"
                  disabled={!state.permissions.canOperate || busy}
                >
                  <div className="cp-form-grid">
                    <Field label="Journey">
                      <select
                        value={newWork.journeyId}
                        onChange={(e) =>
                          setNewWork({ ...newWork, journeyId: e.target.value })
                        }
                      >
                        <option value="">Select a journey</option>
                        {state.published.config.journeys
                          .filter((journey) => journey.enabled)
                          .map((journey) => (
                            <option key={journey.id} value={journey.id}>
                              {journey.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Channel">
                      <select
                        value={newWork.channel}
                        onChange={(e) =>
                          setNewWork({
                            ...newWork,
                            channel: e.target.value as ChannelId,
                          })
                        }
                      >
                        {state.published.config.channels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            {channel.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field
                      label="External reference"
                      wide
                      hint="Use an opaque case or session reference. Avoid account numbers and personal information."
                    >
                      <input
                        value={newWork.reference}
                        onChange={(e) =>
                          setNewWork({ ...newWork, reference: e.target.value })
                        }
                        maxLength={120}
                      />
                    </Field>
                    <Field label="Request summary" wide>
                      <textarea
                        rows={3}
                        value={newWork.summary}
                        onChange={(e) =>
                          setNewWork({ ...newWork, summary: e.target.value })
                        }
                        maxLength={1000}
                      />
                    </Field>
                  </div>
                  <button
                    className="cp-button cp-add"
                    disabled={
                      !newWork.journeyId ||
                      !newWork.reference.trim() ||
                      !newWork.summary.trim() ||
                      dirty ||
                      rawEdited
                    }
                    onClick={() =>
                      void run(async () => {
                        acceptState(
                          await controlApi.createWorkItem({
                            ...newWork,
                            revision: state.revision,
                          }),
                        );
                        setNewWork({
                          journeyId: "",
                          channel: "digital",
                          reference: "",
                          summary: "",
                          idempotencyKey: crypto.randomUUID(),
                        });
                        setNotice("Service request created.");
                      })
                    }
                  >
                    Create request
                  </button>
                  {(dirty || rawEdited) && (
                    <p className="cp-footnote">
                      Save or discard configuration edits before changing work
                      items.
                    </p>
                  )}
                </fieldset>
              </section>
              <section className="cp-panel">
                <div className="cp-panel-heading">
                  <h3>Work item details</h3>
                  {activeWork && (
                    <Badge>{statusLabels[activeWork.status]}</Badge>
                  )}
                </div>
                {activeWork ? (
                  <>
                    <p>
                      <strong>{activeWork.reference}</strong>
                      <br />
                      {activeWork.summary}
                    </p>
                    <dl className="cp-details">
                      <dt>Request ID</dt>
                      <dd>
                        <code>{activeWork.id}</code>
                      </dd>
                      <dt>Journey</dt>
                      <dd>{activeWork.journeyId}</dd>
                      <dt>Created</dt>
                      <dd>{date(activeWork.createdAt)}</dd>
                      <dt>Updated</dt>
                      <dd>{date(activeWork.updatedAt)}</dd>
                      <dt>Release</dt>
                      <dd>
                        v
                        {activeWork.releaseVersion ?? activeWork.version ?? "—"}
                      </dd>
                    </dl>
                    {activeWork.history && activeWork.history.length > 0 && (
                      <details className="cp-work-history">
                        <summary>
                          Activity history ({activeWork.history.length})
                        </summary>
                        <div className="cp-audit-list">
                          {[...activeWork.history]
                            .reverse()
                            .map((entry, index) => (
                              <article key={index}>
                                <span className="cp-audit-marker" />
                                <div>
                                  <strong>{statusLabels[entry.status]}</strong>
                                  <p>
                                    {entry.actor} · {date(entry.timestamp)}
                                  </p>
                                  {entry.note && <p>{entry.note}</p>}
                                </div>
                              </article>
                            ))}
                        </div>
                      </details>
                    )}
                    {transitions[activeWork.status].length ? (
                      <fieldset
                        disabled={!state.permissions.canOperate || busy}
                        className="cp-fieldset"
                      >
                        <div className="cp-form-grid">
                          <Field label="Next status">
                            <select
                              value={workStatus}
                              onChange={(e) =>
                                setWorkStatus(e.target.value as WorkStatus)
                              }
                            >
                              <option value={activeWork.status}>
                                Keep current status ·{" "}
                                {statusLabels[activeWork.status]}
                              </option>
                              {transitions[activeWork.status].map((status) => (
                                <option key={status} value={status}>
                                  {statusLabels[status]}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Assignee">
                            <input
                              value={workAssignee}
                              onChange={(e) => setWorkAssignee(e.target.value)}
                              placeholder="Operator ID"
                            />
                          </Field>
                          <Field label="Progress or resolution note" wide>
                            <textarea
                              rows={3}
                              value={workNote}
                              onChange={(e) => setWorkNote(e.target.value)}
                            />
                          </Field>
                        </div>
                        <button
                          className="cp-button cp-add"
                          disabled={
                            dirty ||
                            rawEdited ||
                            (["completed", "failed", "cancelled"].includes(
                              workStatus,
                            ) &&
                              !workNote.trim())
                          }
                          onClick={() =>
                            void run(async () => {
                              acceptState(
                                await controlApi.updateWorkItem(activeWork.id, {
                                  revision: state.revision,
                                  status: workStatus,
                                  assignee: workAssignee.trim() || null,
                                  ...(workNote.trim()
                                    ? { note: workNote.trim() }
                                    : {}),
                                }),
                              );
                              setSelectedWork("");
                              setNotice("Work item updated.");
                            })
                          }
                        >
                          Update work item
                        </button>
                      </fieldset>
                    ) : (
                      <div className="cp-inline-note">
                        This request is closed. Its final status is preserved in
                        the audit history.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="cp-empty">
                    Select a request to review ownership, service targets, and
                    progress.
                  </div>
                )}
              </section>
            </div>
          </>
        )}

        {section === "releases" && (
          <>
            <div className="cp-section-intro">
              <h2>Make every change accountable</h2>
              <p>
                Review the draft, publish a new release, or restore an earlier
                release. Rollback creates a new version and preserves the full
                history.
              </p>
            </div>
            <ReleaseDiff control={state} />
            <div className="cp-two-column">
              <section className="cp-panel">
                <div className="cp-panel-heading">
                  <h3>Publish a release</h3>
                  <Badge tone={unpublished ? "amber" : "green"}>
                    {changes.length} changed entries
                  </Badge>
                </div>
                {changes.length ? (
                  <ul className="cp-change-list">
                    {changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                ) : (
                  <p>The draft matches the published configuration.</p>
                )}
                <Field
                  label="Release note"
                  hint="Describe what changed and why. Used for publication and rollback."
                >
                  <textarea
                    rows={3}
                    value={releaseNote}
                    onChange={(e) => setReleaseNote(e.target.value)}
                    placeholder="Describe the servicing change…"
                    maxLength={1000}
                    disabled={!state.permissions.canPublish || busy}
                  />
                </Field>
                <button
                  className="cp-button cp-add"
                  disabled={
                    !state.permissions.canPublish ||
                    busy ||
                    dirty ||
                    rawEdited ||
                    !unpublished ||
                    !releaseNote.trim()
                  }
                  onClick={() =>
                    void run(async () => {
                      acceptState(
                        await controlApi.publish(state.revision, releaseNote),
                      );
                      setReleaseNote("");
                      setNotice(
                        "Release published. New servicing requests use the published configuration.",
                      );
                    })
                  }
                >
                  Validate & publish
                </button>
                {dirty && (
                  <p className="cp-footnote">
                    Save your draft before publishing.
                  </p>
                )}
              </section>
              <section className="cp-panel">
                <div className="cp-panel-heading">
                  <h3>Restore a release</h3>
                  <Badge>New version</Badge>
                </div>
                <p>
                  Restore a previous configuration as a new published release.
                  The workspace draft is also restored.
                </p>
                <Field label="Release to restore">
                  <select
                    value={rollbackVersion}
                    onChange={(e) => setRollbackVersion(e.target.value)}
                    disabled={!state.permissions.canPublish || busy}
                  >
                    <option value="">Select a release</option>
                    {state.releases
                      .filter(
                        (release) =>
                          release.version !== state.published.version,
                      )
                      .map((release) => (
                        <option value={release.version} key={release.version}>
                          v{release.version} · {date(release.publishedAt)}
                        </option>
                      ))}
                  </select>
                </Field>
                <button
                  className="cp-button cp-button--quiet cp-add"
                  disabled={
                    !state.permissions.canPublish ||
                    busy ||
                    dirty ||
                    rawEdited ||
                    !rollbackVersion ||
                    !releaseNote.trim()
                  }
                  onClick={() =>
                    void run(async () => {
                      acceptState(
                        await controlApi.rollback(
                          state.revision,
                          Number(rollbackVersion),
                          releaseNote,
                        ),
                      );
                      setRollbackVersion("");
                      setReleaseNote("");
                      setNotice(
                        "Previous configuration restored as a new release.",
                      );
                    })
                  }
                >
                  Restore as new release
                </button>
                <p className="cp-footnote">
                  Enter a release note before restoring.
                </p>
              </section>
            </div>
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>Release history</h3>
                <span className="cp-muted">
                  {state.releases.length} releases
                </span>
              </div>
              <div className="cp-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Release</th>
                      <th>Published</th>
                      <th>Actor</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...state.releases].reverse().map((release) => (
                      <tr key={release.version}>
                        <td>
                          <Badge
                            tone={
                              release.version === state.published.version
                                ? "green"
                                : "neutral"
                            }
                          >
                            v{release.version}
                            {release.version === state.published.version
                              ? " · Live"
                              : ""}
                          </Badge>
                        </td>
                        <td>{date(release.publishedAt)}</td>
                        <td>{release.publishedBy}</td>
                        <td>{release.note || "Initial configuration"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>Audit trail</h3>
                <span className="cp-muted">Recorded changes</span>
              </div>
              {state.audit.length ? (
                <div className="cp-audit-list">
                  {[...state.audit].reverse().map((entry, index) => (
                    <article key={entry.id || index}>
                      <span className="cp-audit-marker" />
                      <div>
                        <strong>{entry.action.replace(/[._]/g, " ")}</strong>
                        <p>
                          {entry.actor || entry.actorId || "System"} ·{" "}
                          {date(entry.timestamp || entry.at)}
                          {entry.revision !== undefined
                            ? ` · revision ${entry.revision}`
                            : ""}
                        </p>
                        {entry.note && <p>{entry.note}</p>}
                        {entry.resourceId && (
                          <p>Resource: {entry.resourceId}</p>
                        )}
                        {entry.details && (
                          <details>
                            <summary>Details</summary>
                            <pre>{pretty(entry.details)}</pre>
                          </details>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="cp-empty">
                  Configuration changes will be recorded here.
                </p>
              )}
            </section>
          </>
        )}

        {(section === "connections" ||
          section === "traces" ||
          section === "operations") && (
          <OperationsConsole
            key={section}
            section={section}
            permissions={state.permissions}
            configurationRevision={state.revision}
            configurationDirty={dirty || rawEdited}
            onSynchronized={() => void refresh()}
          />
        )}
        {(section === "evaluations" ||
          section === "knowledge" ||
          section === "environments") && (
          <DesignStudioConsole
            key={section}
            section={section}
            control={state}
            configurationDirty={dirty || rawEdited}
            onRevisionChange={(revision) => {
              if (!dirty && !rawEdited && revision !== state.revision)
                void refresh();
            }}
          />
        )}

        <details className="cp-panel cp-advanced">
          <summary>
            <span>Advanced configuration</span>
            <small>Review or edit the complete draft JSON</small>
          </summary>
          <p>
            Every configuration field is available here. Apply the JSON to your
            local draft, then validate and save. This view also lets you copy
            unsaved edits before resolving a revision conflict.
          </p>
          <label className="cp-field">
            <span>Draft configuration JSON</span>
            <textarea
              className="cp-prompt"
              rows={16}
              value={rawEdited ? rawConfig : pretty(draft)}
              onChange={(e) => {
                setRawConfig(e.target.value);
                setRawEdited(true);
              }}
              readOnly={!editable}
              spellCheck={false}
            />
          </label>
          <div className="cp-actions">
            <button
              className="cp-button cp-button--quiet"
              disabled={!editable || !rawEdited}
              onClick={() =>
                void run(async () => {
                  let candidate: ServicingConfig;
                  try {
                    candidate = JSON.parse(rawConfig) as ServicingConfig;
                  } catch {
                    throw new Error(
                      "The configuration is not valid JSON. Fix the syntax before applying it.",
                    );
                  }
                  const result = await controlApi.validate(candidate);
                  setValidation(result);
                  if (result.valid) {
                    setDraft(candidate);
                    setRawEdited(false);
                    setNotice(
                      "JSON applied to the local draft. Save the draft to retain these changes.",
                    );
                  }
                })
              }
            >
              Validate & apply JSON
            </button>
            <button
              className="cp-link"
              disabled={!rawEdited || busy}
              onClick={() => {
                setRawConfig(pretty(draft));
                setRawEdited(false);
              }}
            >
              Discard JSON edits
            </button>
          </div>
        </details>
        <footer className="cp-footer">
          <span>Servicing control plane</span>
          <span>
            {state.tenant.id} · Published v{state.published.version} · Draft
            revision {state.revision}
          </span>
        </footer>
      </div>
    </div>
  );
}
