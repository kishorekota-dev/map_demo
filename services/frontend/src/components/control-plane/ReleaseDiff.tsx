import { useState } from "react";
import { authenticatedRequest } from "@/services/controlPlaneService";
import type { ControlPlaneState } from "@/types/controlPlane";
import {
  ConsoleField as Field,
  StatusPill,
  useConsoleAction,
} from "./ConsoleElements";
interface Difference {
  from: { version: number; fingerprint: string };
  to: { version: number | null; fingerprint: string };
  changes: Array<{
    path: string;
    before: unknown;
    after: unknown;
    kind: string;
  }>;
  totalChanges?: number;
  truncated?: boolean;
}
const show = (value: unknown) =>
  value === undefined
    ? "(not set)"
    : typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);
export default function ReleaseDiff({
  control,
}: {
  control: ControlPlaneState;
}) {
  const action = useConsoleAction();
  const [from, setFrom] = useState(control.published.version);
  const [to, setTo] = useState("draft");
  const [diff, setDiff] = useState<Difference | null>(null);
  return (
    <section className="cp-panel">
      <div className="cp-panel-heading">
        <h3>Review exact changes</h3>
        <StatusPill>Saved configurations</StatusPill>
      </div>
      <p>
        Compare individual fields, prompts, and policies before publishing or
        restoring a release.
      </p>
      {action.messages}
      <div className="cp-inline-form">
        <Field label="Compare from release">
          <select
            value={from}
            onChange={(e) => {
              setFrom(Number(e.target.value));
              setDiff(null);
            }}
          >
            {control.releases.map((release) => (
              <option key={release.version} value={release.version}>
                v{release.version}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Compare to configuration">
          <select
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setDiff(null);
            }}
          >
            <option value="draft">Saved draft</option>
            {control.releases.map((release) => (
              <option key={release.version} value={release.version}>
                v{release.version}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="cp-button cp-button--quiet"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () =>
              setDiff(
                await authenticatedRequest<Difference>(
                  `/control-plane/studio/diff?fromVersion=${from}&toVersion=${to}`,
                ),
              ),
            )
          }
        >
          Compare configurations
        </button>
      </div>
      {diff && (
        <>
          <p className="cp-footnote">
            {diff.changes.length} of {diff.totalChanges ?? diff.changes.length}{" "}
            changed fields
            {diff.truncated
              ? " (comparison truncated; review the full saved JSON for the remaining fields)"
              : ""}{" "}
            · {diff.from.fingerprint.slice(0, 12)} →{" "}
            {diff.to.fingerprint.slice(0, 12)}
          </p>
          {diff.changes.length ? (
            diff.changes.map((change, index) => (
              <details className="cp-evidence" key={index}>
                <summary>
                  {change.kind} · {change.path}
                </summary>
                <div className="cp-diff-columns">
                  <div>
                    <strong>Before</strong>
                    <pre>{show(change.before)}</pre>
                  </div>
                  <div>
                    <strong>After</strong>
                    <pre>{show(change.after)}</pre>
                  </div>
                </div>
              </details>
            ))
          ) : (
            <div className="cp-empty">No configuration differences.</div>
          )}
        </>
      )}
    </section>
  );
}
