import { useState } from "react";
import controlApi from "@/services/controlPlaneService";
import type {
  ChannelId,
  ProcedureGuardrail,
  ProcedureImport,
  ServicingConfig,
  ServicingProcedure,
} from "@/types/controlPlane";
import {
  ConsoleField as Field,
  JsonEvidence,
  StatusPill,
  useConsoleAction,
} from "./ConsoleElements";
import RetrievalPanel from "./RetrievalPanel";

const CHANNELS: ChannelId[] = ["digital", "ava", "ivr"];
const OPERATOR_LABELS: Record<string, string> = {
  eq: "is",
  neq: "is not",
  gt: "is over",
  gte: "is at least",
  lt: "is under",
  lte: "is at most",
  in: "is one of",
};

export function describeGuardrail(guardrail: ProcedureGuardrail): string {
  switch (guardrail.type) {
    case "require_fields":
      return `Collect before acting: ${guardrail.fields.join(", ")}`;
    case "require_confirmation":
      return "Ask the customer to confirm before acting";
    case "escalate_when": {
      const value = Array.isArray(guardrail.value)
        ? guardrail.value.join(", ")
        : String(guardrail.value);
      return `${guardrail.action === "handoff" ? "Hand off to a specialist" : "Stop the request"} when ${guardrail.field} ${OPERATOR_LABELS[guardrail.operator] || guardrail.operator} ${value}`;
    }
    case "prohibited_phrases":
      return `Never say: ${guardrail.phrases.map((phrase) => `“${phrase}”`).join(", ")}`;
    case "required_disclosure":
      return `Always include: ${guardrail.text}`;
  }
}

function toggle<T>(list: T[], value: T, on: boolean): T[] {
  return on
    ? [...new Set([...list, value])]
    : list.filter((entry) => entry !== value);
}

function nextGuardrailId(procedure: ServicingProcedure): string {
  const taken = new Set((procedure.guardrails || []).map((g) => g.id));
  let index = taken.size + 1;
  while (taken.has(`guardrail_${index}`)) index += 1;
  return `guardrail_${index}`;
}

