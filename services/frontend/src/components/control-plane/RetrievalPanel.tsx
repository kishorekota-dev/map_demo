import { useState } from "react";
import modelProviderService, {
  type RetrievalCase,
  type RetrievalEvaluation,
} from "@/services/modelProviderService";
import type {
  ChannelId,
  RetrievalSettings,
  RetrievalStrategy,
  ServicingConfig,
} from "@/types/controlPlane";
import { ConsoleField as Field, useConsoleAction } from "./ConsoleElements";

const STRATEGIES: Array<{ id: RetrievalStrategy; label: string }> = [
  { id: "lexical", label: "Lexical (BM25, no model)" },
  { id: "semantic", label: "Semantic (embeddings)" },
  { id: "hybrid", label: "Hybrid (BM25 + embeddings)" },
];
const NO_MATCH = new Set(["none", "-", "null"]);
const PREFIXES = [
  {
    key: "queryPrefix",
    label: "Question prefix",
    placeholder: "search_query: ",
  },
  {
    key: "documentPrefix",
    label: "Procedure prefix",
    placeholder: "search_document: ",
  },
] as const;

/** One case per line: `question | procedure_id`, or `question | none`. */
export function parseCases(
  text: string,
  procedureIds: string[],
): { cases: RetrievalCase[]; errors: string[] } {
  const cases: RetrievalCase[] = [];
  const errors: string[] = [];
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const separator = line.lastIndexOf("|");
      if (separator < 1) {
        errors.push(
          `Line ${index + 1}: use "question | procedure_id" or "question | none".`,
        );
        return;
      }
      const question = line.slice(0, separator).trim();
      const expected = line.slice(separator + 1).trim();
      if (!question) errors.push(`Line ${index + 1}: the question is empty.`);
      else if (NO_MATCH.has(expected.toLowerCase()))
        cases.push({ question, expectedProcedureId: null });
      else if (!procedureIds.includes(expected))
        errors.push(
          `Line ${index + 1}: "${expected}" is not a procedure in this draft.`,
        );
      else cases.push({ question, expectedProcedureId: expected });
    });
  return { cases, errors };
}

const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;

