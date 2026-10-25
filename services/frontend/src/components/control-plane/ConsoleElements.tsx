import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { ControlPlaneError } from "@/services/controlPlaneService";

export const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "—";
export const splitValues = (value: string) =>
  value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
export function ConsoleField({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={`cp-field${wide ? " cp-field--wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(
            children as ReactElement<{
              id?: string;
              "aria-describedby"?: string;
            }>,
            { id, "aria-describedby": hint ? `${id}-hint` : undefined },
          )
        : children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function JsonEvidence({
  value,
  title = "Inspect recorded evidence",
}: {
  value: unknown;
  title?: string;
}) {
  return (
    <details className="cp-evidence">
      <summary>{title}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
export function StringListField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  hint?: string;
}) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => {
    setText(value.join("\n"));
  }, [value]);
  return (
    <ConsoleField label={label} hint={hint || "One value per line."}>
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(splitValues(text))}
      />
    </ConsoleField>
  );
}
export function StatusPill({
  children,
  good = false,
  warning = false,
}: {
  children: ReactNode;
  good?: boolean;
  warning?: boolean;
}) {
  return (
    <span
      className={`cp-badge cp-badge--${good ? "green" : warning ? "amber" : "neutral"}`}
    >
      {children}
    </span>
  );
}
export function useConsoleAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      const detail =
        failure instanceof Error
          ? failure.message
          : "The request could not be completed.";
      setError(
        detail +
          (failure instanceof ControlPlaneError && failure.status === 409
            ? " Your edits are preserved. Reload the latest server revision before saving again."
            : "") +
          (failure instanceof ControlPlaneError && failure.details.length
            ? ` ${failure.details.join(" ")}`
            : ""),
      );
    } finally {
      setBusy(false);
    }
  };
  const messages = (
    <>
      {error && (
        <div className="cp-alert cp-alert--error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="cp-alert cp-alert--success" role="status">
          {notice}
        </div>
      )}
    </>
  );
  return { busy, error, notice, run, setNotice, messages };
}
export function downloadEvidence(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
