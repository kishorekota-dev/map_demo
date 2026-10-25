import { useState } from "react";
import type { ServicingConfig } from "@/types/controlPlane";
import {
  ConsoleField as Field,
  StringListField,
  splitValues,
} from "./ConsoleElements";

export default function RecognitionEditor({
  config,
  onChange,
  disabled,
}: {
  config: ServicingConfig;
  onChange: (config: ServicingConfig) => void;
  disabled: boolean;
}) {
  const [term, setTerm] = useState("");
  const [aliases, setAliases] = useState("");
  const recognition = config.recognition || {
    strategy: "lexical" as const,
    confidenceThreshold: 0.65,
    ambiguityMargin: 0.1,
    ambiguityAction: "clarify" as const,
    synonyms: {},
  };
  const update = (patch: Partial<typeof recognition>) =>
    onChange({ ...config, recognition: { ...recognition, ...patch } });
  return (
    <details className="cp-panel cp-shared-prompts">
      <summary>Recognition policy · Confidence, ambiguity & synonyms</summary>
      <p>
        Configure how the published runtime recognizes customer utterances and
        handles uncertain intent matches.
      </p>
      <fieldset className="cp-fieldset" disabled={disabled}>
        <label className="cp-check">
          <input
            type="checkbox"
            checked={Boolean(config.recognition)}
            onChange={(e) => {
              if (e.target.checked) update({});
              else {
                const next = { ...config };
                delete next.recognition;
                onChange(next);
              }
            }}
          />
          Use configurable recognition policy
        </label>
        {config.recognition && (
          <>
            <div className="cp-form-grid">
              <Field
                label="Recognition strategy"
                hint="External recognition requires the deployed classifier. Model-based recognition requires enabled model-assisted servicing and a recognition profile in Models & providers."
              >
                <select
                  value={recognition.strategy}
                  onChange={(e) =>
                    update({
                      strategy: e.target.value as
                        | "lexical"
                        | "external"
                        | "llm",
                    })
                  }
                >
                  <option value="lexical">
                    Deterministic lexical recognition
                  </option>
                  <option value="external">
                    Configured external classifier
                  </option>
                  <option value="llm">Configured model profile</option>
                </select>
              </Field>
              <Field label="Uncertain match behavior">
                <select
                  value={recognition.ambiguityAction}
                  onChange={(e) =>
                    update({
                      ambiguityAction: e.target.value as "clarify" | "human",
                    })
                  }
                >
                  <option value="clarify">Ask for clarification</option>
                  <option value="human">Route to human servicing</option>
                </select>
              </Field>
              <Field label="Minimum confidence">
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={recognition.confidenceThreshold}
                  onChange={(e) =>
                    update({ confidenceThreshold: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Ambiguity margin">
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={recognition.ambiguityMargin}
                  onChange={(e) =>
                    update({ ambiguityMargin: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
            <div className="cp-form-grid cp-add">
              {Object.entries(recognition.synonyms).map(([key, values]) => (
                <div key={key}>
                  <StringListField
                    label={`Synonyms for “${key}”`}
                    value={values}
                    onChange={(next) =>
                      update({
                        synonyms: { ...recognition.synonyms, [key]: next },
                      })
                    }
                  />
                  <button
                    className="cp-link cp-link--danger"
                    onClick={() => {
                      const next = { ...recognition.synonyms };
                      delete next[key];
                      update({ synonyms: next });
                    }}
                  >
                    Remove term
                  </button>
                </div>
              ))}
            </div>
            <div className="cp-inline-form">
              <Field label="Canonical term">
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="balance"
                />
              </Field>
              <Field label="Synonyms (comma separated)">
                <input
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder="funds, available money"
                />
              </Field>
              <button
                className="cp-button cp-button--quiet"
                disabled={!term.trim() || !aliases.trim()}
                onClick={() => {
                  update({
                    synonyms: {
                      ...recognition.synonyms,
                      [term.trim()]: splitValues(aliases),
                    },
                  });
                  setTerm("");
                  setAliases("");
                }}
              >
                Add synonyms
              </button>
            </div>
          </>
        )}
      </fieldset>
    </details>
  );
}
