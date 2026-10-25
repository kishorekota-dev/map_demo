import { useEffect, useRef, useState } from "react";
import type { ControlPlaneState } from "@/types/controlPlane";
import {
  qualityApi,
  suiteDefinition,
  type QualityAssertion,
  type QualityCase,
  type QualityComparison,
  type QualityPolicy,
  type QualityRun,
  type QualityState,
  type QualitySuite,
  type QualityTask,
} from "@/services/qualityService";
import {
  ConsoleField as Field,
  JsonEvidence,
  StatusPill,
  downloadEvidence,
  formatDate,
  useConsoleAction,
} from "./ConsoleElements";
import "./QualityConsole.css";

const starter = (): QualitySuite => ({
  id: "servicing-probes",
  name: "Synthetic servicing probes",
  description:
    "Replace these examples with reviewed customer-servicing scenarios.",
  dataPolicy: "synthetic_only",
  task: "generation",
  intentId: "general_inquiry",
  cases: [
    {
      id: "readiness",
      category: "happy_path",
      input: "For this synthetic check, reply with exactly READY.",
      assertions: [{ type: "exact", value: "READY" }],
    },
  ],
});
const active = (run?: QualityRun | null) =>
  run?.status === "queued" || run?.status === "running";
const percentage = (value: number | null | undefined) =>
  typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "Not measured";
