import { useEffect, useState } from "react";
import modelApi, {
  type ModelProvider,
  type ProviderModel,
  type ModelTestResult,
} from "@/services/modelProviderService";
import type {
  ModelConfiguration,
  ModelProfile,
  ServicingConfig,
} from "@/types/controlPlane";
import {
  ConsoleField as Field,
  JsonEvidence,
  StatusPill,
  useConsoleAction,
} from "./ConsoleElements";

const localStarter: ModelConfiguration = {
  enabled: false,
  profiles: [
    {
      id: "local-qwen",
      name: "Mac Studio Qwen",
      providerId: "mac-qwen",
      model: "qwen3.5:latest",
      temperature: 0,
      maxOutputTokens: 2048,
      timeoutMs: 120000,
    },
  ],
  routing: {
    generation: "local-qwen",
    extraction: "local-qwen",
    recognition: "local-qwen",
  },
};
const taskLabels = {
  generation: "Response generation",
  extraction: "Entity extraction",
  recognition: "Intent recognition",
  embedding: "Procedure retrieval embeddings",
} as const;
const providerTypes: Record<string, string> = {
  ollama: "Ollama · Local models",
  openai: "OpenAI",
  openai_compatible: "OpenAI-compatible API",
  vertex_gemini: "Vertex AI · Gemini",
  gemini: "Gemini API",
};

