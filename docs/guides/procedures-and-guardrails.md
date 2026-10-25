# Procedures and guardrails

Bring standard operating procedures (SOPs) into the servicing assistant. A
procedure tells the assistant how to handle a request, and its guardrails are
enforced by the runtime in code. Customer-facing procedures also ground answers to
general questions through retrieval, with citations.

Procedures are part of the release-governed servicing configuration
(`config.procedures`). A procedure change therefore gets the same semantic diff,
validation, contract simulation, approval, environment promotion, canary and
rollback as an intent change. A conversation that starts on a release keeps that
release's procedures through its confirmations and recovery.

## How a procedure is used

| Situation | What happens |
| --- | --- |
| The recognized intent and channel have an enabled procedure | That procedure governs the turn. Its guardrails are enforced. For intents answered by a model (no banking tool), its steps are added to the system instructions. The response metadata names the procedure (`metadata.procedure` or `finalResponse.procedure`). |
| A general question (`general_inquiry`, `help`, `complaint` or a custom no-tool intent) with no bound procedure | Enabled **customer-audience** procedures for the channel are retrieved. With a generation model, the top excerpts ground the answer. Without a model, the best procedure's steps are quoted verbatim with its source. `citations` and `retrieval` list what was used. |
| A `knowledge_search` intent finds no approved knowledge | The same procedure retrieval is used as a fallback. Approved knowledge always takes precedence. |
| Tool-backed banking intents | Responses stay deterministic and grounded in the banking result, as before. The procedure acts through its guardrails (required details, confirmation, escalation, wording and disclosures), not through model-generated wording. |

Only one enabled procedure may be bound to each channel and intent pair, so the
applied instructions are never ambiguous.

### Audience

- `internal` (default): instructions and guardrails only. Internal procedures are
  never retrieved or quoted to customers, because SOPs often contain internal
  policy (for example fee waivers or supervisor discretion).
- `customer`: may also ground answers to customers. Write these as text that is
  safe to show a customer. An unbound procedure (`intents: []`) must be a customer
  procedure; it is a retrieval-only reference.

Instructions given to a model can still be paraphrased by it. Do not put content in
an internal procedure bound to a model-answered intent that must never reach a
customer; enforce such rules with guardrails instead.

## Guardrails

Guardrails are typed and declarative. Authors never supply code or regular
expressions. Every guardrail records its `id`; decisions carry the procedure and
guardrail IDs into the policy trace and audit.

| Type | Fields | Enforcement |
| --- | --- | --- |
| `require_fields` | `fields` | Each field must already be a required or optional field of every bound intent. The assistant collects them before any tool runs or response is generated. Simulation shows them in `requiredFields`. |
| `require_confirmation` | — | The customer confirms before the action, even for a read-only intent. It can add a confirmation but never remove one an intent already requires. |
| `escalate_when` | `field`, `operator`, `value`, `action` | Evaluated on the collected details before any tool or generated response. `action: handoff` starts the confirmed specialist handoff (the same flow as a human-fulfilled journey). `action: block` stops the request with the guardrail `message`. The first matching rule in authored order decides. A condition on a value the customer has not supplied does not match. |
| `prohibited_phrases` | `phrases` | Case-insensitive literal match on the final response. A match replaces the response with the guardrail `message` (or a safe default). Phrases are also listed in model instructions. |
| `required_disclosure` | `text` | Appended to the response when it does not already contain the text. |

Operators are `eq`, `neq`, `gt`, `gte`, `lt`, `lte` and `in`. Numeric operators
accept amounts such as `5000`, `"5,000"` or `"$5000"`. Text comparison ignores
case and surrounding whitespace. Every guardrail accepts an optional `message`
(maximum 500 characters) and `sourceText` that records where it came from.

An unbound procedure may only carry `prohibited_phrases` and `required_disclosure`.
They apply to any answer grounded in that procedure.

## Importing a procedure document

In Servicing Studio open **Procedures & guardrails**, then:

1. Enter the governing **source** (for example `SOP-CARD-014 rev 3` or an HTTPS
   link), choose the audience, the bound intents and channels.
2. Paste or upload Markdown or text (up to 30,000 characters; split longer manuals
   into one document per procedure) and choose **Parse document**.
