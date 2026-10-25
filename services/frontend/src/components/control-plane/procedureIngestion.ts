import type { DocumentFormat } from "@/services/documentExtraction";
import type { ProcedureImport } from "@/types/controlPlane";

/** Documents parsed and reviewed together before they enter the draft. */
export const MAX_BATCH = 20;

export type IngestStatus =
  | "extracting"
  | "extracted"
  | "parsing"
  | "ready"
  | "blocked"
  | "failed"
  | "added";

export interface IngestItem {
  key: string;
  name: string;
  format: DocumentFormat | "pasted";
  status: IngestStatus;
  text: string;
  extractionWarnings: string[];
  error?: string;
  result?: ProcedureImport;
}

export const STATUS_LABELS: Record<IngestStatus, string> = {
  extracting: "Reading",
  extracted: "Ready to parse",
  parsing: "Parsing",
  ready: "Ready",
  blocked: "Needs fixes",
  failed: "Failed",
  added: "Added to draft",
};

export const FORMAT_LABELS: Record<IngestItem["format"], string> = {
  markdown: "Markdown",
  text: "Text",
  html: "HTML",
  docx: "Word",
  pdf: "PDF",
  pasted: "Pasted text",
};

/**
 * The source recorded for a file: its name, or the name under the shared
 * location (a folder URL or a named library such as "Servicing SOPs").
 */
export function sourceFor(location: string, fileName: string): string {
  const base = location.trim();
  if (!base) return fileName;
  if (/^https?:\/\//i.test(base)) {
    try {
      return new URL(
        encodeURIComponent(fileName),
        base.endsWith("/") ? base : `${base}/`,
      ).toString();
    } catch {
      return `${base} / ${fileName}`;
    }
  }
  return `${base} / ${fileName}`;
}

/** An id not yet used by an earlier document in the same batch. */
export function uniqueId(id: string, taken: Set<string>): string {
  if (!taken.has(id)) return id;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${id.slice(0, 64 - String(suffix).length - 1)}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const parseable = (item: IngestItem) =>
  ["extracted", "ready", "blocked"].includes(item.status) ||
  (item.status === "failed" && Boolean(item.text));

export function counts(items: IngestItem[]) {
  const count = (status: IngestStatus) =>
    items.filter((item) => item.status === status).length;
  return {
    ready: count("ready"),
    blocked: count("blocked"),
    failed: count("failed"),
    added: count("added"),
    busy: count("extracting") + count("parsing"),
    parseable: items.filter(parseable).length,
  };
}
