import { useEffect, useState } from "react";
import {
  platformApi,
  type PlatformCatalog,
  type PlatformCheck,
  type ReadinessReport,
  type SolutionPackage,
  type SolutionPreview,
  type SolutionSelection,
} from "@/services/platformService";
import {
  ConsoleField,
  downloadEvidence,
  JsonEvidence,
  StatusPill,
  useConsoleAction,
} from "./ConsoleElements";

export default function PlatformConsole({
  editable,
  configurationDirty,
  onApplied,
}: {
  editable: boolean;
  configurationDirty: boolean;
  onApplied: () => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<PlatformCatalog | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [selected, setSelected] = useState("service-desk");
  const [packageText, setPackageText] = useState("");
  const [preview, setPreview] = useState<SolutionPreview | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [note, setNote] = useState("");
  const action = useConsoleAction();
  const refresh = async () => {
    const [nextCatalog, nextReadiness] = await Promise.allSettled([
      platformApi.catalog(),
      platformApi.readiness(),
    ]);
    setCatalogError(
      nextCatalog.status === "rejected"
        ? "The solution catalog is unavailable. Refresh diagnostics to retry."
        : "",
    );
    setDiagnosticsError(
      nextReadiness.status === "rejected"
        ? "Readiness diagnostics are unavailable. Refresh diagnostics to retry."
        : "",
    );
    if (nextCatalog.status === "fulfilled") setCatalog(nextCatalog.value);
    if (nextReadiness.status === "fulfilled") setReadiness(nextReadiness.value);
  };
  useEffect(() => {
    void action.run(refresh);
  }, []);
  const selection = (): SolutionSelection =>
    selected === "import"
      ? { package: JSON.parse(packageText) as SolutionPackage }
      : { catalogId: selected };
  const invalidate = () => {
    setPreview(null);
    setOverwrite(false);
  };
  const checks = (items: PlatformCheck[]) => (
    <div className="cp-platform-checks">
      {items.map((check) => (
        <article className="cp-platform-check" key={check.id}>
          <div>
            <strong>{check.id.replace(/_/g, " ")}</strong>
            <p>{check.message}</p>
          </div>
          <StatusPill
            good={check.status === "passed"}
            warning={check.status === "failed"}
          >
            {check.status === "passed" ? "Passed" : "Needs attention"}
          </StatusPill>
        </article>
      ))}
    </div>
  );
  return (
    <>
      {action.messages}
      <div className="cp-section-intro">
        <h2>Operate a repeatable servicing platform</h2>
        <p>
          Review deployment health, reuse approved solution configurations, and
          keep activation inside your release process.
        </p>
      </div>
      <section className="cp-panel">
        <div className="cp-panel-heading">
          <div>
            <span className="cp-eyebrow">Deployment diagnostics</span>
            <h3>Infrastructure & configuration</h3>
          </div>
          <button
            className="cp-button cp-button--quiet"
            disabled={action.busy}
            onClick={() => void action.run(refresh)}
          >
            Refresh diagnostics
          </button>
        </div>
        {diagnosticsError && (
          <div className="cp-alert cp-alert--error" role="alert">
            {diagnosticsError}
          </div>
        )}
        {readiness ? (
          <>
            <div className="cp-actions">
              <StatusPill
                good={readiness.runtimeReady}
                warning={!readiness.runtimeReady}
              >
                Runtime{" "}
                {readiness.runtimeReady ? "available" : "needs attention"}
              </StatusPill>
              <StatusPill
                good={readiness.configurationReady}
                warning={!readiness.configurationReady}
              >
                Gateway settings{" "}
                {readiness.configurationReady ? "passed" : "need attention"}
              </StatusPill>
            </div>
            <p>{readiness.qualification}</p>
            <p className="cp-footnote">
              Checked {new Date(readiness.checkedAt).toLocaleString()} ·{" "}
              {readiness.mode} mode · diagnostics may be cached for five
              seconds.
            </p>
            <h4>Required services and storage</h4>
            {checks(readiness.checks)}
            <h4>Gateway production configuration</h4>
            {checks(readiness.productionChecks)}
            <button
              className="cp-button cp-button--quiet"
              onClick={() =>
                downloadEvidence("servicing-readiness.json", readiness)
              }
            >
              Export diagnostic report
            </button>
          </>
        ) : (
          <p>
            {diagnosticsError
              ? "No current readiness report is available."
              : "Loading deployment diagnostics…"}
          </p>
        )}
      </section>
      <section className="cp-panel">
        <div className="cp-panel-heading">
          <div>
            <span className="cp-eyebrow">Portable solutions</span>
            <h3>Install into a reviewed draft</h3>
          </div>
          <StatusPill>Dedicated enterprise</StatusPill>
        </div>
        <p>
          Packages contain servicing configuration. They cannot install
          executable code, credentials or new financial tools. Applying a
          package updates the draft; publishing still requires your evaluation
          and approval gates.
        </p>
        {configurationDirty && (
          <div className="cp-alert cp-alert--pending">
            Save or discard current edits before previewing or applying a
            package.
          </div>
        )}
        {catalogError && (
          <div className="cp-alert cp-alert--error" role="alert">
            {catalogError}
          </div>
        )}
        <ConsoleField label="Solution package">
          <select
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              invalidate();
            }}
          >
            {(catalog?.solutions || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.version}
              </option>
            ))}
            <option value="import">Import a solution package</option>
          </select>
        </ConsoleField>
        {selected !== "import" && (
          <p>
            {
              catalog?.solutions.find((item) => item.id === selected)
                ?.description
            }
          </p>
        )}
        {selected === "import" && (
          <>
            <ConsoleField
              label="Read package file"
              hint="JSON only, maximum 512 KB."
            >
              <input
                type="file"
                accept="application/json,.json"
                disabled={!editable || action.busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void action.run(async () => {
                    if (file.size > 512000)
                      throw new Error("The package exceeds 512 KB.");
                    setPackageText(await file.text());
                    invalidate();
                  });
                }}
              />
            </ConsoleField>
            <ConsoleField label="Package JSON">
              <textarea
                rows={10}
                value={packageText}
                onChange={(event) => {
                  setPackageText(event.target.value);
                  invalidate();
                }}
              />
            </ConsoleField>
          </>
        )}
        <div className="cp-actions">
          <button
            className="cp-button"
            disabled={!editable || action.busy || configurationDirty}
            onClick={() =>
              void action.run(async () => {
                const next = await platformApi.preview(selection());
                setPreview(next);
                setOverwrite(false);
              })
            }
          >
            Preview package changes
          </button>
          <button
            className="cp-button cp-button--quiet"
            disabled={action.busy || configurationDirty}
            onClick={() =>
              void action.run(async () => {
                const result = await platformApi.export("draft");
                downloadEvidence("servicing-solution.json", result.package);
              })
            }
          >
            Export saved draft package
          </button>
        </div>
        {preview && (
          <>
            <div className="cp-inline-note">
              {preview.diff.totalChanges} configuration changes ·{" "}
              {preview.conflicts.length} existing configuration conflicts ·
              draft revision {preview.revision}
            </div>
            <JsonEvidence
              title="Review package diff and fingerprints"
              value={preview}
            />
            {preview.conflicts.length > 0 && (
              <label className="cp-toggle">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(event) => setOverwrite(event.target.checked)}
                />{" "}
                Allow the reviewed package to overwrite the listed conflicts
              </label>
            )}
            <ConsoleField label="Change note">
              <textarea
                rows={2}
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </ConsoleField>
            <button
              className="cp-button"
              disabled={
                !editable ||
                action.busy ||
                configurationDirty ||
                !note.trim() ||
                (!!preview.conflicts.length && !overwrite)
              }
              onClick={() =>
                void action.run(async () => {
                  await platformApi.apply(
                    selection(),
                    preview,
                    overwrite,
                    note.trim(),
                  );
                  await onApplied();
                  setPreview(null);
                  action.setNotice(
                    "Solution applied to the saved draft. Review, evaluate and publish to activate.",
                  );
                })
              }
            >
              Apply reviewed package to draft
            </button>
          </>
        )}
      </section>
      {catalog && (
        <section className="cp-panel">
          <span className="cp-eyebrow">Extension contracts</span>
          <h3>Connect your systems through registered adapters</h3>
          <p>
            Extensions are reviewed server modules or provider adapters. A
            solution package references supported contracts and keeps banking
            execution inside the established policy boundary.
          </p>
          <div className="cp-platform-checks">
            {catalog.extensions.map((extension) => (
              <article className="cp-platform-check" key={extension.id}>
                <strong>{extension.id}</strong>
                <span className="cp-footnote">{extension.contract}</span>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