3. Review the parsed steps, guardrails, warnings and suggestions. Remove anything
   wrong and **Accept** suggestions you agree with.
4. **Add to draft**. The procedure is added disabled. Edit it, enable it, **Save
   draft**, simulate, and publish through the normal release gates.

Parsing is deterministic and never saves anything. It reads:

- **Steps**: numbered list items (and bullets under a heading such as "Steps" or
  "Procedure"). Indented continuation lines join the previous step.
- **Guardrails**: lines under a heading such as "Guardrails", "Policy", "Rules",
  "Controls" or "Compliance", in this grammar:

  ```text
  Require confirmation
  Require fields: replacementAddress, reason
  Escalate [to a specialist] when amount > 5000
  Escalate when amount is at least 2500
  Hand off when disputeType in [fraudulent_charge, unauthorized_transaction]
  Block when reason is not lost
  Never say: "no fee", "guaranteed delivery date"
  Disclose: Replacement cards arrive within 5 to 7 business days.
  ```

  Comparators include `>`, `>=`, `<`, `<=`, `=`, `!=`, `is`, `is not`, `over`,
  `above`, `under`, `below`, `at least`, `at most`, `more than`, `less than` and
  `in`. A line that does not match is reported as a warning and **not enforced**.
- **Suggestions**: policy-like sentences elsewhere, for example "must confirm",
  "transfers over $10,000 must be referred to a specialist", "never say
  \"...\"" (quoted phrases only), "always tell the customer that ..." and "must
  verify the delivery address" (when it names a declared field). Each suggestion
  shows its source sentence. Suggestions already covered by an explicit rule are
  omitted.

The response also lists `errors` that would block saving the procedure against the
current draft, for example a guardrail field the bound intent does not collect.

See [the example SOP](../examples/procedures/card-replacement-sop.md).

## Configuration reference

```text
{
  id, title, source, enabled,
  audience?: "internal" | "customer",
  intents: string[],              // configured intents; [] = customer reference
  channels: ("digital"|"ava"|"ivr")[],
  summary?: string,               // ≤ 1,000 characters
  steps: [{ id, instruction }],   // 1–40 steps, ≤ 1,000 characters each
  body?: string,                  // full text, ≤ 30,000 characters; retrieval source
  guardrails?: Guardrail[]        // ≤ 20
}
```

Limits: 100 procedures per configuration and 50 bound intents per procedure.
Title, summary, body, steps and guardrail text pass the same sensitive-content
preflight as approved knowledge (email addresses, card-like numbers and Social
Security number patterns are rejected). `source` must be a named reference or an
HTTP(S) URL without embedded credentials.

The control plane validates the complete contract on draft save, publish and
solution-package preview. The orchestrator re-validates the published shape and
fails closed with `configuration_unavailable` when a snapshot is unsafe.