const list = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
function defaultAssertion(type: QualityAssertion["type"]): QualityAssertion {
  if (type === "json_valid") return { type };
  if (type === "json_equals")
    return { type, path: "intent", value: "balance_inquiry" };
  if (type === "json_required") return { type, paths: ["intent"] };
  if (type === "refusal") return { type, phrases: ["cannot", "unable"] };
  return { type, value: "" };
}
function isEditableSuite(value: unknown): value is QualitySuite {
  if (!value || typeof value !== "object") return false;
  const suite = value as QualitySuite;
  return (
    typeof suite.id === "string" &&
    typeof suite.name === "string" &&
    (suite.description === undefined ||
      typeof suite.description === "string") &&
    suite.dataPolicy === "synthetic_only" &&
    ["generation", "extraction", "recognition"].includes(suite.task) &&
    (suite.intentId === undefined || typeof suite.intentId === "string") &&
    Array.isArray(suite.cases) &&
    suite.cases.length > 0 &&
    suite.cases.every(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.input === "string" &&
        ["happy_path", "negative", "prompt_injection"].includes(
          item.category,
        ) &&
        (item.variables === undefined ||
          (item.variables &&
            typeof item.variables === "object" &&
            Object.values(item.variables).every(
              (value) => typeof value === "string",
            ))) &&
        Array.isArray(item.assertions) &&
        item.assertions.length > 0 &&
        item.assertions.every((rule) => {
          if (!rule || typeof rule !== "object") return false;
          if (["exact", "contains", "not_contains"].includes(rule.type))
            return "value" in rule && typeof rule.value === "string";
          if (rule.type === "json_valid") return true;
          if (rule.type === "json_required")
            return (
              Array.isArray(rule.paths) &&
              rule.paths.every((path) => typeof path === "string")
            );
          if (rule.type === "refusal")
            return (
              Array.isArray(rule.phrases) &&
              rule.phrases.every((phrase) => typeof phrase === "string")
            );
          return (
            rule.type === "json_equals" &&
            typeof rule.path === "string" &&
            (rule.value === null ||
              ["string", "boolean"].includes(typeof rule.value) ||
              (typeof rule.value === "number" && Number.isFinite(rule.value)))
          );
        }),
    )
  );
}
function AssertionEditor({
  rule,
  label,
  onChange,
}: {
  rule: QualityAssertion;
  label: string;
  onChange: (rule: QualityAssertion) => void;
}) {
  return (
    <div className="cp-quality-rule">
      <Field label={`${label} method`}>
        <select
          value={rule.type}
          onChange={(event) =>
            onChange(
              defaultAssertion(event.target.value as QualityAssertion["type"]),
            )
          }
        >
          <option value="exact">Exact response</option>
          <option value="contains">Contains text</option>
          <option value="not_contains">Excludes text</option>
          <option value="json_valid">Valid JSON object</option>
          <option value="json_required">Required JSON fields</option>
          <option value="json_equals">JSON field equals</option>
          <option value="refusal">Refusal phrase</option>
        </select>
      </Field>
      {"value" in rule && rule.type !== "json_equals" && (
        <Field label={`${label} expected text`}>
          <textarea
            rows={2}
            maxLength={2000}
            value={rule.value}
            onChange={(event) =>
              onChange({ ...rule, value: event.target.value })
            }
          />
        </Field>
      )}
      {rule.type === "json_equals" && (
        <>
          <Field
            label={`${label} JSON path`}
            hint="Dot notation; array indexes such as candidates.0.intent are supported."
          >
            <input
              value={rule.path}
              onChange={(event) =>
                onChange({ ...rule, path: event.target.value })
              }
            />
          </Field>
          <Field label={`${label} JSON value type`}>
            <select
              value={rule.value === null ? "null" : typeof rule.value}
              onChange={(event) =>
                onChange({
                  ...rule,
                  value:
                    event.target.value === "null"
                      ? null
                      : event.target.value === "boolean"
                        ? true
                        : event.target.value === "number"
                          ? 0
                          : "",
                })
              }
            >
              <option value="string">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="null">Null</option>
            </select>
          </Field>
          {rule.value !== null && (
            <Field label={`${label} expected JSON value`}>
              {typeof rule.value === "boolean" ? (
                <select
                  value={String(rule.value)}
                  onChange={(event) =>
                    onChange({ ...rule, value: event.target.value === "true" })
                  }
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : (
                <input
                  type={typeof rule.value === "number" ? "number" : "text"}
                  step="any"
                  value={rule.value}
                  onChange={(event) =>
                    onChange({
                      ...rule,
                      value:
                        typeof rule.value === "number"
                          ? Number(event.target.value)
                          : event.target.value,
                    })
                  }
                />
              )}
            </Field>
          )}
        </>
      )}
      {rule.type === "json_required" && (
        <Field label={`${label} required JSON paths`} hint="One path per line.">
          <textarea
            rows={2}
            value={rule.paths.join("\n")}
            onChange={(event) =>
              onChange({ ...rule, paths: list(event.target.value) })
            }
          />
        </Field>
      )}
      {rule.type === "refusal" && (
        <Field
          label={`${label} refusal phrases`}
          hint="Case-insensitive phrase checks; this does not establish semantic safety."
        >
          <textarea
            rows={2}
            value={rule.phrases.join("\n")}
            onChange={(event) =>
              onChange({ ...rule, phrases: list(event.target.value) })
            }
          />
        </Field>
      )}
    </div>
  );
}
export default function QualityConsole({
  control,
  configurationDirty,
  onRevisionChange,
}: {
  control: ControlPlaneState;
  configurationDirty: boolean;
  onRevisionChange: (revision: number) => void;
}) {
  const revisionCallback = useRef(onRevisionChange);
  useEffect(() => {
    revisionCallback.current = onRevisionChange;
  }, [onRevisionChange]);
  const [state, setState] = useState<QualityState | null>(null);
  const [suite, setSuite] = useState<QualitySuite>(starter);
  const [source, setSource] = useState<"draft" | "published">("draft");
  const [version, setVersion] = useState(String(control.published.version));
  const [profileId, setProfileId] = useState("");
  const [duration, setDuration] = useState(120000);
  const [concurrency, setConcurrency] = useState(1);
  const [detail, setDetail] = useState<QualityRun | null>(null);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [comparison, setComparison] = useState<QualityComparison | null>(null);
  const [requirements, setRequirements] = useState<
    QualityPolicy["requirements"]
  >([]);
  const [pollingError, setPollingError] = useState("");
  const [raw, setRaw] = useState("");
  const [rawEdited, setRawEdited] = useState(false);
  const action = useConsoleAction();
  const editable = !!state?.permissions.canEdit;
  const administrator = !!state?.permissions.canPublish;
  const selectedRecord = state?.suites.items.find(
    (item) => item.id === suite.id,
  );
  const suiteDirty =
    !selectedRecord ||
    JSON.stringify(suiteDefinition(selectedRecord)) !== JSON.stringify(suite);
  const config =
    source === "draft"
      ? control.draft
      : control.releases.find((release) => String(release.version) === version)
          ?.config;
  const profiles = config?.llm?.profiles || [];
  const profile = profiles.find((item) => item.id === profileId) || profiles[0];
  const selectedSuite = state?.suites.items.find(
    (item) => item.id === suite.id,
  );
  const outputBudget =
    (selectedSuite?.cases.length || suite.cases.length) *
    (profile?.maxOutputTokens || 0);
  const refresh = async (selectId?: string) => {
    const next = await qualityApi.state();
    setState(next);
    setPollingError("");
    revisionCallback.current(next.revision);
    if (!state) setRequirements(next.policy.requirements);
    const picked = selectId
      ? next.suites.items.find((item) => item.id === selectId)
      : !state
        ? next.suites.items[0]
        : null;
    if (picked) setSuite(suiteDefinition(picked));
    if (detail) setDetail(await qualityApi.detail(detail.id));
  };
  useEffect(() => {
    void action.run(() => refresh());
  }, []);
  const polling =
    state?.runs.items.some((run) => active(run)) || active(detail);
  useEffect(() => {
    if (!polling) return;
    let disposed = false;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const next = await qualityApi.state();
          if (disposed) return;
          setState(next);
          setPollingError("");
          revisionCallback.current(next.revision);
          if (detail) {
            const run = await qualityApi.detail(detail.id);
            if (!disposed) setDetail(run);
          }
        } catch {
          if (!disposed)
            setPollingError(
              "Run status could not be refreshed. Model execution may still be in progress; refresh before starting another run.",
            );
        }
      })();
    }, 3000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [polling, detail?.id]);
  const updateCase = (index: number, patch: Partial<QualityCase>) =>
    setSuite((current) => ({
      ...current,
      cases: current.cases.map((item, number) =>
        number === index ? { ...item, ...patch } : item,
      ),
    }));
  const chooseTask = (task: QualityTask) => {
    const next = { ...suite, task };
    if (task === "recognition") delete next.intentId;
    else next.intentId ||= "general_inquiry";
    setSuite(next);
  };
  return (
    <div className="cp-quality">
      {action.messages}
      {pollingError && (
        <div className="cp-alert cp-alert--error" role="alert">
          {pollingError}
        </div>
      )}
      <div className="cp-section-intro">
        <h2>Measure responses before changing service</h2>
        <p>
          Run reviewed synthetic examples through a selected model profile. Keep
          objective response checks separate from the existing conversation
          contract tests.
        </p>
      </div>
      <div className="cp-actions">
        <button
          className="cp-button cp-button--quiet"
          disabled={action.busy}
          onClick={() => void action.run(() => refresh())}
        >
          Refresh quality evidence
        </button>
      </div>
      {configurationDirty && (
        <div className="cp-alert cp-alert--pending">
          Save or discard unsaved configuration before changing suites, starting
          runs or updating release requirements.
        </div>
      )}
      <section className="cp-panel">
        <div className="cp-panel-heading">
          <div>
            <span className="cp-eyebrow">Dataset design</span>
            <h3>Synthetic response suite</h3>
          </div>
          <StatusPill warning={suiteDirty || rawEdited}>
            {rawEdited
              ? "Unapplied suite JSON"
              : suiteDirty
                ? "Unsaved suite"
                : "Saved suite"}
          </StatusPill>
        </div>
        <Field label="Saved response suite">
          <select
            value={selectedRecord?.id || ""}
            onChange={(event) => {
              const selected = state?.suites.items.find(
                (item) => item.id === event.target.value,
              );
              if (selected) {
                setSuite(suiteDefinition(selected));
                setRaw("");
                setRawEdited(false);
              }
            }}
          >
            <option value="">Choose a saved suite</option>
            {state?.suites.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · revision {item.version}
              </option>
            ))}
          </select>
        </Field>
        <p>
          Use synthetic examples only. Inputs and model outputs are retained as
          evaluation evidence. Objective text and JSON assertions test the
          expectations you define; they do not certify conversational quality or
          execute business tools.
        </p>
        <fieldset disabled={!editable || action.busy || configurationDirty}>
          <div className="cp-form-grid">
            <Field label="Suite ID">
              <input
                value={suite.id}
                maxLength={64}
                onChange={(event) =>
                  setSuite({ ...suite, id: event.target.value })
                }
              />
            </Field>
            <Field label="Suite name">
              <input
                value={suite.name}
                maxLength={120}
                onChange={(event) =>
                  setSuite({ ...suite, name: event.target.value })
                }
              />
            </Field>
            <Field label="Response task">
              <select
                value={suite.task}
                onChange={(event) =>
                  chooseTask(event.target.value as QualityTask)
                }
              >
                <option value="generation">Response generation</option>
                <option value="extraction">Field extraction</option>
                <option value="recognition">Intent recognition</option>
              </select>
            </Field>
            {suite.task !== "recognition" && (
              <Field label="Probe intent">
                <select
                  value={suite.intentId || ""}
                  onChange={(event) =>
                    setSuite({ ...suite, intentId: event.target.value })
                  }
                >
                  {control.draft.intents.map((intent) => (
                    <option value={intent.id} key={intent.id}>
                      {intent.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Suite description" wide>
              <textarea
                rows={2}
                maxLength={1000}
                value={suite.description || ""}
                onChange={(event) =>
                  setSuite({ ...suite, description: event.target.value })
                }
              />
            </Field>
          </div>
          {suite.cases.map((item, index) => (
            <article className="cp-quality-case" key={index}>
              <div className="cp-panel-heading">
                <h4>Case {index + 1}</h4>
                <button
                  className="cp-button cp-button--quiet"
                  disabled={suite.cases.length === 1}
                  onClick={() =>
                    setSuite({
                      ...suite,
                      cases: suite.cases.filter(
                        (_, number) => number !== index,
                      ),
                    })
                  }
                >
                  Remove case {index + 1}
                </button>
              </div>
              <div className="cp-form-grid">
                <Field label={`Case ${index + 1} ID`}>
                  <input
                    value={item.id}
                    onChange={(event) =>
                      updateCase(index, { id: event.target.value })
                    }
                  />
                </Field>
                <Field label={`Case ${index + 1} category`}>
                  <select
                    value={item.category}
                    onChange={(event) =>
                      updateCase(index, {
                        category: event.target.value as QualityCase["category"],
                      })
                    }
                  >
                    <option value="happy_path">Happy path</option>
                    <option value="negative">Negative scenario</option>
                    <option value="prompt_injection">Prompt injection</option>
                  </select>
                </Field>
                <Field label={`Case ${index + 1} input`} wide>
                  <textarea
                    rows={3}
                    maxLength={4000}
                    value={item.input}
                    onChange={(event) =>
                      updateCase(index, { input: event.target.value })
                    }
                  />
                </Field>
              </div>
              {item.assertions.map((rule, ruleIndex) => (
                <div className="cp-quality-assertion" key={ruleIndex}>
                  <AssertionEditor
                    rule={rule}
                    label={`Case ${index + 1} assertion ${ruleIndex + 1}`}
                    onChange={(next) =>
                      updateCase(index, {
                        assertions: item.assertions.map((current, number) =>
                          number === ruleIndex ? next : current,
                        ),
                      })
                    }
                  />
                  <button
                    className="cp-button cp-button--quiet"
                    disabled={item.assertions.length === 1}
                    onClick={() =>
                      updateCase(index, {
                        assertions: item.assertions.filter(
                          (_, number) => number !== ruleIndex,
                        ),
                      })
                    }
                  >
                    Remove assertion {ruleIndex + 1}
                  </button>
                </div>
              ))}
              <button
                className="cp-button cp-button--quiet"
                disabled={item.assertions.length >= 20}
                onClick={() =>
                  updateCase(index, {
                    assertions: [
                      ...item.assertions,
                      { type: "contains", value: "" },
                    ],
                  })
                }
              >
                Add assertion to case {index + 1}
              </button>
            </article>
          ))}
          <div className="cp-actions">
            <button
              className="cp-button cp-button--quiet"
              disabled={suite.cases.length >= 20}
              onClick={() => {
                let number = suite.cases.length + 1;
                while (suite.cases.some((item) => item.id === `case_${number}`))
                  number++;
                setSuite({
                  ...suite,
                  cases: [
                    ...suite.cases,
                    {
                      id: `case_${number}`,
                      category: "negative",
                      input: "",
                      assertions: [
                        { type: "refusal", phrases: ["cannot", "unable"] },
                      ],
                    },
                  ],
                });
              }}
            >
              Add response case
            </button>
            <button
              className="cp-button"
              disabled={rawEdited || !suiteDirty || !suite.id.trim()}
              onClick={() =>
                void action.run(async () => {
                  if (!state) return;
                  const saved = await qualityApi.suite(state.revision, suite);
                  revisionCallback.current(saved.revision);
                  await refresh(suite.id);
                  action.setNotice(
                    "Response suite saved. Existing results remain pinned to their original suite.",
                  );
                })
              }
            >
              Save response suite
            </button>
          </div>
          <details className="cp-evidence">
            <summary>Advanced suite JSON and synthetic variables</summary>
            <Field label="Response suite JSON">
              <textarea
                rows={12}
                spellCheck={false}
                value={rawEdited ? raw : JSON.stringify(suite, null, 2)}
                onChange={(event) => {
                  setRaw(event.target.value);
                  setRawEdited(true);
                }}
              />
            </Field>
            {rawEdited && (
              <p className="cp-inline-note">
                Apply or discard the edited JSON before saving or running a
                suite.
              </p>
            )}
            <button
              type="button"
              className="cp-button cp-button--quiet"
              disabled={!rawEdited}
              onClick={() => {
                setRaw("");
                setRawEdited(false);
              }}
            >
              Discard JSON edits
            </button>
            <button
              className="cp-button cp-button--quiet"
              onClick={() =>
                void action.run(async () => {
                  const parsed: unknown = JSON.parse(
                    rawEdited ? raw : JSON.stringify(suite),
                  );
                  if (!isEditableSuite(parsed))
                    throw new Error(
                      "Provide a synthetic suite with valid tasks, cases, variables and assertion fields. Save validates server limits.",
                    );
                  setSuite(parsed);
                  setRaw("");
                  setRawEdited(false);
                })
              }
            >
              Apply JSON to local suite
            </button>
          </details>
        </fieldset>
      </section>
      <section className="cp-panel">
        <span className="cp-eyebrow">Measured model responses</span>
        <h3>Run a pinned response evaluation</h3>
        <div className="cp-form-grid">
          <Field label="Evaluation configuration">
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value as typeof source);
                setProfileId("");
              }}
            >
              <option value="draft">Saved draft</option>
              <option value="published">Published release</option>
            </select>
          </Field>
          {source === "published" && (
            <Field label="Evaluation release">
              <select
                value={version}
                onChange={(event) => {
                  setVersion(event.target.value);
                  setProfileId("");
                }}
              >
                {control.releases.map((release) => (
                  <option value={release.version} key={release.version}>
                    Release {release.version}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Evaluation model profile">
            <select
              value={profile?.id || ""}
              onChange={(event) => setProfileId(event.target.value)}
            >
              <option value="">Select a model profile</option>
              {profiles.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} · {item.providerId} · {item.model}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Run duration budget (ms)">
            <input
              type="number"
              min={1000}
              max={300000}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            />
          </Field>
          <Field label="Concurrent model requests">
            <select
              value={concurrency}
              onChange={(event) => setConcurrency(Number(event.target.value))}
            >
              <option value={1}>1 · sequential</option>
              <option value={2}>2 · parallel</option>
            </select>
          </Field>
        </div>
        <p>
          {profile
            ? `Provider ${profile.providerId} · model ${profile.model} · reserved output maximum ${outputBudget.toLocaleString()} tokens for this suite.`
            : "Configure and save a model profile before running an evaluation."}{" "}
          Starting a run contacts that provider and can incur usage. Input
          tokens and billing costs are not predicted by the output reservation.
        </p>
        {!config?.llm?.enabled && (
          <p className="cp-inline-note">
            Model-assisted servicing must be enabled in the selected saved
            configuration.
          </p>
        )}
        <button
          className="cp-button"
          disabled={
            !editable ||
            action.busy ||
            configurationDirty ||
            suiteDirty ||
            rawEdited ||
            !profile ||
            !config?.llm?.enabled ||
            outputBudget > 163840
          }
          onClick={() =>
            void action.run(async () => {
              if (!profile) return;
              const run = await qualityApi.run({
                suiteId: suite.id,
                source,
                ...(source === "published" ? { version: Number(version) } : {}),
                profileId: profile.id,
                budget: {
                  concurrency,
                  maxDurationMs: duration,
                  maxOutputTokens: outputBudget,
                },
              });
              await refresh();
              setDetail(run);
              action.setNotice(
                "Evaluation queued. Requests use the selected saved configuration and synthetic suite.",
              );
            })
          }
        >
          Start measured model evaluation
        </button>
      </section>
      <section className="cp-panel">
        <div className="cp-panel-heading">
          <div>
            <span className="cp-eyebrow">Quality evidence</span>
            <h3>Runs and comparisons</h3>
          </div>
          <StatusPill>{state?.runs.total ?? 0} recorded runs</StatusPill>
        </div>
        {!state ? (
          <p>Loading response evaluations…</p>
        ) : state.runs.items.length === 0 ? (
          <p>No model responses have been measured yet.</p>
        ) : (
          <div className="cp-quality-run-list">
            {state.runs.items.map((run) => (
              <button
                className={`cp-quality-run${detail?.id === run.id ? " cp-quality-run--selected" : ""}`}
                key={run.id}
                onClick={() =>
                  void action.run(async () =>
                    setDetail(await qualityApi.detail(run.id)),
                  )
                }
              >
                <span>
                  <strong>{run.suiteId}</strong>
                  <small>
                    {run.profileId} ·{" "}
                    {run.source === "draft"
                      ? "saved draft"
                      : `release ${run.version}`}{" "}
                    · {formatDate(run.createdAt)}
                  </small>
                </span>
                <span>
                  <StatusPill
                    good={run.status === "completed" && run.passed}
                    warning={
                      run.status === "failed" || run.status === "interrupted"
                    }
                  >
                    {run.status}
                  </StatusPill>
                  <small>
                    {run.summary.passedCases}/{run.summary.totalCases} passed
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
        {detail && (
          <article className="cp-quality-case">
            <div className="cp-panel-heading">
              <h4>Run {detail.id}</h4>
              <StatusPill
                good={detail.passed}
                warning={detail.status === "failed"}
              >
                {detail.status}
              </StatusPill>
            </div>
            <div className="cp-quality-metrics">
              <div>
                <small>Response assertions passed</small>
                <strong>{percentage(detail.summary.passRate)}</strong>
              </div>
              <div>
                <small>Median response time</small>
                <strong>
                  {detail.summary.medianLatencyMs === null
                    ? "Not measured"
                    : `${detail.summary.medianLatencyMs} ms`}
                </strong>
              </div>
              <div>
                <small>Reported total tokens</small>
                <strong>{detail.summary.usage.totalTokens ?? "Unknown"}</strong>
              </div>
              <div>
                <small>Usage coverage</small>
                <strong>
                  {detail.summary.usageCoverage.replace(/_/g, " ")}
                </strong>
              </div>
            </div>
            {detail.evidencePending && (
              <p className="cp-inline-note">
                Passing results are recorded; publication evidence is still
                being committed. Refresh before publishing.
              </p>
            )}
            {detail.usageMayBeIncomplete && (
              <p className="cp-inline-note">
                Some requests have incomplete usage metadata. Missing usage does
                not mean zero consumption.
              </p>
            )}
            <div className="cp-actions">
              <button
                className="cp-button cp-button--quiet"
                onClick={() =>
                  downloadEvidence(`quality-run-${detail.id}.json`, detail)
                }
              >
                Export response evidence
              </button>
              {active(detail) && (
                <button
                  className="cp-button cp-button--danger"
                  disabled={!editable || action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await qualityApi.cancel(detail.id);
                      setDetail(await qualityApi.detail(detail.id));
                      await refresh();
                      action.setNotice(
                        "Cancellation requested. Already dispatched model usage may still be incurred.",
                      );
                    })
                  }
                >
                  Cancel evaluation run
                </button>
              )}
            </div>
            {detail.results?.map((result) => (
              <details className="cp-evidence" key={result.id}>
                <summary>
                  {result.id} · {result.status} ·{" "}
                  {result.passed === undefined
                    ? "pending"
                    : result.passed
                      ? "passed"
                      : "failed"}
                </summary>
                {result.error && <p role="status">{result.error}</p>}
                {result.output !== undefined && <pre>{result.output}</pre>}
                {result.outputTruncated && (
                  <p>
                    Displayed output is truncated; assertions used the bounded
                    full model response.
                  </p>
                )}
                <JsonEvidence
                  title={`Inspect ${result.id} measurements and assertions`}
                  value={result}
                />
              </details>
            ))}
            <JsonEvidence
              title="Pinned configuration, profile and suite evidence"
              value={detail}
            />
          </article>
        )}
        <div className="cp-form-grid">
          <Field label="Baseline evaluation run">
            <select
              value={left}
              onChange={(event) => {
                setLeft(event.target.value);
                setComparison(null);
              }}
            >
              <option value="">Select a baseline</option>
              {state?.runs.items.map((run) => (
                <option value={run.id} key={run.id}>
                  {run.suiteId} · {run.profileId} · {formatDate(run.createdAt)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Candidate evaluation run">
            <select
              value={right}
              onChange={(event) => {
                setRight(event.target.value);
                setComparison(null);
              }}
            >
              <option value="">Select a candidate</option>
              {state?.runs.items.map((run) => (
                <option value={run.id} key={run.id}>
                  {run.suiteId} · {run.profileId} · {formatDate(run.createdAt)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button
          className="cp-button cp-button--quiet"
          disabled={action.busy || !left || !right || left === right}
          onClick={() =>
            void action.run(async () =>
              setComparison(await qualityApi.compare(left, right)),
            )
          }
        >
          Compare recorded runs
        </button>
        {comparison && (
          <div className="cp-inline-note">
            <p>
              {comparison.comparable && comparison.passRateDelta !== null
                ? `Pass-rate change: ${(comparison.passRateDelta * 100).toFixed(1)} percentage points. This comparison does not prove causality or customer outcomes.`
                : "These runs do not support a direct pass-rate comparison."}
            </p>
            {comparison.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
            <JsonEvidence
              title="Inspect evaluation comparison"
              value={comparison}
            />
          </div>
        )}
      </section>
      <section className="cp-panel">
        <span className="cp-eyebrow">Release governance</span>
        <h3>Require measured evidence before publication</h3>
        <p>
          Add the suite/profile pairs that must pass for the exact configuration
          being published or promoted. The existing contract evaluation and
          independent approval controls continue to apply.
        </p>
        <fieldset
          disabled={!administrator || action.busy || configurationDirty}
        >
          {requirements.map((entry, index) => (
            <div className="cp-quality-requirement" key={index}>
              <Field label={`Required suite ${index + 1}`}>
                <select
                  value={entry.suiteId}
                  onChange={(event) =>
                    setRequirements(
                      requirements.map((item, number) =>
                        number === index
                          ? { ...item, suiteId: event.target.value }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">Select suite</option>
                  {state?.suites.items.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Required profile ${index + 1}`}>
                <select
                  value={entry.profileId}
                  onChange={(event) =>
                    setRequirements(
                      requirements.map((item, number) =>
                        number === index
                          ? { ...item, profileId: event.target.value }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="">Select profile</option>
                  {control.draft.llm?.profiles.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="cp-button cp-button--quiet"
                onClick={() =>
                  setRequirements(
                    requirements.filter((_, number) => number !== index),
                  )
                }
              >
                Remove requirement {index + 1}
              </button>
            </div>
          ))}
          <div className="cp-actions">
            <button
              className="cp-button cp-button--quiet"
              disabled={requirements.length >= 20}
              onClick={() =>
                setRequirements([
                  ...requirements,
                  { suiteId: "", profileId: "" },
                ])
              }
            >
              Add measured quality requirement
            </button>
            <button
              className="cp-button"
              onClick={() =>
                void action.run(async () => {
                  if (!state) return;
                  const saved = await qualityApi.policy(state.revision, {
                    requirements,
                  });
                  revisionCallback.current(saved.revision);
                  await refresh();
                  action.setNotice(
                    "Measured quality requirements saved. Publication and promotion now require matching passing evidence.",
                  );
                })
              }
            >
              Save measured quality requirements
            </button>
          </div>
        </fieldset>
        <JsonEvidence
          title="Current server quality requirements"
          value={state?.policy || { requirements: [] }}
        />
      </section>
    </div>
  );
}
