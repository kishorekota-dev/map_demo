import { useEffect, useState } from "react";
import { studioApi } from "@/services/servicingStudioService";
import type { ControlPlaneState } from "@/types/controlPlane";
import type {
  EvaluationCase,
  EvaluationStep,
  EvaluationSuite,
  EvaluationRun,
  KnowledgeDocument,
  StudioGovernance,
  StudioState,
} from "@/types/servicingStudio";
import {
  ConsoleField as Field,
  JsonEvidence,
  StatusPill,
  StringListField,
  formatDate,
  useConsoleAction,
} from "./ConsoleElements";
import KnowledgeIngestion from "./KnowledgeIngestion";

export type StudioSection = "evaluations" | "knowledge" | "environments";
const newSuite = (): EvaluationSuite => ({
  id: "",
  name: "",
  description: "",
  cases: [],
});
const newDocument = (): KnowledgeDocument => ({
  id: "",
  title: "",
  content: "",
  source: "",
  allowedRoles: ["customer"],
  expiresAt: null,
  status: "draft",
});
const initialGovernance: StudioGovernance = {
  requireEvaluationForPublish: false,
  requireIndependentApproval: false,
  requiredSuiteIds: [],
};
const localDate = (value: string | null) => {
  if (!value) return "";
  const time = new Date(value);
  return new Date(time.getTime() - time.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

function StepEditor({
  step,
  onChange,
  intents,
}: {
  step: EvaluationStep;
  onChange: (patch: Partial<EvaluationStep>) => void;
  intents: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="cp-form-grid">
      <Field label="Customer utterance" wide>
        <textarea
          rows={2}
          value={step.utterance}
          onChange={(e) => onChange({ utterance: e.target.value })}
        />
      </Field>
      <Field label="Channel">
        <select
          value={step.channel || "digital"}
          onChange={(e) =>
            onChange({ channel: e.target.value as EvaluationStep["channel"] })
          }
        >
          <option value="digital">Digital</option>
          <option value="ava">AVA</option>
          <option value="ivr">IVR</option>
        </select>
      </Field>
      <Field label="Expected intent">
        <select
          value={step.expectedIntent ?? "__none__"}
          onChange={(e) =>
            onChange({
              expectedIntent:
                e.target.value === "__none__" ? null : e.target.value,
            })
          }
        >
          <option value="">Select an intent</option>
          <option value="__none__">No resolved intent / ambiguous</option>
          {intents.map((intent) => (
            <option value={intent.id} key={intent.id}>
              {intent.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Expected routing">
        <select
          value={step.expectedAction || ""}
          onChange={(e) =>
            onChange({ expectedAction: e.target.value || undefined })
          }
        >
          <option value="">Do not assert routing</option>
          <option value="automated">Automated</option>
          <option value="human">Human fulfillment</option>
          <option value="disabled">Disabled</option>
          <option value="clarify">Clarify</option>
        </select>
      </Field>
      <label className="cp-check">
        <input
          type="checkbox"
          checked={Boolean(step.continueIntent)}
          onChange={(e) => onChange({ continueIntent: e.target.checked })}
        />
        Continue the previous turn's intent
      </label>
      <div>
        <label className="cp-check">
          <input
            type="checkbox"
            checked={step.expectedTools !== undefined}
            onChange={(e) =>
              onChange({ expectedTools: e.target.checked ? [] : undefined })
            }
          />
          Assert exact tool mappings
        </label>
        {step.expectedTools !== undefined && (
          <StringListField
            label="Expected tool mappings"
            value={step.expectedTools}
            onChange={(expectedTools) => onChange({ expectedTools })}
            hint="An empty list asserts no tools. Evaluation does not execute these tools."
          />
        )}
      </div>
      <StringListField
        label="Required fields to assert"
        value={step.requiredFields || []}
        onChange={(requiredFields) => onChange({ requiredFields })}
      />
    </div>
  );
}

export default function DesignStudioConsole({
  section,
  control,
  configurationDirty,
  onRevisionChange,
}: {
  section: StudioSection;
  control: ControlPlaneState;
  configurationDirty: boolean;
  onRevisionChange: (revision: number) => void;
}) {
  const action = useConsoleAction();
  const [studio, setStudio] = useState<StudioState | null>(null);
  const [suite, setSuite] = useState<EvaluationSuite>(newSuite);
  const [suiteSource, setSuiteSource] = useState<"draft" | "published">(
    "draft",
  );
  const [suiteJson, setSuiteJson] = useState("");
  const [selectedRun, setSelectedRun] = useState("");
  const [evaluation, setEvaluation] = useState<EvaluationRun | null>(null);
  const [document, setDocument] = useState<KnowledgeDocument>(newDocument);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [importJson, setImportJson] = useState("");
  const [searchResult, setSearchResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [governance, setGovernance] =
    useState<StudioGovernance>(initialGovernance);
  const [rolloutPolicy, setRolloutPolicy] = useState<
    NonNullable<StudioState["rolloutPolicy"]>
  >({ enabled: false, minSamples: 20, maxFailureRate: 0.2, windowMinutes: 30 });
  const [environment, setEnvironment] = useState("staging");
  const [promoteVersion, setPromoteVersion] = useState(
    control.published.version,
  );
  const [canaryPercent, setCanaryPercent] = useState(100);
  const [changeNote, setChangeNote] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const editable =
    control.permissions.canEdit && !configurationDirty && !action.busy;
  const administrable =
    control.permissions.canPublish && !configurationDirty && !action.busy;
  const accept = (next: StudioState) => {
    setStudio(next);
    onRevisionChange(next.revision);
  };
  const load = async () => {
    const next = await studioApi.state();
    accept(next);
    setGovernance(next.governance);
    if (next.rolloutPolicy) setRolloutPolicy(next.rolloutPolicy);
  };
  useEffect(() => {
    void action.run(load);
  }, []);
  const storedSuite = studio?.suites.find((entry) => entry.id === suite.id);
  const suiteDirty = JSON.stringify(storedSuite) !== JSON.stringify(suite);
  useEffect(() => {
    if (selectedRun)
      void action.run(async () =>
        setEvaluation(await studioApi.evaluation(selectedRun)),
      );
  }, [selectedRun]);
  const loadMore = async (
    kind: "suites" | "evaluations" | "knowledge" | "approvals" | "promotions",
  ) => {
    if (!studio) return;
    const current = studio[kind] || [];
    const page = await studioApi.records<Record<string, unknown>>(
      kind,
      current.length,
    );
    const items = page.items.map((entry) =>
      kind === "suites"
        ? {
            ...(entry.definition as Record<string, unknown>),
            version: entry.version,
            updatedAt: entry.updatedAt,
          }
        : entry,
    );
    setStudio({
      ...studio,
      [kind]: [...current, ...items],
      pagination: {
        ...studio.pagination,
        [kind]: {
          total: page.total,
          offset: 0,
          limit: current.length + items.length,
        },
      },
    } as StudioState);
  };
  const changeCase = (index: number, patch: Partial<EvaluationCase>) =>
    setSuite({
      ...suite,
      cases: suite.cases.map((entry, at) =>
        at === index ? { ...entry, ...patch } : entry,
      ),
    });
  const updateDocument = (patch: Partial<KnowledgeDocument>) =>
    setDocument({ ...document, ...patch });

  return (
    <div className="cp-module">
      <div className="cp-section-intro cp-module-intro">
        <div>
          <h2>
            {section === "evaluations"
              ? "Turn servicing requirements into repeatable checks"
              : section === "knowledge"
                ? "Govern the knowledge behind each answer"
                : "Promote changes with evidence and approval"}
          </h2>
          <p>
            {section === "evaluations"
              ? "Maintain utterance and multi-turn suites, evaluate the configuration contract, and bind passing evidence to the exact draft."
              : section === "knowledge"
                ? "Version documents, control role visibility, and publish content with source references and expiry."
                : "Configure release gates, obtain independent approval, and promote stable or canary versions by environment."}
          </p>
        </div>
        <button
          className="cp-button cp-button--quiet"
          disabled={action.busy || configurationDirty}
          onClick={() => void action.run(load)}
        >
          Refresh module
        </button>
      </div>
      {action.messages}
      {configurationDirty && (
        <div className="cp-alert cp-alert--pending">
          Save or discard the local configuration draft before updating studio
          resources. These resources share the workspace revision.
        </div>
      )}
      {!studio && action.busy && (
        <p className="cp-empty" role="status">
          Loading studio resources…
        </p>
      )}
      {studio && section === "evaluations" && (
        <>
          <div className="cp-inline-note">
            Contract simulation verifies recognition, routing, configured tool
            mappings, and required fields. It does not call external tools or
            prove connector execution, latency, or model answer quality.
          </div>
          <div className="cp-two-column cp-add">
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>Evaluation suites</h3>
                <button
                  className="cp-button cp-button--quiet"
                  disabled={!editable}
                  onClick={() => {
                    setSuite(newSuite());
                    setSuiteJson("");
                  }}
                >
                  + New suite
                </button>
              </div>
              {studio.suites.length ? (
                studio.suites.map((entry) => (
                  <button
                    key={entry.id}
                    className={`cp-selection-row${suite.id === entry.id ? " cp-selection-row--active" : ""}`}
                    onClick={() => {
                      setSuite(structuredClone(entry));
                      setSuiteJson("");
                    }}
                  >
                    <span>
                      <strong>{entry.name}</strong>
                      <small>{entry.description || entry.id}</small>
                    </span>
                    <StatusPill>{entry.cases.length} cases</StatusPill>
                  </button>
                ))
              ) : (
                <p className="cp-empty">
                  Create a suite with the customer utterances and expected
                  outcomes you want to protect.
                </p>
              )}
              <div className="cp-panel-heading cp-add">
                <h3>Run saved suite</h3>
                <StatusPill>Revision {studio.revision}</StatusPill>
              </div>
              <Field label="Configuration to evaluate">
                <select
                  value={suiteSource}
                  onChange={(e) =>
                    setSuiteSource(e.target.value as "draft" | "published")
                  }
                >
                  <option value="draft">Saved draft</option>
                  <option value="published">Published release</option>
                </select>
              </Field>
              <button
                className="cp-button cp-add"
                disabled={!editable || !storedSuite || suiteDirty}
                onClick={() =>
                  void action.run(async () => {
                    const next = await studioApi.evaluate(
                      studio.revision,
                      suite.id,
                      suiteSource,
                    );
                    accept(next);
                    setSelectedRun(
                      next.evaluations.find(
                        (entry) =>
                          !studio.evaluations.some(
                            (previous) => previous.id === entry.id,
                          ),
                      )?.id ||
                        next.evaluations[0]?.id ||
                        "",
                    );
                    action.setNotice(
                      "Configuration evaluation completed. Review the recorded results below.",
                    );
                  })
                }
              >
                Run contract evaluation
              </button>
              {suiteDirty && storedSuite && (
                <p className="cp-footnote">
                  Save suite changes before running it.
                </p>
              )}
            </section>
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>{storedSuite ? "Edit suite" : "New suite"}</h3>
                <StatusPill>{suite.cases.length} cases</StatusPill>
              </div>
              <fieldset className="cp-fieldset" disabled={!editable}>
                <div className="cp-form-grid">
                  <Field label="Suite ID">
                    <input
                      value={suite.id}
                      onChange={(e) =>
                        setSuite({ ...suite, id: e.target.value })
                      }
                      placeholder="payments-regression"
                    />
                  </Field>
                  <Field label="Suite name">
                    <input
                      value={suite.name}
                      onChange={(e) =>
                        setSuite({ ...suite, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Description" wide>
                    <textarea
                      rows={2}
                      value={suite.description}
                      onChange={(e) =>
                        setSuite({ ...suite, description: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <div className="cp-actions cp-add">
                  <button
                    className="cp-button cp-button--quiet"
                    onClick={() =>
                      setSuite({
                        ...suite,
                        cases: [
                          ...suite.cases,
                          {
                            id: `case-${suite.cases.length + 1}`,
                            name: "",
                            utterance: "",
                            channel: "digital",
                            expectedIntent: control.draft.intents[0]?.id || "",
                            expectedAction: "automated",
                          },
                        ],
                      })
                    }
                  >
                    + Add case
                  </button>
                  <button
                    className="cp-button"
                    disabled={
                      !suite.id.trim() ||
                      !suite.name.trim() ||
                      !suite.cases.length
                    }
                    onClick={() =>
                      void action.run(async () => {
                        const next = await studioApi.saveSuite(
                          studio.revision,
                          suite,
                        );
                        accept(next);
                        setSuite(
                          next.suites.find((entry) => entry.id === suite.id) ||
                            suite,
                        );
                        action.setNotice("Evaluation suite saved.");
                      })
                    }
                  >
                    Save suite
                  </button>
                </div>
              </fieldset>
            </section>
          </div>
          <fieldset className="cp-fieldset" disabled={!editable}>
            {suite.cases.map((entry, index) => (
              <section className="cp-panel" key={index}>
                <div className="cp-panel-heading">
                  <h3>
                    Case {index + 1}
                    {entry.name ? ` · ${entry.name}` : ""}
                  </h3>
                  <button
                    className="cp-link cp-link--danger"
                    onClick={() =>
                      setSuite({
                        ...suite,
                        cases: suite.cases.filter((_, at) => at !== index),
                      })
                    }
                  >
                    Remove case
                  </button>
                </div>
                <div className="cp-form-grid cp-test-identity">
                  <Field label="Case ID">
                    <input
                      value={entry.id}
                      onChange={(e) =>
                        changeCase(index, { id: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Case name">
                    <input
                      value={entry.name || ""}
                      onChange={(e) =>
                        changeCase(index, { name: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <StepEditor
                  step={entry}
                  onChange={(patch) => changeCase(index, patch)}
                  intents={control.draft.intents}
                />
                {entry.steps?.map((step, turn) => (
                  <div className="cp-test-turn" key={turn}>
                    <div className="cp-panel-heading">
                      <h3>Follow-up turn {turn + 1}</h3>
                      <button
                        className="cp-link cp-link--danger"
                        onClick={() =>
                          changeCase(index, {
                            steps: entry.steps?.filter((_, at) => at !== turn),
                          })
                        }
                      >
                        Remove turn
                      </button>
                    </div>
                    <StepEditor
                      step={step}
                      onChange={(patch) =>
                        changeCase(index, {
                          steps: entry.steps?.map((candidate, at) =>
                            at === turn
                              ? { ...candidate, ...patch }
                              : candidate,
                          ),
                        })
                      }
                      intents={control.draft.intents}
                    />
                  </div>
                ))}
                <button
                  className="cp-button cp-button--quiet cp-add"
                  onClick={() =>
                    changeCase(index, {
                      steps: [
                        ...(entry.steps || []),
                        {
                          utterance: "",
                          channel: entry.channel,
                          expectedIntent: entry.expectedIntent,
                          expectedAction: entry.expectedAction,
                          continueIntent: true,
                        },
                      ],
                    })
                  }
                >
                  + Add follow-up turn
                </button>
              </section>
            ))}
          </fieldset>
          <details className="cp-panel cp-advanced">
            <summary>Suite JSON</summary>
            <Field label="Full evaluation suite">
              <textarea
                className="cp-prompt"
                rows={10}
                value={suiteJson || JSON.stringify(suite, null, 2)}
                onChange={(e) => setSuiteJson(e.target.value)}
                disabled={!editable}
              />
            </Field>
            <button
              className="cp-button cp-button--quiet cp-add"
              disabled={!editable || !suiteJson}
              onClick={() =>
                void action.run(async () => {
                  const candidate = JSON.parse(suiteJson) as EvaluationSuite;
                  if (
                    !candidate ||
                    typeof candidate.id !== "string" ||
                    typeof candidate.name !== "string" ||
                    !Array.isArray(candidate.cases) ||
                    candidate.cases.some(
                      (entry) =>
                        !entry ||
                        typeof entry.id !== "string" ||
                        typeof entry.utterance !== "string",
                    )
                  )
                    throw new Error(
                      "Provide a suite object with an ID, name, and valid case entries.",
                    );
                  setSuite(candidate);
                  setSuiteJson("");
                  action.setNotice(
                    "Suite JSON applied locally. Save to validate and retain it.",
                  );
                })
              }
            >
              Apply suite JSON
            </button>
          </details>
          <section className="cp-panel">
            <div className="cp-panel-heading">
              <h3>Evaluation history</h3>
              <StatusPill>{studio.evaluations.length} runs</StatusPill>
            </div>
            {studio.evaluations.length ? (
              <div className="cp-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Suite</th>
                      <th>Source</th>
                      <th>Result</th>
                      <th>Run at</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...studio.evaluations]
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .map((run) => (
                        <tr key={run.id}>
                          <td>{run.suiteId}</td>
                          <td>
                            {run.source}
                            {run.version ? ` · v${run.version}` : ""}
                          </td>
                          <td>
                            <StatusPill good={run.passed} warning={!run.passed}>
                              {run.passedCases}/{run.totalCases} passed
                            </StatusPill>
                          </td>
                          <td>{formatDate(run.createdAt)}</td>
                          <td>
                            <button
                              className="cp-link"
                              onClick={() => setSelectedRun(run.id)}
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="cp-empty">No evaluations have run yet.</p>
            )}
            {evaluation && (
              <div className="cp-evaluation-result">
                <div className="cp-panel-heading">
                  <h3>{evaluation.suiteId} results</h3>
                  <StatusPill
                    good={evaluation.passed}
                    warning={!evaluation.passed}
                  >
                    {evaluation.passed ? "Passed" : "Failed"}
                  </StatusPill>
                </div>
                <p className="cp-footnote">
                  Scope: {evaluation.scope} · Config fingerprint:{" "}
                  <code>{evaluation.fingerprint}</code>
                </p>
                {(evaluation.results || []).map((result, index) => (
                  <section
                    className="cp-evaluation-case"
                    key={result.id || index}
                  >
                    <div className="cp-panel-heading">
                      <h3>{result.name || result.id}</h3>
                      <StatusPill good={result.passed} warning={!result.passed}>
                        {result.passed ? "Passed" : "Failed"}
                      </StatusPill>
                    </div>
                    {result.steps.map((step, turn) => (
                      <div className="cp-evaluation-step" key={turn}>
                        <strong>
                          Turn {turn + 1} · {step.passed ? "Passed" : "Failed"}
                        </strong>
                        <p>{step.utterance}</p>
                        {step.failures.length > 0 && (
                          <ul>
                            {step.failures.map((failure, at) => (
                              <li key={at}>{failure}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                    <JsonEvidence
                      value={result}
                      title="Recognition and routing evidence"
                    />
                  </section>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {studio && section === "knowledge" && (
        <>
          <div className="cp-two-column">
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>Knowledge documents</h3>
                <button
                  className="cp-button cp-button--quiet"
                  disabled={!editable}
                  onClick={() => setDocument(newDocument())}
                >
                  + New document
                </button>
              </div>
              {studio.knowledge.length ? (
                studio.knowledge.map((entry) => (
                  <button
                    className={`cp-selection-row${document.id === entry.id ? " cp-selection-row--active" : ""}`}
                    key={entry.id}
                    onClick={() => setDocument(structuredClone(entry))}
                  >
                    <span>
                      <strong>{entry.title}</strong>
                      <small>
                        {entry.source || entry.id}
                        {entry.version ? ` · v${entry.version}` : ""}
                      </small>
                    </span>
                    <StatusPill good={entry.status === "published"}>
                      {entry.status}
                    </StatusPill>
                  </button>
                ))
              ) : (
                <p className="cp-empty">
                  No managed knowledge documents. Add source content and publish
                  it after review.
                </p>
              )}
            </section>
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>{document.version ? "Edit document" : "New document"}</h3>
                {document.version && (
                  <StatusPill>v{document.version}</StatusPill>
                )}
              </div>
              <fieldset disabled={!editable} className="cp-fieldset">
                <div className="cp-form-grid">
                  <Field label="Document ID">
                    <input
                      value={document.id}
                      onChange={(e) => updateDocument({ id: e.target.value })}
                    />
                  </Field>
                  <Field label="Title">
                    <input
                      maxLength={200}
                      value={document.title}
                      onChange={(e) =>
                        updateDocument({ title: e.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="Source reference"
                    wide
                    hint="A human-readable source or URL for provenance. Saving does not crawl or import this URL."
                  >
                    <input
                      value={document.source}
                      onChange={(e) =>
                        updateDocument({ source: e.target.value })
                      }
                    />
                  </Field>
                  <StringListField
                    label="Roles allowed to retrieve"
                    value={document.allowedRoles}
                    onChange={(allowedRoles) =>
                      updateDocument({ allowedRoles })
                    }
                    hint="One authorized role per line. The API enforces visibility at retrieval time."
                  />
                  <Field
                    label="Expires at (local time)"
                    hint="Leave blank for no scheduled expiry."
                  >
                    <input
                      type="datetime-local"
                      value={localDate(document.expiresAt)}
                      onChange={(e) =>
                        updateDocument({
                          expiresAt: e.target.value
                            ? new Date(e.target.value).toISOString()
                            : null,
                        })
                      }
                    />
                  </Field>
                  <Field label="Content" wide>
                    <textarea
                      rows={16}
                      maxLength={50000}
                      value={document.content}
                      onChange={(e) =>
                        updateDocument({ content: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Document state">
                    <select
                      value={document.status}
                      onChange={(e) =>
                        updateDocument({
                          status: e.target.value as KnowledgeDocument["status"],
                        })
                      }
                    >
                      <option value="draft">
                        Draft · preserve prior published version
                      </option>
                      <option
                        value="published"
                        disabled={!control.permissions.canPublish}
                      >
                        Published · role-restricted retrieval
                      </option>
                      <option
                        value="archived"
                        disabled={!control.permissions.canPublish}
                      >
                        Archived · withdraw from retrieval
                      </option>
                    </select>
                  </Field>
                </div>
                <button
                  className="cp-button cp-add"
                  disabled={
                    !document.id.trim() ||
                    !document.title.trim() ||
                    !document.content.trim() ||
                    !document.source.trim()
                  }
                  onClick={() =>
                    void action.run(async () => {
                      const next = await studioApi.saveKnowledge(
                        studio.revision,
                        document,
                      );
                      accept(next);
                      setDocument(
                        next.knowledge.find(
                          (entry) => entry.id === document.id,
                        ) || document,
                      );
                      action.setNotice(
                        `Knowledge document saved as ${document.status}.`,
                      );
                    })
                  }
                >
                  Save document version
                </button>
              </fieldset>
              {document.version && (
                <button
                  className="cp-link"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      const versions = await studioApi.knowledgeVersions(
                        document.id,
                      );
                      setDocument({
                        ...document,
                        versions: versions.items as unknown as Array<
                          Record<string, unknown>
                        >,
                      });
                      action.setNotice(
                        `Showing ${versions.items.length} of ${versions.total} document versions.`,
                      );
                    })
                  }
                >
                  Load recent document versions
                </button>
              )}
              {document.versions && (
                <JsonEvidence
                  value={document.versions}
                  title="Archived document versions"
                />
              )}
            </section>
          </div>
          <KnowledgeIngestion
            revision={studio.revision}
            existingIds={studio.knowledge.map((entry) => entry.id)}
            editable={editable}
            onImported={accept}
          />
          <details className="cp-panel cp-shared-prompts">
            <summary>Import knowledge documents from JSON</summary>
            <p>
              Upload or paste a JSON array of up to 50 documents with id, title,
              content, source, allowedRoles, and optional expiresAt. Imported
              documents are saved as drafts for review.
            </p>
            <fieldset className="cp-fieldset" disabled={!editable}>
              <Field label="Knowledge JSON file">
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void action.run(async () => {
                        if (file.size > 5 * 1024 * 1024)
                          throw new Error(
                            "Choose a JSON file smaller than 5 MB.",
                          );
                        setImportJson(await file.text());
                      });
                  }}
                />
              </Field>
              <Field label="Document batch JSON">
                <textarea
                  className="cp-prompt"
                  rows={8}
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                />
              </Field>
              <button
                className="cp-button cp-add"
                disabled={!importJson.trim()}
                onClick={() =>
                  void action.run(async () => {
                    const documents = JSON.parse(
                      importJson,
                    ) as KnowledgeDocument[];
                    if (
                      !Array.isArray(documents) ||
                      !documents.length ||
                      documents.length > 50 ||
                      documents.some(
                        (entry) => !entry || typeof entry !== "object",
                      )
                    )
                      throw new Error(
                        "Provide an array of 1–50 knowledge documents.",
                      );
                    accept(
                      await studioApi.importKnowledge(
                        studio.revision,
                        documents.map((entry) => ({
                          ...entry,
                          expiresAt: entry.expiresAt || null,
                          status: "draft",
                        })),
                      ),
                    );
                    setImportJson("");
                    action.setNotice(
                      "Knowledge batch imported as drafts. Review content and role access before publishing.",
                    );
                  })
                }
              >
                Import draft documents
              </button>
            </fieldset>
          </details>
          <section className="cp-panel">
            <div className="cp-panel-heading">
              <h3>Test knowledge retrieval</h3>
              <StatusPill>Your authenticated roles</StatusPill>
            </div>
            <p>
              Search the published corpus using your actual account permissions.
              Draft, expired, and unauthorized documents are excluded by the
              server.
            </p>
            <div className="cp-inline-form">
              <Field label="Search query">
                <input
                  value={knowledgeQuery}
                  onChange={(e) => setKnowledgeQuery(e.target.value)}
                />
              </Field>
              <button
                className="cp-button cp-button--quiet"
                disabled={action.busy || !knowledgeQuery.trim()}
                onClick={() =>
                  void action.run(async () =>
                    setSearchResult(
                      await studioApi.searchKnowledge(knowledgeQuery),
                    ),
                  )
                }
              >
                Search published knowledge
              </button>
            </div>
            {searchResult && (
              <JsonEvidence
                value={searchResult}
                title="Retrieval results and source evidence"
              />
            )}
          </section>
        </>
      )}

      {studio && section === "environments" && (
        <>
          <section className="cp-panel">
            <div className="cp-panel-heading">
              <h3>Automatic rollback monitoring</h3>
              <StatusPill good={rolloutPolicy.enabled}>
                {rolloutPolicy.enabled ? "Enabled in form" : "Disabled in form"}
              </StatusPill>
            </div>
            <p>
              Configure the candidate failure threshold and observation window.
              Rollback decisions use server-recorded telemetry, never
              browser-submitted outcome counts.
            </p>
            <fieldset className="cp-fieldset" disabled={!administrable}>
              <label className="cp-check">
                <input
                  type="checkbox"
                  checked={rolloutPolicy.enabled}
                  onChange={(e) =>
                    setRolloutPolicy({
                      ...rolloutPolicy,
                      enabled: e.target.checked,
                    })
                  }
                />
                Monitor canaries for automatic rollback
              </label>
              <div className="cp-form-grid cp-add">
                <Field label="Minimum observed samples">
                  <input
                    type="number"
                    min="1"
                    max="1000000"
                    value={rolloutPolicy.minSamples}
                    onChange={(e) =>
                      setRolloutPolicy({
                        ...rolloutPolicy,
                        minSamples: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label="Maximum failure rate"
                  hint="A fraction from 0 to 1; 0.2 means 20%."
                >
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={rolloutPolicy.maxFailureRate}
                    onChange={(e) =>
                      setRolloutPolicy({
                        ...rolloutPolicy,
                        maxFailureRate: Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Observation window (minutes)">
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={rolloutPolicy.windowMinutes}
                    onChange={(e) =>
                      setRolloutPolicy({
                        ...rolloutPolicy,
                        windowMinutes: Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <button
                className="cp-button cp-button--quiet"
                onClick={() =>
                  void action.run(async () => {
                    const next = await studioApi.rolloutPolicy(
                      studio.revision,
                      rolloutPolicy,
                    );
                    accept(next);
                    if (next.rolloutPolicy)
                      setRolloutPolicy(next.rolloutPolicy);
                    action.setNotice("Automatic rollback policy saved.");
                  })
                }
              >
                Save rollback policy
              </button>
            </fieldset>
          </section>
          <div className="cp-environment-grid">
            {studio.environments.map((entry) => (
              <section className="cp-panel" key={entry.id}>
                <span className="cp-eyebrow">Environment</span>
                <h3 className="cp-environment-name">{entry.id}</h3>
                <dl className="cp-details">
                  <dt>Stable release</dt>
                  <dd>v{entry.stableVersion}</dd>
                  <dt>Candidate</dt>
                  <dd>
                    {entry.candidateVersion
                      ? `v${entry.candidateVersion}`
                      : "None"}
                  </dd>
                  <dt>Canary share</dt>
                  <dd>{entry.canaryPercent}%</dd>
                  <dt>Updated</dt>
                  <dd>{formatDate(entry.updatedAt)}</dd>
                </dl>
              </section>
            ))}
          </div>
          <div className="cp-two-column">
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>Promote a release</h3>
                <StatusPill>Published versions only</StatusPill>
              </div>
              <p>
                Assign a stable version or route a percentage of new sessions to
                a candidate. Existing sessions keep their pinned configuration.
              </p>
              <fieldset className="cp-fieldset" disabled={!administrable}>
                <div className="cp-form-grid">
                  <Field label="Target environment">
                    <select
                      value={environment}
                      onChange={(e) => setEnvironment(e.target.value)}
                    >
                      {studio.environments.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.id}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Published release">
                    <select
                      value={promoteVersion}
                      onChange={(e) =>
                        setPromoteVersion(Number(e.target.value))
                      }
                    >
                      {control.releases.map((release) => (
                        <option key={release.version} value={release.version}>
                          v{release.version} ·{" "}
                          {release.note || "Initial configuration"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Traffic share (%)"
                    hint="100 promotes a stable release; 1–99 creates a candidate canary."
                  >
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={canaryPercent}
                      onChange={(e) => setCanaryPercent(Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Promotion note" wide>
                    <textarea
                      rows={3}
                      value={changeNote}
                      onChange={(e) => setChangeNote(e.target.value)}
                    />
                  </Field>
                </div>
                <button
                  className="cp-button cp-add"
                  disabled={
                    !changeNote.trim() ||
                    canaryPercent < 1 ||
                    canaryPercent > 100
                  }
                  onClick={() =>
                    void action.run(async () => {
                      accept(
                        await studioApi.promote(
                          studio.revision,
                          environment,
                          promoteVersion,
                          changeNote,
                          canaryPercent,
                        ),
                      );
                      setChangeNote("");
                      action.setNotice("Environment release policy updated.");
                    })
                  }
                >
                  Apply environment promotion
                </button>
              </fieldset>
            </section>
            <section className="cp-panel">
              <div className="cp-panel-heading">
                <h3>Publication gates</h3>
                <StatusPill>Draft governance</StatusPill>
              </div>
              <fieldset className="cp-fieldset" disabled={!administrable}>
                <div className="cp-choice-group">
                  <label className="cp-check">
                    <input
                      type="checkbox"
                      checked={governance.requireEvaluationForPublish}
                      onChange={(e) =>
                        setGovernance({
                          ...governance,
                          requireEvaluationForPublish: e.target.checked,
                        })
                      }
                    />
                    Require passing evaluation evidence
                  </label>
                  <label className="cp-check">
                    <input
                      type="checkbox"
                      checked={governance.requireIndependentApproval}
                      onChange={(e) =>
                        setGovernance({
                          ...governance,
                          requireIndependentApproval: e.target.checked,
                        })
                      }
                    />
                    Require approval from another administrator
                  </label>
                </div>
                <div className="cp-field cp-add">
                  <span>Required suites</span>
                  {studio.suites.length ? (
                    studio.suites.map((entry) => (
                      <label className="cp-check" key={entry.id}>
                        <input
                          type="checkbox"
                          checked={governance.requiredSuiteIds.includes(
                            entry.id,
                          )}
                          onChange={(e) =>
                            setGovernance({
                              ...governance,
                              requiredSuiteIds: e.target.checked
                                ? [...governance.requiredSuiteIds, entry.id]
                                : governance.requiredSuiteIds.filter(
                                    (id) => id !== entry.id,
                                  ),
                            })
                          }
                        />
                        {entry.name}
                      </label>
                    ))
                  ) : (
                    <p className="cp-footnote">
                      Create an evaluation suite before requiring one.
                    </p>
                  )}
                </div>
                <button
                  className="cp-button cp-button--quiet"
                  onClick={() =>
                    void action.run(async () => {
                      const next = await studioApi.governance(
                        studio.revision,
                        governance,
                      );
                      accept(next);
                      setGovernance(next.governance);
                      action.setNotice("Publication gates saved.");
                    })
                  }
                >
                  Save governance
                </button>
              </fieldset>
              <p className="cp-footnote">
                Evidence and approval apply to the exact draft digest. Editing
                the configuration requires fresh matching evidence.
              </p>
            </section>
          </div>
          <section className="cp-panel">
            <div className="cp-panel-heading">
              <h3>Independent draft approval</h3>
              <StatusPill>Exact configuration</StatusPill>
            </div>
            <p className="cp-digest">
              Current draft digest: <code>{studio.configDigest}</code>
            </p>
            <Field label="Approval note">
              <textarea
                rows={3}
                value={approvalNote}
                disabled={!administrable}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Record the review and supporting evidence…"
              />
            </Field>
            <button
              className="cp-button cp-add"
              disabled={!administrable || !approvalNote.trim()}
              onClick={() =>
                void action.run(async () => {
                  accept(
                    await studioApi.approve(studio.revision, approvalNote),
                  );
                  setApprovalNote("");
                  action.setNotice(
                    "Approval recorded for the current draft digest.",
                  );
                })
              }
            >
              Approve current draft
            </button>
            <p className="cp-footnote">
              The server rejects approval from the most recent draft editor.
              Approval does not publish the configuration.
            </p>
            {studio.approvals.length > 0 && (
              <JsonEvidence value={studio.approvals} title="Approval history" />
            )}
            {Boolean(studio.promotions?.length) && (
              <JsonEvidence
                value={studio.promotions}
                title="Environment promotion history"
              />
            )}
          </section>
        </>
      )}
      {studio && (
        <div className="cp-resource-pagination">
          {(section === "evaluations"
            ? (["suites", "evaluations"] as const)
            : section === "knowledge"
              ? (["knowledge"] as const)
              : (["approvals", "promotions"] as const)
          ).map((kind) => {
            const count = studio[kind]?.length || 0;
            const total = studio.pagination?.[kind]?.total || count;
            return (
              <div key={kind}>
                <span>
                  {count} of {total} {kind} loaded
                </span>
                {count < total && (
                  <button
                    className="cp-link"
                    disabled={action.busy}
                    onClick={() => void action.run(async () => loadMore(kind))}
                  >
                    Load more {kind}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