function BindingFields({
  config,
  intents,
  channels,
  onIntents,
  onChannels,
}: {
  config: ServicingConfig;
  intents: string[];
  channels: ChannelId[];
  onIntents: (value: string[]) => void;
  onChannels: (value: ChannelId[]) => void;
}) {
  return (
    <div className="cp-form-grid">
      <Field
        label="Bound intents"
        hint="The procedure instructs the assistant and enforces its guardrails for these intents. Leave empty for a customer reference that only grounds answers."
      >
        <select
          multiple
          size={6}
          value={intents}
          onChange={(e) =>
            onIntents(
              [...e.target.selectedOptions].map((option) => option.value),
            )
          }
        >
          {config.intents.map((intent) => (
            <option key={intent.id} value={intent.id}>
              {intent.name} ({intent.id})
            </option>
          ))}
        </select>
      </Field>
      <fieldset className="cp-fieldset cp-procedure-channels">
        <legend>Channels</legend>
        {CHANNELS.map((channel) => (
          <label key={channel} className="cp-check">
            <input
              type="checkbox"
              checked={channels.includes(channel)}
              onChange={(e) =>
                onChannels(toggle(channels, channel, e.target.checked))
              }
            />
            {channel.toUpperCase()}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

function GuardrailList({
  guardrails,
  onRemove,
  disabled,
}: {
  guardrails: ProcedureGuardrail[];
  onRemove?: (id: string) => void;
  disabled: boolean;
}) {
  if (!guardrails.length)
    return <p className="cp-muted">No guardrails. The steps guide the assistant only.</p>;
  return (
    <ul className="cp-procedure-guardrails">
      {guardrails.map((guardrail) => (
        <li key={guardrail.id}>
          <span>
            <strong>{describeGuardrail(guardrail)}</strong>
            {guardrail.sourceText && (
              <small className="cp-muted"> From: “{guardrail.sourceText}”</small>
            )}
          </span>
          {onRemove && (
            <button
              type="button"
              className="cp-button cp-button--quiet"
              disabled={disabled}
              onClick={() => onRemove(guardrail.id)}
            >
              Remove
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function ProcedureEditor({
  procedure,
  config,
  published,
  editable,
  onChange,
  onDelete,
}: {
  procedure: ServicingProcedure;
  config: ServicingConfig;
  published?: ServicingProcedure;
  editable: boolean;
  onChange: (next: ServicingProcedure) => void;
  onDelete: () => void;
}) {
  const [advanced, setAdvanced] = useState("");
  const [advancedError, setAdvancedError] = useState("");
  const changed = JSON.stringify(published) !== JSON.stringify(procedure);
  const update = (patch: Partial<ServicingProcedure>) =>
    onChange({ ...procedure, ...patch });
  return (
    <details className="cp-panel cp-procedure">
      <summary>
        <span>
          {procedure.title} <code>{procedure.id}</code>
        </span>
        <span className="cp-procedure-badges">
          <StatusPill good={procedure.enabled}>
            {procedure.enabled ? "Enabled" : "Disabled"}
          </StatusPill>
          <StatusPill>{procedure.audience || "internal"}</StatusPill>
          {!published && <StatusPill warning>New</StatusPill>}
          {published && changed && <StatusPill warning>Unpublished changes</StatusPill>}
        </span>
      </summary>
      <fieldset className="cp-fieldset" disabled={!editable}>
        <div className="cp-form-grid">
          <Field label="Title">
            <input
              value={procedure.title}
              maxLength={200}
              onChange={(e) => update({ title: e.target.value })}
            />
          </Field>
          <Field label="Source" hint="Governing document reference or HTTPS location.">
            <input
              value={procedure.source}
              maxLength={1000}
              onChange={(e) => update({ source: e.target.value })}
            />
          </Field>
          <Field
            label="Audience"
            hint="Internal procedures are never quoted to customers. Customer procedures may also ground answers to customer questions."
          >
            <select
              value={procedure.audience || "internal"}
              onChange={(e) =>
                update({ audience: e.target.value as "internal" | "customer" })
              }
            >
              <option value="internal">Internal</option>
              <option value="customer">Customer</option>
            </select>
          </Field>
          <label className="cp-check">
            <input
              type="checkbox"
              checked={procedure.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            Enabled in this draft
          </label>
        </div>
        <BindingFields
          config={config}
          intents={procedure.intents}
          channels={procedure.channels}
          onIntents={(intents) => update({ intents })}
          onChannels={(channels) => update({ channels })}
        />
        <h4>Steps the assistant follows</h4>
        <ol className="cp-procedure-steps">
          {procedure.steps.map((step, index) => (
            <li key={step.id}>
              <textarea
                rows={2}
                maxLength={1000}
                aria-label={`Step ${index + 1}`}
                value={step.instruction}
                onChange={(e) =>
                  update({
                    steps: procedure.steps.map((entry) =>
                      entry.id === step.id
                        ? { ...entry, instruction: e.target.value }
                        : entry,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="cp-button cp-button--quiet"
                disabled={procedure.steps.length <= 1}
                onClick={() =>
                  update({
                    steps: procedure.steps.filter((entry) => entry.id !== step.id),
                  })
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="cp-button cp-button--light"
          disabled={procedure.steps.length >= 40}
          onClick={() => {
            const taken = new Set(procedure.steps.map((step) => step.id));
            let index = procedure.steps.length + 1;
            while (taken.has(`step_${index}`)) index += 1;
            update({
              steps: [...procedure.steps, { id: `step_${index}`, instruction: "" }],
            });
          }}
        >
          Add step
        </button>
        <h4>Enforced guardrails</h4>
        <GuardrailList
          guardrails={procedure.guardrails || []}
          disabled={!editable}
          onRemove={(id) =>
            update({
              guardrails: (procedure.guardrails || []).filter((g) => g.id !== id),
            })
          }
        />
        <details className="cp-evidence">
          <summary>Edit as JSON</summary>
          <p className="cp-footnote">
            Add or change guardrails here. The control plane validates every
            field when you save the draft.
          </p>
          <textarea
            rows={12}
            aria-label="Procedure JSON"
            value={advanced || JSON.stringify(procedure, null, 2)}
            onChange={(e) => setAdvanced(e.target.value)}
          />
          {advancedError && (
            <div className="cp-alert cp-alert--error" role="alert">
              {advancedError}
            </div>
          )}
          <button
            type="button"
            className="cp-button cp-button--light"
            disabled={!advanced}
            onClick={() => {
              try {
                const parsed = JSON.parse(advanced) as ServicingProcedure;
                if (parsed.id !== procedure.id)
                  throw new Error("Keep the procedure id unchanged.");
                setAdvancedError("");
                setAdvanced("");
                onChange(parsed);
              } catch (failure) {
                setAdvancedError(
                  failure instanceof Error ? failure.message : "Invalid JSON.",
                );
              }
            }}
          >
            Apply JSON
          </button>
        </details>
        <div className="cp-actions">
          <button type="button" className="cp-button cp-button--quiet" onClick={onDelete}>
            Delete procedure
          </button>
        </div>
      </fieldset>
    </details>
  );
}

export default function ProcedureConsole({
  config,
  published,
  onChange,
  editable,
}: {
  config: ServicingConfig;
  published: ServicingConfig;
  onChange: (config: ServicingConfig) => void;
  editable: boolean;
}) {
  const procedures = config.procedures || [];
  const action = useConsoleAction();
  const [source, setSource] = useState("");
  const [content, setContent] = useState("");
  const [audience, setAudience] = useState<"internal" | "customer">("internal");
  const [intents, setIntents] = useState<string[]>([]);
  const [channels, setChannels] = useState<ChannelId[]>(["digital", "ava"]);
  const [preview, setPreview] = useState<ProcedureImport | null>(null);
  const setProcedures = (next: ServicingProcedure[]) =>
    onChange({ ...config, procedures: next });
  const replace = (procedure: ServicingProcedure) =>
    setProcedures([
      ...procedures.filter((entry) => entry.id !== procedure.id),
      procedure,
    ]);

  const parse = () =>
    action.run(async () => {
      setPreview(
        await controlApi.parseProcedure({ source, content, audience, intents, channels }),
      );
    });

  return (
    <>
      <div className="cp-section-intro">
        <h2>Teach the assistant your procedures</h2>
        <p>
          Bring standard operating procedures into the assistant. A procedure
          bound to an intent becomes the assistant&apos;s instructions, and its
          guardrails are enforced in code: required details, confirmation,
          specialist handoff, prohibited wording and required disclosures.
          Customer procedures also ground answers to general questions, with
          citations. Procedures publish, canary and roll back with the release.
        </p>
      </div>

      <section className="cp-panel" aria-labelledby="procedure-import">
        <div className="cp-panel-heading">
          <span className="cp-eyebrow">Import</span>
          <h3 id="procedure-import">Import a procedure document</h3>
        </div>
        <p>
          Paste or upload Markdown or plain text. Numbered lists become steps.
          Rules under a <code>## Guardrails</code> heading become guardrails,
          for example <code>Require confirmation</code>,{" "}
          <code>Require fields: replacementAddress</code>,{" "}
          <code>Escalate when amount &gt; 5000</code>,{" "}
          <code>Never say: &quot;no fee&quot;</code> and{" "}
          <code>Disclose: Fees may apply.</code> Policy-like sentences
          elsewhere are suggested for your review. Nothing is enforced until
          you add the procedure, enable it and publish.
        </p>
        <fieldset className="cp-fieldset" disabled={!editable || action.busy}>
          <div className="cp-form-grid">
            <Field label="Source" hint="For example SOP-CARD-014 rev 3 or an HTTPS link to the governing document.">
              <input value={source} maxLength={1000} onChange={(e) => setSource(e.target.value)} />
            </Field>
            <Field label="Audience">
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as "internal" | "customer")}
              >
                <option value="internal">Internal</option>
                <option value="customer">Customer</option>
              </select>
            </Field>
            <Field label="Upload file" hint="Markdown or text, up to 30,000 characters.">
              <input
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setContent(await file.text());
                }}
              />
            </Field>
          </div>
          <BindingFields
            config={config}
            intents={intents}
            channels={channels}
            onIntents={setIntents}
            onChannels={setChannels}
          />
          <Field label="Procedure text" wide>
            <textarea
              rows={10}
              maxLength={30000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </Field>
          <button
            type="button"
            className="cp-button"
            disabled={!source.trim() || content.trim().length < 20}
            onClick={parse}
          >
            Parse document
          </button>
        </fieldset>
        {action.messages}
        {preview && (
          <div className="cp-procedure-preview">
            <h4>
              {preview.procedure.title} <code>{preview.procedure.id}</code>
            </h4>
            {preview.replaces && (
              <div className="cp-alert cp-alert--pending">
                Adding this replaces the draft procedure with the same id.
              </div>
            )}
            {preview.errors.length > 0 && (
              <div className="cp-alert cp-alert--error" role="alert">
                Fix before saving the draft:
                <ul>
                  {preview.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.warnings.length > 0 && (
              <div className="cp-alert cp-alert--pending">
                <ul>
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <ol className="cp-procedure-steps">
              {preview.procedure.steps.map((step) => (
                <li key={step.id}>{step.instruction}</li>
              ))}
            </ol>
            <h4>Guardrails from the document</h4>
            <GuardrailList
              guardrails={preview.procedure.guardrails || []}
              disabled={!editable}
              onRemove={(id) =>
                setPreview({
                  ...preview,
                  procedure: {
                    ...preview.procedure,
                    guardrails: (preview.procedure.guardrails || []).filter((g) => g.id !== id),
                  },
                })
              }
            />
            {preview.suggestions.length > 0 && (
              <>
                <h4>Suggested guardrails</h4>
                <ul className="cp-procedure-guardrails">
                  {preview.suggestions.map((suggestion) => (
                    <li key={suggestion.guardrail.id}>
                      <span>
                        <strong>{describeGuardrail(suggestion.guardrail)}</strong>
                        <small className="cp-muted"> From: “{suggestion.sourceText}”</small>
                        {suggestion.note && <small className="cp-inline-note"> {suggestion.note}</small>}
                      </span>
                      <button
                        type="button"
                        className="cp-button cp-button--light"
                        disabled={!editable}
                        onClick={() =>
                          setPreview({
                            ...preview,
                            suggestions: preview.suggestions.filter((entry) => entry !== suggestion),
                            procedure: {
                              ...preview.procedure,
                              guardrails: [
                                ...(preview.procedure.guardrails || []),
                                { ...suggestion.guardrail, id: nextGuardrailId(preview.procedure) },
                              ],
                            },
                          })
                        }
                      >
                        Accept
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="cp-actions">
              <button
                type="button"
                className="cp-button"
                disabled={!editable}
                onClick={() => {
                  replace(preview.procedure);
                  setPreview(null);
                  setContent("");
                  action.setNotice(
                    "Procedure added to the draft, disabled. Review it below, enable it, save the draft and publish through the release gates.",
                  );
                }}
              >
                Add to draft
              </button>
              <button type="button" className="cp-button cp-button--quiet" onClick={() => setPreview(null)}>
                Discard
              </button>
            </div>
            <JsonEvidence value={preview.procedure} title="Inspect parsed procedure" />
          </div>
        )}
      </section>

      <RetrievalPanel config={config} onChange={onChange} editable={editable} />

      <section className="cp-panel" aria-labelledby="procedure-list">
        <div className="cp-panel-heading">
          <span className="cp-eyebrow">Draft</span>
          <h3 id="procedure-list">Procedures in this draft ({procedures.length})</h3>
        </div>
        {!procedures.length && (
          <p className="cp-empty">No procedures yet. Import an SOP above to get started.</p>
        )}
        {procedures.map((procedure) => (
          <ProcedureEditor
            key={procedure.id}
            procedure={procedure}
            config={config}
            published={(published.procedures || []).find((entry) => entry.id === procedure.id)}
            editable={editable}
            onChange={replace}
            onDelete={() => setProcedures(procedures.filter((entry) => entry.id !== procedure.id))}
          />
        ))}
      </section>
    </>
  );
}
