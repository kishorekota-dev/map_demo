import { useState } from "react";
import type { ServicingIntent } from "@/types/controlPlane";
import { ConsoleField as Field, StringListField } from "./ConsoleElements";

type Schema = NonNullable<ServicingIntent["fieldSchemas"]>[string];
export default function IntentContractEditor({
  intent,
  onChange,
}: {
  intent: ServicingIntent;
  onChange: (patch: Partial<ServicingIntent>) => void;
}) {
  const [error, setError] = useState("");
  const fields = [...new Set([...intent.requiredData, ...intent.optionalData])];
  const update = (field: string, schema?: Schema) => {
    const next = { ...intent.fieldSchemas };
    if (schema) next[field] = schema;
    else delete next[field];
    onChange({ fieldSchemas: Object.keys(next).length ? next : undefined });
    setError("");
  };
  return (
    <div className="cp-field--wide cp-intent-contract">
      <Field
        label="Confirmation introduction"
        hint="Optional customer-facing introduction. The runtime still includes authoritative action details and requires any mandated confirmation."
      >
        <textarea
          rows={3}
          maxLength={2000}
          value={intent.confirmationMessage || ""}
          onChange={(e) =>
            onChange({ confirmationMessage: e.target.value || undefined })
          }
          placeholder="Use the established confirmation introduction"
        />
      </Field>
      <details className="cp-evidence">
        <summary>Entity validation rules</summary>
        <p className="cp-footnote">
          Add validation to declared entities. Existing banking tool
          requirements remain enforced.
        </p>
        {error && (
          <div className="cp-alert cp-alert--error" role="alert">
            {error}
          </div>
        )}
        {fields.length ? (
          fields.map((field) => {
            const schema = intent.fieldSchemas?.[field];
            return (
              <section className="cp-schema-field" key={field}>
                <h3>{field}</h3>
                <div className="cp-form-grid">
                  <Field label={`Validation type for ${field}`}>
                    <select
                      value={schema?.type || ""}
                      onChange={(e) =>
                        update(
                          field,
                          e.target.value
                            ? { type: e.target.value as Schema["type"] }
                            : undefined,
                        )
                      }
                    >
                      <option value="">Use established validation</option>
                      <option value="string">Text</option>
                      <option value="number">Number</option>
                      <option value="boolean">True / false</option>
                    </select>
                  </Field>
                  {schema && (
                    <StringListField
                      label={`Allowed values for ${field}`}
                      value={schema.enum?.map(String) || []}
                      hint="Optional. Leave empty for no additional allowed-value restriction."
                      onChange={(values) => {
                        const parsed =
                          schema.type === "number"
                            ? values.map(Number)
                            : schema.type === "boolean"
                              ? values.map((value) =>
                                  value === "true"
                                    ? true
                                    : value === "false"
                                      ? false
                                      : value,
                                )
                              : values;
                        if (
                          schema.type === "number" &&
                          parsed.some(
                            (value) =>
                              typeof value !== "number" ||
                              !Number.isFinite(value),
                          )
                        ) {
                          setError(`${field}: enter numeric allowed values.`);
                          return;
                        }
                        if (
                          schema.type === "boolean" &&
                          parsed.some((value) => typeof value !== "boolean")
                        ) {
                          setError(
                            `${field}: allowed values must be true or false.`,
                          );
                          return;
                        }
                        update(field, {
                          ...schema,
                          enum: parsed.length ? parsed : undefined,
                        });
                      }}
                    />
                  )}
                  {schema && schema.type !== "boolean" && (
                    <>
                      <Field
                        label={
                          schema.type === "number"
                            ? `Minimum value for ${field}`
                            : `Minimum length for ${field}`
                        }
                      >
                        <input
                          type="number"
                          min={schema.type === "string" ? 0 : undefined}
                          step={schema.type === "string" ? 1 : "any"}
                          value={
                            (schema.type === "number"
                              ? schema.min
                              : schema.minLength) ?? ""
                          }
                          onChange={(e) =>
                            update(field, {
                              ...schema,
                              [schema.type === "number" ? "min" : "minLength"]:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field
                        label={
                          schema.type === "number"
                            ? `Maximum value for ${field}`
                            : `Maximum length for ${field}`
                        }
                      >
                        <input
                          type="number"
                          min={schema.type === "string" ? 0 : undefined}
                          step={schema.type === "string" ? 1 : "any"}
                          value={
                            (schema.type === "number"
                              ? schema.max
                              : schema.maxLength) ?? ""
                          }
                          onChange={(e) =>
                            update(field, {
                              ...schema,
                              [schema.type === "number" ? "max" : "maxLength"]:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                    </>
                  )}
                </div>
              </section>
            );
          })
        ) : (
          <p className="cp-empty">
            Declare required or optional entities to configure their validation.
          </p>
        )}
      </details>
    </div>
  );
}
