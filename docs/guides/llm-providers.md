# Model providers and Mac Studio Qwen setup

The orchestrator has a provider plugin contract for bounded text and JSON-object
generation, and for embeddings. Servicing Studio's **Models & providers**
workspace selects models for generation, field extraction, intent recognition
and procedure retrieval embeddings. An intent can override
the generation profile. Profiles, task routes and prompt edits travel together
through draft, evaluation, approval, publication and rollback.

The first target is **Qwen on a separate Mac Studio**. The supplied configuration
uses standard ports and an editable example hostname. No connection to that
machine has been verified. No cloud provider is enabled by the example registry.

## Supported adapters

| Registry type | Protocol | Default / example endpoint | Authentication |
| --- | --- | --- | --- |
| `ollama` | `/api/chat`, `/api/tags`, `/api/embed`; non-streaming, thinking disabled | `http://mac-studio.local:11434` | None by default; an explicit credential reference is optional |
| `openai_compatible` | `/chat/completions`, `/models`, `/embeddings` | LM Studio `http://mac-studio.local:1234/v1`; vLLM example `http://mac-studio.local:8000/v1` | Optional explicit bearer credential reference |
| `openai` | Responses API `/responses`, `/models`, `/embeddings`; `store:false` | `https://api.openai.com/v1` | Explicit API-key environment reference |
| `vertex_gemini` | Vertex `generateContent`; embeddings through `predict` | Regional or global `aiplatform.googleapis.com` | Explicit bearer-token environment reference |
| `gemini` | Gemini Developer API `generateContent`, `batchEmbedContents`, model list | `https://generativelanguage.googleapis.com/v1beta` | Explicit API-key environment reference |