Procedures travel in [solution packages](platform-readiness.md) and merge by `id`;
a changed procedure with the same `id` is reported as a conflict for review.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/control-plane/studio/procedures/parse` | Editor/admin. Body `{document:{source,content,title?,id?,intents?,channels?,audience?}}`. Returns `{procedure,suggestions,warnings,errors,replaces}`. Nothing is stored. |
| PUT | `/api/control-plane/draft` | Save `config.procedures` with the rest of the draft. |
| POST | `/api/orchestrator/llm/retrieval/evaluate` | Editor/admin, 10 per minute. Body `{config,cases,channel?,minSimilarity?}`; `cases` are `{question, expectedProcedureId|null}`. Returns per-strategy scores, the suggested floor and per-case results. Nothing is stored. |
| POST | `/api/control-plane/simulate` | `{channel,utterance}` returns `procedure` (id, title, source, step count, guardrail IDs/types) and `requiredFields` including procedure fields. |

## Retrieval

`config.retrieval` selects how customer-audience procedures are found. It is part
of the release, so a strategy change goes through the same diff, approval, canary
and rollback as any other change, and each session keeps the strategy it was
pinned to.

```text
retrieval?: {
  strategy: "lexical" | "semantic" | "hybrid",   // default lexical
  minSimilarity?: number,     // 0–1 cosine floor; required for semantic and hybrid
  maxResults?: number,        // excerpts per answer, 1–5, default 3
  queryPrefix?: string,       // ≤ 64 characters, for models that need a task prefix
  documentPrefix?: string     // for example "search_query: " / "search_document: "
}
```

| Strategy | How chunks are ranked | Needs a model |
| --- | --- | --- |
| `lexical` | BM25 (k1 = 1.2, b = 0.75). A chunk must match at least two distinct query terms (one for a one-word question) and 30% of them, so one incidental shared word cannot ground an answer. | No |
| `semantic` | Cosine similarity between the question embedding and each chunk embedding. Chunks below `minSimilarity` are dropped. Paraphrases with no shared words can match. | Embedding route |
| `hybrid` | Reciprocal-rank fusion (k = 60) of the BM25 ranking (top 20) and the cosine ranking above the floor. A chunk qualifies through either ranking. Fusing ranks avoids calibrating BM25 against cosine scores. | Embedding route |

Chunks are the title and summary, each step, and body paragraphs of up to 800
characters. The procedure title is part of every chunk, both for BM25 and in the
embedded text. Ties break by procedure ID. Only enabled, customer-audience
procedures for the current channel in the pinned release are considered.

### Embedding route

Semantic and hybrid retrieval need `llm.enabled` and an `llm.routing.embedding`
profile. The control plane and the orchestrator both reject a semantic or hybrid
release without one. The profile can use any provider plugin with embedding
support: Ollama (`/api/embed`), OpenAI and OpenAI-compatible (`/embeddings`),
Gemini (`batchEmbedContents`, with the query and document task types) and Vertex
Gemini (`predict`). See [model providers](llm-providers.md#embeddings).

Some embedding models are trained with task prefixes (for example nomic-embed
expects `search_query: ` and `search_document: `, and E5 expects `query: ` and
`passage: `). Set `queryPrefix` and `documentPrefix` for those; leave them empty
for others. The prefix is part of the embedded text, so changing it re-embeds the
procedures.

### Index lifecycle

- **Content-addressed.** Each chunk vector is keyed by a SHA-256 of the provider,
  model and exact embedded text. Editing a procedure, changing a prefix or
  switching model produces new keys; a stale vector is never reused. An edit
  re-embeds only the changed chunks.
- **Shared and durable.** Vectors are held in an in-memory LRU (20,000 entries)
  and, when workflow persistence uses PostgreSQL, in
  `servicing_retrieval_embeddings` (migration `V3`). Restarted and additional
  replicas reuse stored vectors instead of re-embedding. The table holds only
  hashes, provider, model and vectors: no procedure text and no questions.
  Rows not used for 30 days are pruned.
- **Never blocks a customer.** On each message, once the release is resolved,
  the orchestrator starts embedding any of the channel's procedure chunks that
  are not yet indexed, in the background. If a question arrives while more than
  64 chunks are still missing, it is answered with lexical retrieval and reported
  as `index_warming`; 64 or fewer are embedded inline. Batches of 32 are sent one
  at a time, a batch already in flight for the same text is joined rather than
  repeated, and the first provider failure stops the rest.
- **Questions are not stored.** The customer's question is embedded on every
  request and is never cached or persisted. Embedding calls are metered as
  `service: embedding`, `metric: input_tokens` usage events like other model
  calls.

### Fallback

Retrieval only grounds answers; procedure binding and guardrails never depend on
it. If semantic retrieval cannot run, that answer uses lexical retrieval, and the
response reports `retrievalMode: "lexical_fallback"` with `retrievalFallback`:

| Reason | Cause |
| --- | --- |
| `index_warming` | The release's procedures are still being embedded. |
| `index_too_large` | More than 10,000 eligible chunks. |
| `embedding_mismatch` | Query and document vectors have different dimensions. |
| `embedding_unavailable` | The embedding provider failed, timed out or returned an invalid response. |
| `retrieval_error` | Any other retrieval failure. |

Otherwise `retrievalMode` is `lexical`, `semantic` or `hybrid`. Matches carry
`score`, plus `similarity` (semantic and hybrid) and `lexicalScore` (hybrid,
when BM25 also ranked the chunk).

### Evaluating and calibrating

Cosine similarity ranges differ widely between models, so a floor that suits one
model is wrong for another. The **Retrieval** panel in Studio's **Procedures & guardrails** section (and
`POST /api/orchestrator/llm/retrieval/evaluate`) measures the draft as shown,
including unsaved edits, before it is published:

- Enter up to 50 cases, one per line: `question | procedure_id`, or
  `question | none` when nothing should match. Include paraphrases and off-topic
  questions.
- Each strategy reports top result correct (hit@1), correct in top 3 (hit@3),
  mean reciprocal rank and correct "no match" rate. Semantic and hybrid are
  reported as unavailable with the reason when there is no embedding route or the
  model fails.
- The suggested floor is the midpoint of the widest contiguous range of floors
  (0.01 steps) that gets the most cases right, counting a "none" case right when
  every procedure scores below the floor. With no "none" cases, the suggestion is
  based on matched cases only and says so. **Use** applies it to the draft.

Questions and customer procedure text are sent to the configured embedding
model. Questions are not stored. Procedure chunk vectors go into the shared index
like any other, so evaluating a draft also prepares the index for its release.
Evaluation embedding calls are not metered as servicing usage.

### Measured behavior

Evaluated with a small open embedding model (WordLlama `l2_supercat`, 256
dimensions, served through the OpenAI-compatible plugin) on 8 customer procedures
and 25 cases: 21 answerable, 7 of them paraphrases sharing almost no words with
the procedure, and 4 off-topic.

| Strategy | Floor | Top result correct | Correct "no match" |
| --- | --- | --- | --- |
| Lexical | — | 67% | 75% |
| Semantic | 0.50 (default) | 62% | 100% |
| Hybrid | 0.50 (default) | 67% | 75% |
| Semantic | 0.19 (suggested) | 90% | 75% |
| Hybrid | 0.19 (suggested) | 90% | 75% |

Lexical retrieval found none of the 7 paraphrases; semantic found 5. The
uncalibrated default floor was too high for this model, which is why calibration
is part of the workflow. All three strategies wrongly matched "open a business
account" to the statement-download procedure. A larger embedding model will
score differently: run the evaluation with your own model and cases before
publishing.

## Limits and next steps

- Lexical retrieval misses paraphrases that share no terms with the procedure;
  semantic and hybrid retrieval need an embedding model and a calibrated floor.
  Retrieval quality depends on the model and on the evaluation cases; there is no
  continuous offline evaluation against production questions, and no reranker.
- Vectors are compared in the orchestrator, which suits procedure sets up to
  10,000 chunks per channel. Larger corpora need a vector database.
- Procedure steps instruct model-answered intents; tool-backed intents follow
  their code-owned workflow and the procedure's guardrails. Steps are not compiled
  into a new workflow.
- Prohibited-phrase matching is literal. It catches the exact wording, not every
  paraphrase.
- The agent workspace does not yet show the governing procedure to human agents,
  and document import accepts text and Markdown only (no PDF or Word extraction or
  source synchronization).
- Procedures are stored in the release snapshot, which is also pinned to each
  session. Keep bodies focused; very large procedure sets increase session storage.

## Verification

- `services/api-gateway/control-plane/__tests__/procedures.test.js`: validation,
  grammar, import, suggestions, Studio routes, simulation, solution packages and
  control-plane/orchestrator parity.
- `services/ai-orchestrator/src/services/__tests__/procedureRuntime.test.js`:
  snapshot validation, conditions, gates, response guardrails, retrieval and the
  published runtime handoff.
- `services/ai-orchestrator/src/workflows/__tests__/procedureGuardrails.test.js`:
  the guardrails and the retriever exercised through the real LangGraph workflow.
- `services/ai-orchestrator/src/services/__tests__/procedureRetrieval.test.js`:
  semantic and hybrid ranking, the similarity floor, fallbacks, task prefixes, the
  content-addressed index, warming and the PostgreSQL vector store (with
  `RUNTIME_TEST_DATABASE_URL`).
- `services/ai-orchestrator/src/llm/__tests__/embeddings.test.js` and
  `retrievalEvaluation.test.js`: the provider embedding contract for each plugin,
  usage metering, the evaluation route and floor calibration.
- `services/frontend/src/components/control-plane/ProcedureConsole.test.ts` and
  `RetrievalPanel.test.ts`: guardrail wording, the import client and evaluation
  case parsing.
