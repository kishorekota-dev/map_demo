import { useCallback, useEffect, useRef, useState } from "react";
import modelProviderService, {
  type RetrievalIndexStatus,
} from "@/services/modelProviderService";
import type { ServicingConfig } from "@/types/controlPlane";
import { StatusPill, formatDate, useConsoleAction } from "./ConsoleElements";

const POLL_MS = 2000;
const POLL_LIMIT = 90;

/** How an index status reads in the console. */
export function indexState(status: RetrievalIndexStatus): {
  label: string;
  good: boolean;
  warning: boolean;
} {
  if (status.reason === "lexical_strategy")
    return { label: "Lexical: no index needed", good: true, warning: false };
  if (status.reason === "embedding_route_not_configured")
    return { label: "No embedding route", good: false, warning: true };
  if (status.channels.some((channel) => channel.tooLarge))
    return {
      label: "Too large for semantic retrieval",
      good: false,
      warning: true,
    };
  const { chunks, indexed } = status.totals;
  if (!chunks)
    return { label: "No customer procedures", good: false, warning: false };
  if (indexed === chunks) return { label: "Ready", good: true, warning: false };
  if (status.building || status.build?.state === "running")
    return {
      label: `Building: ${indexed} of ${chunks}`,
      good: false,
      warning: false,
    };
  return {
    label: `${indexed} of ${chunks} chunks indexed`,
    good: false,
    warning: true,
  };
}

function StatusRow({
  label,
  status,
}: {
  label: string;
  status: RetrievalIndexStatus | null;
}) {
  if (!status)
    return (
      <tr>
        <th scope="row">{label}</th>
        <td colSpan={4}>Not loaded</td>
      </tr>
    );
  const state = indexState(status);
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{status.strategy}</td>
      <td>
        {status.embedding
          ? `${status.embedding.model} on ${status.embedding.providerId}`
          : "—"}
      </td>
      <td>
        {status.totals.indexed === null
          ? status.totals.chunks
          : `${status.totals.indexed} / ${status.totals.chunks}`}
      </td>
      <td>
        <StatusPill good={state.good} warning={state.warning}>
          {state.label}
        </StatusPill>
      </td>
    </tr>
  );
}

