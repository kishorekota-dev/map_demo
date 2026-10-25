# Intent and prompt quick reference

| Control | Runtime behavior |
| --- | --- |
| `enabled` | Disabled intent blocks execution, including recognized disabled phrases. |
| `patterns` | Literal phrases; longest whole-phrase match precedes the selected recognition strategy. |
| `baseIntent` | Custom ID inherits a reviewed canonical handler or generic case/knowledge path. |
| `requiredData`, `optionalData`, `fieldSchemas` | Declared scalar fields; canonical requirements cannot be removed. Additional validation is additive. |
| `tools` | Subset of reviewed baseline tools; an unavailable action is blocked. |
| `needsConfirmation` | Can strengthen confirmation; cannot weaken a required baseline confirmation. |
| `systemPrompt`, `userPromptTemplate` | Actual optional no-tool generation; never replaces authoritative banking results. |
| `confirmationMessage` | Editable wording followed by code-governed action facts and confirmation question. |
| `llmProfileId` | Per-intent generation profile; extraction/recognition use task routes. |

Global prompts govern extraction and optional LLM recognition. Plain text response wording governs clarification, handoff, unavailability, and data collection. Structural JSON rules, security denials, domain authorization, and authoritative result facts remain code governed.

Use the control console to draft, evaluate, and publish changes. For exact schema, examples, release pinning, and disabled-versus-legacy model semantics, see [runtime contracts](CONTROL-PLANE-RUNTIME.md). [Source defaults](config/intentConfig.js) seed a new deployment; they are not a live draft editor.