The plugins normalize response text, JSON objects, measured token usage, model,
provider, latency and call ID, and return float embedding vectors for
[procedure retrieval](#embeddings). They do not implement streaming, audio/media
or arbitrary model tool execution. Banking and fulfillment continue
through the established workflow/MCP/adapter contracts.

Production requires HTTPS for every enabled provider and explicit environment credential references for cloud providers. Local HTTP ports below are development/test defaults. Production synthetic `/test` and `/evaluate` endpoints return 403; qualify model behavior in a separate staging deployment. The shipped production registry stays empty until explicitly configured.

## 1. Make the Mac Studio endpoint reachable

On the **Mac Studio**, run Ollama with your installed Qwen model. Obtain its exact
tag using `ollama list`; the app's `qwen3.5:latest` value is an editable example,
not a requirement or proof that the target has that model installed.

Ollama normally listens on loopback port `11434`. Configure `OLLAMA_HOST` on the
Studio if requests will arrive from the MacBook or an app container. For the
macOS desktop app, Ollama documents setting the launch environment and restarting
the app, for example:

```sh
launchctl setenv OLLAMA_HOST "0.0.0.0:11434"
```

Allow access only from the intended private network or authenticated proxy.
From the machine/container running the orchestrator, confirm model discovery:

```sh
curl --fail http://mac-studio.local:11434/api/tags
```

Replace `mac-studio.local` with the Studio's actual hostname or private IP. If
Docker cannot resolve the `.local` name, use its private IP. `localhost` inside
the orchestrator container refers to that container, and `host.docker.internal`
refers to the Docker host; neither names a separate Studio.

See the official [Ollama network configuration guide](https://docs.ollama.com/faq)
and [chat API](https://docs.ollama.com/api/chat).

## 2. Configure the server registry

The shipped registry is
[`services/ai-orchestrator/config/llm-providers.example.json`](../../services/ai-orchestrator/config/llm-providers.example.json).
The root development environment and Compose files already pass:

```dotenv
LLM_PROVIDERS_FILE=config/llm-providers.example.json
LLM_OLLAMA_BASE_URL=http://mac-studio.local:11434
```

Edit `LLM_OLLAMA_BASE_URL` in the root `.env.development` to the real Studio
address. Leave the standard port unless the Studio uses a proxy or another port.
The example provider's stable ID is `mac-qwen`:

```json
{
  "providers": [{
    "id": "mac-qwen",
    "type": "ollama",
    "enabled": true,
    "baseUrl": "http://mac-studio.local:11434",
    "baseUrlRef": "LLM_OLLAMA_BASE_URL"
  }]
}
```

For a dedicated deployment, copy this file and set an absolute
`LLM_PROVIDERS_FILE`. A relative path is resolved from the orchestrator
service root (`services/ai-orchestrator`, or `/usr/src/app` inside the service
container), independently of the launch working directory. `LLM_PROVIDERS_JSON`
is an alternative JSON environment value; a configured file takes precedence.
With Compose, explicitly set `LLM_PROVIDERS_FILE=` to use inline JSON. Start PM2
through `./scripts/run-with-env.sh pm2 start ecosystem.config.js` to load the
root development settings, or inject the deployment environment yourself.

`baseUrlRef` reads the named environment variable when nonempty and otherwise
uses `baseUrl`. `credentialRef` reads only its explicitly named environment
variable, accepting `ENV_NAME` or `env:ENV_NAME`. Credentials and endpoint URLs are
never stored in the published servicing configuration or exposed by provider
discovery. `configured:true` means configuration is present; it does not verify
connectivity, token validity or account permissions. Enabled providers with a missing/invalid named credential fail startup; disabled placeholders may remain unconfigured. For model restrictions add
`allowedModels`, an array of exact model
IDs. An empty allowlist permits no models; omitting it permits discovered/selected
models. Registry changes are server administration and require controlled
deployment. Retain the registry with release evidence when reproducing a run:
workflow releases pin profile IDs/settings, while the server owns endpoints and
credentials.

Compose includes the example registry in the image. To use another file, mount
it read-only and set `LLM_PROVIDERS_FILE` to its container path. Supply credential values only through the environment variable named by `credentialRef`; this plugin does not read ADC files or ambient cloud credentials. For example, in a deployment-specific Compose override:

```yaml
services:
  ai-orchestrator:
    volumes:
      - ./llm-providers.json:/run/config/llm-providers.json:ro
    environment:
      LLM_PROVIDERS_FILE: /run/config/llm-providers.json
      LLM_VERTEX_ACCESS_TOKEN: ${LLM_VERTEX_ACCESS_TOKEN:?Set the named credential environment variable}
```

Paths in an override resolve according to the base Compose project's directory.
The registry must explicitly name `LLM_VERTEX_ACCESS_TOKEN` as its Vertex `credentialRef`. Do not put its value into the registry file or source control.

## 3. Discover and smoke-test the exact model

From the repository root with Node.js 22:

```sh
npm run llm:probe -- --list
npm run llm:probe -- --provider mac-qwen --models
npm run llm:probe -- --provider mac-qwen --model YOUR_INSTALLED_QWEN_TAG --test
npm run llm:probe -- --provider mac-qwen --model YOUR_INSTALLED_QWEN_TAG --test --format json
```

Replace the uppercase model placeholder with the tag from the Studio. Listing
the registry does not contact a model. `--models` performs discovery; inference
requires explicit `--test` and `--model`. Tests use fixed synthetic prompts,
bounded output and a 120-second deadline for a cold model. `--registry PATH`
selects another registry file. A failed test exits nonzero and does not select
another provider.

Studio offers discovery and, outside production, a fixed synthetic connectivity test to signed editors/admins. It cannot send an arbitrary test prompt. A successful
connectivity check does not establish recognition accuracy, extraction quality,
banking-task completion or production capacity.

For cold local models, default full-turn budgets are 400000ms between chat and
the orchestrator, 410000ms at the servicing gateway proxy, and 420000ms for the
browser chat request. They allow three sequential model stages at 120000ms
each plus service overhead. Tune `AGENT_RESPONSE_TIMEOUT`,
`SERVICING_REQUEST_TIMEOUT_MS`, and runtime-config.json `chatRequestTimeoutMs`
together; an ingress/load balancer must also allow that budget. Ordinary browser
API calls keep their 30-second deadline. Studio's fixed connectivity test has a
60-second model deadline; the CLI supports 120 seconds. These development
budgets are not a voice latency target; choose smaller measured model deadlines
for live IVR and qualify the provider's webhook/media behavior separately.
The optional legacy NLU lookup has its own `NLU_REQUEST_TIMEOUT_MS` budget
(default 5000ms). Increasing it must leave room inside the outer turn budgets.

## 4. Publish governed model profiles

Sign in with a control-plane editor/admin role and open `/control-plane` →
**Models & providers**. Choose `mac-qwen`, select the actual model tag, then set
profiles and task routes. The remote-Qwen starter is initially **disabled**.
For example, after replacing the model tag:

```json
{
  "llm": {
    "enabled": true,
    "profiles": [{
      "id": "local-qwen",
      "name": "Mac Studio Qwen",
      "providerId": "mac-qwen",
      "model": "YOUR_INSTALLED_QWEN_TAG",
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

The registry provider's `enabled:true` makes the adapter available; published
`llm.enabled:true` separately enables its use in customer workflows. Profile
temperature is bounded to 0–2, output to 1–8192 tokens and deadline to
1000–120000ms. Use a context/output budget supported by the selected model.

Select `recognition.strategy: "llm"` to use the recognition profile, and edit
the shared recognition instruction in **Prompts & intents**. Keeping lexical
recognition while using model generation/extraction is also supported. An
intent's optional `llmProfileId` changes **generation only**. It does not change
the extraction/recognition routes or the intent's tool permissions.

Inspect the diff, run contract evaluations, satisfy configured approval gates
and publish. Pending workflows retain their original release and model profile.
Changing profiles or recognition instructions invalidates previous evaluation
and approval fingerprints. Routing simulations report the selected profiles but
do **not** invoke models or assess their language quality; qualify the actual
model with representative synthetic/end-to-end journeys separately.

Compatibility behavior is explicit:

- Missing `llm` preserves the historical model configuration for older releases.
- `llm.enabled:false` disables both plugin and legacy model calls. Deterministic
  collection, routing and authoritative tool responses remain available.
- Enabled profiles use only their pinned provider/model. A missing task route,
  unavailable provider, malformed JSON or deadline failure cannot silently switch
  to the old model or a cloud provider.

## Embeddings

Semantic and hybrid [procedure retrieval](procedures-and-guardrails.md#retrieval)
use the `embedding` task route. Add a profile for an embedding model (for
example `nomic-embed-text` on Ollama, `text-embedding-3-small` on OpenAI,
`text-embedding-004` on Gemini, or any embedding model an OpenAI-compatible
server loads) and route it:

```json
{
  "llm": {
    "enabled": true,
    "profiles": [
      { "id": "local-qwen", "providerId": "mac-qwen", "model": "YOUR_INSTALLED_QWEN_TAG", "timeoutMs": 120000 },
      { "id": "embed", "providerId": "mac-qwen", "model": "nomic-embed-text", "timeoutMs": 30000 }
    ],
    "routing": { "generation": "local-qwen", "embedding": "embed" }
  },
  "retrieval": { "strategy": "hybrid", "minSimilarity": 0.45,
                 "queryPrefix": "search_query: ", "documentPrefix": "search_document: " }
}
```

The embedding route is only required when `retrieval.strategy` is `semantic` or
`hybrid`; the profile's temperature and output settings are not used. The
similarity floor above is a placeholder: calibrate it with the retrieval
evaluation for the exact model.

The embedding contract is bounded: up to 64 inputs per call, 8,000 characters
per input and 200,000 in total, at most 8,192 dimensions and a 4 MB response.
Each input must get exactly one finite, non-zero vector of the same length, or
the call fails as `LLM_INVALID_RESPONSE`. Gemini and Vertex receive the query or
document task type; Ollama and OpenAI-style servers ignore it, which is what the
retrieval prefixes are for. Measured input tokens are recorded as
`service: embedding` usage when the provider reports them: Ollama, OpenAI and
Vertex do, the Gemini Developer API does not, and OpenAI-compatible servers vary.

## Cloud and compatible servers

Enable only the selected entry in your server registry. For OpenAI, set
`LLM_OPENAI_API_KEY` and choose an available model supporting the plugin's text/
JSON-object contract and configured generation settings. The adapter uses the
[Responses API](https://developers.openai.com/api/docs/guides/text) and requests
`store:false`. The application does not infer that this setting replaces your
organization's provider data-handling agreement.
For models that reject temperature, set server-registry
`supportsTemperature:false`; the adapter omits that parameter without retrying
the request. Other unsupported generation settings fail explicitly.

For Vertex Gemini, replace `project` and `location`, enable `vertex-gemini`, and set the explicitly referenced `LLM_VERTEX_ACCESS_TOKEN` environment variable to a valid bearer token authorized for the model. The operator owns token refresh. The plugin no longer reads implicit ADC, workload identity or mounted credential files; existing deployments must migrate to an explicit environment reference.
Vertex discovery returns the registry's `allowedModels` rather than inventing
an accessible model list. Set that list or enter an approved exact model ID.
See [Vertex authentication](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/gcp-auth)
and [inference reference](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/inference).

For Gemini Developer API, enable `gemini-api`, set `LLM_GEMINI_API_KEY` and select
an authorized model. It uses the
[generateContent API](https://ai.google.dev/api/generate-content). Model discovery
is bounded and does not guarantee every region/account capability.

For LM Studio or vLLM, enable the corresponding `openai_compatible` entry, set
its reachable server address, and select the model actually loaded by that
server. The app uses chat completions; JSON-object support depends on the
compatible server/model. See [LM Studio compatibility](https://lmstudio.ai/docs/developer/openai-compat).

## Operational contract and extension

`src/llm/registry.js` validates server configuration and isolates credentials.
Plugins implement `generate(provider, request, client)`, `models(provider,
client)` and, for embedding support, `embed(provider, request, client)` behind
the shared contract. Add a plugin type to the registry, provide
fixture protocol tests, then document its capabilities before enabling it.
There is no runtime loading of arbitrary plugin source from the browser.

Requests are bounded in message count, text length, output tokens, response
size and deadline. The transport disables redirects and inherited HTTP proxies.
Cloud adapters require HTTPS. Only explicitly configured provider credentials
leave the adapter; customer JWTs and ambient legacy API keys are not forwarded.
Model tool calls and unsupported/truncated responses are rejected. Extracted
fields/candidates are checked by the workflow, and confirmations, ownership and
registered banking tool contracts still apply. Authoritative financial results
retain deterministic responses.

`GET /api/orchestrator/llm/providers` returns sanitized provider metadata;
`GET /api/orchestrator/llm/providers/:providerId/models` performs discovery.
`POST /api/orchestrator/llm/test` accepts only `{providerId, model}`, requires an
editor/admin role and limits requests. All routes require the deployment's
signed access token. Token counts come from provider responses; missing usage
remains missing. Configure rates for the registry **provider ID** and task
(`generation`, `extraction`, `recognition`, `embedding`) in Cost & outcomes to
price them.

Repository validation uses deterministic HTTP fixtures for protocols and
governance. The separate Studio, cloud credentials, model quality and performance
remain deployment checks; none are represented as live-verified by those tests.

## Production registry and lifecycle

For the dedicated production overlay, mount an explicitly reviewed registry file
through `LLM_PROVIDERS_HOST_FILE`; the empty
[production example](../../config/product/llm-providers.production.example.json)
allows deterministic servicing before any provider is enabled. The production
preflight uses the runtime registry validator without contacting a model and
rejects enabled providers with unresolved credentials. Runtime readiness does not
make inference calls or establish model quality. Run explicit synthetic model
tests only when the target endpoint and data policy are configured.

Environment files are loaded as data through `scripts/run-with-env.sh`. Values
are not shell commands and `${VARIABLE}` is not expanded. Secret references in
the provider registry are resolved by the provider registry itself. Follow
[Deployment](deployment.md) for private mounts and [Platform operations](platform-readiness.md)
for startup/schema requirements. The Qwen host is on the separate Mac Studio;
standard-port examples are editable defaults, not a verified connection.