export default function RetrievalPanel({
  config,
  onChange,
  editable,
}: {
  config: ServicingConfig;
  onChange: (config: ServicingConfig) => void;
  editable: boolean;
}) {
  const retrieval: RetrievalSettings = config.retrieval || {
    strategy: "lexical",
  };
  const semantic = retrieval.strategy !== "lexical";
  const embeddingRouted = Boolean(
    config.llm?.enabled && config.llm.routing.embedding,
  );
  const [casesText, setCasesText] = useState("");
  const [channel, setChannel] = useState<ChannelId>("digital");
  const [evaluation, setEvaluation] = useState<RetrievalEvaluation | null>(
    null,
  );
  const action = useConsoleAction();
  const update = (next: RetrievalSettings) =>
    onChange({ ...config, retrieval: next });
  const procedureIds = (config.procedures || []).map(
    (procedure) => procedure.id,
  );

  const run = () =>
    action.run(async () => {
      const { cases, errors } = parseCases(casesText, procedureIds);
      if (errors.length) throw new Error(errors.join(" "));
      if (!cases.length) throw new Error("Add at least one case.");
      setEvaluation(
        await modelProviderService.evaluateRetrieval({
          config,
          cases,
          channel,
        }),
      );
    });

  return (
    <section className="cp-panel" aria-labelledby="procedure-retrieval">
      <div className="cp-panel-heading">
        <span className="cp-eyebrow">Retrieval</span>
        <h3 id="procedure-retrieval">How customer procedures are found</h3>
      </div>
      <p>
        Customer-audience procedures ground answers to general questions.
        Lexical retrieval matches words. Semantic retrieval matches meaning with
        an embedding model, so paraphrases are found. Hybrid combines both
        rankings. If the embedding model is unavailable, retrieval falls back to
        lexical for that answer. Procedure guardrails never depend on retrieval.
      </p>
      <fieldset className="cp-fieldset" disabled={!editable}>
        <div className="cp-form-grid">
          <Field label="Strategy">
            <select
              value={retrieval.strategy}
              onChange={(e) => {
                const strategy = e.target.value as RetrievalStrategy;
                update(
                  strategy === "lexical"
                    ? {
                        strategy,
                        ...(retrieval.maxResults
                          ? { maxResults: retrieval.maxResults }
                          : {}),
                      }
                    : {
                        ...retrieval,
                        strategy,
                        minSimilarity: retrieval.minSimilarity ?? 0.5,
                      },
                );
              }}
            >
              {STRATEGIES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
          {semantic && (
            <Field
              label="Similarity floor"
              hint="Cosine similarity from 0 to 1. Ranges differ by model; use the evaluation below to calibrate it."
            >
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={retrieval.minSimilarity ?? 0.5}
                onChange={(e) =>
                  update({
                    ...retrieval,
                    minSimilarity: Number(e.target.value),
                  })
                }
              />
            </Field>
          )}
          {semantic &&
            PREFIXES.map(({ key, label, placeholder }) => (
              <Field
                key={key}
                label={label}
                hint="Only for embedding models that require a task prefix; leave empty otherwise. Changing it re-embeds procedures."
              >
                <input
                  value={retrieval[key] ?? ""}
                  maxLength={64}
                  placeholder={placeholder}
                  onChange={(e) => {
                    const { [key]: _removed, ...rest } = retrieval;
                    update(
                      e.target.value
                        ? { ...rest, [key]: e.target.value }
                        : rest,
                    );
                  }}
                />
              </Field>
            ))}
          <Field
            label="Maximum excerpts"
            hint="Procedure excerpts used to ground one answer (1–5)."
          >
            <input
              type="number"
              min={1}
              max={5}
              step={1}
              value={retrieval.maxResults ?? 3}
              onChange={(e) =>
                update({ ...retrieval, maxResults: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        {semantic && !embeddingRouted && (
          <div className="cp-alert cp-alert--pending" role="status">
            Assign an embedding profile in Models &amp; providers and enable
            model-assisted servicing. The draft cannot be saved with semantic
            retrieval until then.
          </div>
        )}
      </fieldset>

      <h4>Evaluate retrieval</h4>
      <p className="cp-footnote">
        One case per line: <code>question | procedure_id</code>, or{" "}
        <code>question | none</code> when nothing should match. Include
        paraphrases and off-topic questions. The draft is evaluated as shown,
        including unsaved edits. Questions and customer procedure text are sent
        to the configured embedding model. Questions are not stored; procedure
        vectors (not text) are cached, which also prepares the index for
        publishing.
      </p>
      <fieldset className="cp-fieldset" disabled={!editable || action.busy}>
        <Field label="Cases" wide>
          <textarea
            rows={6}
            value={casesText}
            placeholder={
              "I'm going overseas next month, should I tell you? | travel_notice\nWhat is your mortgage rate? | none"
            }
            onChange={(e) => setCasesText(e.target.value)}
          />
        </Field>
        <div className="cp-form-grid">
          <Field label="Channel">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as ChannelId)}
            >
              <option value="digital">Digital</option>
              <option value="ava">AVA</option>
              <option value="ivr">IVR</option>
            </select>
          </Field>
        </div>
        <button
          type="button"
          className="cp-button"
          disabled={!casesText.trim()}
          onClick={run}
        >
          Run evaluation
        </button>
      </fieldset>
      {action.messages}
      {evaluation && (
        <div className="cp-retrieval-evaluation">
          <p className="cp-footnote">
            {evaluation.embedding
              ? `Embedding model ${evaluation.embedding.model} on ${evaluation.embedding.providerId}; similarity floor ${evaluation.minSimilarity}.`
              : "No embedding route is configured; only lexical retrieval was measured."}
          </p>
          <div className="cp-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Strategy</th>
                  <th scope="col">Top result correct</th>
                  <th scope="col">Correct in top 3</th>
                  <th scope="col">MRR</th>
                  <th scope="col">Correct “no match”</th>
                </tr>
              </thead>
              <tbody>
                {STRATEGIES.map(({ id, label }) => {
                  const score = evaluation.strategies[id];
                  return (
                    <tr key={id}>
                      <th scope="row">{label}</th>
                      {score.available ? (
                        <>
                          <td>{percent(score.hitAt1)}</td>
                          <td>{percent(score.hitAt3)}</td>
                          <td>
                            {score.mrr === null ? "—" : score.mrr.toFixed(2)}
                          </td>
                          <td>{percent(score.correctRejections)}</td>
                        </>
                      ) : (
                        <td colSpan={4}>
                          Unavailable: {score.reason.replace(/_/g, " ")}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {evaluation.calibration && (
            <div className="cp-alert cp-alert--success" role="status">
              Suggested similarity floor:{" "}
              <strong>{evaluation.calibration.minSimilarity}</strong> (
              {evaluation.calibration.correct} of {evaluation.calibration.cases}{" "}
              cases correct
              {evaluation.calibration.basis === "matched_cases_only"
                ? "; add “none” cases to calibrate rejections"
                : ""}
              ).{" "}
              {semantic && (
                <button
                  type="button"
                  className="cp-button cp-button--light"
                  disabled={!editable}
                  onClick={() =>
                    update({
                      ...retrieval,
                      minSimilarity: evaluation.calibration!.minSimilarity,
                    })
                  }
                >
                  Use {evaluation.calibration.minSimilarity}
                </button>
              )}
            </div>
          )}
          <details className="cp-evidence">
            <summary>Case results</summary>
            <div className="cp-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Question</th>
                    <th scope="col">Expected</th>
                    <th scope="col">Lexical</th>
                    <th scope="col">Semantic</th>
                    <th scope="col">Hybrid</th>
                    <th scope="col">Similarity (expected / best)</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluation.results.map((result, index) => (
                    <tr key={index}>
                      <td>{result.question}</td>
                      <td>{result.expectedProcedureId || "none"}</td>
                      {(
                        ["lexical", "semantic", "hybrid"] as RetrievalStrategy[]
                      ).map((strategy) => (
                        <td key={strategy}>
                          {result.strategies[strategy]?.procedures[0] || "—"}
                        </td>
                      ))}
                      <td>
                        {result.similarity
                          ? `${result.similarity.expected ?? "—"} / ${result.similarity.best ?? "—"}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
