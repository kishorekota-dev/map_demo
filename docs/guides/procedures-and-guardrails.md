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
| POST | `/api/control-plane/simulate` | `{channel,utterance}` returns `procedure` (id, title, source, step count, guardrail IDs/types) and `requiredFields` including procedure fields. |

## Retrieval

Retrieval is deterministic BM25 (k1 = 1.2, b = 0.75) over chunks of each eligible
procedure: the title and summary, each step, and body paragraphs of up to 800
characters. The procedure title contributes to every chunk. Terms are
Unicode-normalized, lowercased, filtered for common stop words and lightly stemmed.
A chunk must match at least two distinct query terms (one for a one-word question)
and 30% of them, so a single incidental shared word cannot ground an answer. Ties
break by procedure ID. The top three chunks are used.

Retrieval considers only enabled, customer-audience procedures for the current
channel in the pinned release. It runs in the orchestrator against that snapshot,
so no extra network call or index service is involved.

## Limits and next steps

- Retrieval is lexical. Paraphrases that share no terms with the procedure will
  not match. Semantic (embedding) retrieval would need provider embedding support,
  an index lifecycle and a retrieval-quality evaluation before it is enabled.
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
  the guardrails exercised through the real LangGraph workflow.
- `services/frontend/src/components/control-plane/ProcedureConsole.test.ts`:
  guardrail wording and the import client.
