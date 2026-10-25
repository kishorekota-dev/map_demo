import { useRef, useState } from "react";
import {
  ACCEPTED_DOCUMENTS,
  EXTRACTION_LIMITS,
  ExtractionError,
  extractDocument,
  formatOf,
  identifierFor,
} from "@/services/documentExtraction";
import { studioApi } from "@/services/servicingStudioService";
import type { KnowledgeDocument, StudioState } from "@/types/servicingStudio";
import {
  ConsoleField as Field,
  StatusPill,
  StringListField,
  useConsoleAction,
} from "./ConsoleElements";
import { FORMAT_LABELS, sourceFor } from "./procedureIngestion";

/** The import route accepts at most this many documents per request. */
export const MAX_KNOWLEDGE_BATCH = 50;

type Status =
  "reading" | "unchecked" | "valid" | "invalid" | "failed" | "imported";
const LABELS: Record<Status, string> = {
  reading: "Reading",
  unchecked: "Not checked",
  valid: "Ready",
  invalid: "Needs fixes",
  failed: "Failed",
  imported: "Imported as draft",
};

export interface KnowledgeItem {
  key: string;
  name: string;
  format: keyof typeof FORMAT_LABELS;
  status: Status;
  id: string;
  title: string;
  text: string;
  warnings: string[];
  errors: string[];
}

/** The draft knowledge document a file becomes. */
export function knowledgeDocument(
  item: KnowledgeItem,
  { location, allowedRoles }: { location: string; allowedRoles: string[] },
): KnowledgeDocument {
  return {
    id: item.id,
    title: item.title,
    content: item.text,
    source: sourceFor(location, item.name),
    allowedRoles,
    expiresAt: null,
    status: "draft",
  };
}