export default function RetrievalIndexPanel({
  draft,
  published,
  publishedVersion,
  editable,
}: {
  draft: ServicingConfig;
  published: ServicingConfig;
  publishedVersion?: number;
  editable: boolean;
}) {
  const action = useConsoleAction();
  const [draftStatus, setDraftStatus] = useState<RetrievalIndexStatus | null>(
    null,
  );
  const [publishedStatus, setPublishedStatus] =
    useState<RetrievalIndexStatus | null>(null);
  const polling = useRef(0);
  const mounted = useRef(true);
  // Set on every mount: StrictMode mounts, unmounts and remounts in development.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadPublished = useCallback(
    () =>
      modelProviderService.retrievalIndexStatus(published, publishedVersion),
    [published, publishedVersion],
  );
  const refresh = () =>
    action.run(async () => {
      const [nextDraft, nextPublished] = await Promise.all([
        modelProviderService.retrievalIndexStatus(draft),
        publishedVersion ? loadPublished() : Promise.resolve(null),
      ]);
      setDraftStatus(nextDraft);
      setPublishedStatus(nextPublished);
    });

  // Follows a build until it finishes, for at most three minutes.
  const follow = async () => {
    const run = (polling.current += 1);
    for (let attempt = 0; attempt < POLL_LIMIT; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      if (!mounted.current || run !== polling.current) return;
      try {
        const next = await loadPublished();
        setPublishedStatus(next);
        if (next.build?.state !== "running" && !next.building) {
          // Unchanged chunks are shared, so the draft usually gains vectors too.
          setDraftStatus(
            await modelProviderService.retrievalIndexStatus(draft),
          );
          return;
        }
      } catch {
        return;
      }
    }
  };

  const build = () =>
    action.run(async () => {
      if (!publishedVersion) throw new Error("Publish a release first.");
      setPublishedStatus(
        await modelProviderService.buildRetrievalIndex(publishedVersion),
      );
      action.setNotice(
        `Indexing published version ${publishedVersion}. Customers get lexical retrieval for chunks that are not yet embedded.`,
      );
      void follow();
    });

  const publishedState = publishedStatus ? indexState(publishedStatus) : null;
  const canBuild =
    editable &&
    Boolean(publishedVersion) &&
    publishedStatus?.embedding &&
    publishedStatus.strategy !== "lexical" &&
    publishedStatus.totals.indexed !== publishedStatus.totals.chunks &&
    publishedStatus.build?.state !== "running";
  const lastBuild = publishedStatus?.build;

  return (
    <section className="cp-panel" aria-labelledby="retrieval-index">
      <div className="cp-panel-heading">
        <span className="cp-eyebrow">Index</span>
        <h3 id="retrieval-index">Procedure retrieval index</h3>
      </div>
      <p>
        Semantic and hybrid retrieval compare questions with embedded chunks of
        customer procedures. Build the index after publishing so the first
        customers get semantic answers; chunks that are not yet embedded are
        answered with lexical retrieval. Edited chunks get new vectors, and
        unchanged chunks are reused.
      </p>
      <div className="cp-actions">
        <button
          type="button"
          className="cp-button cp-button--quiet"
          disabled={action.busy}
          onClick={() => void refresh()}
        >
          {draftStatus ? "Refresh status" : "Check index status"}
        </button>
        {publishedVersion && publishedStatus && publishedState && (
          <button
            type="button"
            className="cp-button"
            disabled={!canBuild || action.busy}
            onClick={() => void build()}
          >
            Build index for published v{publishedVersion}
          </button>
        )}
      </div>
      {action.messages}
      {(draftStatus || publishedStatus) && (
        <div className="cp-index-status">
          <div className="cp-table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Configuration</th>
                  <th scope="col">Strategy</th>
                  <th scope="col">Embedding model</th>
                  <th scope="col">Chunks indexed</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <StatusRow label="Draft (current edits)" status={draftStatus} />
                {publishedVersion && (
                  <StatusRow
                    label={`Published v${publishedVersion}`}
                    status={publishedStatus}
                  />
                )}
              </tbody>
            </table>
          </div>
          {lastBuild && (
            <p className="cp-footnote" role="status">
              Last build of v{lastBuild.version}: {lastBuild.state}
              {lastBuild.finishedAt
                ? `, finished ${formatDate(lastBuild.finishedAt)}`
                : `, started ${formatDate(lastBuild.startedAt)}`}
              {lastBuild.inputTokens
                ? ` · ${lastBuild.inputTokens.toLocaleString()} provider input tokens`
                : ""}
              {lastBuild.remaining
                ? ` · ${lastBuild.remaining} chunks still missing`
                : ""}
              {lastBuild.reason
                ? ` · ${lastBuild.reason.replace(/_/g, " ")}`
                : ""}
              . Build provider usage is reported here, not as customer usage.
            </p>
          )}
          {[draftStatus, publishedStatus].some(
            (status) => status && status.embedding && !status.durable,
          ) && (
            <div className="cp-alert cp-alert--pending" role="status">
              Vectors are held only in this orchestrator instance&apos;s memory.
              Configure PostgreSQL workflow persistence to share the index
              across instances and restarts.
            </div>
          )}
          {draftStatus && draftStatus.procedures.length > 0 && (
            <details className="cp-evidence">
              <summary>Chunks per procedure (draft)</summary>
              <div className="cp-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Procedure</th>
                      <th scope="col">Chunks</th>
                      <th scope="col">Indexed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftStatus.procedures.map((procedure) => (
                      <tr key={procedure.id}>
                        <th scope="row">
                          {procedure.title} <code>{procedure.id}</code>
                        </th>
                        <td>{procedure.chunks}</td>
                        <td>{procedure.indexed ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
