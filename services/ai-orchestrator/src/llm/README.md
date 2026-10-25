# Application model provider plugins

The servicing runtime uses a bounded text/JSON interface for Ollama, OpenAI Responses, OpenAI-compatible servers such as LM Studio/vLLM, Vertex Gemini, and the Gemini Developer API. Models extract declared fields, classify published intent IDs, or generate no-tool responses. Banking execution stays in the existing policy/confirmation/MCP workflow. These adapters neither advertise tools to models nor execute model-returned tool calls.

## Server registry

Load `{ "providers": [...] }` from `LLM_PROVIDERS_FILE` or `LLM_PROVIDERS_JSON`. A file takes precedence. Relative file paths resolve against the `services/ai-orchestrator` directory, independently of the process working directory; absolute paths stay absolute. The registry is server configuration, separate from publishable control-plane releases.

```json
{
  "providers": [
    {
      "id": "mac-qwen",
      "type": "ollama",
      "enabled": true,
      "baseUrl": "http://mac-studio.local:11434",
      "baseUrlRef": "LLM_OLLAMA_BASE_URL",
      "allowedModels": ["qwen3.5:latest"]
    }
  ]
}
```

`mac-studio.local` is an example hostname for the separate Mac Studio. Set `LLM_OLLAMA_BASE_URL` to its actual reachable address. The implementation has not verified that remote target. Omitted Ollama/compatible URLs default to loopback ports 11434 and 1234 respectively; loopback is appropriate only when the model server is on the same host/network namespace. No startup discovery or inference runs automatically.

Registry fields are `id`, `type`, `enabled`, optional `baseUrl`, `baseUrlRef`, `credentialRef`, `allowedModels`, `supportsTemperature`, and Vertex-only `project`/`location`. `baseUrlRef` names an environment variable containing an endpoint override, with `baseUrl` as fallback. `credentialRef` names one explicit server environment variable, optionally prefixed `env:`. Credentials, endpoint URLs, projects, and variable names are never returned by provider discovery or accepted from customer/model-profile request bodies.

* Ollama and compatible providers use no credential unless explicitly configured. Ambient `OPENAI_API_KEY` and customer JWTs are never forwarded.
* OpenAI and Gemini Developer API require an explicit credential reference. Gemini uses an API-key header, not a query-string secret.
* Vertex requires an explicit environment credential reference containing a bearer access token. The operator owns token refresh. Implicit ADC, credential files and ambient cloud credentials are not read by this plugin.

Startup validates the registry before initializing services or accepting requests. Enabled cloud providers require an explicit `credentialRef`, and every enabled credential reference must resolve to a bounded nonempty environment value without whitespace/control characters. Disabled provider placeholders may remain unconfigured. Construction never contacts a provider. Literal credential fields and unknown root fields are rejected. Provider response payloads containing the known configured credential value are rejected before generation or discovery can return data.

Models can be restricted by `allowedModels`; omitted means the provider's model identifiers are allowed. An empty list allows no models. `supportsTemperature:false` omits the temperature parameter for model families that reject it; it does not retry with different parameters or providers. Use separate provider registrations when model families need different server capabilities.

Every enabled production provider requires HTTPS, including Ollama/compatible endpoints. Development/test retains local HTTP and the existing default ports. URLs with userinfo, query strings, or fragments are rejected. Redirects, inherited HTTP proxy behavior, and automatic provider retries are disabled. Administrators control network reachability and endpoint identity through the server registry and deployment network.

## Published profiles

```json
{
  "llm": {
    "enabled": true,
    "profiles": [{
      "id": "local-qwen",
      "name": "Mac Studio Qwen",
      "providerId": "mac-qwen",
      "model": "qwen3.5:latest",
      "temperature": 0,
      "maxOutputTokens": 2048,
      "timeoutMs": 120000
    }],
    "routing": {
      "generation": "local-qwen",
      "extraction": "local-qwen",
      "recognition": "local-qwen"
    }
  }
}
```

Profile bounds are temperature 0–2, output tokens 1–8192, and timeout 1000–120000 ms. Profiles are pinned with the workflow's published release; provider endpoint/credential rotations remain deployment operations. `intents[].llmProfileId` overrides generation only. Extraction and recognition use their task routes. Tool-backed responses remain deterministic, so a generation override never rewrites a banking result or a retrieved knowledge source.

The three configuration states are intentional:

* Missing `config.llm`: preserve the existing deployment's legacy model enablement behavior.
* Explicit `config.llm.enabled:false`: disable both legacy and plugin model calls; use deterministic validation/collection and rendering.
* `enabled:true`: use only the pinned configured profiles. If a needed task has no profile, the provider/model is unavailable, or a response is malformed, return a model-unavailable policy result. Do not fall back to a legacy cloud model or another provider.

