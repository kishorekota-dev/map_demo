import { useState } from "react";
import { authenticatedRequest as request } from "@/services/controlPlaneService";
import type { ConsolePermissions } from "@/types/servicingStudio";
import {
  ConsoleField as Field,
  JsonEvidence,
  StatusPill,
  formatDate,
  useConsoleAction,
} from "./ConsoleElements";

interface CostRate {
  provider: string;
  service: string;
  metric: string;
  unitPrice: number | null;
}
const metricPresets = [
  ["openai", "generation", "input_tokens"],
  ["openai", "generation", "output_tokens"],
  ["slm", "extraction", "input_tokens"],
  ["slm", "extraction", "output_tokens"],
  ["recognition", "intent_recognition", "input_tokens"],
  ["recognition", "intent_recognition", "output_tokens"],
  ["mcp", "tool_execution", "calls"],
];
interface CostModel {
  id: string;
  revision: number;
  currency: string;
  rates: CostRate[];
}
interface CostReport {
  windowDays: number;
  currency: string | null;
  pricedCost: number | null;
  pricedRecords: number;
  unpricedRecords: number;
  totalRecords: number;
  completedInteractions: number;
  costPerCompletedInteraction: number | null;
  coverage: "complete" | "partial" | "unpriced" | "no_usage";
  byCurrency: Array<{
    currency: string;
    pricedCost: number;
    pricedRecords: number;
  }>;
  byDimension: Array<{
    provider: string;
    service: string;
    metric: string;
    currency: string | null;
    units: number;
    pricedCost: number;
    pricedRecords: number;
    unpricedRecords: number;
  }>;
  limitations: string[];
}
interface VoiceCall {
  id: string;
  sessionId: string;
  connectionId: string;
  status: "starting" | "active" | "reconciliation_required" | "ended";
  createdAt: string;
  ended?: boolean;
  lastError?: string;
}
const money = (value: number, currency: string | null) =>
  `${currency || "Currency not set"} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;

export function CostConsole({
  permissions,
  edit = false,
}: {
  permissions: ConsolePermissions;
  edit?: boolean;
}) {
  const action = useConsoleAction();
  const [model, setModel] = useState<CostModel | null>(null);
  const [report, setReport] = useState<CostReport | null>(null);
  const [days, setDays] = useState(30);
  return (
    <section className="cp-panel">
      <div className="cp-panel-heading">
        <div>
          <span className="cp-eyebrow">Measured usage</span>
          <h3>
            {edit ? "Usage pricing model" : "Servicing cost observations"}
          </h3>
        </div>
        <StatusPill warning={report?.coverage !== "complete"}>
          {report
            ? report.coverage === "no_usage"
              ? "No usage recorded"
              : `${report.coverage} pricing coverage`
            : "No report loaded"}
        </StatusPill>
      </div>
      {action.messages}
      <p>
        Costs use recorded provider usage and the rates captured when it was
        ingested. Missing rates remain unpriced; model changes apply to future
        records.
      </p>
      <div className="cp-inline-form">
        <Field label="Cost observation window (days)">
          <input
            type="number"
            min="1"
            max="365"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        </Field>
        <button
          className="cp-button cp-button--quiet"
          disabled={action.busy || days < 1}
          onClick={() =>
            void action.run(async () =>
              setReport(
                await request<CostReport>(`/operations/costs?days=${days}`),
              ),
            )
          }
        >
          Load measured usage
        </button>
        {edit && (
          <button
            className="cp-button cp-button--quiet"
            disabled={action.busy || !permissions.canPublish}
            onClick={() =>
              void action.run(async () =>
                setModel(await request<CostModel>("/operations/cost-model")),
              )
            }
          >
            Load pricing model
          </button>
        )}
      </div>
      {report && (
        <>
          <div className="cp-stat-grid">
            <article>
              <span>Priced usage cost</span>
              <strong className="cp-cost-number">
                {report.pricedCost === null
                  ? report.pricedRecords
                    ? "See currency breakdown"
                    : "—"
                  : money(report.pricedCost, report.currency)}
              </strong>
              <p>{report.pricedRecords} priced records</p>
            </article>
            <article>
              <span>Unpriced records</span>
              <strong>{report.unpricedRecords}</strong>
              <p>{report.totalRecords} usage records observed</p>
            </article>
            <article>
              <span>Completed interactions</span>
              <strong>{report.completedInteractions}</strong>
              <p>Recorded outcomes</p>
            </article>
            <article>
              <span>Priced cost / completion</span>
              <strong className="cp-cost-number">
                {report.costPerCompletedInteraction === null
                  ? "—"
                  : money(report.costPerCompletedInteraction, report.currency)}
              </strong>
              <p>
                {report.coverage === "complete"
                  ? "Full priced coverage"
                  : "Unavailable without complete priced coverage"}
              </p>
            </article>
          </div>
          {report.byCurrency?.length > 1 && (
            <div className="cp-operational-status">
              {report.byCurrency.map((entry) => (
                <StatusPill key={entry.currency}>
                  {money(entry.pricedCost, entry.currency)} ·{" "}
                  {entry.pricedRecords} records
                </StatusPill>
              ))}
            </div>
          )}
          {report.byDimension.length ? (
            <div className="cp-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Provider / service</th>
                    <th>Metric</th>
                    <th>Recorded units</th>
                    <th>Priced cost</th>
                    <th>Unpriced records</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byDimension.map((entry, index) => (
                    <tr key={index}>
                      <td>
                        {entry.provider}
                        <small>{entry.service}</small>
                      </td>
                      <td>{entry.metric}</td>
                      <td>{entry.units.toLocaleString()}</td>
                      <td>
                        {entry.pricedRecords
                          ? money(entry.pricedCost, entry.currency)
                          : "Unpriced"}
                      </td>
                      <td>{entry.unpricedRecords}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="cp-empty">No usage observations in this window.</p>
          )}
          {report.limitations.map((limitation, index) => (
            <p className="cp-footnote" key={index}>
              {limitation}
            </p>
          ))}
        </>
      )}
      {edit && model && (
        <fieldset
          className="cp-fieldset cp-add"
          disabled={!permissions.canPublish || action.busy}
        >
          <div className="cp-panel-heading">
            <h3>Rates per recorded unit</h3>
            <StatusPill>Revision {model.revision}</StatusPill>
          </div>
          <Field
            label="Add a measured metric"
            hint="Choose a recorded dimension, then enter your contracted price per unit. No prices are prefilled."
          >
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const [provider, service, metric] = e.target.value.split("/");
                setModel({
                  ...model,
                  rates: [
                    ...model.rates,
                    { provider, service, metric, unitPrice: null },
                  ],
                });
              }}
            >
              <option value="">Select a metric preset</option>
              {metricPresets.map((parts) => (
                <option key={parts.join("/")} value={parts.join("/")}>
                  {parts.join(" / ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pricing currency">
            <input
              maxLength={3}
              value={model.currency}
              onChange={(e) =>
                setModel({ ...model, currency: e.target.value.toUpperCase() })
              }
            />
          </Field>
          {model.rates.map((rate, index) => (
            <div className="cp-rate-row" key={index}>
              <Field label={`Provider for rate ${index + 1}`}>
                <input
                  value={rate.provider}
                  onChange={(e) =>
                    setModel({
                      ...model,
                      rates: model.rates.map((entry, at) =>
                        at === index
                          ? { ...entry, provider: e.target.value }
                          : entry,
                      ),
                    })
                  }
                />
              </Field>
              <Field label={`Service for rate ${index + 1}`}>
                <input
                  value={rate.service}
                  onChange={(e) =>
                    setModel({
                      ...model,
                      rates: model.rates.map((entry, at) =>
                        at === index
                          ? { ...entry, service: e.target.value }
                          : entry,
                      ),
                    })
                  }
                />
              </Field>
              <Field label={`Metric for rate ${index + 1}`}>
                <input
                  value={rate.metric}
                  onChange={(e) =>
                    setModel({
                      ...model,
                      rates: model.rates.map((entry, at) =>
                        at === index
                          ? { ...entry, metric: e.target.value }
                          : entry,
                      ),
                    })
                  }
                  placeholder="input_tokens"
                />
              </Field>
              <Field label={`Unit price for rate ${index + 1}`}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={rate.unitPrice ?? ""}
                  onChange={(e) =>
                    setModel({
                      ...model,
                      rates: model.rates.map((entry, at) =>
                        at === index
                          ? {
                              ...entry,
                              unitPrice:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            }
                          : entry,
                      ),
                    })
                  }
                />
              </Field>
              <button
                className="cp-link cp-link--danger"
                onClick={() =>
                  setModel({
                    ...model,
                    rates: model.rates.filter((_, at) => at !== index),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <div className="cp-actions cp-add">
            <button
              className="cp-button cp-button--quiet"
              onClick={() =>
                setModel({
                  ...model,
                  rates: [
                    ...model.rates,
                    { provider: "", service: "", metric: "", unitPrice: null },
                  ],
                })
              }
            >
              + Add usage rate
            </button>
            <button
              className="cp-button"
              disabled={
                model.currency.length !== 3 ||
                model.rates.some(
                  (rate) =>
                    rate.unitPrice === null ||
                    !Number.isFinite(rate.unitPrice) ||
                    rate.unitPrice < 0 ||
                    !rate.provider.trim() ||
                    !rate.service.trim() ||
                    !rate.metric.trim(),
                )
              }
              onClick={() =>
                void action.run(async () => {
                  setModel(
                    await request<CostModel>("/operations/cost-model", "PUT", {
                      revision: model.revision,
                      currency: model.currency,
                      rates: model.rates,
                    }),
                  );
                  action.setNotice(
                    "Pricing model saved. Future usage records use the updated rates.",
                  );
                })
              }
            >
              Save pricing model
            </button>
          </div>
        </fieldset>
      )}
    </section>
  );
}

export function PrivacyConsole({
  permissions,
}: {
  permissions: ConsolePermissions;
}) {
  const action = useConsoleAction();
  const [subject, setSubject] = useState("");
  const [evidence, setEvidence] = useState<Record<string, unknown> | null>(
    null,
  );
  const [previewSubject, setPreviewSubject] = useState("");
  return (
    <section className="cp-panel">
      <div className="cp-panel-heading">
        <h3>Subject privacy requests</h3>
        <StatusPill>Administrator</StatusPill>
      </div>
      {action.messages}
      <p>
        Inspect a local account's retained operational records, preview erasure,
        and apply the reviewed request. The API blocks erasure with unresolved
        cases or active calls and retains minimal replay-protection records.
      </p>
      <div className="cp-inline-form">
        <Field label="Privacy request user ID">
          <input
            value={subject}
            disabled={!permissions.canPublish || action.busy}
            onChange={(e) => {
              setSubject(e.target.value);
              setEvidence(null);
              setPreviewSubject("");
            }}
          />
        </Field>
        <button
          className="cp-button cp-button--quiet"
          disabled={!permissions.canPublish || action.busy || !subject.trim()}
          onClick={() =>
            void action.run(async () =>
              setEvidence(
                await request<Record<string, unknown>>(
                  `/operations/privacy/subjects/${encodeURIComponent(subject)}`,
                ),
              ),
            )
          }
        >
          Inspect subject records
        </button>
        <button
          className="cp-button cp-button--quiet"
          disabled={!permissions.canPublish || action.busy || !subject.trim()}
          onClick={() =>
            void action.run(async () => {
              setEvidence(
                await request<Record<string, unknown>>(
                  `/operations/privacy/subjects/${encodeURIComponent(subject)}/erase`,
                  "POST",
                  { dryRun: true },
                ),
              );
              setPreviewSubject(subject);
            })
          }
        >
          Preview subject erasure
        </button>
        <button
          className="cp-button"
          disabled={
            !permissions.canPublish ||
            action.busy ||
            !previewSubject ||
            previewSubject !== subject
          }
          onClick={() =>
            void action.run(async () => {
              setEvidence(
                await request<Record<string, unknown>>(
                  `/operations/privacy/subjects/${encodeURIComponent(subject)}/erase`,
                  "POST",
                  { dryRun: false },
                ),
              );
              setPreviewSubject("");
              action.setNotice(
                "The reviewed subject erasure request was applied.",
              );
            })
          }
        >
          Apply reviewed erasure
        </button>
      </div>
      {evidence && (
        <JsonEvidence value={evidence} title="Subject request evidence" />
      )}
    </section>
  );
}

export function VoiceRecoveryConsole({
  permissions,
}: {
  permissions: ConsolePermissions;
}) {
  const action = useConsoleAction();
  const [page, setPage] = useState<{
    items: VoiceCall[];
    total: number;
  } | null>(null);
  const [offset, setOffset] = useState(0);
  const [call, setCall] = useState<VoiceCall | null>(null);
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const load = async (nextOffset: number) => {
    setPage(
      await request<{ items: VoiceCall[]; total: number }>(
        `/operations/voice-calls?limit=25&offset=${nextOffset}`,
      ),
    );
    setOffset(nextOffset);
  };
  return (
    <section className="cp-panel">
      <div className="cp-panel-heading">
        <div>
          <span className="cp-eyebrow">Voice operations</span>
          <h3>Call recovery</h3>
        </div>
        <button
          className="cp-button cp-button--quiet"
          disabled={action.busy || !permissions.canOperate}
          onClick={() => void action.run(async () => load(0))}
        >
          Load recorded calls
        </button>
      </div>
      {action.messages}
      <p>
        Review uncertain voice starts and abandoned calls. Recovery records a
        terminal outcome; it does not resume an uncertain call or duplicate
        customer input.
      </p>
      {page &&
        (page.items.length ? (
          <div className="cp-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Call / session</th>
                  <th>Connection</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.id}
                      <small>{entry.sessionId}</small>
                    </td>
                    <td>{entry.connectionId}</td>
                    <td>{entry.status}</td>
                    <td>{formatDate(entry.createdAt)}</td>
                    <td>
                      <button
                        className="cp-link"
                        disabled={
                          !permissions.canOperate ||
                          !["starting", "reconciliation_required"].includes(
                            entry.status,
                          )
                        }
                        onClick={() => {
                          setCall(entry);
                          setReference("");
                          setNote("");
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
          <p className="cp-empty">No recorded calls.</p>
        ))}
      {page && (
        <div className="cp-pagination">
          <button
            className="cp-button cp-button--quiet"
            disabled={action.busy || offset === 0}
            onClick={() =>
              void action.run(async () => load(Math.max(0, offset - 25)))
            }
          >
            Previous
          </button>
          <span>{page.total} calls</span>
          <button
            className="cp-button cp-button--quiet"
            disabled={action.busy || offset + 25 >= page.total}
            onClick={() => void action.run(async () => load(offset + 25))}
          >
            Next
          </button>
        </div>
      )}
      {call && (
        <fieldset
          className="cp-fieldset cp-add"
          disabled={!permissions.canOperate || action.busy}
        >
          <h3>Resolve call {call.id}</h3>
          {call.lastError && <p className="cp-footnote">{call.lastError}</p>}
          <div className="cp-form-grid cp-add">
            <Field label="Call investigation reference">
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <Field label="Call recovery note">
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
          <button
            className="cp-button"
            disabled={!note.trim() || !reference.trim()}
            onClick={() =>
              void action.run(async () => {
                await request(
                  `/operations/voice-calls/${encodeURIComponent(call.id)}/abandon`,
                  "POST",
                  { note, reference },
                );
                setCall(null);
                await load(offset);
                action.setNotice(
                  "Call recovery recorded as ended. No call was resumed.",
                );
              })
            }
          >
            Mark investigated call as ended
          </button>
        </fieldset>
      )}
    </section>
  );
}