export default function KnowledgeIngestion({
  revision,
  existingIds,
  editable,
  onImported,
}: {
  revision: number;
  existingIds: string[];
  editable: boolean;
  onImported: (next: StudioState) => void;
}) {
  const action = useConsoleAction();
  const [location, setLocation] = useState("");
  const [allowedRoles, setAllowedRoles] = useState<string[]>(["customer"]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const nextKey = useRef(0);
  const patch = (key: string, value: Partial<KnowledgeItem>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...value } : item)),
    );
  const pending = items.filter((item) => item.status !== "imported");
  const reading = items.some((item) => item.status === "reading");
  const ready = items.filter((item) => item.status === "valid");

  const addFiles = async (files: File[]) => {
    const room = MAX_KNOWLEDGE_BATCH - pending.length;
    const chosen = files.slice(0, Math.max(0, room));
    if (files.length > chosen.length)
      action.setNotice(
        `Up to ${MAX_KNOWLEDGE_BATCH} documents can be imported at a time; ${files.length - chosen.length} were not added.`,
      );
    const fresh: KnowledgeItem[] = chosen.map((file) => ({
      key: `knowledge-${(nextKey.current += 1)}`,
      name: file.name,
      format: formatOf(file.name) || "text",
      status: "reading",
      id: identifierFor(file.name),
      title: file.name,
      text: "",
      warnings: [],
      errors: [],
    }));
    setItems((current) => [...current, ...fresh]);
    for (const [index, file] of chosen.entries()) {
      try {
        const extracted = await extractDocument(file);
        patch(fresh[index].key, {
          status: "unchecked",
          title: extracted.title,
          text: extracted.text,
          warnings: extracted.warnings,
        });
      } catch (error) {
        patch(fresh[index].key, {
          status: "failed",
          errors: [
            error instanceof ExtractionError
              ? error.message
              : "The file could not be read.",
          ],
        });
      }
    }
  };

  const check = () =>
    action.run(async () => {
      const targets = items.filter((item) =>
        ["unchecked", "valid", "invalid"].includes(item.status),
      );
      if (!targets.length) throw new Error("Choose files to import first.");
      const result = await studioApi.validateKnowledge(
        targets.map((item) =>
          knowledgeDocument(item, { location, allowedRoles }),
        ),
      );
      targets.forEach((item, index) => {
        const errors = result.results[index]?.errors || [];
        patch(item.key, {
          status: errors.length ? "invalid" : "valid",
          errors,
        });
      });
    });

  const importReady = () =>
    action.run(async () => {
      const next = await studioApi.importKnowledge(
        revision,
        ready.map((item) =>
          knowledgeDocument(item, { location, allowedRoles }),
        ),
      );
      onImported(next);
      const imported = new Set(ready.map((item) => item.key));
      setItems((current) =>
        current.map((item) =>
          imported.has(item.key) ? { ...item, status: "imported" } : item,
        ),
      );
      action.setNotice(
        `${ready.length} document${ready.length === 1 ? "" : "s"} imported as drafts. Review content and role access, then publish each document.`,
      );
    });

  return (
    <section className="cp-panel" aria-labelledby="knowledge-ingest">
      <div className="cp-panel-heading">
        <span className="cp-eyebrow">Ingest</span>
        <h3 id="knowledge-ingest">Import knowledge files</h3>
      </div>
      <p>
        Upload Word, PDF, HTML, Markdown or text files. Each file becomes a
        draft document with the roles below; nothing is retrievable until it is
        published. Files are read in your browser, checked by the server and
        imported only when they pass. Content is limited to 50,000 characters
        per document.
      </p>
      <fieldset className="cp-fieldset" disabled={!editable || action.busy}>
        <div className="cp-form-grid">
          <Field
            label="Source location"
            hint="Recorded with each document, for example a policy library name or an HTTPS folder. Files are added under it by name; with no location the file name is used."
          >
            <input
              value={location}
              maxLength={900}
              onChange={(e) => {
                setLocation(e.target.value);
                setItems((current) =>
                  current.map((item) =>
                    item.status === "valid" || item.status === "invalid"
                      ? { ...item, status: "unchecked", errors: [] }
                      : item,
                  ),
                );
              }}
            />
          </Field>
          <StringListField
            label="Roles allowed to retrieve"
            value={allowedRoles}
            onChange={(next) => {
              setAllowedRoles(next);
              setItems((current) =>
                current.map((item) =>
                  item.status === "valid" || item.status === "invalid"
                    ? { ...item, status: "unchecked", errors: [] }
                    : item,
                ),
              );
            }}
            hint="One role per line, applied to every file in this import."
          />
          <Field
            label="Upload files"
            hint={`Word (.docx), PDF, HTML, Markdown or text, up to ${EXTRACTION_LIMITS.fileBytes / 1024 / 1024} MB each.`}
          >
            <input
              type="file"
              multiple
              accept={ACCEPTED_DOCUMENTS}
              onChange={(e) => {
                const files = [...(e.target.files || [])];
                e.target.value = "";
                if (files.length) void addFiles(files);
              }}
            />
          </Field>
        </div>
        {items.length > 0 && (
          <div className="cp-table-scroll">
            <table className="cp-ingest-table">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Document ID</th>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const locked =
                    item.status === "imported" || item.status === "reading";
                  return (
                    <tr key={item.key}>
                      <th scope="row">
                        {item.name}
                        <small className="cp-muted">
                          {FORMAT_LABELS[item.format]}
                          {item.text
                            ? ` · ${item.text.length.toLocaleString()} characters`
                            : ""}
                        </small>
                      </th>
                      <td>
                        <input
                          aria-label={`Document ID for ${item.name}`}
                          value={item.id}
                          maxLength={64}
                          disabled={locked}
                          onChange={(e) =>
                            patch(item.key, {
                              id: e.target.value,
                              status: "unchecked",
                              errors: [],
                            })
                          }
                        />
                        {existingIds.includes(item.id) &&
                          item.status !== "imported" && (
                            <small className="cp-inline-note">
                              Saves a new draft version of an existing document.
                            </small>
                          )}
                      </td>
                      <td>
                        <input
                          aria-label={`Title for ${item.name}`}
                          value={item.title}
                          maxLength={200}
                          disabled={locked}
                          onChange={(e) =>
                            patch(item.key, {
                              title: e.target.value,
                              status: "unchecked",
                              errors: [],
                            })
                          }
                        />
                      </td>
                      <td>
                        <StatusPill
                          good={
                            item.status === "valid" ||
                            item.status === "imported"
                          }
                          warning={
                            item.status === "invalid" ||
                            item.status === "failed"
                          }
                        >
                          {LABELS[item.status]}
                        </StatusPill>
                        {[...item.warnings, ...item.errors].map((message) => (
                          <small key={message} className="cp-inline-note">
                            {message}
                          </small>
                        ))}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="cp-button cp-button--quiet"
                          aria-label={`Remove ${item.name}`}
                          disabled={item.status === "reading"}
                          onClick={() =>
                            setItems((current) =>
                              current.filter((entry) => entry.key !== item.key),
                            )
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="cp-actions">
          <button
            type="button"
            className="cp-button"
            disabled={
              reading ||
              !items.some((item) =>
                ["unchecked", "valid", "invalid"].includes(item.status),
              )
            }
            onClick={() => void check()}
          >
            Check documents
          </button>
          <button
            type="button"
            className="cp-button"
            disabled={reading || !ready.length}
            onClick={() => void importReady()}
          >
            Import {ready.length || ""} as drafts
          </button>
          {items.length > 0 && (
            <button
              type="button"
              className="cp-button cp-button--quiet"
              onClick={() => setItems([])}
            >
              Clear list
            </button>
          )}
        </div>
      </fieldset>
      {action.messages}
    </section>
  );
}