Generation consumes published intent system/user prompts. Extraction consumes the published extraction prompts plus mandatory schema/data rules, and keeps only declared scalar fields. Optional recognition strategy `llm` consumes published `prompts.recognitionSystem` plus a non-editable JSON/catalog boundary. The pure recognition layer validates candidate IDs and confidence, then applies the same thresholds/ambiguity policy as other strategies. Literal matches still take precedence without a model call. Simulations explicitly distinguish lexical-only evaluation from an executed model request.

## Adapter contract and source references

`ProviderRegistry.generate(providerId, {model,messages,format,temperature,maxOutputTokens,timeoutMs})` returns `{text,json?,usage,providerId,providerType,model,callId,latencyMs,finishReason}`. Messages accept only `system`, `user`, and `assistant` text roles. At most 64 messages, 64,000 characters per message, and 160,000 total input characters are accepted. Responses are size bounded and JSON mode must parse to an object. Unsupported tool calls, safety blocks, incomplete responses, and recognized truncation fail closed. The caller retains application validation even with provider JSON mode.

| Type | API | Usage fields |
| --- | --- | --- |
| `ollama` | Native `/api/chat`, nonstreaming, JSON format when requested | `prompt_eval_count`, `eval_count` |
| `openai` | `/responses`, `store:false`, text/JSON output | `input_tokens`, `output_tokens`, `total_tokens` |
| `openai_compatible` | `/chat/completions`, nonstreaming, JSON object mode | `prompt_tokens`, `completion_tokens`, `total_tokens` |
| `vertex_gemini` | Project/location `generateContent`, explicit bearer environment reference | `usageMetadata` token fields |
| `gemini` | Developer API `generateContent`, explicit API-key header | `usageMetadata` token fields |

The request mappings follow the official [Ollama chat API](https://docs.ollama.com/api/chat), [OpenAI text generation](https://developers.openai.com/api/docs/guides/text), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Vertex inference API](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/inference), and [Gemini content generation API](https://ai.google.dev/api/generate-content). Compatible servers must implement the stated Chat Completions subset; capability differences surface as explicit errors. This interface does not implement streaming, audio, embeddings, arbitrary tools, or provider-specific reasoning controls.

Normalized usage contains only actual returned counts, never text-length estimates. Published runtime calls send measured input/output token metrics under the configured provider ID and task service (`generation`, `extraction`, or `recognition`). Admin connectivity tests return usage without attaching it to a customer interaction. Rates remain server-configured operational pricing; unconfigured rates stay unpriced.

## Protected management endpoints

Under `/api/orchestrator/llm`:

* `GET /providers` returns sanitized IDs/types, enablement/configuration, model allowlists, and capability flags.
* `GET /providers/:id/models` reads provider model discovery. Discovery is bounded to the first returned page and 1,000 entries, filtered by the server allowlist. Vertex returns its configured allowlist with `source:configured-allowlist`; it does not claim universal model availability.
* `POST /test` returns 403 with `LLM_TEST_DISABLED` in production, regardless of editor/admin role. In development/test it accepts only `{providerId,model}`. It sends a fixed synthetic connectivity prompt, with at most 32 output tokens and a 60-second deadline, and returns `{ok,providerId,model,latencyMs,text,usage,error?}`. It cannot accept customer text or a custom prompt. Provider failures use sanitized `{code,message}` errors. Tests are limited to 10 per minute per signed user/tenant.

`POST /evaluate` likewise returns 403 with `LLM_EVALUATION_DISABLED` in production, even with scoped editor delegation and service identity. Run synthetic inference/evaluation in a separately qualified staging environment; production keeps ordinary governed runtime inference and offline configuration validation. Production cannot acquire new live-model release evidence through this endpoint.

These restrictions intentionally replace the earlier implicit ADC, production local-HTTP and production probe behavior. Migrate deployments to explicit environment token references and an approved HTTPS endpoint; keep Mac Studio development testing on the existing HTTP defaults.

Read routes require a signed control-plane viewing role. Test requires a signed administrator/editor role. All routes also enforce the deployment's access-token/tenant middleware. Tests are explicit operator actions; provider discovery does not pull models, deploy resources, or change provider state.

## Extension and validation

Add a reviewed module to `plugins/` implementing `generate(provider,input,client)` and optionally `models(provider,client)`, then register its fixed type in `registry.js` and the control-console provider enum. Use the supplied client for bounded HTTP, explicit server credentials, and safe error handling. Do not expose dynamic module loading or executable code in the published configuration. Add request/response, credential-isolation, malformed-output, and failure tests for each new plugin.

`npm test -- --runInBand src/llm` exercises synthetic fixtures, including an ephemeral local HTTP fixture that is independent of installed model servers. The tests do not contact the separate Mac Studio, the current machine's Ollama, or a cloud model. Runtime tests cover published prompt/profile isolation, pinned continuations, disabled-versus-legacy semantics, extraction guards, deterministic banking boundaries, and unavailable-provider behavior.
