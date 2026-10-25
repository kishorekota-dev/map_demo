import { authenticatedRequest as request } from "./controlPlaneService";
export interface PlatformCheck {
  id: string;
  status: "passed" | "failed";
  message: string;
}
export interface ReadinessReport {
  ready: boolean;
  runtimeReady: boolean;
  configurationReady: boolean;
  mode: string;
  checkedAt: string;
  checks: PlatformCheck[];
  productionChecks: PlatformCheck[];
  qualification: string;
}
export interface SolutionManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  digest?: string;
}
export interface SolutionPackage {
  schemaVersion: number;
  manifest: SolutionManifest;
  configuration: Record<string, unknown>;
}
export interface SolutionPreview {
  revision: number;
  manifest: SolutionManifest;
  digest: string;
  baseFingerprint: string;
  resultFingerprint: string;
  conflicts: string[];
  diff: {
    totalChanges: number;
    truncated: boolean;
    changes: Array<{
      path: string;
      kind: string;
      before: unknown;
      after: unknown;
    }>;
  };
}
export interface PlatformCatalog {
  schemaVersion: number;
  deployment: string;
  capabilities: string[];
  extensions: Array<{ id: string; contract: string }>;
  solutions: SolutionManifest[];
}
export type SolutionSelection =
  | { catalogId: string }
  | { package: SolutionPackage };
export const platformApi = {
  readiness: () => request<ReadinessReport>("/platform/readiness"),
  catalog: () => request<PlatformCatalog>("/platform/catalog"),
  export: (source: "draft" | "published") =>
    request<{
      package: SolutionPackage;
      digest: string;
      sourceRevision: number;
    }>(`/platform/solutions/export?source=${source}`),
  preview: (selection: SolutionSelection) =>
    request<SolutionPreview>("/platform/solutions/preview", "POST", selection),
  apply: (
    selection: SolutionSelection,
    preview: SolutionPreview,
    overwrite: boolean,
    note: string,
  ) =>
    request<{ revision: number; published: boolean }>(
      "/platform/solutions/apply",
      "POST",
      {
        ...selection,
        revision: preview.revision,
        digest: preview.digest,
        baseFingerprint: preview.baseFingerprint,
        overwrite,
        note,
      },
    ),
};