export default function ModelProviderConsole({
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
  const [providers, setProviders] = useState<ModelProvider[] | null>(null);
  const [registryError, setRegistryError] = useState("");
  const [registryLoading, setRegistryLoading] = useState(true);
  const [selected, setSelected] = useState(0);
  const [models, setModels] = useState<Record<string, ProviderModel[]>>({});
  const [test, setTest] = useState<ModelTestResult | null>(null);
  const action = useConsoleAction();
  const llm = config.llm;
  const profile = llm?.profiles[selected];
  const provider = providers?.find((entry) => entry.id === profile?.providerId);
  const discoveredModels = profile ? models[profile.providerId] : undefined;
  const loadRegistry = async () => {
    setRegistryLoading(true);
    setRegistryError("");
    try {
      setProviders((await modelApi.providers()).providers);
    } catch (error) {
      setRegistryError(
        error instanceof Error
          ? error.message
          : "The model registry is unavailable.",
      );
    } finally {
      setRegistryLoading(false);
    }
  };
  useEffect(() => {
    void loadRegistry();
  }, []);

  const update = (patch: Partial<ModelConfiguration>) => {
    if (llm) onChange({ ...config, llm: { ...llm, ...patch } });
  };
  const updateProfile = (patch: Partial<ModelProfile>) => {
    if (!llm || !profile) return;
    const nextId = patch.id;
    const renamed = nextId !== undefined && nextId !== profile.id;
    onChange({
      ...config,
      intents: renamed
        ? config.intents.map((entry) =>
            entry.llmProfileId === profile.id
              ? { ...entry, llmProfileId: nextId }
              : entry,
          )
        : config.intents,
      llm: {
        ...llm,
        profiles: llm.profiles.map((entry, index) =>
          index === selected ? { ...entry, ...patch } : entry,
        ),
        routing: renamed
          ? Object.fromEntries(
              Object.entries(llm.routing).map(([task, id]) => [
                task,
                id === profile.id ? nextId : id,
              ]),
            )
          : llm.routing,
      },
    });
    setTest(null);
  };
  const references = profile
    ? [
        ...Object.entries(llm?.routing || {})
          .filter(([, id]) => id === profile.id)
          .map(([task]) => taskLabels[task as keyof typeof taskLabels]),
        ...config.intents
          .filter((entry) => entry.llmProfileId === profile.id)
          .map((entry) => entry.name),
      ]
    : [];
  const usable = Boolean(
    provider?.configured &&
      provider.enabled &&
      !registryError &&
      !registryLoading,
  );
  const matchingTest =
    test &&
    profile &&
    test.providerId === profile.providerId &&
    test.model === profile.model
      ? test
      : null;

  return (
    <>
      <div className="cp-section-intro">
        <h2>Choose the model for every task</h2>
        <p>
          Connect the deployment’s approved providers to governed model
          profiles. Save and publish profile changes through the same release
          process as prompts and intents.
        </p>
      </div>
      <section className="cp-panel">
        <div className="cp-panel-heading">
          <div>
            <span className="cp-eyebrow">Server-managed connections</span>
            <h3>Model provider registry</h3>
          </div>
          <button
            className="cp-button cp-button--quiet"
            disabled={registryLoading}
            onClick={() => void loadRegistry()}
          >
            {registryLoading ? "Loading providers…" : "Refresh providers"}
          </button>
        </div>
        <p>
          Provider URLs, credentials, and allowed models are configured on the
          server. Configure the remote Mac Studio host or an approved cloud
          provider, then discover and test its models. A configured provider
          still needs a successful live test.
        </p>
        {registryError && (
          <div className="cp-alert cp-alert--error" role="alert">
            {registryError} Profile edits remain available; provider readiness
            could not be verified.
          </div>
        )}
        {providers && !providers.length && (
          <div className="cp-empty">
            No model providers are registered. Configure an approved provider in
            the deployment, then refresh this registry.
          </div>
        )}
        {!!providers?.length && (
          <div className="cp-channel-grid cp-model-registry">
            {providers.map((entry) => (
              <article className="cp-model-provider" key={entry.id}>
                <div className="cp-panel-heading">
                  <div>
                    <h4>{entry.id}</h4>
                    <span className="cp-muted">
                      {providerTypes[entry.type] || entry.type}
                    </span>
                  </div>
                  <StatusPill
                    good={Boolean(
                      entry.enabled &&
                        entry.configured &&
                        matchingTest?.providerId === entry.id &&
                        matchingTest.ok,
                    )}
                    warning={
                      !entry.enabled ||
                      !entry.configured ||
                      Boolean(
                        matchingTest?.providerId === entry.id &&
                          !matchingTest.ok,
                      )
                    }
                  >
                    {!entry.enabled
                      ? "Disabled on server"
                      : !entry.configured
                        ? "Configuration incomplete"
                        : matchingTest?.providerId === entry.id
                          ? matchingTest.ok
                            ? "Live test passed"
                            : "Live test failed"
                          : "Configured · Untested"}
                  </StatusPill>
                </div>
                <p>
                  {entry.capabilities.json
                    ? "Structured JSON supported"
                    : "Structured JSON unavailable"}{" "}
                  ·{" "}
                  {entry.capabilities.modelDiscovery
                    ? "Model discovery available"
                    : "Model discovery unavailable"}
                </p>
                {entry.allowedModels?.length ? (
                  <p className="cp-footnote">
                    Approved models: {entry.allowedModels.join(", ")}
                  </p>
                ) : (
                  <p className="cp-footnote">
                    Model availability is checked by the provider.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="cp-panel">
        <div className="cp-panel-heading">
          <div>
            <span className="cp-eyebrow">Governed configuration</span>
            <h3>Model profiles & routing</h3>
          </div>
          <StatusPill good={published.llm?.enabled}>
            Live:{" "}
            {published.llm?.enabled
              ? "Governed model routing"
              : published.llm
                ? "Model calls disabled"
                : "Legacy deployment routing"}
          </StatusPill>
        </div>
        {!llm ? (
          <>
            <p>
              This configuration uses the deployment’s existing model path. Add
              a Qwen starter for the remote Mac Studio. Its model name is an
              example until discovered on that host. The starter is disabled;
              publishing it disables model calls until model-assisted servicing
              is enabled.
            </p>
            <button
              className="cp-button"
              disabled={!editable}
              onClick={() => {
                onChange({ ...config, llm: structuredClone(localStarter) });
                setSelected(0);
              }}
            >
              Add local Qwen starter
            </button>
          </>
        ) : (
          <>
            <fieldset className="cp-fieldset" disabled={!editable}>
              <label className="cp-check">
                <input
                  type="checkbox"
                  checked={llm.enabled}
                  onChange={(event) =>
                    update({ enabled: event.target.checked })
                  }
                />
                Enable model-assisted servicing
              </label>
              <p className="cp-footnote">
                This switch changes the draft. Save and publish to activate it.
                When disabled, profiles remain saved and servicing uses
                deterministic collection and rendering without model calls.
                Enabled routing uses the selected provider explicitly;
                unavailable providers do not trigger an automatic cloud
                fallback.
              </p>
              <div className="cp-form-grid cp-add">
                {(
                  Object.keys(taskLabels) as Array<keyof typeof taskLabels>
                ).map((task) => (
                  <Field
                    key={task}
                    label={`${taskLabels[task]} profile`}
                    hint={
                      task === "recognition"
                        ? "Used when the recognition policy selects the model-based strategy."
                        : task === "generation"
                          ? "Individual intents can override this generation profile."
                          : task === "embedding"
                            ? "An embedding model, used when procedure retrieval is semantic or hybrid. Output limits and temperature do not apply."
                            : "Used for structured field extraction."
                    }
                  >
                    <select
                      value={llm.routing[task] || ""}
                      onChange={(event) =>
                        update({
                          routing: {
                            ...llm.routing,
                            [task]: event.target.value || undefined,
                          },
                        })
                      }
                    >
                      <option value="">No profile assigned</option>
                      {llm.profiles.map((entry, index) => (
                        <option value={entry.id} key={index}>
                          {entry.name || entry.id}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            </fieldset>
            <div className="cp-section-intro cp-add">
              <h3>Profiles</h3>
              <p>
                Separate profiles can share a provider and model while using
                different output limits, temperatures, and time budgets.
              </p>
            </div>
            <div className="cp-inline-form">
              <Field label="Profile to edit">
                <select
                  value={profile ? selected : ""}
                  onChange={(event) => {
                    setSelected(Number(event.target.value));
                    setTest(null);
                  }}
                >
                  <option value="" disabled>
                    Select a profile
                  </option>
                  {llm.profiles.map((entry, index) => (
                    <option value={index} key={index}>
                      {entry.name || entry.id || "Unnamed profile"}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="cp-button cp-button--quiet"
                disabled={!editable || llm.profiles.length >= 50}
                onClick={() => {
                  let number = llm.profiles.length + 1;
                  while (
                    llm.profiles.some(
                      (entry) => entry.id === `profile-${number}`,
                    )
                  )
                    number++;
                  update({
                    profiles: [
                      ...llm.profiles,
                      {
                        id: `profile-${number}`,
                        name: "New model profile",
                        providerId:
                          providers?.find(
                            (entry) => entry.enabled && entry.configured,
                          )?.id || "mac-qwen",
                        model: "",
                        temperature: 0,
                        maxOutputTokens: 2048,
                        timeoutMs: 120000,
                      },
                    ],
                  });
                  setSelected(llm.profiles.length);
                  setTest(null);
                }}
              >
                + Add profile
              </button>
            </div>
            {profile && (
              <fieldset className="cp-fieldset cp-add" disabled={!editable}>
                <div className="cp-form-grid">
                  <Field
                    label="Profile ID"
                    hint="Lowercase letters, numbers, hyphens, and underscores. Renaming updates its routes and intent references."
                  >
                    <input
                      maxLength={64}
                      value={profile.id}
                      onChange={(event) =>
                        updateProfile({ id: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Profile name">
                    <input
                      maxLength={120}
                      value={profile.name}
                      onChange={(event) =>
                        updateProfile({ name: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Model provider">
                    <select
                      value={profile.providerId}
                      onChange={(event) =>
                        updateProfile({
                          providerId: event.target.value,
                          model: "",
                        })
                      }
                    >
                      {!providers?.some(
                        (entry) => entry.id === profile.providerId,
                      ) && (
                        <option value={profile.providerId}>
                          {profile.providerId} · Not registered
                        </option>
                      )}
                      {providers?.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.id} · {providerTypes[entry.type] || entry.type}
                          {!entry.enabled || !entry.configured
                            ? " · Unavailable"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Model ID"
                    hint="Enter an approved model ID or use model discovery below. Availability is verified by the provider."
                  >
                    <input
                      maxLength={200}
                      list="cp-approved-models"
                      value={profile.model}
                      onChange={(event) =>
                        updateProfile({ model: event.target.value })
                      }
                    />
                  </Field>
                  <datalist id="cp-approved-models">
                    {Array.from(
                      new Set([
                        ...(provider?.allowedModels || []),
                        ...(discoveredModels || []).map((entry) => entry.id),
                      ]),
                    ).map((id) => (
                      <option key={id} value={id} />
                    ))}
                  </datalist>
                  <Field
                    label="Temperature"
                    hint={
                      provider?.capabilities.temperature === false
                        ? "This provider does not accept temperature. The saved value is retained for other providers."
                        : "0–2; lower values favor more consistent responses."
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      disabled={provider?.capabilities.temperature === false}
                      value={profile.temperature}
                      onChange={(event) =>
                        updateProfile({
                          temperature: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Maximum output tokens">
                    <input
                      type="number"
                      min="1"
                      max="8192"
                      step="1"
                      value={profile.maxOutputTokens}
                      onChange={(event) =>
                        updateProfile({
                          maxOutputTokens: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Model response timeout (ms)"
                    hint="1,000–120,000 milliseconds. Slow local model loads may need a longer budget."
                  >
                    <input
                      type="number"
                      min="1000"
                      max="120000"
                      step="1000"
                      value={profile.timeoutMs}
                      onChange={(event) =>
                        updateProfile({ timeoutMs: Number(event.target.value) })
                      }
                    />
                  </Field>
                </div>
                <button
                  className="cp-link cp-link--danger cp-add"
                  disabled={references.length > 0}
                  onClick={() => {
                    update({
                      profiles: llm.profiles.filter(
                        (_, index) => index !== selected,
                      ),
                    });
                    setSelected(0);
                    setTest(null);
                  }}
                >
                  Remove profile
                </button>
                {references.length > 0 && (
                  <p className="cp-footnote">
                    Used by: {references.join(", ")}. Remove those assignments
                    before deleting this profile.
                  </p>
                )}
              </fieldset>
            )}
          </>
        )}
      </section>
      {profile && (
        <section className="cp-panel">
          <div className="cp-panel-heading">
            <div>
              <span className="cp-eyebrow">Live provider check</span>
              <h3>Discover & test {profile.providerId}</h3>
            </div>
            <StatusPill
              good={Boolean(matchingTest?.ok)}
              warning={Boolean(matchingTest && !matchingTest.ok)}
            >
              {matchingTest
                ? matchingTest.ok
                  ? "Test passed"
                  : "Test failed"
                : "Not tested in this session"}
            </StatusPill>
          </div>
          {action.messages}
          <p>
            Discovery reads the provider’s model catalog. The test sends a fixed
            synthetic prompt to the selected model and may incur provider usage.
            It does not publish routing or execute a customer action.
          </p>
          {!usable && (
            <div className="cp-inline-note">
              {registryLoading
                ? "Loading provider readiness…"
                : registryError
                  ? "Provider readiness is unavailable. Refresh the registry before testing."
                  : "This provider must be registered, enabled, and configured on the server before testing."}
            </div>
          )}
          <div className="cp-actions cp-add">
            <button
              className="cp-button cp-button--quiet"
              disabled={
                action.busy || !usable || !provider?.capabilities.modelDiscovery
              }
              onClick={() =>
                void action.run(async () => {
                  const result = await modelApi.models(profile.providerId);
                  setModels((current) => ({
                    ...current,
                    [result.providerId]: result.models,
                  }));
                  action.setNotice(
                    `${result.models.length} models returned by ${result.providerId}.`,
                  );
                })
              }
            >
              Discover available models
            </button>
            <button
              className="cp-button"
              disabled={
                !editable || action.busy || !usable || !profile.model.trim()
              }
              onClick={() =>
                void action.run(async () => {
                  setTest(null);
                  setTest(
                    await modelApi.test(profile.providerId, profile.model),
                  );
                })
              }
            >
              {action.busy ? "Checking provider…" : "Run synthetic model test"}
            </button>
          </div>
          {provider && !provider.capabilities.modelDiscovery && (
            <p className="cp-footnote">
              Model discovery is unavailable for this provider. Enter an
              approved model ID above.
            </p>
          )}
          {!editable && (
            <p className="cp-footnote">
              A configuration editor or administrator can run model tests.
            </p>
          )}
          {discoveredModels && (
            <div className="cp-add">
              <Field label="Discovered model">
                <select
                  disabled={!editable}
                  value={
                    discoveredModels.some((entry) => entry.id === profile.model)
                      ? profile.model
                      : ""
                  }
                  onChange={(event) =>
                    updateProfile({ model: event.target.value })
                  }
                >
                  <option value="" disabled>
                    {discoveredModels.length
                      ? "Choose a discovered model"
                      : "No models returned"}
                  </option>
                  {discoveredModels.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name || entry.id}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          {matchingTest && (
            <div className="cp-add">
              <div
                className={`cp-alert cp-alert--${matchingTest.ok ? "success" : "error"}`}
                role={matchingTest.ok ? "status" : "alert"}
              >
                {matchingTest.ok
                  ? `Model responded${typeof matchingTest.latencyMs === "number" ? ` in ${matchingTest.latencyMs.toLocaleString()} ms` : ""}.`
                  : typeof matchingTest.error === "string"
                    ? matchingTest.error
                    : matchingTest.error?.message || "The model test failed."}
              </div>
              {matchingTest.text && (
                <pre className="cp-model-response">{matchingTest.text}</pre>
              )}
              <JsonEvidence title="Model test evidence" value={matchingTest} />
            </div>
          )}
        </section>
      )}
    </>
  );
}
